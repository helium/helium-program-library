/**
 * Compare each program's on-chain hash with its release hashes.
 *
 * A read-only witness, run on a schedule. It takes no action: it reports
 * deployed, pending, or unknown binary per program, and prints one JSON object
 * for the workflow to turn into a run summary and annotations.
 *
 * A program whose releases carry no `<name>.so.sha256` asset is skipped, not
 * failed: a program enters the check at its first release through the new flow.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const USAGE =
  "Usage: [GITHUB_TOKEN=<token>] [SOLANA_URL=<rpc>] node scripts/program-hash-check.mjs";

// The check is mainnet only, and this RPC needs no key.
const DEFAULT_RPC = "https://solana-rpc.web.helium.io";
const REPO = process.env.GITHUB_REPOSITORY ?? "helium/helium-program-library";
// A `program-<name>-<x.y.z>` tag and nothing else: the tag list holds a
// `v`-prefixed tag, a `-test` suffixed one, and a misspelled program name, and a
// loose parse reads a program or a version out of all three.
const PROGRAM_TAG = /^program-(.+)-(\d+\.\d+\.\d+)$/;

// A vote and an execute take time, so a pending upgrade is normal for a few days.
const PENDING_NOTICE_DAYS = 3;

/** Newest release first, by version. */
const byVersionDesc = (a, b) => {
  const parts = (v) => v.split(".").map(Number);
  const [x, y] = [parts(a.version), parts(b.version)];
  return y[0] - x[0] || y[1] - x[1] || y[2] - x[2];
};

const ageInDays = (taggedAt, now) =>
  (now.getTime() - new Date(taggedAt).getTime()) / 86400000;

/**
 * The result of one program's comparison. Pure.
 *
 * `releases` are that program's releases, each with the release hash from its
 * `<name>.so.sha256` asset. `onChainHash` is what the chain holds.
 */
export const classify = ({ releases, onChainHash, now }) => {
  const sorted = [...releases].sort(byVersionDesc);
  const newest = sorted[0];
  // No release of this program published a hash asset. Nothing to compare with.
  if (!newest) return { status: "skipped" };
  const tagAgeDays = ageInDays(newest.taggedAt, now);
  if (onChainHash === newest.hash) {
    return { status: "deployed", version: newest.version };
  }
  // The chain holds a binary this repository never released.
  if (!sorted.some((release) => release.hash === onChainHash)) {
    return { status: "unknown binary", version: newest.version };
  }
  return {
    status: "pending",
    version: newest.version,
    tag: newest.tag,
    tagAgeDays,
    notify: tagAgeDays > PENDING_NOTICE_DAYS,
  };
};

/**
 * The programs to check: the `programs.localnet` ids, which are the mainnet ids.
 * `key` is the underscored Anchor name, `name` the crate and tag name.
 */
const localnetPrograms = (anchorToml) => {
  const section = anchorToml
    .split(/^\[/m)
    .find((s) => s.startsWith("programs.localnet]"));
  if (!section)
    throw new Error("Anchor.toml has no [programs.localnet] section");
  return [...section.matchAll(/^(\w+)\s*=\s*"([^"]+)"/gm)].map(
    ([, key, programId]) => ({
      key,
      name: key.replaceAll("_", "-"),
      programId,
    }),
  );
};

/** Every `program-<name>-<x.y.z>` tag with the date it was created. */
const programTags = () =>
  execFileSync(
    "git",
    [
      "for-each-ref",
      "--format=%(refname:strip=2)\t%(creatordate:iso-strict)",
      "refs/tags/program-*",
    ],
    { encoding: "utf8" },
  )
    .split("\n")
    .flatMap((line) => {
      const [tag, taggedAt] = line.split("\t");
      const match = PROGRAM_TAG.exec(tag ?? "");
      return match
        ? [{ tag, taggedAt, name: match[1], version: match[2] }]
        : [];
    });

const githubJson = async (path) => {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: githubHeaders("application/vnd.github+json"),
  });
  if (!response.ok) {
    throw new Error(`GET ${path} returned ${response.status}`);
  }
  return response.json();
};

const githubHeaders = (accept) => ({
  accept,
  "x-github-api-version": "2022-11-28",
  ...(process.env.GITHUB_TOKEN
    ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
    : {}),
});

/** Every release of the repository, by tag name. One listing, not one call per tag. */
const releasesByTag = async () => {
  const byTag = new Map();
  for (let page = 1; ; page++) {
    const releases = await githubJson(
      `/repos/${REPO}/releases?per_page=100&page=${page}`,
    );
    for (const release of releases) byTag.set(release.tag_name, release);
    if (releases.length < 100) return byTag;
  }
};

/** The release hash in a `<key>.so.sha256` asset, or null when the release has none. */
const releaseHash = async (release, key) => {
  const asset = release?.assets?.find((a) => a.name === `${key}.so.sha256`);
  if (!asset) return null;
  // GitHub answers an asset URL with a redirect to another host, and fetch
  // drops `authorization` across it: only a public release asset arrives.
  const response = await fetch(asset.url, {
    headers: githubHeaders("application/octet-stream"),
  });
  if (!response.ok) {
    throw new Error(`GET ${asset.name} returned ${response.status}`);
  }
  return (await response.text()).trim();
};

/** What the chain holds. `solana-verify` downloads the program and hashes it. */
const onChainHash = (programId, url) =>
  execFileSync("solana-verify", ["get-program-hash", "--url", url, programId], {
    encoding: "utf8",
  }).trim();

const main = async () => {
  const url = process.env.SOLANA_URL || DEFAULT_RPC;
  const now = new Date();
  const releases = await releasesByTag();
  const tags = programTags();

  const results = [];
  for (const program of localnetPrograms(readFileSync("Anchor.toml", "utf8"))) {
    const published = [];
    for (const tag of tags.filter((t) => t.name === program.name)) {
      const hash = await releaseHash(releases.get(tag.tag), program.key);
      if (hash) published.push({ ...tag, hash });
    }
    // No release hash to compare with, so the chain is not read either.
    const result = published.length
      ? classify({
          releases: published,
          onChainHash: onChainHash(program.programId, url),
          now,
        })
      : { status: "skipped" };
    results.push({
      program: program.name,
      programId: program.programId,
      ...result,
    });
  }

  // Issue 53 reads the OtterSec `/status` of every `deployed` entry here and
  // submits a remote job when `is_verified` is false. Each entry carries the
  // program id it needs.
  console.log(
    JSON.stringify({
      programs: results,
      notices: results.flatMap(notice),
    }),
  );
};

/**
 * The `::warning::` bodies this run prints. Silent unless a person must act.
 *
 * An unknown binary is not here: it fails the run through its own step.
 */
export const notice = (result) => {
  if (result.status === "pending" && result.notify) {
    return [
      `${result.program} ${result.version}: tag ${result.tag} is ${Math.floor(result.tagAgeDays)} days old, not deployed`,
    ];
  }
  return [];
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    await main();
  } catch (error) {
    console.error(`${String(error?.message ?? error)}\n${USAGE}`);
    process.exit(1);
  }
}
