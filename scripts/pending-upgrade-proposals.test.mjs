import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { PublicKey } from "@solana/web3.js";
import * as multisig from "@sqds/multisig";

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
// The spill account of the recorded upgrade at index 163.
const SPILL = new PublicKey("propu8J469CCZuBxerEm3Yrzx1NDNSFkkn7SYD8MEyz");

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

const read = (programId, spill = SPILL) =>
  pendingUpgrades({
    getMultipleAccountsInfo,
    multisigPda: new PublicKey(fixture.multisig),
    programId: new PublicKey(programId),
    spill,
  });

test("an Active upgrade proposal for the program is pending, with its buffer", async () => {
  assert.deepEqual(await read(LAZY_TRANSACTIONS), [
    { index: 163, status: "Active", buffer: PENDING_BUFFER, exact: true },
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
      spill: SPILL,
    }),
    /multisig account .* not found/,
  );
});

const pending = [
  { index: 160, status: "Approved", buffer: "old" },
  { index: 163, status: "Active", buffer: PENDING_BUFFER, exact: true },
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

// Index 163's proposal and vault transaction, re-recorded at `index` with
// `status`, the message changed by `edit` and the account bytes by `rewrite`.
const multisigPda = new PublicKey(fixture.multisig);
const [recordedProposal] = multisig.accounts.Proposal.fromAccountInfo({
  data: Buffer.from(
    fixture.accounts[
      multisig
        .getProposalPda({ multisigPda, transactionIndex: 163n })[0]
        .toBase58()
    ].data,
    "base64",
  ),
});
const [recordedTransaction] =
  multisig.accounts.VaultTransaction.fromAccountInfo({
    data: Buffer.from(
      fixture.accounts[
        multisig.getTransactionPda({ multisigPda, index: 163n })[0].toBase58()
      ].data,
      "base64",
    ),
  });
const withProposal = (
  index,
  status,
  edit = (message) => message,
  rewrite = (data) => data,
) => {
  const proposal = multisig.accounts.Proposal.fromArgs({
    ...recordedProposal,
    transactionIndex: BigInt(index),
    status: { __kind: status, timestamp: recordedProposal.status.timestamp },
  }).serialize()[0];
  const transaction = multisig.accounts.VaultTransaction.fromArgs({
    ...recordedTransaction,
    index: BigInt(index),
    message: edit(recordedTransaction.message),
  }).serialize()[0];
  rewrite(transaction);
  const extra = {
    [multisig
      .getProposalPda({ multisigPda, transactionIndex: BigInt(index) })[0]
      .toBase58()]: proposal,
    [multisig
      .getTransactionPda({ multisigPda, index: BigInt(index) })[0]
      .toBase58()]: transaction,
  };
  return (programId) =>
    pendingUpgrades({
      getMultipleAccountsInfo: async (keys) =>
        (await getMultipleAccountsInfo(keys)).map(
          (account, i) =>
            account ??
            (extra[keys[i].toBase58()]
              ? { data: extra[keys[i].toBase58()] }
              : null),
        ),
      multisigPda,
      programId: new PublicKey(programId),
      spill: SPILL,
    });
};

const OTHER_BUFFER = new PublicKey(LAZY_DISTRIBUTOR);
const OTHER_SPILL = new PublicKey(LAZY_DISTRIBUTOR);
const onBuffer = (buffer) => (message) => ({
  ...message,
  accountKeys: message.accountKeys.map((key, i) => (i === 5 ? buffer : key)),
});

test("an Approved proposal at or below the stale index is still pending", async () => {
  // The recorded multisig's stale transaction index is 160.
  const pending = await withProposal(
    150,
    "Approved",
    onBuffer(OTHER_BUFFER),
  )(LAZY_TRANSACTIONS);
  assert.deepEqual(
    pending.map((p) => [p.index, p.status]),
    [
      [150, "Approved"],
      [163, "Active"],
    ],
  );
  assert.deepEqual(classifyPending(pending, PENDING_BUFFER), {
    sameBuffer: 163,
    older: [150],
  });
});

test("an Active proposal at or below the stale index is not pending", async () => {
  const pending = await withProposal(150, "Active")(LAZY_TRANSACTIONS);
  assert.deepEqual(
    pending.map((p) => p.index),
    [163],
  );
});

test("a proposal that is exactly this workflow's upgrade is the same-buffer proposal", async () => {
  assert.deepEqual(
    classifyPending(await read(LAZY_TRANSACTIONS), PENDING_BUFFER),
    {
      sameBuffer: 163,
      older: [],
    },
  );
});

test("a same-buffer proposal with an extra instruction is an older one", async () => {
  // Index 150 comes first, so it would be taken as the same-buffer proposal.
  const pending = await withProposal(150, "Approved", (message) => ({
    ...message,
    instructions: [
      ...message.instructions,
      {
        programIdIndex: 1,
        accountIndexes: new Uint8Array([0]),
        data: new Uint8Array([1]),
      },
    ],
  }))(LAZY_TRANSACTIONS);
  assert.deepEqual(classifyPending(pending, PENDING_BUFFER), {
    sameBuffer: 163,
    older: [150],
  });
});

test("a loader instruction that is not an upgrade is not pending", async () => {
  const pending = await withProposal(150, "Approved", (message) => ({
    ...message,
    // Loader instruction 4 is SetAuthority, with the upgrade's accounts.
    instructions: message.instructions.map((ix) =>
      Buffer.from(ix.data).equals(Buffer.from([3, 0, 0, 0]))
        ? { ...ix, data: new Uint8Array([4, 0, 0, 0]) }
        : ix,
    ),
  }))(LAZY_TRANSACTIONS);
  assert.deepEqual(
    pending.map((p) => p.index),
    [163],
  );
});

test("an account at the transaction address that is not a vault transaction is not pending", async () => {
  const pending = await withProposal(150, "Approved", undefined, (data) =>
    data.fill(0, 0, 8),
  )(LAZY_TRANSACTIONS);
  assert.deepEqual(
    pending.map((p) => p.index),
    [163],
  );
});

test("a proposal with another spill is not the same-buffer proposal", async () => {
  const pending = await read(LAZY_TRANSACTIONS, OTHER_SPILL);
  assert.deepEqual(classifyPending(pending, PENDING_BUFFER), {
    sameBuffer: null,
    older: [163],
  });
});

// The recorded IDL instruction is SetBuffer (variant 3) with accounts
// (buffer, idl, authority). `edit` rewrites it.
const onIdl = (edit) => (message) => ({
  ...message,
  instructions: message.instructions.map((ix) =>
    Buffer.from(ix.data).subarray(0, 8).equals(IDL_IX_TAG) ? edit(ix) : ix,
  ),
});
const IDL_IX_TAG = Buffer.from([
  0x40, 0xf4, 0xbc, 0x78, 0xa7, 0xe9, 0x69, 0x0a,
]);
const withIdlVariant = (variant) => (ix) => {
  const data = Buffer.from(ix.data);
  data[8] = variant;
  return { ...ix, data: new Uint8Array(data) };
};

test("an IDL SetAuthority makes the proposal not exact", async () => {
  const pending = await withProposal(
    150,
    "Approved",
    onIdl(withIdlVariant(4)),
  )(LAZY_TRANSACTIONS);
  assert.deepEqual(
    pending.map((p) => [p.index, p.exact]),
    [
      [150, false],
      [163, true],
    ],
  );
});

test("an IDL Close to a destination that is not the vault makes the proposal not exact", async () => {
  // Account index 6 is the spill, not the vault.
  const pending = await withProposal(
    150,
    "Approved",
    onIdl((ix) => ({
      ...withIdlVariant(5)(ix),
      accountIndexes: new Uint8Array([2, 0, 6]),
    })),
  )(LAZY_TRANSACTIONS);
  assert.deepEqual(
    pending.map((p) => [p.index, p.exact]),
    [
      [150, false],
      [163, true],
    ],
  );
});

test("an IDL SetBuffer with an authority that is not the vault makes the proposal not exact", async () => {
  // Account index 6 is the spill, not the vault.
  const pending = await withProposal(
    150,
    "Approved",
    onIdl((ix) => ({ ...ix, accountIndexes: new Uint8Array([2, 3, 6]) })),
  )(LAZY_TRANSACTIONS);
  assert.deepEqual(
    pending.map((p) => [p.index, p.exact]),
    [
      [150, false],
      [163, true],
    ],
  );
});
