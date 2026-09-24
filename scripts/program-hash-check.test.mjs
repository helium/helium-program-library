import assert from "node:assert/strict";
import test from "node:test";

import {
  checkProgram,
  classify,
  isUpgradeTransaction,
  lastUpgradeTime,
  notice,
  parseProgramTag,
} from "./program-hash-check.mjs";

const NOW = new Date("2026-09-21T00:00:00Z");
const day = (n) => new Date(NOW.getTime() - n * 86400000).toISOString();

test("the on-chain hash equals the newest release hash: deployed", () => {
  assert.deepEqual(
    classify({
      releases: [
        {
          tag: "program-fanout-0.1.2",
          version: "0.1.2",
          hash: "aa",
          taggedAt: day(9),
        },
        {
          tag: "program-fanout-0.1.3",
          version: "0.1.3",
          hash: "bb",
          taggedAt: day(1),
        },
      ],
      onChainHash: "bb",
      now: NOW,
    }),
    { status: "deployed", version: "0.1.3" },
  );
});

test("the on-chain hash equals an older release hash, deployed before the newest tag under 3 days: pending, silent", () => {
  assert.deepEqual(
    classify({
      releases: [
        {
          tag: "program-fanout-0.1.2",
          version: "0.1.2",
          hash: "aa",
          taggedAt: day(9),
        },
        {
          tag: "program-fanout-0.1.3",
          version: "0.1.3",
          hash: "bb",
          taggedAt: day(2),
        },
      ],
      onChainHash: "aa",
      now: NOW,
      deployedAt: new Date(day(5)),
    }),
    {
      status: "pending",
      version: "0.1.3",
      tag: "program-fanout-0.1.3",
      tagAgeDays: 2,
      notify: false,
    },
  );
});

test("the newest tag is older than 3 days and the upgrade is not executed: pending, one notice", () => {
  assert.deepEqual(
    classify({
      releases: [
        {
          tag: "program-fanout-0.1.2",
          version: "0.1.2",
          hash: "aa",
          taggedAt: day(9),
        },
        {
          tag: "program-fanout-0.1.3",
          version: "0.1.3",
          hash: "bb",
          taggedAt: day(4),
        },
      ],
      onChainHash: "aa",
      now: NOW,
    }),
    {
      status: "pending",
      version: "0.1.3",
      tag: "program-fanout-0.1.3",
      tagAgeDays: 4,
      notify: true,
    },
  );
});

test("the on-chain hash equals no release hash: unknown binary", () => {
  assert.deepEqual(
    classify({
      releases: [
        {
          tag: "program-fanout-0.1.3",
          version: "0.1.3",
          hash: "bb",
          taggedAt: day(4),
        },
      ],
      onChainHash: "cc",
      now: NOW,
    }),
    { status: "unknown binary", version: "0.1.3" },
  );
});

test("no release carries a hash asset: skipped", () => {
  assert.deepEqual(
    classify({
      releases: [],
      onChainHash: "cc",
      now: NOW,
    }),
    { status: "skipped" },
  );
});

test("a pending program past the notice window: one annotation line naming the tag and its age", () => {
  assert.deepEqual(
    notice({
      program: "fanout",
      status: "pending",
      version: "0.1.3",
      tag: "program-fanout-0.1.3",
      tagAgeDays: 4.7,
      notify: true,
    }),
    ["fanout 0.1.3: tag program-fanout-0.1.3 is 4 days old, not deployed"],
  );
});

test("a pending program inside the notice window: no annotation", () => {
  assert.deepEqual(
    notice({
      program: "fanout",
      status: "pending",
      version: "0.1.3",
      tag: "program-fanout-0.1.3",
      tagAgeDays: 2,
      notify: false,
    }),
    [],
  );
});

// An unknown binary fails the run through its own step, so it is not a pending notice.
test("an unknown binary: no annotation", () => {
  assert.deepEqual(
    notice({ program: "fanout", status: "unknown binary", version: "0.1.3" }),
    [],
  );
});

