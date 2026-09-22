import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { parseChangeset } from "./missing-changesets.mjs";
import {
  changesetTitle,
  dependentLevel,
  writeChangesets,
  writeFiles,
} from "./write-changesets.mjs";

const own = (name, hint = "patch") => ({ name, own: true, via: [], hint });
const dependent = (name, via) => ({ name, own: false, via });

const emptyDiff = { added: [], removed: [], changed: [], other: [] };
const programDiff = (name, diff = {}) => ({
  name,
  changed: Object.values(diff).some((list) => list.length > 0),
  diff: { ...emptyDiff, ...diff },
});

const write = (overrides) =>
  writeChangesets({
    missing: { npm: [], programs: [], idls: null },
    idlDiff: null,
    title: "fix(lazy-distributor): bind the oracle signature to the task",
    files: [],
    id: "bot-abc1234",
    ...overrides,
  });

test("the title loses its type(scope): prefix and gains a capital", () => {
  assert.equal(
    changesetTitle("fix(lazy-distributor): bind the oracle signature"),
    "Bind the oracle signature",
  );
  assert.equal(changesetTitle("feat!: drop the v0 path"), "Drop the v0 path");
  assert.equal(changesetTitle("chore:   tidy"), "Tidy");
  assert.equal(
    changesetTitle("bind the oracle signature"),
    "Bind the oracle signature",
  );
  assert.equal(changesetTitle("Bind: the sig"), "Bind: the sig");
});

test("every missing npm package gets patch, and @helium/idls gets the fixed level", () => {
  const files = write({
    missing: {
      npm: ["@helium/idls", "@helium/spl-utils"],
      programs: [],
      idls: { level: "minor", breaking: false },
    },
  });
  assert.deepEqual(Object.keys(files), [".changeset/bot-abc1234.md"]);
  assert.deepEqual(parseChangeset(files[".changeset/bot-abc1234.md"]), {
    releases: { "@helium/idls": "minor", "@helium/spl-utils": "patch" },
    summary: "Bind the oracle signature to the task",
  });
  assert.equal(
    files[".changeset/bot-abc1234.md"],
    '---\n"@helium/idls": minor\n"@helium/spl-utils": patch\n---\n\nBind the oracle signature to the task\n',
  );
});

test("a breaking IDL diff adds the possible-break line naming the items", () => {
  const files = write({
    missing: {
      npm: ["@helium/idls"],
      programs: [],
      idls: { level: "minor", breaking: true },
    },
    idlDiff: {
      programs: [
        programDiff("lazy-distributor", {
          removed: [{ kind: "instruction", name: "instruction old_v0" }],
          changed: [{ kind: "arg", name: "instruction set_v0 arg amount" }],
        }),
      ],
    },
  });
  assert.equal(
    parseChangeset(files[".changeset/bot-abc1234.md"]).summary,
    "Bind the oracle signature to the task\n\nPossible breaking change: instruction old_v0, instruction set_v0 arg amount",
  );
});

test("an own-source program takes the IDL hint and one line names the IDL change", () => {
  const files = write({
    missing: {
      npm: [],
      programs: [own("lazy-distributor", "minor")],
      idls: null,
    },
    idlDiff: {
      programs: [
        programDiff("lazy-distributor", {
          added: [
            { kind: "instruction", name: "instruction foo_v0" },
            { kind: "account", name: "account Foo" },
          ],
          changed: [{ kind: "field", name: "type Bar field baz" }],
        }),
      ],
    },
  });
  assert.deepEqual(Object.keys(files), [".changeset-programs/bot-abc1234.md"]);
  assert.equal(
    files[".changeset-programs/bot-abc1234.md"],
    "---\nlazy-distributor: minor\n---\n\nBind the oracle signature to the task\n\n- lazy-distributor: Adds instruction foo_v0, account Foo; changes type Bar field baz\n",
  );
});

test("a handler-only own change gets the title alone", () => {
  const files = write({
    missing: { npm: [], programs: [own("lazy-distributor")], idls: null },
    idlDiff: { programs: [programDiff("lazy-distributor")] },
  });
  assert.equal(
    files[".changeset-programs/bot-abc1234.md"],
    "---\nlazy-distributor: patch\n---\n\nBind the oracle signature to the task\n",
  );
});

