/**
 * Fails a promotion when a program's source changed without a version bump.
 *
 * The backstop on develop asks for a program changeset; an admin can bypass it.
 * This check asks the tags instead, so nothing that reaches master can ship a
 * program whose version already has a tag: a tag is never moved and a version
 * is never reused, so a tagged version with newer source is source that would
 * deploy under a version already on chain.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import {
  buildGraph,
  changedProgramsForBases,
  crateFor,
  isNoReleasePath,
} from "./changed-programs.mjs";

const run = (command, args) =>
  execFileSync(command, args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });

const git = (...args) => run("git", args);

/**
 * The later of two commits: `b` when `a` is its ancestor, else `a`. A
 * `skipped.json` SHA that is not a descendant of the tag (a rewritten branch,
 * a hand edit) leaves the base on the tag, which is the stricter answer.
 */
const laterOf = (a, b) => {
  try {
    git("merge-base", "--is-ancestor", a, b);
    return b;
  } catch {
    return a;
  }
};

// The programs with no base to diff from ask `changedProgramsForBases` for a
// ref that has no files, so one call answers for the candidates alone.
const NO_BASE = Symbol("no base");

/**
 * The files that mark one program as changed, for the failure text: its own
 * source, plus the source of a crate it depends on directly.
 */
const markingFiles = ({ crateDirs, dependents }, name, files) =>
  files.filter((file) => {
    if (isNoReleasePath(file)) return false;
    const crate = crateFor(crateDirs, file);
    return crate === name || (dependents.get(crate)?.has(name) ?? false);
  });

/**
 * One verdict per program.
 *
 * - `new`: no `program-<name>-*` tag at all. The first tag and the first deploy
 *   stay manual, so the check has no base to diff from and says nothing.
 * - `bumped`: no tag for the current version. The next tag bot run tags it.
 * - `clean`: the current version is tagged and nothing has changed since.
 * - `missing-bump`: the current version is tagged and the source moved. Fails.
 *
 * @param {{
 *   metadata: object,
 *   programs: { name: string, version: string, tags: string[], tagCommit?: string, skippedSha?: string }[],
 *   changedFiles: (base: string) => string[],
 *   laterCommit?: (a: string, b: string) => string,
 * }} input `programs` carries each program's current version, the versions its
 *   `program-<name>-*` tags name, the commit of the tag for the current version
 *   and the program's `skipped.json` SHA. `changedFiles` gives the paths a base
 *   changed against HEAD.
 * @returns {{ ok: boolean, results: object[], failing: object[] }}
 */
export const missingBumpCheck = ({
  metadata,
  programs,
  changedFiles,
  laterCommit = laterOf,
}) => {
  const graph = buildGraph(metadata);

  const bases = {};
  for (const { name, version, tags, tagCommit, skippedSha } of programs) {
    if (!tags.includes(version)) continue;
    // A `none` level reviewed the program up to the SHA in `skipped.json`, so
    // the base moves there when that commit is the later of the two.
    bases[name] = skippedSha ? laterCommit(tagCommit, skippedSha) : tagCommit;
  }

  const filesByBase = {};
  for (const base of new Set(Object.values(bases))) {
    filesByBase[base] = changedFiles(base);
  }

  const changed = changedProgramsForBases({
    metadata,
    defaultBase: NO_BASE,
    filesByBase,
    programBases: bases,
  });

  const results = programs.map(({ name, version, tags }) => {
    if (!tags.length) {
      return { name, version, status: "new", base: null, via: [], files: [] };
    }
    if (!tags.includes(version)) {
      return {
        name,
        version,
        status: "bumped",
        base: null,
        via: [],
        files: [],
      };
    }
    const base = bases[name];
    const entry = changed.find((program) => program.name === name);
    return {
      name,
      version,
      status: entry ? "missing-bump" : "clean",
      base,
      via: entry?.via ?? [],
      files: entry ? markingFiles(graph, name, filesByBase[base]) : [],
    };
  });

  const failing = results.filter(({ status }) => status === "missing-bump");
  return { ok: failing.length === 0, results, failing };
};