test("the on-chain hash equals no release hash and the deploy predates the hashed releases: pending", () => {
  assert.deepEqual(
    classify({
      releases: [
        {
          tag: "program-fanout-0.1.3",
          version: "0.1.3",
          hash: "bb",
          taggedAt: day(4),
        },
      ],
      onChainHash: "cc",
      now: NOW,
      preHashDeploy: true,
    }),
    {
      status: "pending",
      version: "0.1.3",
      tag: "program-fanout-0.1.3",
      tagAgeDays: 4,
      notify: true,
    },
  );
});

test("the on-chain hash equals no release hash and the deploy is after the hashed releases: unknown binary", () => {
  assert.deepEqual(
    classify({
      releases: [
        {
          tag: "program-fanout-0.1.3",
          version: "0.1.3",
          hash: "bb",
          taggedAt: day(4),
        },
      ],
      onChainHash: "cc",
      now: NOW,
      preHashDeploy: false,
    }),
    { status: "unknown binary", version: "0.1.3" },
  );
});

test("the on-chain hash equals an older release hash deployed after the newest release: rolled back", () => {
  assert.deepEqual(
    classify({
      releases: [
        {
          tag: "program-fanout-0.1.2",
          version: "0.1.2",
          hash: "aa",
          taggedAt: day(9),
        },
        {
          tag: "program-fanout-0.1.3",
          version: "0.1.3",
          hash: "bb",
          taggedAt: day(2),
        },
      ],
      onChainHash: "aa",
      now: NOW,
      deployedAt: new Date(day(1)),
    }),
    { status: "rolled back", version: "0.1.2" },
  );
});

// The last upgrade time is not read, so the check cannot tell a rollback from a vote.
test("the on-chain hash equals an older release hash and no upgrade time: pending", () => {
  assert.deepEqual(
    classify({
      releases: [
        {
          tag: "program-fanout-0.1.2",
          version: "0.1.2",
          hash: "aa",
          taggedAt: day(9),
        },
        {
          tag: "program-fanout-0.1.3",
          version: "0.1.3",
          hash: "bb",
          taggedAt: day(2),
        },
      ],
      onChainHash: "aa",
      now: NOW,
      deployedAt: null,
    }),
    {
      status: "pending",
      version: "0.1.3",
      tag: "program-fanout-0.1.3",
      tagAgeDays: 2,
      notify: false,
    },
  );
});

const LOADER = "BPFLoaderUpgradeab1e11111111111111111111111";
const loaderIx = (type, programDataAccount = "PD") => ({
  program: "bpf-upgradeable-loader",
  programId: LOADER,
  parsed: { type, info: { programDataAccount } },
});
const parsedTx = (instructions, innerInstructions = []) => ({
  blockTime: 1,
  transaction: { message: { instructions } },
  meta: { innerInstructions },
});

test("an outer upgrade instruction: an upgrade transaction", () => {
  assert.equal(
    isUpgradeTransaction(parsedTx([loaderIx("upgrade")]), "PD"),
    true,
  );
});

test("an upgrade only in the inner instructions: an upgrade transaction", () => {
  assert.equal(
    isUpgradeTransaction(
      parsedTx(
        [
          {
            programId: "SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf",
            data: "",
          },
        ],
        [{ index: 0, instructions: [loaderIx("upgrade")] }],
      ),
      "PD",
    ),
    true,
  );
});

test("a deployWithMaxDataLen instruction: an upgrade transaction", () => {
  assert.equal(
    isUpgradeTransaction(parsedTx([loaderIx("deployWithMaxDataLen")]), "PD"),
    true,
  );
});

test("an extendProgram-only transaction: not an upgrade transaction", () => {
  assert.equal(
    isUpgradeTransaction(parsedTx([loaderIx("extendProgram")]), "PD"),
    false,
  );
});

test("a setAuthority transaction: not an upgrade transaction", () => {
  assert.equal(
    isUpgradeTransaction(parsedTx([loaderIx("setAuthority")]), "PD"),
    false,
  );
});

test("an upgrade of another ProgramData: not an upgrade transaction", () => {
  assert.equal(
    isUpgradeTransaction(parsedTx([loaderIx("upgrade", "OTHER")]), "PD"),
    false,
  );
});

