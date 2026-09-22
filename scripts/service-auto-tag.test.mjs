import assert from "node:assert/strict";
import test from "node:test";

import { serviceAutoTag } from "./service-auto-tag.mjs";

const dockerInfo = {
  web: {
    "solana-monitor": "./packages/monitor-service",
    "ecc-verifier": "./utils/ecc-sig-verifier",
    "faucet-service": "./packages/faucet-service",
  },
  oracle: { "distributor-oracle": "./packages/distributor-oracle" },
  autoTag: ["solana-monitor"],
};

// Every service builds with `turbo prune` and changed, unless a test says otherwise.
const io = {
  usesTurboPrune: () => true,
  workspaceChanged: () => true,
  pathChanged: () => true,
};

test("the highest version in the repo wins over the newest tag", () => {
  const bases = [];
  const { tags } = serviceAutoTag({
    ...io,
    dockerInfo,
    // Newest first, as `--sort=-creatordate` gives them: 0.0.15 is the newest
    // tag, 0.0.17 came from a fix branch earlier, 0.0.9 sorts last as a string.
    tags: [
      "docker-web-solana-monitor-0.0.15",
      "docker-web-solana-monitor-0.0.17",
      "docker-web-solana-monitor-0.0.9",
    ],
    workspaceChanged: (path, tag) => {
      bases.push(tag);
      return true;
    },
  });

  assert.deepEqual(bases, ["docker-web-solana-monitor-0.0.17"]);
  assert.deepEqual(tags, [
    {
      service: "solana-monitor",
      env: "web",
      path: "./packages/monitor-service",
      lastTag: "docker-web-solana-monitor-0.0.17",
      tag: "docker-web-solana-monitor-0.0.18",
      rule: "workspace",
    },
  ]);
});

test("a hand minor bump is continued from", () => {
  const { tags } = serviceAutoTag({
    ...io,
    dockerInfo,
    tags: [
      "docker-web-solana-monitor-0.1.19",
      "docker-web-solana-monitor-0.2.0",
      "docker-web-solana-monitor-0.1.20",
    ],
  });

  assert.deepEqual(
    tags.map(({ lastTag, tag }) => [lastTag, tag]),
    [["docker-web-solana-monitor-0.2.0", "docker-web-solana-monitor-0.2.1"]],
  );
});

test("a service with no tag is skipped with a reason, and the others still tag", () => {
  const { tags, skipped } = serviceAutoTag({
    ...io,
    dockerInfo: {
      ...dockerInfo,
      autoTag: ["faucet-service", "solana-monitor"],
    },
    tags: [
      "docker-web-solana-monitor-0.1.19",
      // Not a version: the repo holds a tag of this shape.
      "docker-web-faucet-service-0.0.1-test",
    ],
  });

  assert.deepEqual(skipped, [
    { service: "faucet-service", reason: "no docker tag yet" },
  ]);
  assert.deepEqual(
    tags.map(({ tag }) => tag),
    ["docker-web-solana-monitor-0.1.20"],
  );
});

test("a Dockerfile without turbo prune asks its own path only", () => {
  const asked = [];
  const { tags, unchanged } = serviceAutoTag({
    dockerInfo: { ...dockerInfo, autoTag: ["ecc-verifier", "solana-monitor"] },
    tags: ["docker-web-ecc-verifier-0.1.1", "docker-web-solana-monitor-0.1.19"],
    usesTurboPrune: (path) => path === "./packages/monitor-service",
    workspaceChanged: (path, tag) => {
      asked.push(["workspace", path, tag]);
      return false;
    },
    pathChanged: (path, tag) => {
      asked.push(["path", path, tag]);
      return true;
    },
  });

  assert.deepEqual(asked, [
    ["path", "./utils/ecc-sig-verifier", "docker-web-ecc-verifier-0.1.1"],
    [
      "workspace",
      "./packages/monitor-service",
      "docker-web-solana-monitor-0.1.19",
    ],
  ]);
  assert.deepEqual(
    tags.map(({ tag, rule }) => [tag, rule]),
    [["docker-web-ecc-verifier-0.1.2", "path"]],
  );
  assert.deepEqual(unchanged, [
    {
      service: "solana-monitor",
      lastTag: "docker-web-solana-monitor-0.1.19",
      rule: "workspace",
    },
  ]);
});

test("an opted-in name with no path in docker-info.json is skipped", () => {
  const { tags, skipped } = serviceAutoTag({
    ...io,
    dockerInfo: { ...dockerInfo, autoTag: ["helius-service"] },
    tags: ["docker-web-helius-service-0.0.1"],
  });

  assert.deepEqual(tags, []);
  assert.deepEqual(skipped, [
    { service: "helius-service", reason: "not in docker-info.json" },
  ]);
});

test("the base is the tag that exists, whatever account it names", () => {
  const { tags } = serviceAutoTag({
    ...io,
    dockerInfo: { ...dockerInfo, autoTag: ["distributor-oracle"] },
    tags: [
      "docker-oracle-distributor-oracle-0.1.24",
      "docker-web-distributor-oracle-0.1.25",
    ],
  });

  assert.deepEqual(
    tags.map(({ lastTag, tag }) => [lastTag, tag]),
    [
      [
        "docker-web-distributor-oracle-0.1.25",
        "docker-oracle-distributor-oracle-0.1.26",
      ],
    ],
  );
});
