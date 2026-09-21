import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { PublicKey } from "@solana/web3.js";

import {
  classifyPending,
  pendingUpgrades,
} from "./pending-upgrade-proposals.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

// Real mainnet accounts of the Helium Squads v4 multisig, recorded with
// `getMultipleAccounts`: the multisig, and the proposal and vault transaction at
// indexes 161-163. 163 is an Active upgrade of lazy-transactions; 161 and 162 are
// Executed upgrades of other programs.
const fixture = JSON.parse(
  readFileSync(
    path.join(here, "fixtures", "squads-multisig-accounts.json"),
    "utf8",
  ),
);

const LAZY_TRANSACTIONS = "1atrmQs3eq1N2FEYWu6tyTXbCjP4uQwExpjtnhXtS8h";
const LAZY_DISTRIBUTOR = "1azyuavdMyvsivtNxPoz6SucD18eDHeXzFCUPq5XU7w";
const PENDING_BUFFER = "FuC5CA8q9QLoWURPtABjHpPbW3rcgX8EaXcBd1DxUzH4";

const getMultipleAccountsInfo = async (keys) =>
  keys.map((key) => {
    const account = fixture.accounts[key.toBase58()];
    return account
      ? {
          owner: new PublicKey(account.owner),
          data: Buffer.from(account.data, "base64"),
        }
      : null;
  });

const read = (programId) =>
  pendingUpgrades({
    getMultipleAccountsInfo,
    multisigPda: new PublicKey(fixture.multisig),
    programId: new PublicKey(programId),
  });

test("an Active upgrade proposal for the program is pending, with its buffer", async () => {
  assert.deepEqual(await read(LAZY_TRANSACTIONS), [
    { index: 163, status: "Active", buffer: PENDING_BUFFER },
  ]);
});

test("an Executed upgrade of the program is not pending", async () => {
  assert.deepEqual(await read(LAZY_DISTRIBUTOR), []);
});

test("a missing multisig account is an error, not an empty list", async () => {
  await assert.rejects(
    pendingUpgrades({
      getMultipleAccountsInfo: async (keys) => keys.map(() => null),
      multisigPda: new PublicKey(fixture.multisig),
      programId: new PublicKey(LAZY_TRANSACTIONS),
    }),
    /multisig account .* not found/,
  );
});

const pending = [
  { index: 160, status: "Approved", buffer: "old" },
  { index: 163, status: "Active", buffer: PENDING_BUFFER },
];

test("a pending proposal on the reused buffer is the same-buffer proposal", () => {
  assert.deepEqual(classifyPending(pending, PENDING_BUFFER), {
    sameBuffer: 163,
    older: [160],
  });
});

test("with no reused buffer every pending proposal is an older one", () => {
  assert.deepEqual(classifyPending(pending, ""), {
    sameBuffer: null,
    older: [160, 163],
  });
});
