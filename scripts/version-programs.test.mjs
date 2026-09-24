import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { versionPrograms } from "./version-programs.mjs";

const HEAD_SHA = "0ae7a24507d2b4a1c9f6e8b3d5a7c1e9f0b2d4a6";

/** A program manifest shaped like the real ones: version on line 3, comments after it. */
const manifest = (name, version) => `[package]
name = "${name}"
version = "${version}"
description = "Created with Anchor"
edition = "2021"
# Trigger deployment - timestamp: 03-31-2025 #4

[lib]
crate-type = ["cdylib", "lib"]

[dependencies]
anchor-lang = { workspace = true, version = "0.31.1" }
`;

/**
 * A repo root with the given program versions and `.changeset-programs/`
 * contents. Values are file bodies; keys are file names.
 */
const makeRepo = ({ programs = {}, changesets = {}, changelogs = {} }) => {
  const root = mkdtempSync(path.join(tmpdir(), "version-programs-"));
  mkdirSync(path.join(root, ".changeset-programs"));
  for (const [name, version] of Object.entries(programs)) {
    mkdirSync(path.join(root, "programs", name), { recursive: true });
    writeFileSync(
      path.join(root, "programs", name, "Cargo.toml"),
      manifest(name, version),
    );
  }
  for (const [name, body] of Object.entries(changelogs)) {
    writeFileSync(path.join(root, "programs", name, "CHANGELOG.md"), body);
  }
  for (const [name, body] of Object.entries(changesets)) {
    writeFileSync(path.join(root, ".changeset-programs", name), body);
  }
  return root;
};

const changeset = (frontMatter, text) =>
  `---\n${frontMatter}\n---\n\n${text}\n`;

const read = (root, ...parts) =>
  readFileSync(path.join(root, ...parts), "utf8");

const version = (root, name) =>
  read(root, "programs", name, "Cargo.toml").match(/^version = "(.*)"$/m)[1];

/** Collects the `cargo update` calls instead of shelling out. */
const recorder = () => {
  const calls = [];
  return { calls, cargoUpdate: () => calls.push("cargo update --workspace") };
};

test("the highest level across files wins and both notes land under one entry", () => {
  const root = makeRepo({
    programs: { "lazy-distributor": "0.3.11", "mini-fanout": "0.1.8" },
    changesets: {
      "bind-oracle-signature.md": changeset(
        "lazy-distributor: patch\nmini-fanout: minor",
        "Bind the oracle signature to the running task.",
      ),
      "second-note.md": changeset(
        "mini-fanout: patch",
        "Reject a fanout share of zero.",
      ),
    },
  });
  const { calls, cargoUpdate } = recorder();

  versionPrograms({ root, headSha: HEAD_SHA, cargoUpdate });

  assert.equal(version(root, "mini-fanout"), "0.2.0");
  assert.equal(version(root, "lazy-distributor"), "0.3.12");
  assert.equal(
    read(root, "programs", "mini-fanout", "CHANGELOG.md"),
    `# mini-fanout

## 0.2.0

### Minor Changes

- Bind the oracle signature to the running task.

### Patch Changes

- Reject a fanout share of zero.
`,
  );
  assert.equal(
    existsSync(path.join(root, ".changeset-programs", "second-note.md")),
    false,
  );
  assert.deepEqual(calls, ["cargo update --workspace"]);
});

test("level none bumps nothing, writes no changelog, and records the head SHA", () => {
  const root = makeRepo({
    programs: { "lazy-distributor": "0.3.11" },
    changesets: {
      "handler-body-only.md": changeset(
        "lazy-distributor: none",
        "A helper body changed; the binary is unaffected.",
      ),
    },
  });
  const { calls, cargoUpdate } = recorder();

  const result = versionPrograms({ root, headSha: HEAD_SHA, cargoUpdate });

  assert.equal(version(root, "lazy-distributor"), "0.3.11");
  assert.equal(
    existsSync(path.join(root, "programs", "lazy-distributor", "CHANGELOG.md")),
    false,
  );
  assert.equal(
    read(root, ".changeset-programs", "skipped.json"),
    `{\n  "lazy-distributor": "${HEAD_SHA}"\n}\n`,
  );
  assert.equal(
    existsSync(path.join(root, ".changeset-programs", "handler-body-only.md")),
    false,
  );
  assert.deepEqual(result.released, []);
  assert.deepEqual(result.skipped, ["lazy-distributor"]);
  assert.deepEqual(calls, []);
});