const STATUS_TEXT = {
  new: "skipped: no program tag yet",
  bumped: "ok: version not tagged yet",
  clean: "ok: no change since the tag",
  "missing-bump": "FAIL: changed with no bump",
};

/** The run summary: one row per program, then a block per failing program. */
export const report = ({ results, failing }) => {
  const rows = results.map(
    ({ name, version, status, base }) =>
      `| ${name} | ${version} | ${STATUS_TEXT[status]} | ${base ? base.slice(0, 9) : "-"} |`,
  );
  const table = [
    "| program | version | result | base |",
    "| --- | --- | --- | --- |",
    ...rows,
  ].join("\n");

  const blocks = failing.map(({ name, version, base, via, files }) =>
    [
      `${name} ${version} is tagged as \`program-${name}-${version}\`, and it changed since ${base}:`,
      ...files.map((file) => `  - ${file}`),
      via.length ? `  via its dependency on ${via.join(", ")}` : null,
      `  Bump \`programs/${name}/Cargo.toml\`, or add a \`.changeset-programs/\` file that gives it a level.`,
    ]
      .filter(Boolean)
      .join("\n"),
  );

  return blocks.length ? `${table}\n\n${blocks.join("\n\n")}` : table;
};

const USAGE =
  "Usage: node scripts/missing-bump-check.mjs [head] [--json <file>]";

const PACKAGE_VERSION = /^version = "(\d+\.\d+\.\d+)"$/m;

/** The file's content at `head`, or null when it is not in that tree. */
const showFile = (head, file) => {
  try {
    return execFileSync("git", ["show", `${head}:${file}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
};

/**
 * Every `programs/*` directory with a `Cargo.toml`, with its version at `head`,
 * its tagged versions and the commit the tag for that version points at.
 *
 * The tag list is filtered to exactly `program-<name>-<x>.<y>.<z>`: the repo
 * carries legacy `-v0.0.7` tags and a `-0.2.34-new` suffix that a looser
 * pattern would read as versions.
 */
const readPrograms = (head, skipped) =>
  git("ls-tree", "-d", "--name-only", `${head}:programs`)
    .split("\n")
    .filter(Boolean)
    .map((name) => {
      const cargo = showFile(head, `programs/${name}/Cargo.toml`);
      if (!cargo) return null;
      const version = cargo.match(PACKAGE_VERSION)[1];
      const tags = git("tag", "-l", `program-${name}-*`)
        .split("\n")
        .map((tag) => tag.match(`^program-${name}-(\\d+\\.\\d+\\.\\d+)$`)?.[1])
        .filter(Boolean);
      return {
        name,
        version,
        tags,
        tagCommit: tags.includes(version)
          ? git("rev-list", "-n1", `program-${name}-${version}`).trim()
          : undefined,
        skippedSha: skipped[name],
      };
    })
    .filter(Boolean);

const parseArgs = (argv) => {
  const positional = [];
  let json;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] !== "--json") {
      positional.push(argv[i]);
      continue;
    }
    json = argv[i + 1];
    if (!json) throw new Error(USAGE);
    i += 1;
  }
  if (positional.length > 1) throw new Error(USAGE);
  return { head: positional[0] ?? "HEAD", json };
};

const main = (argv) => {
  const { head, json } = parseArgs(argv);
  const metadata = JSON.parse(
    run("cargo", ["metadata", "--format-version", "1", "--no-deps"]),
  );
  const skipped = JSON.parse(
    showFile(head, ".changeset-programs/skipped.json") ?? "{}",
  );
  const result = missingBumpCheck({
    metadata,
    programs: readPrograms(head, skipped),
    changedFiles: (base) =>
      git("diff", "--name-only", base, head).split("\n").filter(Boolean),
  });

  const text = report(result);
  process.stdout.write(`${text}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
  }
  if (json) fs.writeFileSync(json, `${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exit(1);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
}
