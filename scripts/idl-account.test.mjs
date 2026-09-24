import assert from "node:assert/strict";
import test from "node:test";
import { deflateSync } from "node:zlib";

import { decodeIdlAccount, idlMatches, sameIdl } from "./idl-account.mjs";

const idlAccountData = (idl, { length } = {}) => {
  const compressed = deflateSync(Buffer.from(JSON.stringify(idl)));
  const header = Buffer.alloc(4);
  header.writeUInt32LE(length ?? compressed.length);
  return Buffer.concat([Buffer.alloc(8 + 32), header, compressed]);
};

const IDL = {
  address: "1atrmQs3eq1N2FEYWu6tyTXbCjP4uQwExpjtnhXtS8h",
  metadata: { name: "lazy_transactions", version: "0.2.2" },
  instructions: [{ name: "a" }, { name: "b" }],
};

test("an IDL account decodes to the JSON it stores", () => {
  assert.deepEqual(decodeIdlAccount(idlAccountData(IDL)), IDL);
});

test("IDLs that differ only in key order are the same", () => {
  assert.equal(
    sameIdl(IDL, {
      instructions: IDL.instructions,
      metadata: { version: "0.2.2", name: "lazy_transactions" },
      address: IDL.address,
    }),
    true,
  );
});

test("IDLs that differ in array order are not the same", () => {
  assert.equal(
    sameIdl(IDL, { ...IDL, instructions: [...IDL.instructions].reverse() }),
    false,
  );
});

test("an IDL account with another IDL does not match", () => {
  assert.equal(
    idlMatches(
      idlAccountData({
        ...IDL,
        metadata: { ...IDL.metadata, version: "0.2.3" },
      }),
      IDL,
    ),
    false,
  );
});

test("a missing or undecodable IDL account does not match", () => {
  assert.equal(idlMatches(null, IDL), false);
  assert.equal(
    idlMatches(idlAccountData(IDL, { length: 1_000_000 }), IDL),
    false,
  );
  assert.equal(idlMatches(Buffer.alloc(44), IDL), false);
});
