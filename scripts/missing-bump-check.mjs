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
  changedFiles as diffFiles,
  changedProgramsForBases,
  crateFor,
  isNoReleasePath,
  lockfileAt,
  manifestAt,
  run,
} from "./changed-programs.mjs";
import { ENTRY } from "./missing-changesets.mjs";
import { parseProgramTag } from "./program-hash-check.mjs";

const git = (...args) => run("git", args);

// The programs with no base to diff from ask `changedProgramsForBases` for a
// ref that has no files, so one call answers for the candidates alone.
const NO_BASE = Symbol("no base");

/**
 * The files that mark one program as changed, for the failure text: its own
 * source, plus the source of the crates in its `via`, plus `Cargo.lock` when
 * its `via` names it.
 */
const markingFiles = ({ crateDirs }, { name, via }, files) =>
  files.filter((file) => {
    if (isNoReleasePath(file)) return false;
    const crate = crateFor(crateDirs, file) ?? file;
    return crate === name || via.includes(crate);
  });

/**
 * One verdict per program.
 *
 * - `new`: no `program-<name>-*` tag at all. The first tag and the first deploy
 *   stay manual, so the check has no base to diff from and says nothing.
 * - `bumped`: no tag for the current version. The next tag bot run tags it.
 * - `clean`: the current version is tagged and nothing has changed since.
 * - `missing-bump`: the current version is tagged and the source moved. Fails.
 *   A program with a reviewed SHA fails only when its source moved since the tag
 *   and also since that SHA.
 *
 * @param {{
 *   metadata: object,
 *   programs: { name: string, version: string, tags: string[], tagCommit?: string, reviewedSha?: string }[],
 *   changedFiles: (base: string) => string[],
 *   lockfilesFor?: (base: string) => { base: string, head: string },
 *   manifestsFor?: (base: string) => { base: string, head: string },
 * }} input `programs` carries each program's current version, the versions its
 *   `program-<name>-*` tags name, the commit of the tag for the current version
 *   and the program's reviewed SHA. `changedFiles` gives the paths a base
 *   changed against HEAD. `lockfilesFor` gives `Cargo.lock` at a base and at
 *   HEAD, for a base whose changed paths include it, and `manifestsFor` the root
 *   `Cargo.toml` the same way.
 * @returns {{ ok: boolean, results: object[], failing: object[] }}
 */
export const missingBumpCheck = ({
  metadata,
  programs,
  changedFiles,
  lockfilesFor,
  manifestsFor,
}) => {
  const graph = buildGraph(metadata);

  const bases = {};
  const reviewedBases = {};
  for (const { name, version, tags, tagCommit, reviewedSha } of programs) {
    if (!tags.includes(version)) continue;
    bases[name] = tagCommit;
    // A `none` level reviewed the program up to its reviewed SHA. Tags sit on
    // master merge commits that develop never contains, so neither
    // commit is reliably the later one, and a change must show against both.
    if (reviewedSha) reviewedBases[name] = reviewedSha;
  }

  const filesByBase = {};
  for (const base of new Set([
    ...Object.values(bases),
    ...Object.values(reviewedBases),
  ])) {
    filesByBase[base] = changedFiles(base);
  }

  const changedFrom = (programBases) =>
    changedProgramsForBases({
      metadata,
      defaultBase: NO_BASE,
      filesByBase,
      programBases,
      lockfilesFor,
      manifestsFor,
    });
  const changedSinceTag = changedFrom(bases);

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
    const reviewedBase = reviewedBases[name];
    const tagEntry = changedSinceTag.find((program) => program.name === name);
    // A reviewed SHA clears a file only when the file has not changed since it.
    const files = tagEntry
      ? markingFiles(graph, tagEntry, filesByBase[base]).filter(
          (file) => !reviewedBase || filesByBase[reviewedBase].includes(file),
        )
      : [];
    const failing = tagEntry && (!reviewedBase || files.length > 0);
    return {
      name,
      version,
      status: failing ? "missing-bump" : "clean",
      base,
      via: failing ? tagEntry.via : [],
      files: failing ? files : [],
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
      `  Bump \`programs/${name}/Cargo.toml\`.`,
    ]
      .filter(Boolean)
      .join("\n"),
  );

  return blocks.length ? `${table}\n\n${blocks.join("\n\n")}` : table;
};

const USAGE =
  "Usage: node scripts/missing-bump-check.mjs [head] [--json <file>]";

