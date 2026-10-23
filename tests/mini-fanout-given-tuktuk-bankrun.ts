import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import { Tuktuk } from "@helium/tuktuk-idls/lib/types/tuktuk";
import {
  compileTransaction,
  init as initTuktuk,
  nextAvailableTaskIds,
  runTask,
  taskKey,
  taskQueueKey,
  taskQueueNameMappingKey,
  tuktukConfigKey,
} from "@helium/tuktuk-sdk";
import { createMemoInstruction } from "@solana/spl-memo";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMint2Instruction,
  getAssociatedTokenAddressSync,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  AccountMeta,
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { BankrunProvider } from "anchor-bankrun";
import { expect } from "chai";
import { copyFileSync } from "fs";
import { join } from "path";
import { ProgramTestContext } from "solana-bankrun";
import { queueAuthorityKey } from "../packages/mini-fanout-sdk/src";
import { MiniFanout } from "../target/types/mini_fanout";
import {
  ensureCloned,
  readAccount,
  startBankrun,
  warpTo,
} from "./utils/bankrun";

const MINI_FANOUT = new PublicKey(
  "mfanLprNnaiP4RX9Zz1BMcDosYHCqnG24H1fMEbi9Gn",
);
const TUKTUK = new PublicKey("tuktukUrfhXT6ZT77QTU8RQtvgL967uRuVagWF57zVA");
const TUKTUK_CONFIG = tuktukConfigKey()[0];
const TUKTUK_IDL = new PublicKey(
  "GkUxZMcw2RbwZ64VL3MvBtYNV8zim3y7UfzabFTybAUJ",
);
// The name the tuktuk binary under test takes in `target/deploy`. It differs from `tuktuk`, so
// the binary the other suites load stays as it is.
const TUKTUK_UNDER_TEST = "tuktuk_under_test";
const HOURLY = "0 0 * * * *";

/** Print the program logs of a failed transaction, which mocha leaves out, then rethrow the error. */
const withLogs = async <T>(run: Promise<T>): Promise<T> => {
  try {
    return await run;
  } catch (e: any) {
    console.log((e.logs ?? []).join("\n"));
    throw e;
  }
};

