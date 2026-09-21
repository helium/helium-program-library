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

import { parseProgramChangeset } from "./version-programs.mjs";

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

const run = (command, args) =>
  execFileSync(command, args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });

const git = (...args) => run("git", args);

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

const PACKAGE_VERSION = /^version = "(\d+\.\d+\.\d+)"$/m;

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
 * The programs whose version at `head` has no tag: merging the Promotion PR is
 * the decision to deploy each of them. `from` is the highest tagged version,
 * matched exactly as `program-<name>-<x>.<y>.<z>` so the repo's legacy `v`
 * tags and its one `-new` suffix are not read as versions.
 */
const readDeploying = (head) =>
  git("ls-tree", "-d", "--name-only", `${head}:programs`)
    .split("\n")
    .filter(Boolean)
    .map((name) => {
      const cargo = showFile(head, `programs/${name}/Cargo.toml`);
      if (!cargo) return null;
      const to = cargo.match(PACKAGE_VERSION)[1];
      const tags = git("tag", "-l", `program-${name}-*`)
        .split("\n")
        .map((tag) => tag.match(`^program-${name}-(\\d+\\.\\d+\\.\\d+)$`)?.[1])
        .filter(Boolean);
      if (tags.includes(to)) return null;
      const from = lastRelease(tags, to);
      return {
        name,
        from,
        to,
        changelog: changelogSince(
          showFile(head, `programs/${name}/CHANGELOG.md`),
          from,
        ),
      };
    })
    .filter(Boolean);

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
      const parsed = parseProgramChangeset(showFile(head, file) ?? "");
      return parsed ? { file, ...parsed } : null;
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
