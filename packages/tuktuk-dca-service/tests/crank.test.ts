import assert from "node:assert/strict";
import {
  AddressLookupTableAccount,
  Keypair,
  PublicKey,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  buildFittingTask,
  CRANK_MAX_TX_BYTES,
  crankTransactionSize,
  retrySwapMaxBytes,
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

  describe("buildFittingTask", () => {
    /** A build that answers the given sizes in order and records the budgets it was given. */
    const builds = (sizes: (number | undefined)[]) => {
      const budgets: number[] = [];
      const build = async (maxBytes: number) => {
        budgets.push(maxBytes);
        return { task: `task@${maxBytes}`, size: sizes[budgets.length - 1] };
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
      await assert.rejects(buildFittingTask(build), {
        message:
          "Jupiter found no route for this DCA order whose crank transaction fits (1233 bytes, limit 1232)",
      });
      assert.deepEqual(budgets, [DCA_SWAP_MAX_BYTES, DCA_SWAP_MAX_BYTES - 66]);
    });

    it("refuses without a retry when the overshoot is the whole budget", async () => {
      const { budgets, build } = builds([
        CRANK_MAX_TX_BYTES + DCA_SWAP_MAX_BYTES,
      ]);
      await assert.rejects(buildFittingTask(build), {
        message:
          "Jupiter found no route for this DCA order whose crank transaction fits (1752 bytes, limit 1232)",
      });
      assert.deepEqual(budgets, [DCA_SWAP_MAX_BYTES]);
    });
  });
});
