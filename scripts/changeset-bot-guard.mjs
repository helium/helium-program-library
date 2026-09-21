/**
 * The guard between the changeset bot's LLM step and its commit step.
 *
 * The LLM holds a Write tool and nothing else, so the working tree is the only
 * thing it can change. This script reads the tree after the LLM step and
 * refuses anything but the one shape the bot may commit. The prompt asks for
 * the same shape; the guard is what enforces it.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { IDLS_PACKAGE, parseChangeset } from "./missing-changesets.mjs";

const USAGE = "Usage: node scripts/changeset-bot-guard.mjs <missing.json>";

// The bot never writes `major`: a person edits the file up to it. `none`
// exists only for programs.
const SIDES = [
  { dir: ".changeset", side: "npm", levels: ["patch", "minor"] },
  {
    dir: ".changeset-programs",
    side: "programs",
    levels: ["none", "patch", "minor"],
  },
];

/** The side a new file belongs to: a `<name>.md` directly in one of the two directories. */
const sideOf = (file) =>
  SIDES.find(
    ({ dir }) =>
      file.startsWith(`${dir}/`) &&
      /^[^/]+\.md$/.test(file.slice(dir.length + 1)) &&
      !file.endsWith("/README.md"),
  );

/** `XY path` lines of `git status --porcelain=v1 --untracked-files=all`. */
const parseStatus = (status) =>
  status
    .split("\n")
    .filter(Boolean)
    .map((line) => ({ code: line.slice(0, 2), file: line.slice(3) }));

/**
 * @param {{
 *   status: string,
 *   missing: { npm: string[], programs: { name: string, own: boolean }[], idls: { level: string, breaking: boolean } | null },
 *   readFile: (file: string) => string,
 * }} input
 * @returns {{ errors: string[], files: string[], report: { possibleBreak: boolean, emptyReason: string | null, dependents: { name: string, level: string, via: string[] }[], programText: string | null, flagged: boolean } }}
 *   `report` holds the flags the PR comment shows.
 */
export const guardBotFiles = ({ status, missing, readFile }) => {
  const errors = [];
  const files = [];
  const report = {
    possibleBreak: false,
    emptyReason: null,
    dependents: [],
    programText: null,
  };

  for (const { code, file } of parseStatus(status)) {
    if (code !== "??") {
      errors.push(`existing file changed: ${file}`);
      continue;
    }
    if (!sideOf(file)) {
      errors.push(`path not allowed: ${file}`);
      continue;
    }
    files.push(file);
  }

  for (const { dir } of SIDES) {
    const inDir = files.filter((file) => file.startsWith(`${dir}/`));
    if (inDir.length > 1) {
      errors.push(`more than one new file in ${dir}: ${inDir.join(", ")}`);
    }
  }

  for (const file of files) {
    const { side, levels } = sideOf(file);
    let parsed;
    try {
      parsed = parseChangeset(readFile(file));
    } catch (err) {
      errors.push(`${file}: ${err.message}`);
      continue;
    }
    const names = Object.keys(parsed.releases);
    if (names.length === 0) {
      if (side === "programs") {
        errors.push(`${file}: names no program`);
      } else if (!parsed.summary) {
        errors.push(`${file}: empty changeset with no reason`);
      } else {
        report.emptyReason = parsed.summary;
      }
      continue;
    }

    const allowed =
      side === "npm" ? missing.npm : missing.programs.map(({ name }) => name);
    for (const [name, level] of Object.entries(parsed.releases)) {
      if (!allowed.includes(name)) {
        errors.push(`${file}: ${name} is not a missing name on this side`);
        continue;
      }
      if (!levels.includes(level)) {
        errors.push(`${file}: ${name}: level ${level} is not allowed`);
        continue;
      }
      if (name === IDLS_PACKAGE) {
        report.possibleBreak = missing.idls?.breaking === true;
      }
      if (name === IDLS_PACKAGE && level !== missing.idls?.level) {
        errors.push(
          `${file}: ${IDLS_PACKAGE} must be ${missing.idls?.level}, not ${level}`,
        );
      }
      const program = missing.programs.find((entry) => entry.name === name);
      if (side === "programs" && level === "none" && program.own) {
        errors.push(`${file}: ${name}: none is only for a dependent program`);
      }
      if (side === "programs" && !program.own) {
        report.dependents.push({ name, level, via: program.via });
      }
    }
    if (side === "programs") report.programText = parsed.summary;
  }

  const flagged =
    report.possibleBreak ||
    report.emptyReason !== null ||
    report.dependents.length > 0;

  // A guard failure commits nothing.
  return {
    errors,
    files: errors.length > 0 ? [] : files,
    report: { ...report, flagged },
  };
};

const main = (argv) => {
  const [missingFile] = argv;
  if (!missingFile) throw new Error(USAGE);
  const result = guardBotFiles({
    // Every untracked file by name: the default folds a new directory into one
    // line, which would hide what is inside it.
    status: execFileSync(
      "git",
      ["status", "--porcelain=v1", "--untracked-files=all"],
      { encoding: "utf8" },
    ),
    missing: JSON.parse(readFileSync(missingFile, "utf8")),
    readFile: (file) => readFileSync(file, "utf8"),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.errors.length > 0) throw new Error(result.errors.join("\n"));
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
}
