import assert from "node:assert/strict";
import test from "node:test";

import { guardBotFiles } from "./changeset-bot-guard.mjs";

const missing = {
  npm: ["@helium/idls", "@helium/spl-utils"],
  programs: [
    { name: "lazy-distributor", own: true, via: [] },
    { name: "welcome-pack", own: false, via: ["lazy-distributor"] },
  ],
  idls: { level: "minor", breaking: false },
};

const files = {
  ".changeset/bot-a.md":
    '---\n"@helium/idls": minor\n"@helium/spl-utils": patch\n---\n\nAdd a helper.\n',
  ".changeset-programs/bot-a.md":
    "---\nlazy-distributor: patch\nwelcome-pack: none\n---\n\nTighten a check. welcome-pack: handler bodies only.\n",
};

/** `git status --porcelain=v1` lines: `??` untracked, ` M` modified. */
const status = (entries) =>
  entries.map(([code, file]) => `${code} ${file}`).join("\n");

const guard = (entries, overrides = {}) =>
  guardBotFiles({
    status: status(entries),
    missing,
    readFile: (file) => files[file],
    ...overrides,
  });

test("one well-formed file per side passes", () => {
  const result = guard([
    ["??", ".changeset/bot-a.md"],
    ["??", ".changeset-programs/bot-a.md"],
  ]);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.files, [
    ".changeset/bot-a.md",
    ".changeset-programs/bot-a.md",
  ]);
});

test("two new files in one directory fail", () => {
  const result = guard(
    [
      ["??", ".changeset/bot-a.md"],
      ["??", ".changeset/bot-b.md"],
    ],
    {
      readFile: () => '---\n"@helium/spl-utils": patch\n---\n\nText.\n',
    },
  );
  assert.match(
    result.errors.join("\n"),
    /more than one new file in \.changeset\b/,
  );
});

test("an edited existing file fails, even a changeset", () => {
  for (const code of [" M", "M ", " D", "R "]) {
    const result = guard([
      ["??", ".changeset/bot-a.md"],
      [code, ".changeset/written-by-hand.md"],
    ]);
    assert.match(
      result.errors.join("\n"),
      /existing file changed: \.changeset\/written-by-hand\.md/,
    );
    assert.deepEqual(result.files, []);
  }
});

test("a new file at any other path fails", () => {
  for (const file of [
    ".github/workflows/x.yaml",
    ".changeset/nested/bot.md",
    ".changeset/config.json",
    ".changeset-programs/skipped.json",
    ".changeset-programs/README.md",
  ]) {
    const result = guard([["??", file]]);
    assert.match(result.errors.join("\n"), /path not allowed/);
    assert.deepEqual(result.files, []);
  }
});

test("a name outside that side's missing set fails", () => {
  const npm = guard([["??", ".changeset/bot-a.md"]], {
    readFile: () => '---\n"@helium/sus": patch\n---\n\nText.\n',
  });
  assert.match(npm.errors.join("\n"), /@helium\/sus is not a missing name/);

  // A program name is not a missing npm name, and the other way round.
  const crossed = guard([["??", ".changeset/bot-a.md"]], {
    readFile: () => "---\nlazy-distributor: patch\n---\n\nText.\n",
  });
  assert.match(
    crossed.errors.join("\n"),
    /lazy-distributor is not a missing name/,
  );

  const programs = guard([["??", ".changeset-programs/bot-a.md"]], {
    readFile: () => "---\nmini-fanout: patch\n---\n\nText.\n",
  });
  assert.match(programs.errors.join("\n"), /mini-fanout is not a missing name/);
});

test("a wrong @helium/idls level fails", () => {
  const result = guard([["??", ".changeset/bot-a.md"]], {
    readFile: () => '---\n"@helium/idls": patch\n---\n\nText.\n',
  });
  assert.match(
    result.errors.join("\n"),
    /@helium\/idls must be minor, not patch/,
  );
});

test("none for an own-source program fails, and passes for a dependent program", () => {
  const own = guard([["??", ".changeset-programs/bot-a.md"]], {
    readFile: () => "---\nlazy-distributor: none\n---\n\nText.\n",
  });
  assert.match(
    own.errors.join("\n"),
    /lazy-distributor: none is only for a dependent program/,
  );

  const dependent = guard([["??", ".changeset-programs/bot-a.md"]], {
    readFile: () => "---\nwelcome-pack: none\n---\n\nHandler bodies only.\n",
  });
  assert.deepEqual(dependent.errors, []);
});

test("major fails on both sides, and none fails on the npm side", () => {
  const npm = guard([["??", ".changeset/bot-a.md"]], {
    readFile: () => '---\n"@helium/spl-utils": major\n---\n\nText.\n',
  });
  assert.match(
    npm.errors.join("\n"),
    /@helium\/spl-utils: level major is not allowed/,
  );

  const none = guard([["??", ".changeset/bot-a.md"]], {
    readFile: () => '---\n"@helium/spl-utils": none\n---\n\nText.\n',
  });
  assert.match(none.errors.join("\n"), /level none is not allowed/);

  const programs = guard([["??", ".changeset-programs/bot-a.md"]], {
    readFile: () => "---\nlazy-distributor: major\n---\n\nText.\n",
  });
  assert.match(
    programs.errors.join("\n"),
    /lazy-distributor: level major is not allowed/,
  );
});

test("an empty changeset needs a reason, and a program changeset is never empty", () => {
  const bare = guard([["??", ".changeset/bot-a.md"]], {
    readFile: () => "---\n---\n",
  });
  assert.match(bare.errors.join("\n"), /empty changeset with no reason/);

  const reasoned = guard([["??", ".changeset/bot-a.md"]], {
    readFile: () => "---\n---\n\nOnly a dev script changed.\n",
  });
  assert.deepEqual(reasoned.errors, []);
  assert.equal(reasoned.report.emptyReason, "Only a dev script changed.");

  const program = guard([["??", ".changeset-programs/bot-a.md"]], {
    readFile: () => "---\n---\n\nNothing ships.\n",
  });
  assert.match(program.errors.join("\n"), /names no program/);
});

test("the report carries each flag the PR comment shows", () => {
  const result = guard(
    [
      ["??", ".changeset/bot-a.md"],
      ["??", ".changeset-programs/bot-a.md"],
    ],
    { missing: { ...missing, idls: { level: "minor", breaking: true } } },
  );
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.report, {
    possibleBreak: true,
    emptyReason: null,
    dependents: [
      { name: "welcome-pack", level: "none", via: ["lazy-distributor"] },
    ],
    programText: "Tighten a check. welcome-pack: handler bodies only.",
    flagged: true,
  });
});

test("no new file passes with nothing to commit and no flag", () => {
  const result = guard([]);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.files, []);
  assert.equal(result.report.flagged, false);
});

test("the breaking flag shows only when the bot's file names @helium/idls", () => {
  const result = guard([["??", ".changeset/bot-a.md"]], {
    missing: { ...missing, idls: { level: "minor", breaking: true } },
    readFile: () => '---\n"@helium/spl-utils": patch\n---\n\nText.\n',
  });
  assert.equal(result.report.possibleBreak, false);
});
