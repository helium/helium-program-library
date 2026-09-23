/**
 * Compare each program's on-chain hash with its release hashes.
 *
 * A read-only witness, run on a schedule. It takes no action: it reports
 * deployed, pending, rolled back, or unknown binary per program, and prints one JSON object
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
const PROGRAM_TAG = /^program-([a-z0-9]+(?:-[a-z0-9]+)*)-(\d+\.\d+\.\d+)$/;

/** The program name and version a `program-<name>-<x.y.z>` tag names, or null. */
export const parseProgramTag = (tag) => {
  const match = PROGRAM_TAG.exec(tag ?? "");
  return match ? { name: match[1], version: match[2] } : null;
};

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
 * `preHashDeploy` is true when the program also has tags whose release carries
 * no hash asset and the last upgrade predates the oldest hashed release: the
 * chain may still run one of those unhashed tags. `deployedAt` is the last
 * upgrade time, or null when it was not read.
 */
export const classify = ({
  releases,
  onChainHash,
  now,
  preHashDeploy = false,
  deployedAt = null,
}) => {
  const sorted = [...releases].sort(byVersionDesc);
  const newest = sorted[0];
  // No release of this program published a hash asset. Nothing to compare with.
  if (!newest) return { status: "skipped" };
  const tagAgeDays = ageInDays(newest.taggedAt, now);
  if (onChainHash === newest.hash) {
    return { status: "deployed", version: newest.version };
  }
  // The chain holds a binary this repository never released, unless the deploy
  // predates the hash assets and so may be an unhashed tag.
  if (
    !preHashDeploy &&
    !sorted.some((release) => release.hash === onChainHash)
  ) {
    return { status: "unknown binary", version: newest.version };
  }
  // An older release deployed after the newest one was created is a rollback,
  // not an upgrade that has yet to execute. An older proposal that executes
  // after a newer release was tagged also reads as rolled back, so a person
  // must look at it.
  const matched = sorted.find((release) => release.hash === onChainHash);
  if (
    matched &&
    deployedAt !== null &&
    deployedAt.getTime() > new Date(newest.taggedAt).getTime()
  ) {
    return { status: "rolled back", version: matched.version };
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

/**
 * Every `program-<name>-<x.y.z>` tag with its creator date. For a lightweight
 * tag that is the commit date, so `main` prefers the release's `created_at`.
 */
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
      const parsed = parseProgramTag(tag);
      return parsed ? [{ tag, taggedAt, ...parsed }] : [];
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

/** One JSON-RPC call. The workflow installs no packages, so no web3.js. */
const rpc = async (url, method, params) => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!response.ok) throw new Error(`${method} returned ${response.status}`);
  const { result, error } = await response.json();
  if (error) throw new Error(`${method}: ${error.message}`);
  return result;
};

const UPGRADEABLE_LOADER = "BPFLoaderUpgradeab1e11111111111111111111111";

/**
 * Whether a `jsonParsed` transaction upgrades or first deploys a program. Pure.
 * Squads executes the upgrade as a CPI, so the inner instructions count too.
 * An ExtendProgram alone is not an upgrade.
 */
export const isUpgradeTransaction = (tx) =>
  [
    ...(tx?.transaction?.message?.instructions ?? []),
    ...(tx?.meta?.innerInstructions ?? []).flatMap(
      (inner) => inner.instructions,
    ),
  ].some(
    (ix) =>
      ix.programId === UPGRADEABLE_LOADER &&
      ["upgrade", "deployWithMaxDataLen"].includes(ix.parsed?.type),
  );

/**
 * When the program was last upgraded, or null. The ProgramData header slot is
 * not used: `solana program extend` before the vote rewrites it. The last
 * upgrade transaction touches the ProgramData account, so its signatures hold it.
 */
export const lastUpgradeTime = async (url, programId, since) => {
  const program = await rpc(url, "getAccountInfo", [
    programId,
    { encoding: "jsonParsed" },
  ]);
  const programData = program?.value?.data?.parsed?.info?.programData;
  if (!programData) return null;
  let before;
  let seen = 0;
  for (;;) {
    const signatures = await rpc(url, "getSignaturesForAddress", [
      programData,
      { limit: 50, ...(before ? { before } : {}) },
    ]);
    if (!signatures.length) return null;
    for (const { signature, err, blockTime } of signatures) {
      if (++seen > 1000) {
        throw new Error(
          `${programId}: no upgrade in the last 1000 ProgramData signatures`,
        );
      }
      // No upgrade is newer than this signature, and it predates every
      // release, so its time bounds the upgrade time from above.
      if (blockTime != null && blockTime * 1000 < since.getTime()) {
        return new Date(blockTime * 1000);
      }
      if (err !== null) continue;
      const tx = await rpc(url, "getTransaction", [
        signature,
        { encoding: "jsonParsed", maxSupportedTransactionVersion: 1 },
      ]);
      if (isUpgradeTransaction(tx)) {
        return tx.blockTime == null ? null : new Date(tx.blockTime * 1000);
      }
    }
    before = signatures[signatures.length - 1].signature;
  }
};

const main = async () => {
  const url = process.env.SOLANA_URL || DEFAULT_RPC;
  const now = new Date();
  const releases = await releasesByTag();
  const tags = programTags();

  const results = [];
  for (const program of localnetPrograms(readFileSync("Anchor.toml", "utf8"))) {
    const published = [];
    let hasUnhashedTags = false;
    for (const tag of tags.filter((t) => t.name === program.name)) {
      const release = releases.get(tag.tag);
      const hash = await releaseHash(release, program.key);
      if (hash) {
        published.push({
          ...tag,
          taggedAt: release.created_at ?? tag.taggedAt,
          hash,
        });
      } else {
        hasUnhashedTags = true;
      }
    }
    // No release hash to compare with, so the chain is not read either.
    const chainHash = published.length
      ? onChainHash(program.programId, url)
      : null;
    const [newest] = [...published].sort(byVersionDesc);
    const matchesOlder =
      chainHash !== null &&
      chainHash !== newest.hash &&
      published.some((release) => release.hash === chainHash);
    // A null time means no upgrade was found in the whole history, so an
    // older-release match stays pending.
    const deployedAt =
      published.length && (hasUnhashedTags || matchesOlder)
        ? await lastUpgradeTime(
            url,
            program.programId,
            new Date(
              Math.min(
                ...published.map((release) =>
                  new Date(release.taggedAt).getTime(),
                ),
              ),
            ),
          )
        : null;
    const preHashDeploy =
      deployedAt !== null &&
      published.every(
        (release) =>
          deployedAt.getTime() < new Date(release.taggedAt).getTime(),
      );
    const result = published.length
      ? classify({
          releases: published,
          onChainHash: chainHash,
          now,
          preHashDeploy,
          deployedAt,
        })
      : { status: "skipped" };
    results.push({
      program: program.name,
      programId: program.programId,
      ...result,
    });
  }

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
 * An unknown binary and a rollback are not here: each fails the run through
 * its own step.
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
