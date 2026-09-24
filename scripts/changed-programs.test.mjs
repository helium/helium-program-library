import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildGraph,
  changedPrograms,
  changedProgramsForBases,
  isNoReleasePath,
} from "./changed-programs.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

// Real `cargo metadata --no-deps` output, trimmed to the fields the script reads.
const metadata = JSON.parse(
  readFileSync(path.join(here, "fixtures", "cargo-metadata.json"), "utf8"),
);

const names = (changed) => changed.map((c) => c.name);
const find = (changed, name) => changed.find((c) => c.name === name);

test("a program's own src change marks it own and its dependents via it", () => {
  const changed = changedPrograms({
    metadata,
    files: ["programs/helium-sub-daos/src/instructions/track_dc_burn_v0.rs"],
  });

  assert.deepEqual(find(changed, "helium-sub-daos"), {
    name: "helium-sub-daos",
    own: true,
    via: [],
  });
  assert.deepEqual(find(changed, "hexboosting"), {
    name: "hexboosting",
    own: false,
    via: ["helium-sub-daos"],
  });
  assert.deepEqual(names(changed).sort(), [
    "data-credits",
    "dc-auto-top",
    "helium-entity-manager",
    "helium-sub-daos",
    "hexboosting",
    "hpl-crons",
    "mobile-entity-manager",
    "rewards-oracle",
  ]);
});

test("a utils crate's src change marks every program that depends on it", () => {
  const changed = changedPrograms({
    metadata,
    files: ["utils/shared-utils/src/precise_number.rs"],
  });

  assert.equal(
    changed.every((c) => c.own === false && c.via.length === 1),
    true,
  );
  assert.deepEqual(names(changed), [
    "circuit-breaker",
    "data-credits",
    "dc-auto-top",
    "fanout",
    "helium-entity-manager",
    "helium-sub-daos",
    "hexboosting",
    "hpl-crons",
    "lazy-distributor",
    "lazy-transactions",
    "mini-fanout",
    "mobile-entity-manager",
    "no-emit",
    "rewards-oracle",
    "treasury-management",
    "tuktuk-dca",
    "voter-stake-registry",
    "welcome-pack",
  ]);
});

test("Cargo.lock, the root Cargo.toml, tests and docs mark nothing", () => {
  const changed = changedPrograms({
    metadata,
    files: [
      "Cargo.lock",
      "Cargo.toml",
      "tests/hexboosting.ts",
      "programs/hexboosting/README.md",
      "programs/hexboosting/src/NOTES.md",
    ],
  });

  assert.deepEqual(changed, []);
});

test("the no-release path filter names markdown, tests, workflows, and scratch", () => {
  assert.equal(isNoReleasePath("programs/hexboosting/README.md"), true);
  assert.equal(isNoReleasePath("docs/hexboosting.md"), true);
  assert.equal(isNoReleasePath("tests/hexboosting.ts"), true);
  assert.equal(isNoReleasePath("programs/hexboosting/tests/boost.rs"), true);
  assert.equal(isNoReleasePath("packages/spl-utils/src/x.test.ts"), true);
  assert.equal(isNoReleasePath(".github/workflows/tests.yaml"), true);
  assert.equal(isNoReleasePath(".scratch/feature/plan.md"), true);
  assert.equal(isNoReleasePath("programs/hexboosting/src/lib.rs"), false);
  assert.equal(isNoReleasePath("programs/hexboosting/Cargo.toml"), false);
  assert.equal(isNoReleasePath("packages/blockchain-api/docs/api.txt"), false);
});

test("a program's own Cargo.toml change marks it own", () => {
  const changed = changedPrograms({
    metadata,
    files: ["programs/price-oracle/Cargo.toml"],
  });

  assert.deepEqual(changed, [{ name: "price-oracle", own: true, via: [] }]);
});

test("a `workspace = true` dependency is seen", () => {
  const manifest = readFileSync(
    path.join(here, "..", "programs", "hexboosting", "Cargo.toml"),
    "utf8",
  );
  // The manifest names no path for shared-utils, so only cargo sees the edge.
  assert.match(manifest, /^shared-utils = \{ workspace = true \}$/m);

  const { dependents } = buildGraph(metadata);

  assert.equal(dependents.get("shared-utils").has("hexboosting"), true);
});

test("a workspace-excluded path dependency still marks its dependents", () => {
  const changed = changedPrograms({
    metadata,
    files: ["utils/default-env/src/lib.rs"],
  });

  // Every program but hpl-crons depends on default-env directly; hpl-crons
  // links it through helium-sub-daos.
  assert.equal(changed.length, 19);
  assert.equal(
    changed.every((c) => c.own === false && c.via[0] === "default-env"),
    true,
  );
});

test("edges are transitive, and via names the changed crate", () => {
  const changed = changedPrograms({
    metadata,
    files: ["programs/circuit-breaker/src/lib.rs"],
  });

  // helium-entity-manager links circuit-breaker through data-credits.
  assert.deepEqual(find(changed, "helium-entity-manager"), {
    name: "helium-entity-manager",
    own: false,
    via: ["circuit-breaker"],
  });
  assert.deepEqual(names(changed), [
    "circuit-breaker",
    "data-credits",
    "dc-auto-top",
    "helium-entity-manager",
    "helium-sub-daos",
    "hexboosting",
    "hpl-crons",
    "lazy-distributor",
    "mobile-entity-manager",
    "rewards-oracle",
    "treasury-management",
    "welcome-pack",
  ]);
});

test("an IDL under a crate's idls/ marks the programs that depend on it", () => {
  const changed = changedPrograms({
    metadata,
    files: ["utils/modular-governance/idls/proposal.json"],
  });

  // `declare_program!` in modular-governance reads these IDLs.
  assert.deepEqual(names(changed), [
    "data-credits",
    "dc-auto-top",
    "helium-entity-manager",
    "helium-sub-daos",
    "hexboosting",
    "hpl-crons",
    "mobile-entity-manager",
    "rewards-oracle",
    "voter-stake-registry",
  ]);
  assert.equal(
    changed.every((c) => !c.own && c.via[0] === "modular-governance"),
    true,
  );
});

test("a per-program base is honoured for that program only", () => {
  const changed = changedProgramsForBases({
    metadata,
    defaultBase: "develop",
    filesByBase: {
      develop: ["programs/price-oracle/src/lib.rs"],
      "program-fanout-0.1.0": ["programs/fanout/src/lib.rs"],
    },
    programBases: { fanout: "program-fanout-0.1.0" },
  });

  assert.deepEqual(changed, [
    { name: "fanout", own: true, via: [] },
    { name: "price-oracle", own: true, via: [] },
  ]);
});
