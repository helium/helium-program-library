import assert from "node:assert/strict";
import {
  AccountMeta,
  AddressLookupTableAccount,
  ComputeBudgetProgram,
  Ed25519Program,
  Keypair,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  buildFittingTask,
  CRANK_MAX_TX_BYTES,
  CrankTooLargeError,
  crankTransactionSize,
  retrySwapMaxBytes,
  runTaskRemainingAccounts,
  signedTaskCrankSize,
} from "../src/crank";
import { DCA_SWAP_MAX_BYTES } from "../src/jupiter";

const key = () => Keypair.generate().publicKey;

const SIGNER = key();
const CRANK_TURNER = key();
const TUKTUK = key();
const REMAINING = Array.from({ length: 10 }, key);

/** A run_task_v0 of the program's shape: the crank turner signs and pays, the task's accounts follow. */
const runTask = (remaining: PublicKey[] = REMAINING) =>
  new TransactionInstruction({
    programId: TUKTUK,
    keys: [
      { pubkey: CRANK_TURNER, isSigner: true, isWritable: true },
      ...remaining.map((pubkey) => ({
        pubkey,
        isSigner: false,
        isWritable: true,
      })),
    ],
    data: Buffer.alloc(14),
  });

const remoteTask = (messageBytes: number) => ({
  signer: SIGNER,
  message: Buffer.alloc(messageBytes, 7),
  signature: Buffer.alloc(64, 9),
});

const table = (addresses: PublicKey[]) =>
  new AddressLookupTableAccount({
    key: key(),
    state: {
      deactivationSlot: BigInt("18446744073709551615"),
      lastExtendedSlot: 0,
      lastExtendedSlotStartIndex: 0,
      authority: undefined,
      addresses,
    },
  });

