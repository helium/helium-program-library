import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  missingBumpCheck,
  packageVersion,
  taggedVersions,
} from "./missing-bump-check.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

// Real `cargo metadata --no-deps` output, trimmed to the fields the script reads.
const metadata = JSON.parse(
  readFileSync(path.join(here, "fixtures", "cargo-metadata.json"), "utf8"),
);

const find = (results, name) => results.find((r) => r.name === name);

test("a program whose current version has no tag is bumped, so it passes", () => {
  const { ok, results } = missingBumpCheck({
    metadata,
    programs: [
      { name: "price-oracle", version: "0.2.3", tags: ["0.2.2"] },
      {
        name: "fanout",
        version: "0.1.3",
        tags: ["0.1.3"],
        tagCommit: "fanout-tag",
      },
    ],
    changedFiles: () => ["programs/price-oracle/src/lib.rs"],
  });

  assert.equal(ok, true);
  assert.deepEqual(find(results, "price-oracle"), {
    name: "price-oracle",
    version: "0.2.3",
    status: "bumped",
    base: null,
    via: [],
    files: [],
  });
});

test("a tagged version with a source change fails and names the base and the files", () => {
  const { ok, failing } = missingBumpCheck({
    metadata,
    programs: [
      {
        name: "price-oracle",
        version: "0.2.2",
        tags: ["0.2.2", "0.2.3"],
        tagCommit: "price-oracle-tag",
      },
    ],
    changedFiles: (base) =>
      base === "price-oracle-tag"
        ? ["programs/price-oracle/src/lib.rs", "tests/price-oracle.ts"]
        : [],
  });

  assert.equal(ok, false);
  assert.deepEqual(failing, [
    {
      name: "price-oracle",
      version: "0.2.2",
      status: "missing-bump",
      base: "price-oracle-tag",
      via: [],
      files: ["programs/price-oracle/src/lib.rs"],
    },
  ]);
});

test("a change only in a direct dependency fails the dependent", () => {
  const { ok, failing } = missingBumpCheck({
    metadata,
    programs: [
      {
        name: "hexboosting",
        version: "0.2.4",
        tags: ["0.2.4"],
        tagCommit: "hexboosting-tag",
      },
    ],
    changedFiles: () => ["utils/shared-utils/src/precise_number.rs"],
  });

  assert.equal(ok, false);
  assert.deepEqual(failing, [
    {
      name: "hexboosting",
      version: "0.2.4",
      status: "missing-bump",
      base: "hexboosting-tag",
      via: ["shared-utils"],
      files: ["utils/shared-utils/src/precise_number.rs"],
    },
  ]);
});

const PRICE_ORACLE_SKIPPED = {
  name: "price-oracle",
  version: "0.2.2",
  tags: ["0.2.2"],
  tagCommit: "price-oracle-tag",
  skippedSha: "reviewed-sha",
};

test("a change since the tag but not since the skipped.json SHA passes", () => {
  const { ok, results } = missingBumpCheck({
    metadata,
    programs: [PRICE_ORACLE_SKIPPED],
    changedFiles: (base) =>
      base === "price-oracle-tag" ? ["programs/price-oracle/src/lib.rs"] : [],
  });

  assert.equal(ok, true);
  assert.equal(results[0].status, "clean");
});

test("a change since both the tag and the skipped.json SHA fails", () => {
  const { ok, failing } = missingBumpCheck({
    metadata,
    programs: [PRICE_ORACLE_SKIPPED],
    changedFiles: (base) =>
      ({
        "price-oracle-tag": [
          "programs/price-oracle/src/lib.rs",
          "programs/price-oracle/src/state.rs",
        ],
        "reviewed-sha": ["programs/price-oracle/src/state.rs"],
      })[base],
  });

  assert.equal(ok, false);
  assert.deepEqual(failing, [
    {
      name: "price-oracle",
      version: "0.2.2",
      status: "missing-bump",
      base: "price-oracle-tag",
      via: [],
      files: ["programs/price-oracle/src/state.rs"],
    },
  ]);
});

test("a change since the tag and a different change since the skipped.json SHA passes", () => {
  const { ok, results } = missingBumpCheck({
    metadata,
    programs: [PRICE_ORACLE_SKIPPED],
    changedFiles: (base) =>
      ({
        "price-oracle-tag": ["programs/price-oracle/src/lib.rs"],
        "reviewed-sha": ["programs/price-oracle/src/state.rs"],
      })[base],
  });

  assert.equal(ok, true);
  assert.equal(results[0].status, "clean");
});

test("a change since the tag with no skipped.json SHA fails on the tag diff alone", () => {
  const { ok, failing } = missingBumpCheck({
    metadata,
    programs: [{ ...PRICE_ORACLE_SKIPPED, skippedSha: undefined }],
    changedFiles: (base) =>
      base === "price-oracle-tag" ? ["programs/price-oracle/src/lib.rs"] : [],
  });

  assert.equal(ok, false);
  assert.equal(failing[0].status, "missing-bump");
  assert.deepEqual(failing[0].files, ["programs/price-oracle/src/lib.rs"]);
});

test("a program with no tag at all is skipped, and nothing is diffed for it", () => {
  const bases = [];
  const { ok, results } = missingBumpCheck({
    metadata,
    programs: [{ name: "welcome-pack", version: "0.0.6", tags: [] }],
    changedFiles: (base) => {
      bases.push(base);
      return ["programs/welcome-pack/src/lib.rs"];
    },
  });

  assert.deepEqual(bases, []);
  assert.equal(ok, true);
  assert.deepEqual(results, [
    {
      name: "welcome-pack",
      version: "0.0.6",
      status: "new",
      base: null,
      via: [],
      files: [],
    },
  ]);
});

test("a tests-only change since the tag passes", () => {
  const { ok, results } = missingBumpCheck({
    metadata,
    programs: [
      {
        name: "fanout",
        version: "0.1.3",
        tags: ["0.1.3"],
        tagCommit: "fanout-tag",
      },
    ],
    changedFiles: () => [
      "tests/fanout.ts",
      "programs/fanout/README.md",
      "Cargo.lock",
    ],
  });

  assert.equal(ok, true);
  assert.equal(results[0].status, "clean");
  assert.equal(results[0].base, "fanout-tag");
});

test("only exact program-<name>-<x.y.z> tags of the program name its versions", () => {
  assert.deepEqual(
    taggedVersions("fanout", [
      "program-fanout-0.1.0",
      "vprogram-fanout-0.1.1",
      "v0.1.2",
      "program-fanout-0.1.3-test",
      "program-fanuot-0.1.4",
      "program-fanout-extra-0.1.5",
      "",
    ]),
    ["0.1.0"],
  );
});

test("the package version is the literal version, and a workspace-inherited one throws by name", () => {
  assert.equal(
    packageVersion("fanout", '[package]\nname = "fanout"\nversion = "0.1.3"\n'),
    "0.1.3",
  );
  assert.throws(
    () =>
      packageVersion(
        "fanout",
        '[package]\nname = "fanout"\nversion.workspace = true\n',
      ),
    /programs\/fanout\/Cargo.toml has no literal version/,
  );
});
