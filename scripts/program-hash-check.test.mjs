import assert from "node:assert/strict";
import test from "node:test";

import { classify, notice } from "./program-hash-check.mjs";

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

test("the on-chain hash equals an older release hash, newest tag under 3 days: pending, silent", () => {
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