// Canned JSON-RPC answers: the program's ProgramData address, its signatures,
// newest first, in pages of 50, and the parsed transaction of each upgrade
// signature.
const stubRpc = (signatures, upgrades, programData = "PD") => {
  const fetch = globalThis.fetch;
  globalThis.fetch = async (_url, { body }) => {
    const { method, params } = JSON.parse(body);
    const result = {
      getAccountInfo: () => ({
        value: { data: { parsed: { info: { programData } } } },
      }),
      getSignaturesForAddress: () => {
        const start = params[1].before
          ? signatures.findIndex((s) => s.signature === params[1].before) + 1
          : 0;
        return signatures.slice(start, start + params[1].limit);
      },
      getTransaction: () =>
        params[0] in upgrades
          ? upgrades[params[0]]
          : parsedTx([loaderIx("extendProgram")]),
    }[method]();
    return { ok: true, json: async () => ({ result }) };
  };
  return () => {
    globalThis.fetch = fetch;
  };
};
const signature = (i, blockTime) => ({
  signature: `s${i}`,
  err: null,
  blockTime,
});
const SINCE = new Date(day(10));
const secondsAgo = (days) => Math.floor(new Date(day(days)).getTime() / 1000);

test("the upgrade is on the second page: its time", async (t) => {
  const signatures = Array.from({ length: 60 }, (_, i) =>
    signature(i, secondsAgo(1)),
  );
  t.after(
    stubRpc(signatures, {
      s55: { ...parsedTx([loaderIx("upgrade")]), blockTime: secondsAgo(2) },
    }),
  );
  assert.deepEqual(
    await lastUpgradeTime("rpc", "program", SINCE),
    new Date(secondsAgo(2) * 1000),
  );
});

test("a signature older than the oldest release before any upgrade: its time", async (t) => {
  t.after(
    stubRpc(
      [
        signature(0, secondsAgo(1)),
        { signature: "s1", err: {}, blockTime: secondsAgo(11) },
        signature(2, secondsAgo(12)),
      ],
      { s2: { ...parsedTx([loaderIx("upgrade")]), blockTime: secondsAgo(12) } },
    ),
  );
  assert.deepEqual(
    await lastUpgradeTime("rpc", "program", SINCE),
    new Date(secondsAgo(11) * 1000),
  );
});

test("more than 1000 signatures and no upgrade: an error", async (t) => {
  t.after(
    stubRpc(
      Array.from({ length: 1100 }, (_, i) => signature(i, secondsAgo(1))),
      {},
    ),
  );
  await assert.rejects(
    lastUpgradeTime("rpc", "program", SINCE),
    /no upgrade in the last 1000/,
  );
});

test("a successful signature whose transaction the RPC cannot serve: an error", async (t) => {
  t.after(
    stubRpc([signature(0, secondsAgo(1)), signature(1, secondsAgo(2))], {
      s0: null,
      s1: { ...parsedTx([loaderIx("upgrade")]), blockTime: secondsAgo(2) },
    }),
  );
  await assert.rejects(
    lastUpgradeTime("rpc", "program", SINCE),
    /program: getTransaction returned null for s0/,
  );
});

test("an empty first signature page: error, not pending", async (t) => {
  t.after(stubRpc([], {}));
  assert.deepEqual(
    await checkProgram(FANOUT, lookups({ lastUpgradeTime: undefined })),
    {
      program: "fanout",
      programId: "fan",
      status: "error",
      version: "0.1.3",
      message: "fan: ProgramData history ended with no deploy or upgrade found",
    },
  );
});

test("a program account with no ProgramData address: error, not pending", async (t) => {
  t.after(stubRpc([], {}, null));
  assert.deepEqual(
    await checkProgram(FANOUT, lookups({ lastUpgradeTime: undefined })),
    {
      program: "fanout",
      programId: "fan",
      status: "error",
      version: "0.1.3",
      message: "fan: no ProgramData address",
    },
  );
});

