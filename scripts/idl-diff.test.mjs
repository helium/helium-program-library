import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  combinedIdlsLevel,
  diffPrograms,
  idlDiff,
  idlsLevel,
  programLevel,
} from "./idl-diff.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

const fixture = () =>
  JSON.parse(
    readFileSync(path.join(here, "fixtures", "idl-base.json"), "utf8"),
  );

test("a new instruction is an added instruction", () => {
  const head = fixture();
  head.instructions.push({
    name: "remove_mint_authority_v0",
    discriminator: [9, 9, 9, 9, 9, 9, 9, 9],
    accounts: [{ name: "authority", signer: true }],
    args: [],
  });

  const diff = idlDiff(fixture(), head);

  assert.deepEqual(diff.added, [
    { kind: "instruction", name: "instruction remove_mint_authority_v0" },
    {
      kind: "instruction-account",
      name: "instruction remove_mint_authority_v0 account authority",
    },
  ]);
  assert.deepEqual(diff.removed, []);
  assert.deepEqual(diff.changed, []);
  assert.deepEqual(diff.other, []);
});

test("a new field on an account struct is an added field: minor, not breaking", () => {
  const head = fixture();
  head.types
    .find((t) => t.name === "AccountWindowedCircuitBreakerV0")
    .type.fields.push({ name: "owner", type: "pubkey" });

  const diff = idlDiff(fixture(), head);

  assert.deepEqual(diff.added, [
    {
      kind: "field",
      name: "type AccountWindowedCircuitBreakerV0 field owner",
    },
  ]);
  assert.deepEqual(diff.removed, []);
  assert.deepEqual(diff.changed, []);
  assert.deepEqual(idlsLevel(diff), { level: "minor", breaking: false });
  assert.equal(programLevel(diff), "patch");
});

test("a removed instruction is breaking, and its accounts and args go with it", () => {
  const head = fixture();
  head.instructions = head.instructions.filter((i) => i.name !== "burn_v0");

  const diff = idlDiff(fixture(), head);

  assert.deepEqual(diff.removed, [
    { kind: "instruction", name: "instruction burn_v0" },
    { kind: "instruction-account", name: "instruction burn_v0 account from" },
    { kind: "instruction-account", name: "instruction burn_v0 account owner" },
    {
      kind: "instruction-account",
      name: "instruction burn_v0 account circuit_breaker",
    },
    { kind: "arg", name: "instruction burn_v0 arg args" },
  ]);
  assert.deepEqual(diff.added, []);
  assert.deepEqual(idlsLevel(diff), { level: "minor", breaking: true });
  assert.equal(programLevel(diff), "patch");
});

test("a changed arg type is a changed type: minor plus the breaking flag", () => {
  const head = fixture();
  head.instructions.find(
    (i) => i.name === "initialize_account_windowed_breaker_v0",
  ).args[0].type = "i64";

  const diff = idlDiff(fixture(), head);

  assert.deepEqual(diff.changed, [
    {
      kind: "arg",
      name: "instruction initialize_account_windowed_breaker_v0 arg window_size_seconds",
      from: '{index:0,type:"u64"}',
      to: '{index:0,type:"i64"}',
    },
  ]);
  assert.deepEqual(diff.added, []);
  assert.deepEqual(diff.removed, []);
  assert.deepEqual(idlsLevel(diff), { level: "minor", breaking: true });
  assert.equal(programLevel(diff), "patch");
});

test("a docs-only IDL change is a difference, but only a patch", () => {
  const head = fixture();
  head.instructions.find((i) => i.name === "burn_v0").docs = [
    "Burns tokens through the breaker, respecting the window.",
  ];

  const diff = idlDiff(fixture(), head);

  assert.deepEqual(diff.other, [
    { kind: "instruction", name: "instruction burn_v0" },
  ]);
  assert.deepEqual(diff.added, []);
  assert.deepEqual(diff.removed, []);
  assert.deepEqual(diff.changed, []);
  assert.deepEqual(idlsLevel(diff), { level: "patch", breaking: false });
  assert.equal(programLevel(diff), "patch");
});

test("an identical IDL, and a crate version bump alone, is no difference", () => {
  const head = fixture();
  head.metadata.version = "0.2.0";

  for (const other of [fixture(), head]) {
    const diff = idlDiff(fixture(), other);

    assert.equal(diff.hasChanges, false);
    assert.equal(idlsLevel(diff), null);
  }
});

