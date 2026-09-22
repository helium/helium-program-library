/**
 * The changesets a PR is missing, written by fixed rules.
 *
 * The changeset bot's writer. `missing-changesets.mjs` names what no changeset
 * in the PR covers; this script turns those names into at most one file per
 * side. Every level and every line of text is a rule, so the invariants the
 * bot commits under are this file's unit tests: names only from the missing
 * set, `none` only for a dependent program, never an empty changeset, never a
 * write over an existing file. The author edits the file when a rule falls
 * short.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isNoReleasePath } from "./changed-programs.mjs";
import { IDLS_PACKAGE } from "./missing-changesets.mjs";

const USAGE =
  "Usage: node scripts/write-changesets.mjs <base> [head] --missing <json> --title <text> --id <id> [--idl-diff <json>]";

/** `type(scope)!:` conventional-commit prefix. */
const TITLE_PREFIX = /^[a-z]+(\([^)]*\))?!?:\s+/;

/** The PR title as changeset text: no commit-type prefix, first letter up. */
export const changesetTitle = (title) => {
  const text = title.trim().replace(TITLE_PREFIX, "");
  return text.charAt(0).toUpperCase() + text.slice(1);
};

const HANDLER_DIR = /^programs\/[^/]+\/src\/instructions\//;

/**
 * The level for a program changed only through the crates in `via`. `none`
 * needs proof that the dependent's binary cannot have changed: every
 * dependency is a program whose IDL did not move and whose only changed files
 * are instruction handlers, which a dependent never runs. Anything else, a
 * shared crate above all, is `patch`.
 *
 * @param {{ via: string[], files: string[], idlDiff: { programs: { name: string, changed: boolean }[] } | null }} input
 *   `files` are the PR's changed paths; `idlDiff` is `idl-diff.mjs` output.
 * @returns {{ level: "none" | "patch", reason: string }}
 */
export const dependentLevel = ({ via, files, idlDiff }) => {
  const reasons = via.map((crate) => {
    const prefix = `programs/${crate}/`;
    const changed = files.filter(
      (file) => file.startsWith(prefix) && !isNoReleasePath(file),
    );
    if (changed.length === 0) {
      return { level: "patch", reason: `${crate} is not a program` };
    }
    const diff = idlDiff?.programs.find(({ name }) => name === crate);
    if (!diff || diff.changed) {
      return { level: "patch", reason: `the IDL of ${crate} changed` };
    }
    if (!changed.every((file) => HANDLER_DIR.test(file))) {
      return {
        level: "patch",
        reason: `${crate} changed outside its instruction handlers`,
      };
    }
    return {
      level: "none",
      reason: `only instruction handlers in ${crate} changed and its IDL did not`,
    };
  });
  const patch = reasons.filter(({ level }) => level === "patch");
  const chosen = patch.length > 0 ? patch : reasons;
  return {
    level: chosen[0].level,
    reason: chosen.map(({ reason }) => reason).join("; "),
  };
};

const names = (entries) => entries.map(({ name }) => name).join(", ");

/** "Adds instruction X; changes account Y", or empty when the IDL did not move. */
const idlLine = (diff) =>
  [
    diff.added.length > 0 && `adds ${names(diff.added)}`,
    diff.removed.length > 0 && `removes ${names(diff.removed)}`,
    diff.changed.length + diff.other.length > 0 &&
      `changes ${names([...diff.changed, ...diff.other])}`,
  ]
    .filter(Boolean)
    .join("; ")
    .replace(/^./, (c) => c.toUpperCase());

const file = (frontMatter, paragraphs) =>
  `---\n${frontMatter.join("\n")}\n---\n\n${paragraphs.join("\n\n")}\n`;

/**
 * @param {{
 *   missing: { npm: string[], programs: { name: string, own: boolean, via: string[], hint?: string }[], idls: { level: string, breaking: boolean } | null },
 *   idlDiff: { programs: { name: string, changed: boolean, diff: object }[] } | null,
 *   title: string,
 *   files: string[],
 *   id: string,
 * }} input `missing` is `missing-changesets.mjs` output, `files` the PR's changed paths.
 * @returns {Record<string, string>} repo-relative path -> file text; empty when nothing is missing.
 */
export const writeChangesets = ({ missing, idlDiff, title, files, id }) => {
  const text = changesetTitle(title);
  const out = {};

  if (missing.npm.length > 0) {
    const paragraphs = [text];
    if (missing.npm.includes(IDLS_PACKAGE) && missing.idls?.breaking) {
      const items = (idlDiff?.programs ?? []).flatMap(({ diff }) => [
        ...diff.removed,
        ...diff.changed,
      ]);
      paragraphs.push(`Possible breaking change: ${names(items)}`);
    }
    out[`.changeset/${id}.md`] = file(
      missing.npm.map(
        (name) =>
          `"${name}": ${name === IDLS_PACKAGE ? missing.idls.level : "patch"}`,
      ),
      paragraphs,
    );
  }

  if (missing.programs.length > 0) {
    const levels = [];
    const lines = [];
    for (const program of missing.programs) {
      if (program.own) {
        levels.push(`${program.name}: ${program.hint ?? "patch"}`);
        const entry = idlDiff?.programs.find(
          ({ name }) => name === program.name,
        );
        if (entry?.changed) {
          lines.push(`- ${program.name}: ${idlLine(entry.diff)}`);
        }
      } else {
        const { level, reason } = dependentLevel({
          via: program.via,
          files,
          idlDiff,
        });
        levels.push(`${program.name}: ${level}`);
        lines.push(`- ${program.name}: ${level}, ${reason}`);
      }
    }
    out[`.changeset-programs/${id}.md`] = file(
      levels,
      lines.length > 0 ? [text, lines.join("\n")] : [text],
    );
  }

  return out;
};

/**
 * Writes the files under `root`. Checks every path before the first write, so
 * a file that exists stops the bot without touching anything.
 *
 * @returns {string[]} the paths written, in order.
 */
export const writeFiles = (outputs, root) => {
  const entries = Object.entries(outputs);
  for (const [rel] of entries) {
    try {
      readFileSync(path.join(root, rel));
      throw new Error(`${rel} exists; the bot never rewrites a changeset`);
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
  }
  for (const [rel, text] of entries) {
    writeFileSync(path.join(root, rel), text, { flag: "wx" });
  }
  return entries.map(([rel]) => rel);
};

const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));

const parseArgs = (argv) => {
  const positional = [];
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = {
      "--missing": "missing",
      "--idl-diff": "idlDiff",
      "--title": "title",
      "--id": "id",
    }[argv[i]];
    if (!key) {
      positional.push(argv[i]);
      continue;
    }
    options[key] = argv[i + 1];
    i += 1;
  }
  const [base, head = "HEAD"] = positional;
  if (!base || !options.missing || !options.title || !options.id) {
    throw new Error(USAGE);
  }
  return { base, head, options };
};

const main = (argv) => {
  const { base, head, options } = parseArgs(argv);
  const files = execFileSync("git", ["diff", "--name-only", base, head], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\n")
    .filter(Boolean);
  const outputs = writeChangesets({
    missing: readJson(options.missing),
    idlDiff: options.idlDiff ? readJson(options.idlDiff) : null,
    title: options.title,
    files,
    id: options.id,
  });
  const written = writeFiles(outputs, process.cwd());
  process.stdout.write(`${JSON.stringify(written)}\n`);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
}