test("an upgrade transaction with no blockTime: error, not pending", async (t) => {
  t.after(
    stubRpc([signature(0, secondsAgo(1))], {
      s0: { ...parsedTx([loaderIx("upgrade")]), blockTime: null },
    }),
  );
  assert.deepEqual(
    await checkProgram(FANOUT, lookups({ lastUpgradeTime: undefined })),
    {
      program: "fanout",
      programId: "fan",
      status: "error",
      version: "0.1.3",
      message: "fan: upgrade transaction s0 has no blockTime",
    },
  );
});

test("a program tag parses to its name and version", () => {
  assert.deepEqual(parseProgramTag("program-fanout-0.1.0"), {
    name: "fanout",
    version: "0.1.0",
  });
});

test("a v-prefixed tag is not a program tag", () => {
  assert.equal(parseProgramTag("vprogram-fanout-0.1.0"), null);
  assert.equal(parseProgramTag("v0.1.0"), null);
});

test("a -test suffixed tag is not a program tag", () => {
  assert.equal(parseProgramTag("program-fanout-0.1.0-test"), null);
});

// Two hashed fanout releases and one unhashed, with the lookups stubbed.
const FANOUT = { key: "fanout", name: "fanout", programId: "fan" };
const releaseTag = (version, days) => ({
  tag: `program-fanout-${version}`,
  taggedAt: day(days),
  name: "fanout",
  version,
});
const TAGS = [
  releaseTag("0.1.1", 20),
  releaseTag("0.1.2", 9),
  releaseTag("0.1.3", 2),
];
const RELEASES = new Map([
  ["program-fanout-0.1.1", { created_at: day(20) }],
  ["program-fanout-0.1.2", { created_at: day(9), hash: "aa" }],
  ["program-fanout-0.1.3", { created_at: day(2), hash: "bb" }],
]);
const lookups = (overrides) => ({
  tags: TAGS,
  releases: RELEASES,
  url: "rpc",
  now: NOW,
  releaseHash: async (release) => release?.hash ?? null,
  onChainHash: () => "aa",
  lastUpgradeTime: async () => new Date(day(5)),
  ...overrides,
});

test("the upgrade time lookup fails: error, and the next program still gets a result", async () => {
  const results = [];
  for (const [program, chain] of [
    [FANOUT, "aa"],
    [FANOUT, "bb"],
  ]) {
    results.push(
      await checkProgram(
        program,
        lookups({
          onChainHash: () => chain,
          lastUpgradeTime: async () => {
            throw new Error("getSignaturesForAddress returned 429");
          },
        }),
      ),
    );
  }
  assert.deepEqual(results, [
    {
      program: "fanout",
      programId: "fan",
      status: "error",
      version: "0.1.3",
      message: "getSignaturesForAddress returned 429",
    },
    {
      program: "fanout",
      programId: "fan",
      status: "deployed",
      version: "0.1.3",
    },
  ]);
});

test("the release hash lookup fails: error", async () => {
  assert.deepEqual(
    await checkProgram(
      FANOUT,
      lookups({
        releaseHash: async () => {
          throw new Error("GET fanout.so.sha256 returned 502");
        },
      }),
    ),
    {
      program: "fanout",
      programId: "fan",
      status: "error",
      version: undefined,
      message: "GET fanout.so.sha256 returned 502",
    },
  );
});

test("a release published after its tag: the published time is the tag time", async () => {
  // The upgrade at day 5 is after the 0.1.3 commit but before its release went out.
  const releases = new Map(RELEASES);
  releases.set("program-fanout-0.1.3", {
    created_at: day(6),
    published_at: day(2),
    hash: "bb",
  });
  const result = await checkProgram(FANOUT, lookups({ releases }));
  assert.equal(result.status, "pending");
  assert.equal(Math.round(result.tagAgeDays), 2);
});

test("the chain runs the newest release and older tags are unhashed: deployed, no upgrade time lookup", async () => {
  let lookedUp = false;
  assert.deepEqual(
    await checkProgram(
      FANOUT,
      lookups({
        onChainHash: () => "bb",
        lastUpgradeTime: async () => {
          lookedUp = true;
          return new Date(day(1));
        },
      }),
    ),
    {
      program: "fanout",
      programId: "fan",
      status: "deployed",
      version: "0.1.3",
    },
  );
  assert.equal(lookedUp, false);
});
