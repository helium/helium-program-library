import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = fileURLToPath(new URL("./build-payload.sh", import.meta.url));

const git = (cwd, ...args) => {
  const { status, stderr } = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(status, 0, stderr);
};

/** A repo with one commit holding `files`, and its HEAD oid. */
const makeRepo = (files) => {
  const root = mkdtempSync(path.join(tmpdir(), "api-commit-"));
  git(root, "init", "--quiet", "--initial-branch=main");
  git(root, "config", "user.email", "bot@example.com");
  git(root, "config", "user.name", "bot");
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(path.join(root, name), body);
  }
  git(root, "add", "-A");
  git(root, "commit", "--quiet", "-m", "base");
  const head = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).stdout.trim();
  return { root, head };
};

const build = (root, env) =>
  spawnSync("bash", [script], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      GITHUB_REPOSITORY: "helium/helium-program-library",
      BRANCH: "program-release/develop-42",
      HEADLINE: "chore: version programs",
      ...env,
    },
  });

test("an addition, a change and a deletion become one mutation body", () => {
  const { root, head } = makeRepo({ "a.txt": "a\n", "gone.txt": "bye\n" });
  writeFileSync(path.join(root, "a.txt"), "changed\n");
  writeFileSync(path.join(root, "new.txt"), "new\n");
  rmSync(path.join(root, "gone.txt"));

  const { status, stdout, stderr } = build(root, { EXPECTED_HEAD_OID: head });
  assert.equal(status, 0, stderr);

  const { variables } = JSON.parse(stdout);
  const { additions, deletions } = variables.input.fileChanges;
  assert.deepEqual(additions.map((a) => a.path).sort(), ["a.txt", "new.txt"]);
  assert.deepEqual(deletions, [{ path: "gone.txt" }]);
  assert.equal(
    Buffer.from(
      additions.find((a) => a.path === "a.txt").contents,
      "base64",
    ).toString("utf8"),
    "changed\n",
  );
  assert.equal(variables.input.expectedHeadOid, head);
  assert.equal(variables.input.branch.branchName, "program-release/develop-42");
  assert.equal(
    variables.input.branch.repositoryNameWithOwner,
    "helium/helium-program-library",
  );
  assert.deepEqual(variables.input.message, {
    headline: "chore: version programs",
  });
});

test("a 100 KB file round-trips: jq reads it, argv never does", () => {
  // `Cargo.lock` is ~88 KB, ~117 KB once base64 grows it: under the 128 KiB
  // argv cap. This 120000-byte fixture is what exceeds the cap.
  const lock = 'package = { name = "helium" }\n'.repeat(4000);
  assert.ok(lock.length > 100 * 1024);
  const { root, head } = makeRepo({ "Cargo.lock": "empty\n" });
  writeFileSync(path.join(root, "Cargo.lock"), lock);

  const { status, stdout, stderr } = build(root, { EXPECTED_HEAD_OID: head });
  assert.equal(status, 0, stderr);

  const { variables } = JSON.parse(stdout);
  const addition = variables.input.fileChanges.additions.find(
    (a) => a.path === "Cargo.lock",
  );
  assert.equal(Buffer.from(addition.contents, "base64").toString("utf8"), lock);
});

test("a binary file keeps its bytes: nothing decodes it as UTF-8", () => {
  const bytes = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0xfe, 0x80, 0x61, 0x62, 0x63,
  ]);
  const { root, head } = makeRepo({ "logo.png": "placeholder\n" });
  writeFileSync(path.join(root, "logo.png"), bytes);

  const { status, stdout, stderr } = build(root, { EXPECTED_HEAD_OID: head });
  assert.equal(status, 0, stderr);

  const { additions } = JSON.parse(stdout).variables.input.fileChanges;
  const addition = additions.find((a) => a.path === "logo.png");
  assert.deepEqual(Buffer.from(addition.contents, "base64"), bytes);
});

test("a rename becomes one deletion and one addition", () => {
  const { root, head } = makeRepo({ "a.txt": "a\n" });
  git(root, "mv", "a.txt", "b.txt");

  const { status, stdout, stderr } = build(root, { EXPECTED_HEAD_OID: head });
  assert.equal(status, 0, stderr);

  const { additions, deletions } =
    JSON.parse(stdout).variables.input.fileChanges;
  assert.deepEqual(deletions, [{ path: "a.txt" }]);
  assert.deepEqual(
    additions.map((a) => a.path),
    ["b.txt"],
  );
  assert.equal(
    Buffer.from(additions[0].contents, "base64").toString("utf8"),
    "a\n",
  );
});