test("a dependent program is none when the dependency is handler-only with an empty IDL diff", () => {
  const files = [
    "programs/lazy-distributor/src/instructions/set_v0.rs",
    "programs/lazy-distributor/README.md",
  ];
  const idlDiff = { programs: [programDiff("lazy-distributor")] };
  assert.deepEqual(
    dependentLevel({ via: ["lazy-distributor"], files, idlDiff }),
    {
      level: "none",
      reason:
        "only instruction handlers in lazy-distributor changed and its IDL did not",
    },
  );

  const written = write({
    missing: {
      npm: [],
      programs: [
        own("lazy-distributor"),
        dependent("welcome-pack", ["lazy-distributor"]),
      ],
      idls: null,
    },
    idlDiff,
    files,
  });
  assert.equal(
    written[".changeset-programs/bot-abc1234.md"],
    "---\nlazy-distributor: patch\nwelcome-pack: none\n---\n\nBind the oracle signature to the task\n\n- welcome-pack: none, only instruction handlers in lazy-distributor changed and its IDL did not\n",
  );
});

test("a dependent program is patch when the dependency is a shared crate", () => {
  assert.deepEqual(
    dependentLevel({
      via: ["shared-utils"],
      files: ["utils/shared-utils/src/precise_number.rs"],
      idlDiff: null,
    }),
    { level: "patch", reason: "shared-utils is not a program" },
  );
});

test("a dependent program is patch when the dependency changed outside its handlers or its IDL moved", () => {
  assert.deepEqual(
    dependentLevel({
      via: ["lazy-distributor"],
      files: [
        "programs/lazy-distributor/src/instructions/set_v0.rs",
        "programs/lazy-distributor/src/state.rs",
      ],
      idlDiff: { programs: [programDiff("lazy-distributor")] },
    }),
    {
      level: "patch",
      reason: "lazy-distributor changed outside its instruction handlers",
    },
  );
  assert.deepEqual(
    dependentLevel({
      via: ["lazy-distributor"],
      files: ["programs/lazy-distributor/src/instructions/set_v0.rs"],
      idlDiff: {
        programs: [
          programDiff("lazy-distributor", {
            added: [{ kind: "arg", name: "instruction set_v0 arg x" }],
          }),
        ],
      },
    }),
    { level: "patch", reason: "the IDL of lazy-distributor changed" },
  );
  // No diff entry for the dependency: nothing proves the binary is unchanged.
  assert.equal(
    dependentLevel({
      via: ["lazy-distributor"],
      files: ["programs/lazy-distributor/src/instructions/set_v0.rs"],
      idlDiff: null,
    }).level,
    "patch",
  );
});

test("one patch dependency makes the dependent patch, with that reason", () => {
  assert.deepEqual(
    dependentLevel({
      via: ["lazy-distributor", "shared-utils"],
      files: [
        "programs/lazy-distributor/src/instructions/set_v0.rs",
        "utils/shared-utils/src/x.rs",
      ],
      idlDiff: { programs: [programDiff("lazy-distributor")] },
    }),
    { level: "patch", reason: "shared-utils is not a program" },
  );
});

test("nothing missing writes no file, and an empty side writes no file on that side", () => {
  assert.deepEqual(write({}), {});
  assert.deepEqual(
    Object.keys(
      write({
        missing: { npm: ["@helium/spl-utils"], programs: [], idls: null },
      }),
    ),
    [".changeset/bot-abc1234.md"],
  );
});

test("writeFiles creates the files and never touches an existing one", () => {
  const root = mkdtempSync(path.join(tmpdir(), "write-changesets-"));
  mkdirSync(path.join(root, ".changeset"));
  mkdirSync(path.join(root, ".changeset-programs"));
  const outputs = {
    ".changeset/bot-abc1234.md": "npm\n",
    ".changeset-programs/bot-abc1234.md": "programs\n",
  };

  assert.deepEqual(writeFiles(outputs, root), [
    ".changeset/bot-abc1234.md",
    ".changeset-programs/bot-abc1234.md",
  ]);
  assert.equal(
    readFileSync(path.join(root, ".changeset/bot-abc1234.md"), "utf8"),
    "npm\n",
  );

  const byHand = path.join(root, ".changeset-programs/bot-abc1234.md");
  writeFileSync(byHand, "written by hand\n");
  writeFileSync(path.join(root, ".changeset/bot-abc1234.md"), "also by hand\n");
  assert.throws(
    () => writeFiles(outputs, root),
    /\.changeset\/bot-abc1234\.md exists/,
  );
  assert.equal(readFileSync(byHand, "utf8"), "written by hand\n");
  assert.equal(
    readFileSync(path.join(root, ".changeset/bot-abc1234.md"), "utf8"),
    "also by hand\n",
  );
});
