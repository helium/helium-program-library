/**
 * Builds the body of the Promotion PR (develop → master).
 *
 * The PR is the deploy decision for every program whose version is ahead of its
 * last program release tag, so the body says what merging it puts on chain and
 * what would slip through without a bump. It says nothing about npm packages or
 * service images: promotion does nothing to either.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { readPrograms, showFile } from "./missing-bump-check.mjs";
import { parseChangeset } from "./missing-changesets.mjs";

/**
 * The changelog sections a promotion adds: everything above the `## <from>`
 * heading of the last tagged version. The file is newest-first, so no version
 * comparison is needed. `from` null (a program with no tag yet) takes the whole
 * file, and a program with no changelog gives no text.
 */
export const changelogSince = (changelog, from) => {
  if (!changelog) return "";
  const body = changelog.replace(/^#[^#][^\n]*\n+/, "");
  const end = from ? body.indexOf(`## ${from}\n`) : -1;
  return (end === -1 ? body : body.slice(0, end)).trim();
};

/** The programs that will deploy, with each one's changelog text. */
const deployingSection = (deploying) => {
  if (!deploying.length) {
    return "No program version is ahead of its last program release tag.";
  }
  const table = [
    "| program | last tag | develop |",
    "| --- | --- | --- |",
    ...deploying.map(
      ({ name, from, to }) => `| ${name} | ${from ?? "none"} | ${to} |`,
    ),
  ].join("\n");

  const blocks = deploying.map(({ name, from, to, changelog }) =>
    [
      `### ${name} ${from ?? "first release"} → ${to}`,
      "",
      changelog?.trim() ||
        `No \`programs/${name}/CHANGELOG.md\` entry. Read the diff.`,
    ].join("\n"),
  );

  return [table, ...blocks].join("\n\n");
};

/**
 * The missing-bump check's failures in words: each program whose current
 * version is tagged and whose source moved since that tag. Merging with one of
 * these would deploy new source under a version already on chain, so the check
 * fails the PR too.
 */
const missingBumpSection = (missingBump) => {
  if (!missingBump.length) {
    return "Every changed program carries a version bump.";
  }
  return missingBump
    .map(({ name, version, base, via, files }) =>
      [
        `- \`${name}\` ${version} is tagged as \`program-${name}-${version}\`, and it changed since ${base.slice(0, 9)}${
          via.length ? ` through its dependency on ${via.join(", ")}` : ""
        }:`,
        ...files.map((file) => `  - \`${file}\``),
      ].join("\n"),
    )
    .join("\n");
};

/**
 * The program changesets still waiting for the program release PR. They are not
 * in the versions above, so what they describe does not deploy with this
 * promotion.
 */
const unversionedSection = (unversioned) => {
  if (!unversioned.length) {
    return "`.changeset-programs/` holds no program changeset.";
  }
  return unversioned
    .map(({ file, entries, text }) =>
      [
        `- \`${file}\` — ${entries.map(({ name, level }) => `${name}: ${level}`).join(", ")}`,
        ...text
          .trim()
          .split("\n")
          .map((line) => `  > ${line}`),
      ].join("\n"),
    )
    .join("\n");
};

export const promotionPrBody = ({
  deploying,
  missingBump,
  unversioned,
  backMerge,
}) =>
  [
    "## Programs that will deploy",
    "",
    deployingSection(deploying),
    "",
    "## Programs with changes and no bump",
    "",
    missingBumpSection(missingBump),
    "",
    "## Program changesets not yet versioned",
    "",
    unversionedSection(unversioned),
    "",
    // master must reach develop before develop can promote: the up-to-date
    // rule on master blocks the merge until the back-merge lands.
    ...(backMerge
      ? [
          "## Blocked: back-merge open",
          "",
          `A hotfix is on its way back to develop in ${backMerge.url}. Merge it first: master must be in develop before this PR can merge.`,
          "",
        ]
      : []),
    "Promotion does nothing to npm packages or service images. npm publishes from develop and service images are tagged on develop.",
    "",
  ].join("\n");

const USAGE =
  "Usage: node scripts/promotion-pr-body.mjs [head] [--missing-bump <file>] [--back-merge <url>]";

const bySemver = (a, b) => {
  const right = b.split(".").map(Number);
  return (
    a
      .split(".")
      .map((part, i) => Number(part) - right[i])
      .find((difference) => difference !== 0) ?? 0
  );
};

/**
 * The version a promotion moves the program up from: the highest tag at or
 * below the version on develop, or null when the program has none. Tags above
 * the current version are typos or abandoned releases (the repo carries
 * `program-helium-sub-daos-0.2.201`), so a plain maximum would name a release
 * that never happened.
 */
export const lastRelease = (tags, version) =>
  tags
    .filter((tag) => bySemver(tag, version) <= 0)
    .sort(bySemver)
    .at(-1) ?? null;

/**
 * The programs whose version has no tag: merging the Promotion PR is the
 * decision to deploy each of them. A program with no tag at all is left out,
 * as the tag bot leaves it out: its first tag stays manual. `from` is the
 * highest tagged version at or below the current one.
 *
 * @param {{ name: string, version: string, tags: string[] }[]} programs
 *   `readPrograms` output.
 * @param {(name: string) => string | null} readChangelog
 */
export const deployingPrograms = (programs, readChangelog) =>
  programs
    .filter(({ version, tags }) => tags.length && !tags.includes(version))
    .map(({ name, version, tags }) => {
      const from = lastRelease(tags, version);
      return {
        name,
        from,
        to: version,
        changelog: changelogSince(readChangelog(name), from),
      };
    });

const readDeploying = (head) =>
  deployingPrograms(readPrograms(head, {}), (name) =>
    showFile(head, `programs/${name}/CHANGELOG.md`),
  );

/** The program changesets in the tree at `head` that no release has used yet. */
const readUnversioned = (head) => {
  let listing;
  try {
    // Absent before the directory reaches the branch under the head.
    listing = execFileSync(
      "git",
      ["ls-tree", "--name-only", `${head}:.changeset-programs`],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
  } catch {
    return [];
  }
  return listing
    .split("\n")
    .filter((name) => name.endsWith(".md") && name !== "README.md")
    .map((name) => {
      const file = `.changeset-programs/${name}`;
      let parsed;
      try {
        parsed = parseChangeset(showFile(head, file) ?? "");
      } catch {
        return null;
      }
      return {
        file,
        entries: Object.entries(parsed.releases).map(([program, level]) => ({
          name: program,
          level,
        })),
        text: parsed.summary,
      };
    })
    .filter(Boolean);
};

const parseArgs = (argv) => {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i].match(/^--(missing-bump|back-merge)$/)?.[1];
    if (!flag) {
      positional.push(argv[i]);
      continue;
    }
    if (!argv[i + 1]) throw new Error(USAGE);
    flags[flag] = argv[i + 1];
    i += 1;
  }
  if (positional.length > 1) throw new Error(USAGE);
  return { head: positional[0] ?? "HEAD", ...flags };
};

const main = (argv) => {
  const args = parseArgs(argv);
  // The missing-bump check's own JSON, so the PR body and the check on it
  // never disagree. Without the file the section says nothing is missing.
  const missingBump = args["missing-bump"]
    ? JSON.parse(fs.readFileSync(args["missing-bump"], "utf8")).failing
    : [];
  process.stdout.write(
    promotionPrBody({
      deploying: readDeploying(args.head),
      missingBump,
      unversioned: readUnversioned(args.head),
      backMerge: args["back-merge"] ? { url: args["back-merge"] } : null,
    }),
  );
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
}