test("a path with bytes past ASCII is not C-quoted", () => {
  const { root, head } = makeRepo({ "a.txt": "a\n" });
  writeFileSync(path.join(root, "ünï.txt"), "accents\n");

  const { status, stdout, stderr } = build(root, { EXPECTED_HEAD_OID: head });
  assert.equal(status, 0, stderr);

  const { additions } = JSON.parse(stdout).variables.input.fileChanges;
  assert.deepEqual(
    additions.map((a) => a.path),
    ["ünï.txt"],
  );
});

test("nothing to commit writes nothing and exits 0", () => {
  const { root, head } = makeRepo({ "a.txt": "a\n" });

  const { status, stdout, stderr } = build(root, { EXPECTED_HEAD_OID: head });
  assert.equal(status, 0, stderr);
  assert.equal(stdout, "");
});

for (const [variable, name] of [
  ["EXPECTED_HEAD_OID", "expected-head-oid"],
  ["GITHUB_REPOSITORY", "GITHUB_REPOSITORY"],
  ["BRANCH", "branch"],
  ["HEADLINE", "headline"],
]) {
  test(`an empty ${name} fails before any work`, () => {
    const { root, head } = makeRepo({ "a.txt": "a\n" });
    writeFileSync(path.join(root, "a.txt"), "b\n");

    const { status, stdout, stderr } = build(root, {
      EXPECTED_HEAD_OID: head,
      [variable]: "",
    });
    assert.notEqual(status, 0);
    assert.equal(stdout, "");
    assert.match(stderr, new RegExp(`${name} is required`));
  });
}

test("the changes are computed against the expected head, not HEAD", () => {
  const { root, head: expected } = makeRepo({ "a.txt": "a\n", "b.txt": "b\n" });
  writeFileSync(path.join(root, "a.txt"), "committed after\n");
  git(root, "commit", "--quiet", "-am", "after the expected head");
  writeFileSync(path.join(root, "b.txt"), "worktree\n");

  const { status, stdout, stderr } = build(root, {
    EXPECTED_HEAD_OID: expected,
  });
  assert.equal(status, 0, stderr);

  const { expectedHeadOid, fileChanges } = JSON.parse(stdout).variables.input;
  assert.equal(expectedHeadOid, expected);
  assert.deepEqual(fileChanges.additions.map((a) => a.path).sort(), [
    "a.txt",
    "b.txt",
  ]);
});

test("PATHS limits the commit to the paths it names", () => {
  const { root, head } = makeRepo({ "a.txt": "a\n", "Cargo.lock": "lock\n" });
  writeFileSync(path.join(root, "a.txt"), "changed\n");
  writeFileSync(path.join(root, "Cargo.lock"), "drift\n");

  const { status, stdout, stderr } = build(root, {
    EXPECTED_HEAD_OID: head,
    PATHS: "a.txt",
  });
  assert.equal(status, 0, stderr);

  const { additions, deletions } =
    JSON.parse(stdout).variables.input.fileChanges;
  assert.deepEqual(
    additions.map((a) => a.path),
    ["a.txt"],
  );
  assert.deepEqual(deletions, []);
});

test("PATHS reaches git as pathspecs: the shell expands no glob", () => {
  const { root, head } = makeRepo({ "a.txt": "a\n", "c.md": "c\n" });
  mkdirSync(path.join(root, "sub"));
  writeFileSync(path.join(root, "sub", "b.txt"), "b\n");
  writeFileSync(path.join(root, "a.txt"), "changed\n");
  writeFileSync(path.join(root, "c.md"), "changed\n");

  const { status, stdout, stderr } = build(root, {
    EXPECTED_HEAD_OID: head,
    PATHS: "*.txt",
  });
  assert.equal(status, 0, stderr);

  // The shell would expand `*.txt` to `a.txt` only; git's pathspec also
  // matches `sub/b.txt`.
  const { additions } = JSON.parse(stdout).variables.input.fileChanges;
  assert.deepEqual(additions.map((a) => a.path).sort(), ["a.txt", "sub/b.txt"]);
});

test("a status the script does not handle fails the build", () => {
  const { root, head } = makeRepo({ "a.txt": "a\n", "b.txt": "b\n" });
  // A tracked file turned into a symlink is a type change, status T.
  rmSync(path.join(root, "a.txt"));
  symlinkSync("b.txt", path.join(root, "a.txt"));

  const { status, stderr } = build(root, { EXPECTED_HEAD_OID: head });
  assert.notEqual(status, 0);
  assert.match(stderr, /unhandled status T/);
});
