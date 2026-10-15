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

test("tests and docs mark nothing", () => {
  const changed = changedPrograms({
    metadata,
    files: [
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

// A small workspace: the program `alpha` depends on the utils crate `bridge`,
// which depends on `helper`. `alpha` also has two dev dependencies by path:
// the workspace crate `tester` and `programs/mock`, which is no package.
const smallWorkspace = {
  workspace_root: "/r",
  packages: [
    {
      name: "alpha",
      manifest_path: "/r/programs/alpha/Cargo.toml",
      dependencies: [
        { name: "bridge", path: "/r/utils/bridge", kind: null },
        { name: "tester", path: "/r/utils/tester", kind: "dev" },
        { name: "mock", path: "/r/programs/mock", kind: "dev" },
      ],
    },
    {
      name: "bridge",
      manifest_path: "/r/utils/bridge/Cargo.toml",
      dependencies: [{ name: "helper", path: "/r/utils/helper", kind: null }],
    },
    {
      name: "helper",
      manifest_path: "/r/utils/helper/Cargo.toml",
      dependencies: [],
    },
    {
      name: "tester",
      manifest_path: "/r/utils/tester/Cargo.toml",
      dependencies: [],
    },
  ],
};

test("a dev dependency marks nothing", () => {
  const changed = changedPrograms({
    metadata: smallWorkspace,
    files: ["utils/tester/src/lib.rs", "programs/mock/src/lib.rs"],
  });

  assert.deepEqual(changed, []);
});

test("a dependent that is not a program is not named", () => {
  const changed = changedPrograms({
    metadata: smallWorkspace,
    files: ["utils/helper/src/lib.rs"],
  });

  assert.deepEqual(changed, [{ name: "alpha", own: false, via: ["helper"] }]);
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

// A workspace with registry dependencies: `alpha` depends on `anchor`, which
// depends on `syn`, and has `proptest` as a dev and `cc` as a build
// dependency. `beta` depends on the utils crate `helper`, which depends on
// `num`.
const lockWorkspace = {
  workspace_root: "/r",
  packages: [
    {
      name: "alpha",
      manifest_path: "/r/programs/alpha/Cargo.toml",
      dependencies: [
        { name: "anchor", path: null, kind: null },
        { name: "proptest", path: null, kind: "dev" },
        { name: "cc", path: null, kind: "build" },
      ],
    },
    {
      name: "beta",
      manifest_path: "/r/programs/beta/Cargo.toml",
      dependencies: [{ name: "helper", path: "/r/utils/helper", kind: null }],
    },
    {
      name: "helper",
      manifest_path: "/r/utils/helper/Cargo.toml",
      dependencies: [{ name: "num", path: null, kind: null }],
    },
  ],
};

const REGISTRY = "registry+https://github.com/rust-lang/crates.io-index";

/** A Cargo.lock for `lockWorkspace`, with the given registry crate versions. */
const lockfile = ({
  syn = "1.0.0",
  num = "0.4.0",
  proptest = "1.0.0",
  cc = "1.0.0",
} = {}) =>
  `# This file is automatically @generated by Cargo.
version = 4

[[package]]
name = "alpha"
version = "0.1.0"
dependencies = [
 "anchor",
 "cc",
 "proptest",
]

[[package]]
name = "anchor"
version = "0.31.2"
source = "${REGISTRY}"
dependencies = [
 "syn ${syn}",
]

[[package]]
name = "beta"
version = "0.1.0"
dependencies = [
 "helper",
]

[[package]]
name = "cc"
version = "${cc}"
source = "${REGISTRY}"

[[package]]
name = "helper"
version = "0.1.0"
dependencies = [
 "num",
]

[[package]]
name = "num"
version = "${num}"
source = "${REGISTRY}"

[[package]]
name = "proptest"
version = "${proptest}"
source = "${REGISTRY}"

[[package]]
name = "syn"
version = "1.0.0"
source = "${REGISTRY}"

[[package]]
name = "syn"
version = "${syn}"
source = "${REGISTRY}"
`;

/** A root Cargo.toml for `lockWorkspace`, with the given extra text. */
const manifest = ({ profile = "", workspace = "" } = {}) =>
  `[profile.release]
overflow-checks = true
${profile}
[workspace]
resolver = "2"
members = ["programs/*"]

[workspace.dependencies]
anchor-lang = { version = "0.31.2", features = ["init-if-needed"] }
${workspace}`;

test("a changed Cargo.lock package marks the programs that resolve it", () => {
  const changed = changedPrograms({
    metadata: lockWorkspace,
    files: ["Cargo.lock"],
    lockfiles: { base: lockfile(), head: lockfile({ syn: "1.0.1" }) },
  });

  assert.deepEqual(changed, [
    { name: "alpha", own: false, via: ["Cargo.lock"] },
  ]);
});

test("a changed Cargo.lock package marks a program through a utils crate", () => {
  const changed = changedPrograms({
    metadata: lockWorkspace,
    files: ["Cargo.toml", "Cargo.lock"],
    manifests: { base: manifest(), head: manifest() },
    lockfiles: { base: lockfile(), head: lockfile({ num: "0.4.1" }) },
  });

  assert.deepEqual(changed, [
    { name: "beta", own: false, via: ["Cargo.lock"] },
  ]);
});

test("a dev or build dependency change in Cargo.lock marks nothing", () => {
  const changed = changedPrograms({
    metadata: lockWorkspace,
    files: ["Cargo.toml", "Cargo.lock"],
    manifests: { base: manifest(), head: manifest() },
    lockfiles: {
      base: lockfile(),
      head: lockfile({ proptest: "1.1.0", cc: "1.1.0" }),
    },
  });

  assert.deepEqual(changed, []);
});

test("a root Cargo.toml change that leaves the resolution unchanged marks nothing", () => {
  const changed = changedPrograms({
    metadata: lockWorkspace,
    files: ["Cargo.toml", "Cargo.lock"],
    manifests: { base: manifest(), head: manifest() },
    lockfiles: { base: lockfile(), head: `${lockfile()}\n` },
  });

  assert.deepEqual(changed, []);
});

test("a Cargo.lock change reads the lockfiles of that base only", () => {
  const asked = [];
  const changed = changedProgramsForBases({
    metadata: lockWorkspace,
    defaultBase: "develop",
    filesByBase: {
      develop: ["programs/beta/src/lib.rs"],
      "program-alpha-0.1.0": ["Cargo.lock"],
    },
    programBases: { alpha: "program-alpha-0.1.0" },
    lockfilesFor: (base) => {
      asked.push(base);
      return { base: lockfile(), head: lockfile({ syn: "1.0.1" }) };
    },
  });

  assert.deepEqual(asked, ["program-alpha-0.1.0"]);
  assert.deepEqual(changed, [
    { name: "alpha", own: false, via: ["Cargo.lock"] },
    { name: "beta", own: true, via: [] },
  ]);
});

test("a workspace crate's version in Cargo.lock is left to its Cargo.toml", () => {
  const changed = changedPrograms({
    metadata: lockWorkspace,
    files: ["programs/beta/Cargo.toml", "Cargo.lock"],
    lockfiles: {
      base: lockfile(),
      head: lockfile().replace(
        'name = "beta"\nversion = "0.1.0"',
        'name = "beta"\nversion = "0.1.1"',
      ),
    },
  });

  assert.deepEqual(changed, [{ name: "beta", own: true, via: [] }]);
});

test("a root Cargo.toml profile change marks every program", () => {
  const changed = changedPrograms({
    metadata: lockWorkspace,
    files: ["Cargo.toml"],
    manifests: {
      base: manifest(),
      head: manifest({ profile: 'opt-level = "z"\n' }),
    },
  });

  assert.deepEqual(changed, [
    { name: "alpha", own: false, via: ["Cargo.toml profile"] },
    { name: "beta", own: false, via: ["Cargo.toml profile"] },
  ]);
});

test("a root Cargo.toml change outside the profiles marks nothing", () => {
  const changed = changedPrograms({
    metadata: lockWorkspace,
    files: ["Cargo.toml"],
    manifests: {
      base: manifest(),
      head: manifest({ workspace: 'time = "0.3.36"\n' }),
    },
  });

  assert.deepEqual(changed, []);
});

test("a profile change in whitespace or comments only marks nothing", () => {
  const changed = changedPrograms({
    metadata: lockWorkspace,
    files: ["Cargo.toml"],
    manifests: {
      base: manifest(),
      head: manifest().replace(
        "[profile.release]\noverflow-checks = true",
        "# Checked math.\n[ profile.release ]\n\n  overflow-checks=true # on\n",
      ),
    },
  });

  assert.deepEqual(changed, []);
});
