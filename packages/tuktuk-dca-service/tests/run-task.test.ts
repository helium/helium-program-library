import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { AnchorProvider, Program, Wallet } from "@anchor-lang/core";
import { Tuktuk } from "@helium/tuktuk-idls/lib/types/tuktuk";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { crankSizer, crankTransactionSize } from "../src/crank";
import { CRANK_TURNER_STAND_IN, runTaskBuilder } from "../src/run-task";

const key = () => Keypair.generate().publicKey;

// The tuktuk IDL as mainnet serves it (0.2.13). The service fetches it on chain at start.
const IDL = JSON.parse(
  readFileSync(path.join(__dirname, "fixtures/tuktuk.json"), "utf8")
);
// No RPC call is made: every account run_task_v0 needs is given.
const tuktukProgram = new Program<Tuktuk>(
  IDL,
  new AnchorProvider(
    new Connection("http://127.0.0.1:1"),
    new Wallet(Keypair.generate()),
    {}
  )
);

const TASK = key();
const TASK_ACCOUNT = { taskQueue: key(), rentRefund: key() };
const REMAINING = Array.from({ length: 3 }, () => ({
  pubkey: key(),
  isSigner: false,
  isWritable: true,
}));

describe("run_task_v0 builder", () => {
  it("names the free task ids and the task's accounts in tuktuk's order, with the stand-in crank turner signing", async () => {
    const ix = await runTaskBuilder(
      tuktukProgram,
      TASK,
      TASK_ACCOUNT
    )([0, 1], REMAINING);

    assert.ok(ix.programId.equals(new PublicKey(IDL.address)));
    const { name, data } = tuktukProgram.coder.instruction.decode(ix.data)!;
    assert.equal(name, "runTaskV0");
    assert.deepEqual((data as { args: { freeTaskIds: number[] } }).args, {
      freeTaskIds: [0, 1],
    });

    const keys = ix.keys.map(({ pubkey, isSigner, isWritable }) => ({
      pubkey: pubkey.toBase58(),
      isSigner,
      isWritable,
    }));
    assert.deepEqual(keys.slice(0, 4), [
      {
        pubkey: CRANK_TURNER_STAND_IN.toBase58(),
        isSigner: true,
        isWritable: true,
      },
      {
        pubkey: TASK_ACCOUNT.rentRefund.toBase58(),
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: TASK_ACCOUNT.taskQueue.toBase58(),
        isSigner: false,
        isWritable: true,
      },
      { pubkey: TASK.toBase58(), isSigner: false, isWritable: true },
    ]);
    assert.deepEqual(
      keys.slice(-REMAINING.length),
      REMAINING.map(({ pubkey, isSigner, isWritable }) => ({
        pubkey: pubkey.toBase58(),
        isSigner,
        isWritable,
      }))
    );
  });

  it("sizes the crank transaction with the stand-in crank turner as payer", async () => {
    const remoteTask = {
      signer: key(),
      message: Buffer.alloc(300, 7),
      signature: Buffer.alloc(64, 9),
    };
    const runTask = runTaskBuilder(tuktukProgram, TASK, TASK_ACCOUNT);
    let built = await runTask([], []);
    const sizeCrank = await crankSizer({
      taskAccount: { freeTasks: 2 },
      taskQueueAccount: { lookupTables: [] },
      fetchLookupTables: async () => [],
      runTask: async (freeTaskIds, remaining) =>
        (built = await runTask(freeTaskIds, remaining)),
    });
    const size = await sizeCrank({
      remoteTask,
      remainingAccounts: REMAINING,
      swapLookupTables: [],
    });
    assert.ok(size !== undefined);
    assert.equal(size, crankTransactionSize(remoteTask, built, []));
    assert.equal(
      built.keys.length,
      4 + 2 + REMAINING.length + 2,
      "4 named accounts, the system program and instructions sysvar, the task's accounts and 2 stand-ins"
    );
  });
});
