/**
 * Which changed names the PR's added changesets do not cover, per side.
 *
 * The changeset bot's fixed step. The npm side takes the changed packages
 * (`changed-packages.mjs`) plus `@helium/idls` when the IDL diff names it; the
 * program side takes the changed programs (`changed-programs.mjs`). A name is
 * covered when a changeset the PR adds names it. An empty changeset covers
 * every npm package and no program: it is changesets' own "no release" mark,
 * and programs have `none` instead.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const USAGE =
  "Usage: node scripts/missing-changesets.mjs <base> [head] --packages <json> --programs <json> [--idl-diff <json>]";

export const IDLS_PACKAGE = "@helium/idls";

const FRONT_MATTER = /^---\n([\s\S]*?)---\n?([\s\S]*)$/;
const ENTRY = /^(["']?)([^"':]+)\1:\s*(\w+)\s*$/;
const LEVELS = ["major", "minor", "patch", "none"];
// An npm package name or a program directory name. A name like `__proto__`
// fails it, so it cannot reach the releases object as a key.
const NAME = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

/**
 * A changeset or program changeset: the `name: level` front matter and the
 * text. Package names carry quotes in changesets' own output, program names
 * do not; both parse here.
 *
 * @returns {{ releases: Record<string, string>, summary: string }}
 */
export const parseChangeset = (text) => {
  const match = text.replace(/\r/g, "").match(FRONT_MATTER);
  if (!match) throw new Error("no front matter");
  // No prototype, so no name reads or writes an inherited key.
  const releases = Object.create(null);
  for (const line of match[1].split("\n").filter((l) => l.trim())) {
    const [, , name, level] = line.match(ENTRY) || [];
    if (!name || !NAME.test(name)) {
      throw new Error(`bad front matter line "${line}"`);
    }
    if (!LEVELS.includes(level)) {
      throw new Error(`bad release level "${level}" for ${name}`);
    }
    releases[name] = level;
  }
  return { releases, summary: match[2].trim() };
};

/**
 * @param {{
 *   packages: string[],
 *   programs: { name: string, own: boolean, via: string[] }[],
 *   idls: { level: string, breaking: boolean } | null,
 *   programHints?: Record<string, string>,
 *   changesets: { releases: Record<string, string> }[],
 *   programChangesets: { releases: Record<string, string> }[],
 * }} input
 * @returns {{ npm: string[], programs: { name: string, own: boolean, via: string[] }[], idls: object | null, nothingMissing: boolean }}
 */
export const missingChangesets = ({
  packages,
  programs,
  idls,
  programHints = {},
  changesets,
  programChangesets,
}) => {
  const wanted = new Set(packages);
  if (idls) wanted.add(IDLS_PACKAGE);

  const emptyChangeset = changesets.some(
    ({ releases }) => Object.keys(releases).length === 0,
  );
  const namedPackages = new Set(
    changesets.flatMap(({ releases }) => Object.keys(releases)),
  );
  const npm = emptyChangeset
    ? []
    : [...wanted].filter((name) => !namedPackages.has(name)).sort();

  const namedPrograms = new Set(
    programChangesets.flatMap(({ releases }) => Object.keys(releases)),
  );
  // The hint is the IDL diff's fixed level for the program's own change. A
  // dependent program has no hint.
  const missingPrograms = programs
    .filter(({ name }) => !namedPrograms.has(name))
    .map((program) =>
      program.own
        ? { ...program, hint: programHints[program.name] ?? "patch" }
        : program,
    );

  return {
    npm,
    programs: missingPrograms,
    idls: npm.includes(IDLS_PACKAGE) ? idls : null,
    nothingMissing: npm.length === 0 && missingPrograms.length === 0,
  };
};

const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));

const run = (command, args) =>
  execFileSync(command, args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });

/** The changesets the PR adds under one directory, read from the head tree. */
const addedChangesets = (base, head, dir) =>
  run("git", [
    "diff",
    "--name-only",
    "--diff-filter=A",
    base,
    head,
    "--",
    `${dir}/*.md`,
  ])
    .split("\n")
    .filter((file) => file && path.basename(file) !== "README.md")
    .map((file) => ({
      file,
      ...parseChangeset(run("git", ["show", `${head}:${file}`])),
    }));

const parseArgs = (argv) => {
  const positional = [];
  const files = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = {
      "--packages": "packages",
      "--programs": "programs",
      "--idl-diff": "idlDiff",
    }[argv[i]];
    if (!key) {
      positional.push(argv[i]);
      continue;
    }
    files[key] = argv[i + 1];
    i += 1;
  }
  const [base, head = "HEAD"] = positional;
  if (!base || !files.packages || !files.programs) throw new Error(USAGE);
  return { base, head, files };
};

/**
 * The same answer from a command line: the changed names come from the JSON
 * files the caller wrote, the added changesets from the git history. The
 * backstop check reads it too, so both sides run one rule.
 */
export const missingFromArgv = (argv) => {
  const { base, head, files } = parseArgs(argv);
  const idlDiff = files.idlDiff ? readJson(files.idlDiff) : null;
  return missingChangesets({
    packages: readJson(files.packages),
    programs: readJson(files.programs),
    idls: idlDiff?.idls ?? null,
    programHints: Object.fromEntries(
      (idlDiff?.programs ?? []).map(({ name, level }) => [name, level]),
    ),
    changesets: addedChangesets(base, head, ".changeset"),
    programChangesets: addedChangesets(base, head, ".changeset-programs"),
  });
};

const main = (argv) => {
  process.stdout.write(`${JSON.stringify(missingFromArgv(argv))}\n`);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
}