test("a program with no base IDL is new: every entity is an addition", () => {
  const diff = idlDiff(null, fixture());

  assert.deepEqual(diff.removed, []);
  assert.equal(
    diff.added.some(
      ({ name }) => name === "instruction burn_v0" || name === "address",
    ),
    true,
  );
  assert.deepEqual(idlsLevel(diff), { level: "minor", breaking: false });
  assert.equal(programLevel(diff), "minor");
});

test("the @helium/idls level across programs takes the strongest", () => {
  assert.equal(combinedIdlsLevel([null, null]), null);
  assert.deepEqual(
    combinedIdlsLevel([null, { level: "patch", breaking: false }]),
    {
      level: "patch",
      breaking: false,
    },
  );
  assert.deepEqual(
    combinedIdlsLevel([
      { level: "patch", breaking: false },
      { level: "minor", breaking: false },
    ]),
    { level: "minor", breaking: false },
  );
  assert.deepEqual(
    combinedIdlsLevel([
      { level: "minor", breaking: true },
      { level: "patch", breaking: false },
    ]),
    { level: "minor", breaking: true },
  );
});

test("diffPrograms answers for every program asked, and names @helium/idls once", () => {
  const head = fixture();
  head.instructions.push({
    name: "remove_mint_authority_v0",
    discriminator: [9, 9, 9, 9, 9, 9, 9, 9],
    accounts: [],
    args: [],
  });
  const idls = {
    "circuit-breaker": { base: fixture(), head },
    "data-credits": { base: fixture(), head: fixture() },
  };

  const result = diffPrograms({
    programs: ["circuit-breaker", "data-credits"],
    readIdl: (program, side) => idls[program][side],
  });

  assert.deepEqual(result.idls, { level: "minor", breaking: false });
  assert.deepEqual(
    result.programs.map(({ name, level, changed }) => ({
      name,
      level,
      changed,
    })),
    [
      { name: "circuit-breaker", level: "minor", changed: true },
      { name: "data-credits", level: "patch", changed: false },
    ],
  );
  assert.deepEqual(result.programs[0].diff.added, [
    { kind: "instruction", name: "instruction remove_mint_authority_v0" },
  ]);
});

test("reordered struct fields and instruction args are changed types", () => {
  // The fixture instruction has one arg, so both sides get a second one.
  const withTwoArgs = () => {
    const idl = fixture();
    idl.instructions
      .find((i) => i.name === "initialize_account_windowed_breaker_v0")
      .args.push({ name: "threshold", type: "u64" });
    return idl;
  };
  const base = withTwoArgs();
  const head = withTwoArgs();
  const fields = head.types.find(
    (t) => t.name === "AccountWindowedCircuitBreakerV0",
  ).type.fields;
  [fields[0], fields[1]] = [fields[1], fields[0]];
  const args = head.instructions.find(
    (i) => i.name === "initialize_account_windowed_breaker_v0",
  ).args;
  [args[0], args[1]] = [args[1], args[0]];

  const diff = idlDiff(base, head);

  assert.deepEqual(
    diff.changed.map(({ kind, name }) => ({ kind, name })),
    [
      {
        kind: "arg",
        name: "instruction initialize_account_windowed_breaker_v0 arg threshold",
      },
      {
        kind: "arg",
        name: "instruction initialize_account_windowed_breaker_v0 arg window_size_seconds",
      },
      {
        kind: "field",
        name: "type AccountWindowedCircuitBreakerV0 field authority",
      },
      {
        kind: "field",
        name: "type AccountWindowedCircuitBreakerV0 field token_account",
      },
    ],
  );
  assert.equal(diff.hasChanges, true);
  assert.deepEqual(idlsLevel(diff), { level: "minor", breaking: true });
});

test("a bytemuck type that becomes borsh with the same fields is a changed type", () => {
  const base = fixture();
  Object.assign(
    base.types.find((t) => t.name === "AccountWindowedCircuitBreakerV0"),
    { serialization: "bytemuck", repr: { kind: "c" } },
  );

  const diff = idlDiff(base, fixture());

  assert.deepEqual(
    diff.changed.map(({ kind, name }) => ({ kind, name })),
    [{ kind: "type", name: "type AccountWindowedCircuitBreakerV0" }],
  );
  assert.deepEqual(diff.added, []);
  assert.deepEqual(diff.removed, []);
});