describe("tuktuk-dca-service crank transaction size", () => {
  describe("crankTransactionSize", () => {
    it("equals the crank turner's transaction: compute budget, ed25519 check, run_task_v0", () => {
      const task = remoteTask(300);
      const tables = [table(REMAINING)];
      const expected = new VersionedTransaction(
        new TransactionMessage({
          payerKey: CRANK_TURNER,
          recentBlockhash: PublicKey.default.toBase58(),
          instructions: [
            ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }),
            ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 }),
            Ed25519Program.createInstructionWithPublicKey({
              publicKey: task.signer.toBytes(),
              message: task.message,
              signature: task.signature,
            }),
            runTask(),
          ],
        }).compileToV0Message(tables)
      ).serialize().length;
      assert.equal(crankTransactionSize(task, runTask(), tables), expected);
    });

    it("grows one byte for each byte of the signed remote task", () => {
      const small = crankTransactionSize(remoteTask(300), runTask(), []);
      const large = crankTransactionSize(remoteTask(400), runTask(), []);
      assert.ok(small !== undefined && large !== undefined);
      assert.equal(large - small, 100);
    });

    it("counts the accounts the lookup tables hold as one byte each", () => {
      const bare = crankTransactionSize(remoteTask(300), runTask(), []);
      const tabled = crankTransactionSize(remoteTask(300), runTask(), [
        table(REMAINING),
      ]);
      assert.ok(bare !== undefined && tabled !== undefined);
      // Each account moves from a 32-byte key to a 1-byte index; the table adds 32 + 2 bytes.
      assert.equal(bare - tabled, REMAINING.length * 31 - 34);
    });

    it("returns undefined when the message overruns the packet limit", () => {
      assert.equal(
        crankTransactionSize(remoteTask(CRANK_MAX_TX_BYTES), runTask(), []),
        undefined
      );
    });

    it("refuses a run_task_v0 that names no crank turner", () => {
      const unsigned = new TransactionInstruction({
        programId: TUKTUK,
        keys: REMAINING.map((pubkey) => ({
          pubkey,
          isSigner: false,
          isWritable: true,
        })),
        data: Buffer.alloc(14),
      });
      assert.throws(() => crankTransactionSize(remoteTask(300), unsigned, []), {
        message: "run_task_v0 names no crank turner",
      });
    });
  });

  describe("retrySwapMaxBytes", () => {
    it("takes the overshoot off the default budget", () => {
      assert.equal(
        retrySwapMaxBytes(CRANK_MAX_TX_BYTES + 1),
        DCA_SWAP_MAX_BYTES - 1
      );
      assert.equal(retrySwapMaxBytes(1300), DCA_SWAP_MAX_BYTES - 68);
    });

    it("counts an unknown size as the smallest signed transaction whose message overruns", () => {
      assert.equal(retrySwapMaxBytes(undefined), DCA_SWAP_MAX_BYTES - 66);
    });
  });

  describe("runTaskRemainingAccounts", () => {
    const compiled = [
      { pubkey: key(), isSigner: true, isWritable: true },
      { pubkey: key(), isSigner: false, isWritable: false },
      { pubkey: key(), isSigner: true, isWritable: false },
    ];

    it("keeps the compiled accounts in order, none of them signing", () => {
      const accounts = runTaskRemainingAccounts(compiled, 2);
      assert.deepEqual(
        accounts.slice(0, compiled.length),
        compiled.map(({ pubkey, isWritable }) => ({
          pubkey,
          isWritable,
          isSigner: false,
        }))
      );
      assert.ok(accounts.every((account) => !account.isSigner));
    });

    it("adds one writable stand-in for each free task", () => {
      const standIns = runTaskRemainingAccounts(compiled, 3).slice(
        compiled.length
      );
      assert.equal(standIns.length, 3);
      assert.ok(standIns.every((account) => account.isWritable));
      assert.equal(new Set(standIns.map((a) => a.pubkey.toBase58())).size, 3);
    });
  });

  describe("signedTaskCrankSize", () => {
    const compiled = REMAINING.map((pubkey) => ({
      pubkey,
      isSigner: false,
      isWritable: true,
    }));

    /** Size the task with 2 free tasks, recording the accounts run_task_v0 was built over. */
    const sized = async (
      queueLookupTables: AddressLookupTableAccount[],
      swapLookupTables: AddressLookupTableAccount[]
    ) => {
      let built: AccountMeta[] = [];
      const size = await signedTaskCrankSize({
        remoteTask: remoteTask(300),
        remainingAccounts: compiled,
        freeTaskCount: 2,
        queueLookupTables,
        swapLookupTables,
        runTask: async (accounts) => {
          built = accounts;
          return runTask(accounts.map(({ pubkey }) => pubkey));
        },
      });
      return { size, built };
    };

    it("builds run_task_v0 over the task's accounts and one stand-in per free task", async () => {
      const { built } = await sized([], []);
      assert.equal(built.length, compiled.length + 2);
      assert.deepEqual(built.slice(0, compiled.length), compiled);
      assert.ok(built.slice(compiled.length).every((a) => a.isWritable));
    });

    it("counts the queue's lookup tables beside the swap's", async () => {
      const swapTable = table([key()]);
      const { size, built } = await sized([table(REMAINING)], [swapTable]);
      const withBoth = crankTransactionSize(
        remoteTask(300),
        runTask(built.map((a) => a.pubkey)),
        [table(REMAINING), swapTable]
      );
      const swapOnly = crankTransactionSize(
        remoteTask(300),
        runTask(built.map((a) => a.pubkey)),
        [swapTable]
      );
      assert.ok(withBoth !== undefined && swapOnly !== undefined);
      assert.equal(size, withBoth);
      assert.ok(swapOnly > withBoth);
    });
  });

  describe("buildFittingTask", () => {
    /** A build that answers the given sizes in order and records the budgets it was given. */
    const builds = (sizes: (number | undefined)[]) => {
      const budgets: number[] = [];
      const build = (maxBytes: number) => {
        budgets.push(maxBytes);
        return Promise.resolve({
          task: `task@${maxBytes}`,
          size: sizes[budgets.length - 1],
        });
      };
      return { budgets, build };
    };

    it("builds once when the crank transaction fits", async () => {
      const { budgets, build } = builds([CRANK_MAX_TX_BYTES]);
      assert.equal(await buildFittingTask(build), `task@${DCA_SWAP_MAX_BYTES}`);
      assert.deepEqual(budgets, [DCA_SWAP_MAX_BYTES]);
    });

    it("retries once with the overshoot taken off and answers the retry", async () => {
      const { budgets, build } = builds([CRANK_MAX_TX_BYTES + 40, 1200]);
      assert.equal(
        await buildFittingTask(build),
        `task@${DCA_SWAP_MAX_BYTES - 40}`
      );
      assert.deepEqual(budgets, [DCA_SWAP_MAX_BYTES, DCA_SWAP_MAX_BYTES - 40]);
    });

    it("refuses the order when the retry still does not fit", async () => {
      const { budgets, build } = builds([undefined, CRANK_MAX_TX_BYTES + 1]);
      await assert.rejects(buildFittingTask(build), (error) => {
        assert.ok(error instanceof CrankTooLargeError);
        assert.equal(
          error.message,
          "Jupiter found no route for this DCA order whose crank transaction fits (1233 bytes, limit 1232)"
        );
        return true;
      });
      assert.deepEqual(budgets, [DCA_SWAP_MAX_BYTES, DCA_SWAP_MAX_BYTES - 66]);
    });

    it("refuses without a retry when the overshoot is the whole budget", async () => {
      const { budgets, build } = builds([
        CRANK_MAX_TX_BYTES + DCA_SWAP_MAX_BYTES,
      ]);
      await assert.rejects(buildFittingTask(build), (error) => {
        assert.ok(error instanceof CrankTooLargeError);
        assert.equal(
          error.message,
          "Jupiter found no route for this DCA order whose crank transaction fits (1752 bytes, limit 1232)"
        );
        return true;
      });
      assert.deepEqual(budgets, [DCA_SWAP_MAX_BYTES]);
    });
  });
});