// Runs mini-fanout against the tuktuk binary that `TUKTUK_SO` names, and is skipped without it.
describe("mini-fanout against a given tuktuk binary", () => {
  let ctx: ProgramTestContext;
  let provider: BankrunProvider;
  let program: Program<MiniFanout>;
  let tuktukProgram: Program<Tuktuk>;
  let me: PublicKey;
  let mint: PublicKey;
  let taskQueue: PublicKey;

  const queueAuthority = queueAuthorityKey()[0];

  // A pre task is stored on the fanout, so it carries its own accounts.
  const memoPreTask = (() => {
    const { transaction, remainingAccounts } = compileTransaction(
      [createMemoInstruction("HELLO!", [])],
      [],
    );
    return { ...transaction, accounts: remainingAccounts.map((a) => a.pubkey) };
  })();

  const send = (instructions: anchor.web3.TransactionInstruction[]) =>
    provider.sendAndConfirm(new Transaction().add(...instructions));

  before(async function () {
    const binary = process.env.TUKTUK_SO;
    if (!binary) {
      this.skip();
    }
    copyFileSync(
      binary!,
      join(__dirname, "..", "target", "deploy", `${TUKTUK_UNDER_TEST}.so`),
    );
    ctx = await startBankrun(
      [
        { name: "mini_fanout", programId: MINI_FANOUT },
        { name: TUKTUK_UNDER_TEST, programId: TUKTUK },
      ],
      [
        ensureCloned("tuktuk_config", TUKTUK_CONFIG),
        ensureCloned("tuktuk_idl", TUKTUK_IDL),
      ],
    );
    provider = new BankrunProvider(ctx);
    program = new Program<MiniFanout>(
      require("../target/idl/mini_fanout.json"),
      provider,
    );
    tuktukProgram = await initTuktuk(provider);
    me = provider.wallet.publicKey;

    const mintKeypair = Keypair.generate();
    mint = mintKeypair.publicKey;
    await provider.sendAndConfirm(
      new Transaction().add(
        SystemProgram.createAccount({
          fromPubkey: me,
          newAccountPubkey: mint,
          space: MINT_SIZE,
          lamports:
            await provider.connection.getMinimumBalanceForRentExemption(
              MINT_SIZE,
            ),
          programId: TOKEN_PROGRAM_ID,
        }),
        createInitializeMint2Instruction(mint, 8, me, me),
      ),
      [mintKeypair],
    );

    const name = "bankrun";
    const { nextTaskQueueId } =
      await tuktukProgram.account.tuktukConfigV0.fetch(TUKTUK_CONFIG);
    taskQueue = taskQueueKey(TUKTUK_CONFIG, nextTaskQueueId)[0];
    await tuktukProgram.methods
      .initializeTaskQueueV0({
        name,
        minCrankReward: new anchor.BN(1),
        capacity: 1000,
        lookupTables: [],
        staleTaskAge: 10000,
      })
      .accounts({
        tuktukConfig: TUKTUK_CONFIG,
        payer: me,
        updateAuthority: me,
        taskQueue,
        taskQueueNameMapping: taskQueueNameMappingKey(TUKTUK_CONFIG, name)[0],
      })
      .rpc();
    await tuktukProgram.methods
      .addQueueAuthorityV0()
      .accounts({ payer: me, queueAuthority, taskQueue })
      .rpc();
  });

  /**
   * A fanout with a compiled pre task, and with its distribution and its pre task queued. `payer`
   * pays for the queued tasks, and so is their rent refund.
   */
  async function scheduledFanout(seed: string, payer?: Keypair) {
    const {
      pubkeys: { miniFanout },
    } = await program.methods
      .initializeMiniFanoutV0({
        seed: Buffer.from(seed, "utf-8"),
        shares: [
          {
            wallet: Keypair.generate().publicKey,
            share: { share: { amount: 100 } },
          },
        ],
        schedule: HOURLY,
        preTask: { compiledV0: [memoPreTask as any] } as any,
      })
      .accounts({ payer: me, owner: me, taskQueue, rentRefund: me, mint })
      .rpcAndKeys();
    // The fanout pays the crank reward of the tasks that a distribution returns.
    await send([
      SystemProgram.transfer({
        fromPubkey: me,
        toPubkey: miniFanout!,
        lamports: 1000000000,
      }),
      createAssociatedTokenAccountIdempotentInstruction(
        me,
        getAssociatedTokenAddressSync(mint, miniFanout!, true),
        miniFanout!,
        mint,
      ),
    ]);

    const { taskBitmap, capacity } =
      await tuktukProgram.account.taskQueueV0.fetch(taskQueue);
    const [preTaskId, taskId] = nextAvailableTaskIds(
      taskBitmap,
      2,
      false,
      capacity,
    );
    await program.methods
      .scheduleTaskV0({ taskId, preTaskId })
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({ units: 1400000 }),
      ])
      .accounts({
        payer: payer?.publicKey ?? me,
        miniFanout: miniFanout!,
        task: taskKey(taskQueue, taskId)[0],
        preTask: taskKey(taskQueue, preTaskId)[0],
      })
      .signers(payer ? [payer] : [])
      .rpc();
    return miniFanout!;
  }

  const crank = async (task: PublicKey) =>
    send([
      ComputeBudgetProgram.setComputeUnitLimit({ units: 1400000 }),
      ...(await runTask({ program: tuktukProgram, task, crankTurner: me })),
    ]);

  /** Run the pre task and the distribution, which returns the next of each. */
  async function distributeOnce(miniFanout: PublicKey) {
    const { nextTask, nextPreTask } =
      await program.account.miniFanoutV0.fetch(miniFanout);
    const { trigger } = await tuktukProgram.account.taskV0.fetch(nextTask);
    await warpTo(ctx, BigInt(trigger.timestamp![0].toString()));
    await crank(nextPreTask);
    await crank(nextTask);
    const after = await program.account.miniFanoutV0.fetch(miniFanout);
    expect(after.nextTask.toBase58()).to.not.equal(nextTask.toBase58());
    expect(after.nextPreTask.toBase58()).to.not.equal(nextPreTask.toBase58());
  }

  /** The rent refund that each queued task of the fanout names, as writable remaining accounts. */
  async function rentRefundsOf(miniFanout: PublicKey): Promise<AccountMeta[]> {
    const { nextTask, nextPreTask } =
      await program.account.miniFanoutV0.fetch(miniFanout);
    const rentRefundOf = async (task: PublicKey) =>
      tuktukProgram.coder.accounts.decode(
        "taskV0",
        (await readAccount(ctx, task))!,
      ).rentRefund as PublicKey;
    return [await rentRefundOf(nextTask), await rentRefundOf(nextPreTask)].map(
      (pubkey) => ({ pubkey, isWritable: true, isSigner: false }),
    );
  }

  async function update(
    miniFanout: PublicKey,
    remainingAccounts: AccountMeta[] = [],
  ) {
    const { nextTask, nextPreTask } =
      await program.account.miniFanoutV0.fetch(miniFanout);
    const { taskBitmap, capacity } =
      await tuktukProgram.account.taskQueueV0.fetch(taskQueue);
    const [newPreTaskId, newTaskId] = nextAvailableTaskIds(
      taskBitmap,
      2,
      true,
      capacity,
    );
    await withLogs(
      program.methods
        .updateMiniFanoutV0({
          shares: null,
          schedule: null,
          newTaskId,
          newPreTaskId,
        })
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({ units: 1400000 }),
        ])
        .accounts({
          payer: me,
          owner: me,
          miniFanout,
          newTask: taskKey(taskQueue, newTaskId)[0],
          newPreTask: taskKey(taskQueue, newPreTaskId)[0],
          taskRentRefund: me,
        })
        .remainingAccounts(remainingAccounts)
        .rpc(),
    );

    expect(await readAccount(ctx, nextTask)).to.equal(null);
    expect(await readAccount(ctx, nextPreTask)).to.equal(null);
    const acc = await program.account.miniFanoutV0.fetch(miniFanout);
    expect(acc.nextTask.toBase58()).to.equal(
      taskKey(taskQueue, newTaskId)[0].toBase58(),
    );
    expect(acc.nextPreTask.toBase58()).to.equal(
      taskKey(taskQueue, newPreTaskId)[0].toBase58(),
    );
  }

  async function close(
    miniFanout: PublicKey,
    remainingAccounts: AccountMeta[] = [],
  ) {
    const { nextTask, nextPreTask } =
      await program.account.miniFanoutV0.fetch(miniFanout);
    await withLogs(
      program.methods
        .closeMiniFanoutV0()
        .accounts({ miniFanout, taskRentRefund: me })
        .remainingAccounts(remainingAccounts)
        .rpc(),
    );

    expect(await readAccount(ctx, nextTask)).to.equal(null);
    expect(await readAccount(ctx, nextPreTask)).to.equal(null);
    expect(await readAccount(ctx, miniFanout)).to.equal(null);
  }

  describe("before a distribution", () => {
    it("updates a fanout with a pre task", async () => {
      await update(await scheduledFanout("update-before"));
    });

    it("closes a fanout with a pre task", async () => {
      await close(await scheduledFanout("close-before"));
    });
  });

  describe("after one distribution", () => {
    it("updates a fanout with a pre task", async () => {
      const miniFanout = await scheduledFanout("update-after");
      await distributeOnce(miniFanout);
      await update(miniFanout);
    });

    it("closes a fanout with a pre task", async () => {
      const miniFanout = await scheduledFanout("close-after");
      await distributeOnce(miniFanout);
      await close(miniFanout);
    });
  });

  describe("with tasks whose payer is no account of the instruction", () => {
    /** A fanout after one distribution, with tasks that a separate payer queued. */
    async function fanoutOfAnotherPayer(seed: string) {
      const payer = Keypair.generate();
      await send([
        SystemProgram.transfer({
          fromPubkey: me,
          toPubkey: payer.publicKey,
          lamports: 1000000000,
        }),
      ]);
      const miniFanout = await scheduledFanout(seed, payer);
      await distributeOnce(miniFanout);
      // The returned next task refunds to the payer, which the instruction does not take. The
      // returned pre task refunds to the task queue.
      expect(
        (await rentRefundsOf(miniFanout)).map((a) => a.pubkey.toBase58()),
      ).to.deep.equal([payer.publicKey.toBase58(), taskQueue.toBase58()]);
      return miniFanout;
    }

    it("updates a fanout with the rent refunds as remaining accounts", async () => {
      const miniFanout = await fanoutOfAnotherPayer("update-other-payer");
      await update(miniFanout, await rentRefundsOf(miniFanout));
    });

    it("closes a fanout with the rent refunds as remaining accounts", async () => {
      const miniFanout = await fanoutOfAnotherPayer("close-other-payer");
      await close(miniFanout, await rentRefundsOf(miniFanout));
    });
  });
});
