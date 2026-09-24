/**
 * Versions the Anchor programs from the program changesets in
 * `.changeset-programs/`. Changesets stays for npm packages, so this script
 * writes no `package.json`, no git tag and no PR; the program release PR
 * workflow does that.
 *
 * A program changeset is front matter of `<cargo package name>: <level>` lines
 * followed by the text for the Squads signer. The highest level per program
 * wins. Levels are plain semver arithmetic on 0.x, so minor on 0.1.8 gives
 * 0.2.0. Level `none` bumps nothing and records the program in `skipped.json`
 * instead, so the missing-bump check knows the change was reviewed.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseChangeset } from "./missing-changesets.mjs";

const USAGE = "Usage: node scripts/version-programs.mjs [root]";

const CHANGESET_DIR = ".changeset-programs";
const SKIPPED_FILE = "skipped.json";

/** Ordered lowest to highest; `none` releases nothing. */
const LEVELS = ["none", "patch", "minor", "major"];
const RELEASE_LEVELS = LEVELS.filter((level) => level !== "none");

// The first line-anchored `version =` is the [package] one; dependency
// versions live in inline tables, so they never start a line.
const PACKAGE_VERSION = /^version = "(\d+\.\d+\.\d+)"$/m;

export const bump = (version, level) => {
  const [major, minor, patch] = version.split(".").map(Number);
  if (level === "major") return `${major + 1}.0.0`;
  if (level === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
};

/** Program names: the `programs/*` directories that hold a `Cargo.toml`. */
const listPrograms = (root) =>
  fs
    .readdirSync(path.join(root, "programs"))
    .filter((name) =>
      fs.existsSync(path.join(root, "programs", name, "Cargo.toml")),
    );

/** The program changesets, newest-last. `README.md` keeps the dir in git. */
const listChangesets = (root) =>
  fs
    .readdirSync(path.join(root, CHANGESET_DIR))
    .filter(
      (file) =>
        file.endsWith(".md") && file !== "README.md" && file !== SKIPPED_FILE,
    )
    .map((file) => path.join(root, CHANGESET_DIR, file));

/**
 * program -> { level, notes: [{ level, text }] }, with every name and level
 * validated. The whole plan is built before any write, so an unknown program or
 * level leaves the tree untouched.
 */
const plan = (programs, files) => {
  const releases = {};
  for (const file of files) {
    // One grammar with the backstop, so a file both accept means the same.
    let parsed;
    try {
      parsed = parseChangeset(fs.readFileSync(file, "utf8"));
    } catch (err) {
      throw new Error(`${file}: ${err.message}`);
    }
    const { releases: entries, summary: text } = parsed;
    for (const [name, level] of Object.entries(entries)) {
      if (!programs.includes(name))
        throw new Error(`${file}: unknown program "${name}"`);
      if (!LEVELS.includes(level))
        throw new Error(`${file}: unknown level "${level}"`);
      releases[name] ??= { level: "none", notes: [] };
      if (LEVELS.indexOf(level) > LEVELS.indexOf(releases[name].level))
        releases[name].level = level;
      releases[name].notes.push({ level, text });
    }
  }
  return releases;
};

/** The changesets entry for one release, in the changesets layout. */
const changelogEntry = (name, next, notes) => {
  const sections = [...RELEASE_LEVELS]
    .reverse()
    .filter((level) => notes.some((note) => note.level === level))
    .map(
      (level) =>
        `### ${level[0].toUpperCase()}${level.slice(1)} Changes\n\n` +
        notes
          .filter((note) => note.level === level)
          .map((note) => `- ${note.text.replace(/\n/g, "\n  ")}`)
          .join("\n"),
    )
    .join("\n\n");
  return `## ${next}\n\n${sections}`;
};

const prependChangelog = (root, name, entry) => {
  const changelogPath = path.join(root, "programs", name, "CHANGELOG.md");
  const header = `# ${name}\n\n`;
  const old = fs.existsSync(changelogPath)
    ? fs.readFileSync(changelogPath, "utf8").slice(header.length)
    : "";
  fs.writeFileSync(
    changelogPath,
    `${header}${entry}\n\n${old}`.trimEnd() + "\n",
  );
};

/**
 * The skip record: program -> the commit its changes were reviewed up to. The
 * missing-bump check diffs from the later of this SHA and the program's last
 * release tag, so a `none` level does not fail the promotion PR. A real release
 * clears the program's entry. The file goes when nothing is skipped, and
 * `README.md` keeps the directory in git on its own.
 */
const writeSkipped = (root, skipped) => {
  const skippedPath = path.join(root, CHANGESET_DIR, SKIPPED_FILE);
  const existing = fs.existsSync(skippedPath)
    ? JSON.parse(fs.readFileSync(skippedPath, "utf8"))
    : {};
  const next = { ...existing, ...skipped };
  for (const name of Object.keys(next)) {
    if (skipped[name] === null) delete next[name];
  }
  const sorted = Object.fromEntries(
    Object.keys(next)
      .sort()
      .map((name) => [name, next[name]]),
  );
  if (!Object.keys(sorted).length) {
    if (fs.existsSync(skippedPath)) fs.unlinkSync(skippedPath);
    return;
  }
  fs.writeFileSync(skippedPath, `${JSON.stringify(sorted, null, 2)}\n`);
};

// cargo's progress goes to stderr, so stdout carries only the release report
// the workflow puts in the PR body.
const runCargoUpdate = () =>
  execSync("cargo update --workspace", {
    stdio: ["ignore", process.stderr, "inherit"],
  });

/**
 * Applies every program changeset under `root` and deletes the files it used.
 *
 * @param {{ root: string, headSha: string, cargoUpdate?: () => void }} input
 *   `headSha` is the commit the changesets were reviewed up to; it is what a
 *   `none` level records in `skipped.json`.
 * @returns {{ released: { name: string, from: string, to: string, level: string }[], skipped: string[] }}
 */
export const versionPrograms = ({
  root,
  headSha,
  cargoUpdate = runCargoUpdate,
}) => {
  const programs = listPrograms(root);
  const files = listChangesets(root);
  const releases = plan(programs, files);

  const released = [];
  const skipped = [];
  // program -> new SHA, or null to clear the entry a real release supersedes.
  const skipRecord = {};
  for (const [name, { level, notes }] of Object.entries(releases)) {
    if (level === "none") {
      skipped.push(name);
      skipRecord[name] = headSha;
      continue;
    }
    skipRecord[name] = null;
    const cargoPath = path.join(root, "programs", name, "Cargo.toml");
    const cargo = fs.readFileSync(cargoPath, "utf8");
    const from = cargo.match(PACKAGE_VERSION)[1];
    const to = bump(from, level);
    fs.writeFileSync(
      cargoPath,
      cargo.replace(PACKAGE_VERSION, `version = "${to}"`),
    );
    prependChangelog(root, name, changelogEntry(name, to, notes));
    released.push({ name, from, to, level });
  }

  if (Object.keys(skipRecord).length) writeSkipped(root, skipRecord);
  files.forEach((file) => fs.unlinkSync(file));
  if (released.length) cargoUpdate();

  return {
    released: released.sort((a, b) => a.name.localeCompare(b.name)),
    skipped: skipped.sort(),
  };
};

const main = (argv) => {
  if (argv.length > 1) throw new Error(USAGE);
  const root = argv[0] ?? process.cwd();
  const headSha = execSync("git rev-parse HEAD", {
    cwd: root,
    encoding: "utf8",
  }).trim();
  const { released, skipped } = versionPrograms({ root, headSha });
  for (const { name, from, to, level } of released) {
    process.stdout.write(`${name}: ${from} -> ${to} (${level})\n`);
  }
  for (const name of skipped) {
    process.stdout.write(`${name}: no release (none)\n`);
  }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
}