test("a real release clears the program's skip entry and leaves the others", () => {
  const root = makeRepo({
    programs: { "lazy-distributor": "0.3.11", "mini-fanout": "0.1.8" },
    changesets: {
      "ship-it.md": changeset(
        "lazy-distributor: patch",
        "Bind the oracle signature to the running task.",
      ),
    },
  });
  writeFileSync(
    path.join(root, ".changeset-programs", "skipped.json"),
    JSON.stringify({ "lazy-distributor": "aaa", "mini-fanout": "bbb" }),
  );
  const { cargoUpdate } = recorder();

  versionPrograms({ root, headSha: HEAD_SHA, cargoUpdate });

  assert.equal(
    read(root, ".changeset-programs", "skipped.json"),
    `{\n  "mini-fanout": "bbb"\n}\n`,
  );
});

test("the last skip entry takes the file with it", () => {
  const root = makeRepo({
    programs: { "lazy-distributor": "0.3.11" },
    changesets: {
      "ship-it.md": changeset("lazy-distributor: patch", "Ship it."),
    },
  });
  writeFileSync(
    path.join(root, ".changeset-programs", "skipped.json"),
    JSON.stringify({ "lazy-distributor": "aaa" }),
  );
  const { cargoUpdate } = recorder();

  versionPrograms({ root, headSha: HEAD_SHA, cargoUpdate });

  assert.equal(
    existsSync(path.join(root, ".changeset-programs", "skipped.json")),
    false,
  );
});

test("an unknown program fails before any write", () => {
  const root = makeRepo({
    programs: { "mini-fanout": "0.1.8" },
    changesets: {
      "good.md": changeset("mini-fanout: minor", "Add a fanout instruction."),
      "typo.md": changeset("mobiler-entity-manager: patch", "A typo."),
    },
  });
  const { calls, cargoUpdate } = recorder();

  assert.throws(
    () => versionPrograms({ root, headSha: HEAD_SHA, cargoUpdate }),
    /unknown program "mobiler-entity-manager"/,
  );

  assert.equal(version(root, "mini-fanout"), "0.1.8");
  assert.equal(
    existsSync(path.join(root, "programs", "mini-fanout", "CHANGELOG.md")),
    false,
  );
  assert.equal(
    existsSync(path.join(root, ".changeset-programs", "good.md")),
    true,
  );
  assert.deepEqual(calls, []);
});

test("an unknown level fails before any write", () => {
  const root = makeRepo({
    programs: { "mini-fanout": "0.1.8" },
    changesets: {
      "wrong-level.md": changeset("mini-fanout: breaking", "A bad level."),
    },
  });
  const { calls, cargoUpdate } = recorder();

  assert.throws(
    () => versionPrograms({ root, headSha: HEAD_SHA, cargoUpdate }),
    /wrong-level\.md: bad release level "breaking"/,
  );

  assert.equal(version(root, "mini-fanout"), "0.1.8");
  assert.equal(
    existsSync(path.join(root, ".changeset-programs", "wrong-level.md")),
    true,
  );
  assert.deepEqual(calls, []);
});

test("no program changesets releases nothing and runs no cargo update", () => {
  const root = makeRepo({ programs: { "mini-fanout": "0.1.8" } });
  writeFileSync(
    path.join(root, ".changeset-programs", "README.md"),
    "# Program changesets\n",
  );
  writeFileSync(
    path.join(root, ".changeset-programs", "skipped.json"),
    JSON.stringify({ "mini-fanout": "aaa" }),
  );
  const { calls, cargoUpdate } = recorder();

  const result = versionPrograms({ root, headSha: HEAD_SHA, cargoUpdate });

  assert.deepEqual(result, { released: [], skipped: [] });
  assert.equal(version(root, "mini-fanout"), "0.1.8");
  assert.equal(
    read(root, ".changeset-programs", "README.md"),
    "# Program changesets\n",
  );
  assert.equal(
    read(root, ".changeset-programs", "skipped.json"),
    JSON.stringify({ "mini-fanout": "aaa" }),
  );
  assert.deepEqual(calls, []);
});