const PACKAGE_VERSION = /^version = "(\d+\.\d+\.\d+)"$/m;

// What `git show` prints when the ref exists and the path is not in its tree.
const NOT_IN_TREE = /does not exist in|exists on disk, but not in/;

/**
 * The file's content at `head`, or null when it is not in that tree. Any other
 * failure, such as a bad ref, throws.
 */
export const showFile = (head, file) => {
  try {
    return execFileSync("git", ["show", `${head}:${file}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    if (NOT_IN_TREE.test(String(err.stderr ?? err.message))) return null;
    throw err;
  }
};

/**
 * The literal `version = "x.y.z"` in `name`'s `Cargo.toml`. A tag names that
 * version, so a manifest without one (`version.workspace = true`) is an error
 * rather than a program with no version.
 */
export const packageVersion = (name, cargo) => {
  const match = cargo.match(PACKAGE_VERSION);
  if (!match) {
    throw new Error(
      `programs/${name}/Cargo.toml has no literal version = "x.y.z"`,
    );
  }
  return match[1];
};

/** The versions `name`'s `program-<name>-<x.y.z>` tags in `tags` name. */
export const taggedVersions = (name, tags) =>
  tags
    .map(parseProgramTag)
    .filter((parsed) => parsed?.name === name)
    .map(({ version }) => version);

const PROGRAM_CHANGESETS = ".changeset-programs/*.md";
const NOT_README = ":!.changeset-programs/README.md";

/**
 * Each program's reviewed SHA: the newest commit reachable from `head` that
 * declares the program `none` in a program changeset. The `none` reviews the
 * program up to that commit. History keeps the commit after the version step
 * consumes the changeset, and a squash merge keeps it as the squash commit.
 *
 * A commit declares a program when its diff adds a `<program>: none` line and
 * removes none for that program, so a reworded changeset reviews nothing new.
 */
export const reviewedShas = (head) => {
  // No prototype, so no program name reads an inherited key.
  const shas = Object.create(null);
  const commits = git(
    "log",
    "--topo-order",
    "--no-merges",
    "--format=%H",
    head,
    "--",
    PROGRAM_CHANGESETS,
    NOT_README,
  )
    .split("\n")
    .filter(Boolean);
  for (const sha of commits) {
    const diff = git(
      "show",
      "--format=",
      "--unified=0",
      "--no-ext-diff",
      sha,
      "--",
      PROGRAM_CHANGESETS,
      NOT_README,
    ).split("\n");
    const declaredNone = (sign) =>
      new Set(
        diff
          .filter((line) => line.startsWith(sign))
          .map((line) => line.slice(1).match(ENTRY))
          .filter((entry) => entry?.[3] === "none")
          .map((entry) => entry[2]),
      );
    const removed = declaredNone("-");
    for (const name of declaredNone("+")) {
      if (!removed.has(name) && !(name in shas)) shas[name] = sha;
    }
  }
  return shas;
};

/**
 * Every `programs/*` directory with a `Cargo.toml`, with its version at `head`,
 * its tagged versions and the commit the tag for that version points at.
 *
 * The tag list is filtered to exactly `program-<name>-<x>.<y>.<z>`: the repo
 * carries legacy `-v0.0.7` tags and a `-0.2.34-new` suffix that a looser
 * pattern would read as versions.
 */
export const readPrograms = (head, reviewed) =>
  git("ls-tree", "-d", "--name-only", `${head}:programs`)
    .split("\n")
    .filter(Boolean)
    .map((name) => {
      const cargo = showFile(head, `programs/${name}/Cargo.toml`);
      if (!cargo) return null;
      const version = packageVersion(name, cargo);
      const tags = taggedVersions(
        name,
        git("tag", "-l", `program-${name}-*`).split("\n"),
      );
      return {
        name,
        version,
        tags,
        tagCommit: tags.includes(version)
          ? git("rev-list", "-n1", `program-${name}-${version}`).trim()
          : undefined,
        reviewedSha: reviewed[name],
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
  const result = missingBumpCheck({
    metadata,
    programs: readPrograms(head, reviewedShas(head)),
    changedFiles: (base) => diffFiles(base, head),
    lockfilesFor: (base) => ({
      base: lockfileAt(base),
      head: lockfileAt(head),
    }),
    manifestsFor: (base) => ({
      base: manifestAt(base),
      head: manifestAt(head),
    }),
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