test("plain semver arithmetic on 0.x", () => {
  const root = makeRepo({
    programs: {
      "dc-auto-top": "0.0.17",
      "mini-fanout": "0.1.8",
      "voter-stake-registry": "0.4.10",
    },
    changesets: {
      "patch.md": changeset("dc-auto-top: patch", "A patch."),
      "minor.md": changeset("mini-fanout: minor", "A new instruction."),
      "major.md": changeset("voter-stake-registry: major", "A break."),
    },
  });
  const { cargoUpdate } = recorder();

  versionPrograms({ root, headSha: HEAD_SHA, cargoUpdate });

  assert.equal(version(root, "dc-auto-top"), "0.0.18");
  assert.equal(version(root, "mini-fanout"), "0.2.0");
  assert.equal(version(root, "voter-stake-registry"), "1.0.0");
});

test("only the [package] version line moves; comments and deps stay", () => {
  const root = makeRepo({
    programs: { "mini-fanout": "0.1.8" },
    changesets: {
      "patch.md": changeset("mini-fanout: patch", "Reject a share of zero."),
    },
  });
  const before = read(root, "programs", "mini-fanout", "Cargo.toml");
  const { cargoUpdate } = recorder();

  versionPrograms({ root, headSha: HEAD_SHA, cargoUpdate });

  const after = read(root, "programs", "mini-fanout", "Cargo.toml");
  assert.equal(after, before.replace('version = "0.1.8"', 'version = "0.1.9"'));
  assert.match(after, /^# Trigger deployment - timestamp: 03-31-2025 #4$/m);
  assert.match(
    after,
    /^anchor-lang = \{ workspace = true, version = "0\.31\.1" \}$/m,
  );
});

test("a new entry is prepended above the existing changelog", () => {
  const root = makeRepo({
    programs: { "mini-fanout": "0.1.8" },
    changelogs: {
      "mini-fanout": `# mini-fanout

## 0.1.8

### Patch Changes

- Reject a fanout share of zero.
`,
    },
    changesets: {
      "minor.md": changeset("mini-fanout: minor", "Add a fanout instruction."),
    },
  });
  const { cargoUpdate } = recorder();

  versionPrograms({ root, headSha: HEAD_SHA, cargoUpdate });

  assert.equal(
    read(root, "programs", "mini-fanout", "CHANGELOG.md"),
    `# mini-fanout

## 0.2.0

### Minor Changes

- Add a fanout instruction.

## 0.1.8

### Patch Changes

- Reject a fanout share of zero.
`,
  );
});

// The same texts missing-changesets.test.mjs parses: the backstop and the
// release read them through one parser.
test("CRLF, empty front matter, a bare closing --- and a single-quoted name version as the backstop reads them", () => {
  const root = makeRepo({
    programs: {
      "lazy-distributor": "0.3.11",
      "mini-fanout": "0.1.8",
      "welcome-pack": "0.0.4",
    },
    changesets: {
      "crlf.md": "---\r\nlazy-distributor: patch\r\n---\r\n\r\nCRLF text.\r\n",
      "empty.md": "---\n---\n\nNothing to release.\n",
      "bare.md": "---\nmini-fanout: minor\n---",
      "quoted.md": "---\n'welcome-pack': patch\n---\n\nQuoted text.\n",
    },
  });
  const { cargoUpdate } = recorder();

  const { released } = versionPrograms({
    root,
    headSha: HEAD_SHA,
    cargoUpdate,
  });

  assert.deepEqual(released, [
    {
      name: "lazy-distributor",
      from: "0.3.11",
      to: "0.3.12",
      level: "patch",
    },
    { name: "mini-fanout", from: "0.1.8", to: "0.2.0", level: "minor" },
    { name: "welcome-pack", from: "0.0.4", to: "0.0.5", level: "patch" },
  ]);
  assert.match(
    read(root, "programs", "lazy-distributor", "CHANGELOG.md"),
    /- CRLF text\./,
  );
});

test("a file with no front matter fails the plan and names the file", () => {
  const root = makeRepo({
    programs: { "mini-fanout": "0.1.8" },
    changesets: { "no-front-matter.md": "Just text.\n" },
  });
  const { calls, cargoUpdate } = recorder();

  assert.throws(
    () => versionPrograms({ root, headSha: HEAD_SHA, cargoUpdate }),
    /no-front-matter\.md: no front matter/,
  );
  assert.equal(version(root, "mini-fanout"), "0.1.8");
  assert.deepEqual(calls, []);
});
