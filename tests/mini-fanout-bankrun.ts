import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import { Tuktuk } from "@helium/tuktuk-idls/lib/types/tuktuk";
import {
  compileTransaction,
  init as initTuktuk,
  nextAvailableTaskIds,
  runTask,
  taskKey,
  taskQueueAuthorityKey,
  taskQueueKey,
  taskQueueNameMappingKey,
  tuktukConfigKey,
} from "@helium/tuktuk-sdk";
import { createMemoInstruction } from "@solana/spl-memo";
import {
  AccountLayout,
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMint2Instruction,
  createMintToInstruction,
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
import { ProgramTestContext } from "solana-bankrun";
import { expect } from "chai";
import { queueAuthorityKey } from "../packages/mini-fanout-sdk/src";
import { MiniFanout } from "../target/types/mini_fanout";
import {
  ensureCloned,
  ensureDumped,
  overwriteAccountData,
  readAccount,
  startBankrun,
  warpTo,
} from "./utils/bankrun";

const MINI_FANOUT = new PublicKey(
  "mfanLprNnaiP4RX9Zz1BMcDosYHCqnG24H1fMEbi9Gn"
);
const TUKTUK = new PublicKey("tuktukUrfhXT6ZT77QTU8RQtvgL967uRuVagWF57zVA");
// shared_utils::ORACLE_SIGNER, which the tests build against because `anchor build` here runs
// without the `devnet` feature.
const ORACLE_SIGNER = new PublicKey(
  "orc1TYY5L4B4ZWDEMayTqu99ikPM9bQo9fqzoaCPP5Q"
);
// tuktuk's config, and the IDL account `initTuktuk` reads to build its Program. Both are what
// `Anchor.toml` clones for the localnet suites, so both suites run against the same tuktuk.
const TUKTUK_CONFIG = tuktukConfigKey()[0];
const TUKTUK_IDL = new PublicKey(
  "GkUxZMcw2RbwZ64VL3MvBtYNV8zim3y7UfzabFTybAUJ"
);

const FANOUT_AMOUNT = 1000000000;
// No cron string can be "two seconds from now" without racing the run that reads it. Under
// bankrun the trigger is reached by moving the clock, so the schedule is an ordinary one.
const HOURLY = "0 0 * * * *";
const RENT_REFUND_MISSING =
  /Error Code: RentRefundAccountMissing\. Error Number: 6014\./;
const RENT_REFUND_NOT_WRITABLE =
  /Error Code: RentRefundAccountNotWritable\. Error Number: 6015\./;

/** The logs of a failed transaction, which is where an Anchor error names itself. */
async function programErrorLogs(run: Promise<unknown>): Promise<string> {
  try {
    await run;
  } catch (e: any) {
    return [String(e.message ?? e), ...(e.logs ?? [])].join("\n");
  }
  throw new Error("expected the transaction to fail, and it succeeded");
}

async function tokenAmount(
  ctx: ProgramTestContext,
  address: PublicKey
): Promise<bigint> {
  const data = await readAccount(ctx, address);
  if (!data) {
    throw new Error(`no token account at ${address.toBase58()}`);
  }
  return AccountLayout.decode(data).amount;
}

describe("mini-fanout under bankrun", () => {
  let ctx: ProgramTestContext;
  let provider: BankrunProvider;
  let program: Program<MiniFanout>;
  let tuktukProgram: Program<Tuktuk>;
  let me: PublicKey;
  let mint: PublicKey;
  let taskQueue: PublicKey;

  const queueAuthority = queueAuthorityKey()[0];

  // compileTransaction hands the account list back separately so it can ride as remaining
  // accounts on queue_task_v0, which merges them in. A pre task is stored on the fanout
  // instead, so it has to carry its own accounts for program_id_index to resolve against.
  const memoPreTask = (() => {
    const { transaction, remainingAccounts } = compileTransaction(
      [createMemoInstruction("HELLO!", [])],
      []
    );
    return { ...transaction, accounts: remainingAccounts.map((a) => a.pubkey) };
  })();

  const send = (instructions: anchor.web3.TransactionInstruction[]) =>
    provider.sendAndConfirm(new Transaction().add(...instructions));

  async function createMint(): Promise<PublicKey> {
    const mintKeypair = Keypair.generate();
    const lamports =
      await provider.connection.getMinimumBalanceForRentExemption(MINT_SIZE);
    await provider.sendAndConfirm(
      new Transaction().add(
        SystemProgram.createAccount({
          fromPubkey: me,
          newAccountPubkey: mintKeypair.publicKey,
          space: MINT_SIZE,
          lamports,
          programId: TOKEN_PROGRAM_ID,
        }),
        createInitializeMint2Instruction(mintKeypair.publicKey, 8, me, me)
      ),
      [mintKeypair]
    );
    return mintKeypair.publicKey;
  }

  /** The wallet's ATA, created if absent and credited with `amount`. */
  async function ataWith(
    owner: PublicKey,
    amount: number,
    allowOwnerOffCurve = false
  ) {
    const ata = getAssociatedTokenAddressSync(mint, owner, allowOwnerOffCurve);
    const instructions = [
      createAssociatedTokenAccountIdempotentInstruction(me, ata, owner, mint),
    ];
    if (amount > 0) {
      instructions.push(createMintToInstruction(mint, ata, me, amount));
    }
    await send(instructions);
    return ata;
  }

  before(async () => {
    ensureDumped("tuktuk", TUKTUK);
    ctx = await startBankrun(
      [
        { name: "mini_fanout", programId: MINI_FANOUT },
        { name: "tuktuk", programId: TUKTUK },
      ],
      [
        ensureCloned("tuktuk_config", TUKTUK_CONFIG),
        ensureCloned("tuktuk_idl", TUKTUK_IDL),
      ]
    );
    provider = new BankrunProvider(ctx);
    program = new Program<MiniFanout>(
      require("../target/idl/mini_fanout.json"),
      provider
    );
    tuktukProgram = await initTuktuk(provider);
    me = provider.wallet.publicKey;
    mint = await createMint();

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
    // A second queue authority, so a test can queue and dequeue a task directly.
    await tuktukProgram.methods
      .addQueueAuthorityV0()
      .accounts({ payer: me, queueAuthority: me, taskQueue })
      .rpc();
  });

  /**
   * A fanout with its distribution scheduled: the same state the localnet suite reaches by
   * waiting for a cron string two seconds out, minus the wait and the race. `payer` pays for
   * the queued tasks, and so is their rent refund.
   */
  async function scheduledFanout({
    seed,
    shares,
    funding = FANOUT_AMOUNT,
    preTask = { compiledV0: [memoPreTask as any] } as any,
    payer,
  }: {
    seed: string;
    shares: any[];
    funding?: number;
    preTask?: any;
    payer?: Keypair;
  }) {
    const {
      pubkeys: { miniFanout },
    } = await program.methods
      .initializeMiniFanoutV0({
        seed: Buffer.from(seed, "utf-8"),
        shares,
        schedule: HOURLY,
        preTask,
      })
      .accounts({ payer: me, owner: me, taskQueue, rentRefund: me, mint })
      .rpcAndKeys();

    // The crank reward comes out of the fanout's own lamports; without it distribute_v0
    // unschedules itself instead of re-queuing, and never reads the pre task.
    await send([
      SystemProgram.transfer({
        fromPubkey: me,
        toPubkey: miniFanout!,
        lamports: 1000000000,
      }),
    ]);

    const { taskBitmap, capacity } =
      await tuktukProgram.account.taskQueueV0.fetch(taskQueue);
    const [preTaskId, taskId] = nextAvailableTaskIds(
      taskBitmap,
      2,
      false,
      capacity
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

    if (funding > 0) {
      await ataWith(miniFanout!, funding, true);
    }
    return {
      miniFanout: miniFanout!,
      task: taskKey(taskQueue, taskId)[0],
      preTask: taskKey(taskQueue, preTaskId)[0],
    };
  }

  /**
   * Rewrite the fanout's stored `next_pre_task` to `key`. A fanout holding a claim on a
   * slot it does not own is a state no instruction writes, so only a direct rewrite of
   * the account produces it.
   */
  async function plantNextPreTask(miniFanout: PublicKey, key: PublicKey) {
    const original = await readAccount(ctx, miniFanout);
    const before = program.coder.accounts.decode(
      "miniFanoutV0",
      Buffer.from(original!)
    );
    const planted = Buffer.from(original!);
    const at = planted.indexOf(Buffer.from(before.nextPreTask.toBytes()));
    expect(at).to.be.greaterThan(-1);
    planted.set(key.toBytes(), at);
    await overwriteAccountData(ctx, miniFanout, planted);
  }

  // dequeue_task_v0 refunds to the task's own rent_refund, which is the payer for a task
  // queue_task_v0 created. For a task that a run returned, it is the rent refund of the task that
  // ran when that task paid all of its rent. The rent_amount of the task that ran caps the rent of
  // all the tasks that one run returns, so a task past the cap refunds to the task queue
  // (helium/tuktuk#115).
  // Read through banksClient: anchor's fetchNullable goes through BankrunConnectionProxy,
  // which throws on a missing account rather than returning null.
  const taskRentRefundOf = async (miniFanout: PublicKey) => {
    const { nextTask } = await program.account.miniFanoutV0.fetch(miniFanout);
    return nextTask.equals(miniFanout)
      ? me
      : (tuktukProgram.coder.accounts.decode(
          "taskV0",
          (await readAccount(ctx, nextTask))!
        ).rentRefund as PublicKey);
  };

  /** A rent refund in the shape of a remaining account. */
  const rentRefundMeta = (pubkey: PublicKey, isWritable = true): AccountMeta => ({
    pubkey,
    isWritable,
    isSigner: false,
  });

  /** Reschedule through `update_mini_fanout_v0`, changing nothing but the task ids. */
  async function rescheduleViaUpdate(
    miniFanout: PublicKey,
    remainingAccounts: AccountMeta[] = []
  ) {
    const { taskBitmap, capacity } =
      await tuktukProgram.account.taskQueueV0.fetch(taskQueue);
    const [newPreTaskId, newTaskId] = nextAvailableTaskIds(
      taskBitmap,
      2,
      true,
      capacity
    );
    await program.methods
      .updateMiniFanoutV0({ shares: null, schedule: null, newTaskId, newPreTaskId })
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
      .rpc();
  }

  const crank = async (task: PublicKey) =>
    send([
      ComputeBudgetProgram.setComputeUnitLimit({ units: 1400000 }),
      ...(await runTask({ program: tuktukProgram, task, crankTurner: me })),
    ]);

  /**
   * Run the pre task, then move the clock to the distribution's trigger. distribute_v0 refuses
   * to run while the pre task account still exists, so the order is the chain's, not a choice.
   */
  async function reachDistribution(task: PublicKey, preTask: PublicKey) {
    const { trigger } = await tuktukProgram.account.taskV0.fetch(task);
    await warpTo(ctx, BigInt(trigger.timestamp![0].toString()));
    await crank(preTask);
    return () => crank(task);
  }

  const shareOf = (wallet: PublicKey, amount: number) => ({
    wallet,
    share: { share: { amount } },
  });

  it("distributes to wallets when the clock reaches the trigger", async () => {
    const [wallet1, wallet2, wallet3] = [
      Keypair.generate(),
      Keypair.generate(),
      Keypair.generate(),
    ];
    // wallet2 gets no ATA on purpose: its payout has nowhere to go and must be recorded as
    // owed rather than silently dropped.
    const wallet1Ata = await ataWith(wallet1.publicKey, 0);
    const wallet3Ata = await ataWith(wallet3.publicKey, 0);

    const { miniFanout, task, preTask } = await scheduledFanout({
      seed: "distributes",
      shares: [
        shareOf(wallet1.publicKey, 50),
        shareOf(wallet2.publicKey, 50),
        {
          wallet: wallet3.publicKey,
          share: { fixed: { amount: new anchor.BN(100000000) } },
        },
      ],
    });
    const fanoutAta = getAssociatedTokenAddressSync(mint, miniFanout, true);

    const distribute = await reachDistribution(task, preTask);
    await distribute();

    expect(Number(await tokenAmount(ctx, fanoutAta))).to.equal(450000000);
    expect(Number(await tokenAmount(ctx, wallet1Ata))).to.equal(450000000);
    expect(Number(await tokenAmount(ctx, wallet3Ata))).to.equal(100000000);

    const acc = await program.account.miniFanoutV0.fetch(miniFanout);
    // There was no ATA for this wallet, so the total owed is the amount we couldn't transfer
    expect(acc.shares[1].totalOwed.toNumber()).to.equal(450000000);

    // distribute_v0 re-queues both tasks every cycle, so this is the read-through at that call
    // site: the stored pre task reaches the queue, and it carries no free tasks, which is what
    // keeps a pre task from spawning children of its own.
    expect(await tuktukProgram.account.taskV0.fetch(acc.nextTask)).to.not.be
      .null;
    const nextPreTask = await tuktukProgram.account.taskV0.fetch(
      acc.nextPreTask
    );
    expect(nextPreTask.freeTasks).to.equal(0);
    expect(nextPreTask.transaction.compiledV0![0].instructions.length).to.equal(
      1
    );
    expect(nextPreTask.transaction.compiledV0![0].signerSeeds).to.deep.equal(
      []
    );
  });

  it("records no next pre task when the fanout has none", async () => {
    const wallet = Keypair.generate();
    await ataWith(wallet.publicKey, 0);

    const { miniFanout, task } = await scheduledFanout({
      seed: "no-pre-task",
      shares: [shareOf(wallet.publicKey, 100)],
      preTask: null,
    });

    // schedule_task_v0 queued this one, so this is the declaration at that call site.
    const queued = await tuktukProgram.account.taskV0.fetch(task);
    expect(queued.freeTasks).to.equal(1);

    await warpTo(ctx, BigInt(queued.trigger.timestamp![0].toString()));
    await crank(task);

    const acc = await program.account.miniFanoutV0.fetch(miniFanout);
    // The fanout's own key is the sentinel for there being no next pre task, so the
    // second free task slot is not recorded and distribute_v0 stays runnable.
    expect(acc.nextPreTask.toBase58()).to.equal(miniFanout.toBase58());
    // One slot for the next distribution, and none for a pre task it will not queue.
    const next = await tuktukProgram.account.taskV0.fetch(acc.nextTask);
    expect(next.freeTasks).to.equal(1);

    // Runnable again next cycle, which is what the sentinel buys.
    await warpTo(ctx, BigInt(next.trigger.timestamp![0].toString()));
    await crank(acc.nextTask);
    const after = await program.account.miniFanoutV0.fetch(miniFanout);
    expect(after.nextPreTask.toBase58()).to.equal(miniFanout.toBase58());
  });

  it("pays a share member what it was owed once its account exists", async () => {
    const [wallet1, wallet2] = [Keypair.generate(), Keypair.generate()];
    const wallet1Ata = await ataWith(wallet1.publicKey, 0);

    const { miniFanout, task, preTask } = await scheduledFanout({
      seed: "settles-owed",
      shares: [shareOf(wallet1.publicKey, 50), shareOf(wallet2.publicKey, 50)],
    });

    const distribute = await reachDistribution(task, preTask);
    await distribute();

    const acc = await program.account.miniFanoutV0.fetch(miniFanout);
    expect(acc.shares[1].totalOwed.toNumber()).to.be.greaterThan(0);

    // Give wallet2 somewhere to receive, then reach the next distribution.
    const wallet2Ata = await ataWith(wallet2.publicKey, 0);
    const again = await reachDistribution(acc.nextTask, acc.nextPreTask);
    await again();

    const settled = await program.account.miniFanoutV0.fetch(miniFanout);
    expect(settled.shares[1].totalOwed.toNumber()).to.equal(0);

    // Settling comes off the top, so the whole pool goes to the member that was
    // behind and the two end on the even split the weights describe. The member
    // already paid receives nothing further, which is what stops the settlement
    // being a second payout of the same tokens.
    const fanoutAta = getAssociatedTokenAddressSync(mint, miniFanout, true);
    expect(Number(await tokenAmount(ctx, wallet1Ata))).to.equal(FANOUT_AMOUNT / 2);
    expect(Number(await tokenAmount(ctx, wallet2Ata))).to.equal(FANOUT_AMOUNT / 2);
    expect(Number(await tokenAmount(ctx, fanoutAta))).to.equal(0);
  });

  it("distributes when the share weights exceed a u32", async () => {
    const [wallet1, wallet2] = [Keypair.generate(), Keypair.generate()];
    const ata1 = await ataWith(wallet1.publicKey, 0);
    const ata2 = await ataWith(wallet2.publicKey, 0);

    // Two weights whose sum is wider than a u32, which is the width the running
    // total has to carry.
    const half = 0xffffffff;
    const { task, preTask } = await scheduledFanout({
      seed: "wide-weights",
      shares: [shareOf(wallet1.publicKey, half), shareOf(wallet2.publicKey, half)],
    });

    const distribute = await reachDistribution(task, preTask);
    await distribute();

    expect(Number(await tokenAmount(ctx, ata1))).to.equal(FANOUT_AMOUNT / 2);
    expect(Number(await tokenAmount(ctx, ata2))).to.equal(FANOUT_AMOUNT / 2);
  });

  it("distributes to 6 wallets in one transaction", async () => {
    const wallets = Array.from({ length: 6 }, () => Keypair.generate());
    const atas = [];
    for (const w of wallets) {
      atas.push(await ataWith(w.publicKey, 0));
    }

    const { miniFanout, task, preTask } = await scheduledFanout({
      seed: "six-wallets",
      shares: wallets.map((w) => shareOf(w.publicKey, 10)),
      funding: 600000000,
    });
    const fanoutAta = getAssociatedTokenAddressSync(mint, miniFanout, true);

    const distribute = await reachDistribution(task, preTask);
    await distribute();

    expect(Number(await tokenAmount(ctx, fanoutAta))).to.equal(0);
    for (const ata of atas) {
      expect(Number(await tokenAmount(ctx, ata))).to.equal(100000000);
    }
  });

  it("refuses to re-queue a stored pre task that does not satisfy the rule", async () => {
    const wallet = Keypair.generate();
    await ataWith(wallet.publicKey, 0);

    const { miniFanout, task, preTask } = await scheduledFanout({
      seed: "stored-before",
      shares: [shareOf(wallet.publicKey, 100)],
    });

    // A fanout carrying a pre task neither instruction would store: scheduled while it
    // conformed, then rewritten underneath. Only bankrun can produce it, and it is what
    // reaches distribute_v0's read of the pre task with something to refuse.
    const acc = await program.account.miniFanoutV0.fetch(miniFanout);
    const encoded = await program.coder.accounts.encode("miniFanoutV0", {
      ...acc,
      preTask: {
        compiledV0: [
          {
            ...acc.preTask!.compiledV0![0],
            signerSeeds: [[Buffer.from("helium", "utf-8"), Buffer.from([253])]],
          },
        ],
      },
    });
    const original = await readAccount(ctx, miniFanout);
    expect(encoded.length).to.be.at.most(original!.length);
    const rewritten = Buffer.alloc(original!.length);
    encoded.copy(rewritten);
    await overwriteAccountData(ctx, miniFanout, rewritten);

    // The rewrite has to have taken, or the refusal below would be asserting nothing.
    const stored = await program.account.miniFanoutV0.fetch(miniFanout);
    expect(stored.preTask!.compiledV0![0].signerSeeds.length).to.equal(1);

    const distribute = await reachDistribution(task, preTask);
    expect(await programErrorLogs(distribute())).to.match(
      /Error Code: InvalidPreTask\. Error Number: 6011\./
    );
  });

  it("refuses to distribute while the fanout sits below the rent minimum", async () => {
    const wallet = Keypair.generate();
    const walletAta = await ataWith(wallet.publicKey, 0);

    const { miniFanout, task, preTask } = await scheduledFanout({
      seed: "below-rent",
      shares: [shareOf(wallet.publicKey, 100)],
    });

    // A fanout funded before a Rent sysvar increase: the account exists, the program will
    // never write it into this state, and only bankrun can take its lamports away.
    const before = await ctx.banksClient.getAccount(miniFanout);
    const minimum = await provider.connection.getMinimumBalanceForRentExemption(
      before!.data.length
    );
    const setLamports = (lamports: number) =>
      ctx.setAccount(miniFanout, {
        lamports,
        data: before!.data,
        owner: new PublicKey(before!.owner),
        executable: before!.executable,
      });
    await setLamports(minimum - 1);

    const distribute = await reachDistribution(task, preTask);
    expect(await programErrorLogs(distribute())).to.match(
      /Error Code: BelowRentExempt\. Error Number: 6013\./
    );
    // Nothing committed: no payout, and the task is still queued rather than consumed.
    expect(Number(await tokenAmount(ctx, walletAta))).to.equal(0);
    expect(await tuktukProgram.account.taskV0.fetchNullable(task)).to.not.be
      .null;

    // Topped up, the same task runs and the fanout resumes without being rescheduled. The
    // memo only keeps this from being byte-identical to the transaction that just failed.
    await setLamports(before!.lamports);
    await send([
      ComputeBudgetProgram.setComputeUnitLimit({ units: 1400000 }),
      ...(await runTask({ program: tuktukProgram, task, crankTurner: me })),
      createMemoInstruction("topped up", []),
    ]);
    expect(Number(await tokenAmount(ctx, walletAta))).to.equal(FANOUT_AMOUNT);
  });

  it("clears a stale next pre task when it reschedules", async () => {
    const wallet = Keypair.generate();
    await ataWith(wallet.publicKey, 0);
    const { miniFanout } = await scheduledFanout({
      seed: "clears-stale",
      shares: [shareOf(wallet.publicKey, 100)],
      preTask: null,
    });

    // Plant a key no instruction writes: a fanout holding a claim on a slot it does not
    // own is the state this clears, and only a direct rewrite can produce it.
    const stale = Keypair.generate().publicKey;
    await plantNextPreTask(miniFanout, stale);
    expect(
      (await program.account.miniFanoutV0.fetch(miniFanout)).nextPreTask.toBase58()
    ).to.equal(stale.toBase58());

    await rescheduleViaUpdate(miniFanout);

    const after = await program.account.miniFanoutV0.fetch(miniFanout);
    expect(after.nextPreTask.toBase58()).to.equal(miniFanout.toBase58());

    // The queued transaction carries the `next_pre_task` `get_task_ix` read, and
    // `distribute_v0` checks it against the stored one, so running the task is what
    // says the two agree.
    const queued = await tuktukProgram.account.taskV0.fetch(after.nextTask);
    await warpTo(ctx, BigInt(queued.trigger.timestamp![0].toString()));
    await crank(after.nextTask);
    expect(
      (await program.account.miniFanoutV0.fetch(miniFanout)).nextPreTask.toBase58()
    ).to.equal(miniFanout.toBase58());
  });

  it("clears a stale next pre task when a delegate changes", async () => {
    const wallet = Keypair.generate();
    await ataWith(wallet.publicKey, 0);
    const { miniFanout } = await scheduledFanout({
      seed: "clears-stale-delegate",
      shares: [shareOf(wallet.publicKey, 100)],
      preTask: null,
    });

    const stale = Keypair.generate().publicKey;
    await plantNextPreTask(miniFanout, stale);

    const { taskBitmap, capacity } =
      await tuktukProgram.account.taskQueueV0.fetch(taskQueue);
    const [newPreTaskId, newTaskId] = nextAvailableTaskIds(
      taskBitmap,
      2,
      true,
      capacity
    );
    await program.methods
      .updateWalletDelegateV0({
        newTaskId,
        newPreTaskId,
        delegate: Keypair.generate().publicKey,
        index: 0,
      })
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({ units: 1400000 }),
      ])
      .accounts({
        payer: me,
        wallet: wallet.publicKey,
        miniFanout,
        newTask: taskKey(taskQueue, newTaskId)[0],
        newPreTask: taskKey(taskQueue, newPreTaskId)[0],
      })
      .signers([wallet])
      .rpc();

    expect(
      (await program.account.miniFanoutV0.fetch(miniFanout)).nextPreTask.toBase58()
    ).to.equal(miniFanout.toBase58());
  });

  it("clears a stale next pre task whose account is not empty", async () => {
    const wallet = Keypair.generate();
    await ataWith(wallet.publicKey, 0);
    const { miniFanout } = await scheduledFanout({
      seed: "stuck-nonempty",
      shares: [shareOf(wallet.publicKey, 100)],
      preTask: null,
    });

    // Plant a key whose account is live and is not a task: the shape a recorded free task
    // slot takes once something else occupies that id. A fanout with no pre task never
    // owned the slot, so it must neither close what is there nor be trapped by it.
    await plantNextPreTask(miniFanout, taskQueue);
    const queueBefore = await readAccount(ctx, taskQueue);

    await rescheduleViaUpdate(miniFanout);

    // Repaired, and the account that was sitting in the slot is still there.
    expect(
      (await program.account.miniFanoutV0.fetch(miniFanout)).nextPreTask.toBase58()
    ).to.equal(miniFanout.toBase58());
    expect((await readAccount(ctx, taskQueue))!.length).to.equal(queueBefore!.length);
  });

  it("changes a delegate on a fanout with nothing scheduled", async () => {
    const wallet = Keypair.generate();
    await ataWith(wallet.publicKey, 0);
    // No scheduleTaskV0, so next_task is still the sentinel initialize wrote.
    const {
      pubkeys: { miniFanout },
    } = await program.methods
      .initializeMiniFanoutV0({
        seed: Buffer.from("unscheduled-delegate", "utf-8"),
        shares: [shareOf(wallet.publicKey, 100)],
        schedule: HOURLY,
        preTask: null,
      })
      .accounts({ payer: me, owner: me, taskQueue, rentRefund: me, mint })
      .rpcAndKeys();
    await send([
      SystemProgram.transfer({
        fromPubkey: me,
        toPubkey: miniFanout!,
        lamports: 1000000000,
      }),
    ]);

    const { taskBitmap, capacity } =
      await tuktukProgram.account.taskQueueV0.fetch(taskQueue);
    const [newPreTaskId, newTaskId] = nextAvailableTaskIds(
      taskBitmap,
      2,
      true,
      capacity
    );
    const delegate = Keypair.generate().publicKey;
    await program.methods
      .updateWalletDelegateV0({ newTaskId, newPreTaskId, delegate, index: 0 })
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({ units: 1400000 }),
      ])
      .accounts({
        payer: me,
        wallet: wallet.publicKey,
        miniFanout: miniFanout!,
        newTask: taskKey(taskQueue, newTaskId)[0],
        newPreTask: taskKey(taskQueue, newPreTaskId)[0],
      })
      .signers([wallet])
      .rpc();

    const acc = await program.account.miniFanoutV0.fetch(miniFanout!);
    expect(acc.shares[0].delegate.toBase58()).to.equal(delegate.toBase58());
  });

  describe("changing a delegate on a scheduled fanout", () => {
    const lamportsOf = async (address: PublicKey) =>
      Number((await ctx.banksClient.getAccount(address))!.lamports);

    /**
     * What tuktuk holds in a task, and so what a dequeue refunds: rent exemption for the task's
     * size, and the crank reward the task records.
     */
    const lamportsHeldBy = async (task: PublicKey) => {
      const data = (await readAccount(ctx, task))!;
      const { crankReward } = tuktukProgram.coder.accounts.decode("taskV0", data);
      return (
        (await provider.connection.getMinimumBalanceForRentExemption(
          data.length
        )) + Number(crankReward.toString())
      );
    };

    /** update_wallet_delegate_v0 on the next free task ids, with `payer` paying for the new task. */
    async function changeDelegate(
      miniFanout: PublicKey,
      wallet: Keypair,
      payer?: Keypair,
      remainingAccounts: AccountMeta[] = []
    ) {
      const { taskBitmap, capacity } =
        await tuktukProgram.account.taskQueueV0.fetch(taskQueue);
      const [newPreTaskId, newTaskId] = nextAvailableTaskIds(
        taskBitmap,
        2,
        true,
        capacity
      );
      const delegate = Keypair.generate().publicKey;
      await program.methods
        .updateWalletDelegateV0({ newTaskId, newPreTaskId, delegate, index: 0 })
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({ units: 1400000 }),
        ])
        .accounts({
          payer: payer?.publicKey ?? me,
          wallet: wallet.publicKey,
          miniFanout,
          newTask: taskKey(taskQueue, newTaskId)[0],
          newPreTask: taskKey(taskQueue, newPreTaskId)[0],
        })
        .remainingAccounts(remainingAccounts)
        .signers(payer ? [wallet, payer] : [wallet])
        .rpc();
      return { delegate, newTask: taskKey(taskQueue, newTaskId)[0] };
    }

    it("refunds the task's rent to the payer that queued it", async () => {
      const wallet = Keypair.generate();
      // `me` pays the transaction fees, so the payer's lamports move only by task rent.
      const payer = Keypair.generate();
      await send([
        SystemProgram.transfer({
          fromPubkey: me,
          toPubkey: payer.publicKey,
          lamports: 1_000_000_000,
        }),
      ]);
      const { miniFanout, task } = await scheduledFanout({
        seed: "delegate-refunds-payer",
        shares: [shareOf(wallet.publicKey, 100)],
        preTask: null,
        payer,
      });
      expect((await taskRentRefundOf(miniFanout)).toBase58()).to.equal(
        payer.publicKey.toBase58()
      );
      const taskLamports = await lamportsHeldBy(task);
      expect(await lamportsOf(task)).to.equal(taskLamports);
      const before = await lamportsOf(payer.publicKey);

      const { delegate, newTask } = await changeDelegate(
        miniFanout,
        wallet,
        payer
      );

      expect(await readAccount(ctx, task)).to.equal(null);
      const acc = await program.account.miniFanoutV0.fetch(miniFanout);
      expect(acc.shares[0].delegate.toBase58()).to.equal(delegate.toBase58());
      expect(acc.nextTask.toBase58()).to.equal(newTask.toBase58());
      // The payer got the old task's lamports back and funded the new task.
      const newTaskLamports = await lamportsOf(newTask);
      expect(newTaskLamports).to.equal(await lamportsHeldBy(newTask));
      expect(await lamportsOf(payer.publicKey)).to.equal(
        before + taskLamports - newTaskLamports
      );
    });

    it("refunds a task that a run returned to the payer of the task that ran", async () => {
      const wallet = Keypair.generate();
      await ataWith(wallet.publicKey, 0);
      // `me` pays the transaction fees, so the payer's lamports move only by task rent.
      const payer = Keypair.generate();
      await send([
        SystemProgram.transfer({
          fromPubkey: me,
          toPubkey: payer.publicKey,
          lamports: 1_000_000_000,
        }),
      ]);
      const { miniFanout, task } = await scheduledFanout({
        seed: "delegate-refunds-run-payer",
        shares: [shareOf(wallet.publicKey, 100)],
        preTask: null,
        payer,
      });
      const queued = await tuktukProgram.account.taskV0.fetch(task);
      await warpTo(ctx, BigInt(queued.trigger.timestamp![0].toString()));
      await crank(task);

      const { nextTask } = await program.account.miniFanoutV0.fetch(miniFanout);
      expect((await taskRentRefundOf(miniFanout)).toBase58()).to.equal(
        payer.publicKey.toBase58(),
        "the run should have returned a task that refunds to the payer of the task that ran"
      );
      const taskLamports = await lamportsHeldBy(nextTask);
      expect(await lamportsOf(nextTask)).to.equal(taskLamports);
      const before = await lamportsOf(payer.publicKey);
      const queueBefore = await lamportsOf(taskQueue);

      const { delegate, newTask } = await changeDelegate(
        miniFanout,
        wallet,
        payer
      );

      expect(await readAccount(ctx, nextTask)).to.equal(null);
      const acc = await program.account.miniFanoutV0.fetch(miniFanout);
      expect(acc.shares[0].delegate.toBase58()).to.equal(delegate.toBase58());
      expect(acc.nextTask.toBase58()).to.equal(newTask.toBase58());
      // The payer got the returned task's lamports back and funded the new task.
      const newTaskLamports = await lamportsOf(newTask);
      expect(newTaskLamports).to.equal(await lamportsHeldBy(newTask));
      expect(await lamportsOf(payer.publicKey)).to.equal(
        before + taskLamports - newTaskLamports
      );
      expect(await lamportsOf(taskQueue)).to.equal(queueBefore);
    });

    describe("with a task whose rent refund is no account of the instruction", () => {
      /** A scheduled fanout whose task another payer queued, so that payer is its rent refund. */
      async function fanoutOfAnotherPayer(seed: string) {
        const wallet = Keypair.generate();
        const payer = Keypair.generate();
        await send([
          SystemProgram.transfer({
            fromPubkey: me,
            toPubkey: payer.publicKey,
            lamports: 1_000_000_000,
          }),
        ]);
        const { miniFanout, task } = await scheduledFanout({
          seed,
          shares: [shareOf(wallet.publicKey, 100)],
          preTask: null,
          payer,
        });
        return {
          miniFanout,
          task,
          wallet,
          rentRefund: payer.publicKey,
          taskLamports: await lamportsHeldBy(task),
          before: await lamportsOf(payer.publicKey),
        };
      }

      it("refunds the task to a writable remaining account", async () => {
        const { miniFanout, task, wallet, rentRefund, taskLamports, before } =
          await fanoutOfAnotherPayer("delegate-remaining");

        await changeDelegate(miniFanout, wallet, undefined, [
          rentRefundMeta(rentRefund),
        ]);

        expect(await readAccount(ctx, task)).to.equal(null);
        expect(await lamportsOf(rentRefund)).to.equal(before + taskLamports);
      });

      it("refuses when the rent refund is not passed", async () => {
        const { miniFanout, task, wallet } = await fanoutOfAnotherPayer(
          "delegate-missing"
        );

        expect(
          await programErrorLogs(changeDelegate(miniFanout, wallet))
        ).to.match(RENT_REFUND_MISSING);
        expect(await readAccount(ctx, task)).to.not.equal(null);
      });

      it("refuses a rent refund passed as a read-only remaining account", async () => {
        const { miniFanout, task, wallet, rentRefund } =
          await fanoutOfAnotherPayer("delegate-read-only");

        expect(
          await programErrorLogs(
            changeDelegate(miniFanout, wallet, undefined, [
              rentRefundMeta(rentRefund, false),
            ])
          )
        ).to.match(RENT_REFUND_NOT_WRITABLE);
        expect(await readAccount(ctx, task)).to.not.equal(null);
      });
    });
  });

  describe("a task at the recorded address whose transaction does not name the fanout", () => {
    /**
     * A scheduled fanout with a memo task at the address it records. The transaction of that task
     * does not name the fanout.
     */
    async function fanoutWithMemoTask(seed: string, wallet: PublicKey) {
      const { miniFanout, task } = await scheduledFanout({
        seed,
        shares: [shareOf(wallet, 100)],
        preTask: null,
      });
      const own = await tuktukProgram.account.taskV0.fetch(task);
      // The task that schedule_task_v0 queued names the fanout.
      expect(
        own.transaction.compiledV0![0].accounts.map((a) => a.toBase58())
      ).to.include(miniFanout.toBase58());
      const taskQueueAuthority = taskQueueAuthorityKey(taskQueue, me)[0];
      await tuktukProgram.methods
        .dequeueTaskV0()
        .accounts({
          queueAuthority: me,
          rentRefund: own.rentRefund,
          taskQueueAuthority,
          taskQueue,
          task,
        })
        .rpc();
      const { transaction, remainingAccounts } = compileTransaction(
        [createMemoInstruction("memo", [])],
        []
      );
      await tuktukProgram.methods
        .queueTaskV0({
          id: own.id,
          trigger: { now: {} },
          transaction: { compiledV0: [transaction] },
          crankReward: null,
          freeTasks: 0,
          description: "memo",
        })
        .accounts({
          payer: me,
          queueAuthority: me,
          taskQueueAuthority,
          taskQueue,
          task,
        })
        .remainingAccounts(remainingAccounts)
        .rpc();
      const { nextTask } = await program.account.miniFanoutV0.fetch(miniFanout);
      expect(nextTask.toBase58()).to.equal(task.toBase58());
      return { miniFanout, task, queued: (await readAccount(ctx, task))! };
    }

    it("stays queued when a delegate changes", async () => {
      const wallet = Keypair.generate();
      const { miniFanout, task, queued } = await fanoutWithMemoTask(
        "memo-delegate",
        wallet.publicKey
      );
      const { taskBitmap, capacity } =
        await tuktukProgram.account.taskQueueV0.fetch(taskQueue);
      const [newPreTaskId, newTaskId] = nextAvailableTaskIds(
        taskBitmap,
        2,
        true,
        capacity
      );
      const newTask = taskKey(taskQueue, newTaskId)[0];

      await program.methods
        .updateWalletDelegateV0({
          newTaskId,
          newPreTaskId,
          delegate: Keypair.generate().publicKey,
          index: 0,
        })
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({ units: 1400000 }),
        ])
        .accounts({
          payer: me,
          wallet: wallet.publicKey,
          miniFanout,
          newTask,
          newPreTask: taskKey(taskQueue, newPreTaskId)[0],
        })
        .signers([wallet])
        .rpc();

      expect(await readAccount(ctx, task)).to.deep.equal(queued);
      const acc = await program.account.miniFanoutV0.fetch(miniFanout);
      expect(acc.nextTask.toBase58()).to.equal(newTask.toBase58());
    });

    it("stays queued when the fanout is updated", async () => {
      const { miniFanout, task, queued } = await fanoutWithMemoTask(
        "memo-update",
        Keypair.generate().publicKey
      );

      await rescheduleViaUpdate(miniFanout);

      expect(await readAccount(ctx, task)).to.deep.equal(queued);
      const acc = await program.account.miniFanoutV0.fetch(miniFanout);
      expect(acc.nextTask.toBase58()).to.not.equal(task.toBase58());
    });

    it("stays queued when the fanout is closed", async () => {
      const { miniFanout, task, queued } = await fanoutWithMemoTask(
        "memo-close",
        Keypair.generate().publicKey
      );

      await program.methods
        .closeMiniFanoutV0()
        .accounts({ miniFanout, taskRentRefund: me })
        .rpc();

      expect(await readAccount(ctx, task)).to.deep.equal(queued);
      expect(await readAccount(ctx, miniFanout)).to.equal(null);
    });
  });

  describe("a fanout with a pre task after one distribution", () => {
    /** A fanout that ran one distribution, and the two tasks that the run returned. */
    async function distributedFanout(seed: string) {
      const { miniFanout, task, preTask } = await scheduledFanout({
        seed,
        shares: [shareOf(Keypair.generate().publicKey, 100)],
      });
      const distribute = await reachDistribution(task, preTask);
      await distribute();
      const { nextTask, nextPreTask } =
        await program.account.miniFanoutV0.fetch(miniFanout);
      return { miniFanout, nextTask, nextPreTask };
    }

    it("dequeues both returned tasks when the fanout is updated", async () => {
      const { miniFanout, nextTask, nextPreTask } =
        await distributedFanout("distributed-update");

      await rescheduleViaUpdate(miniFanout);

      expect(await readAccount(ctx, nextTask)).to.equal(null);
      expect(await readAccount(ctx, nextPreTask)).to.equal(null);
    });

    it("dequeues both returned tasks when the fanout is closed", async () => {
      const { miniFanout, nextTask, nextPreTask } =
        await distributedFanout("distributed-close");

      await program.methods
        .closeMiniFanoutV0()
        .accounts({ miniFanout, taskRentRefund: me })
        .rpc();

      expect(await readAccount(ctx, nextTask)).to.equal(null);
      expect(await readAccount(ctx, nextPreTask)).to.equal(null);
      expect(await readAccount(ctx, miniFanout)).to.equal(null);
    });
  });

  describe("a task at the recorded pre task address", () => {
    const ORACLE_URL = "https://hnt-rewards.oracle.helium.io/v1/tuktuk/asset";
    const otherMemo = compileTransaction(
      [createMemoInstruction("memo", [])],
      []
    );
    // Each shape a pre task takes, beside a different transaction of the same shape.
    const shapes = [
      {
        shape: "remote",
        preTask: { remoteV0: { url: `${ORACLE_URL}/1`, signer: ORACLE_SIGNER } },
        other: { remoteV0: { url: `${ORACLE_URL}/2`, signer: ORACLE_SIGNER } },
        otherAccounts: [],
      },
      {
        shape: "compiled",
        preTask: { compiledV0: [memoPreTask] },
        other: { compiledV0: [otherMemo.transaction] },
        otherAccounts: otherMemo.remainingAccounts,
      },
    ];

    const transactionOf = async (task: PublicKey) =>
      JSON.stringify((await tuktukProgram.account.taskV0.fetch(task)).transaction);

    const storedPreTaskOf = async (miniFanout: PublicKey) =>
      JSON.stringify(
        (await program.account.miniFanoutV0.fetch(miniFanout)).preTask
      );

    /** A scheduled fanout that stores `preTask`, with its own pre task queued. */
    async function fanoutWithPreTask(seed: string, preTask: any) {
      const { miniFanout, preTask: task } = await scheduledFanout({
        seed,
        shares: [shareOf(Keypair.generate().publicKey, 100)],
        preTask,
      });
      // The queued pre task equals the pre task the fanout stores.
      expect(await transactionOf(task)).to.equal(
        await storedPreTaskOf(miniFanout)
      );
      return { miniFanout, task };
    }

    /**
     * The same fanout with a task at the recorded pre task address whose transaction differs from
     * the pre task the fanout stores.
     */
    async function fanoutWithDifferentPreTask(
      seed: string,
      { preTask, other, otherAccounts }: (typeof shapes)[number]
    ) {
      const { miniFanout, task } = await fanoutWithPreTask(seed, preTask);
      const own = await tuktukProgram.account.taskV0.fetch(task);
      const taskQueueAuthority = taskQueueAuthorityKey(taskQueue, me)[0];
      await tuktukProgram.methods
        .dequeueTaskV0()
        .accounts({
          queueAuthority: me,
          rentRefund: own.rentRefund,
          taskQueueAuthority,
          taskQueue,
          task,
        })
        .rpc();
      await tuktukProgram.methods
        .queueTaskV0({
          id: own.id,
          trigger: { now: {} },
          transaction: other as any,
          crankReward: null,
          freeTasks: 0,
          description: "memo",
        })
        .accounts({
          payer: me,
          queueAuthority: me,
          taskQueueAuthority,
          taskQueue,
          task,
        })
        .remainingAccounts(otherAccounts)
        .rpc();
      const { nextPreTask } = await program.account.miniFanoutV0.fetch(
        miniFanout
      );
      expect(nextPreTask.toBase58()).to.equal(task.toBase58());
      expect(await transactionOf(task)).to.not.equal(
        await storedPreTaskOf(miniFanout)
      );
      return { miniFanout, task, queued: (await readAccount(ctx, task))! };
    }

    const close = async (
      miniFanout: PublicKey,
      remainingAccounts: AccountMeta[] = []
    ) =>
      program.methods
        .closeMiniFanoutV0()
        .accounts({ miniFanout, taskRentRefund: me })
        .remainingAccounts(remainingAccounts)
        .rpc();

    describe("with a rent refund that is no account of the instruction", () => {
      const lamportsOf = async (address: PublicKey) =>
        Number((await ctx.banksClient.getAccount(address))!.lamports);

      /**
       * A scheduled fanout whose next task another payer queued. The next task refunds to that
       * payer.
       */
      async function fanoutWithNextTaskOfAnotherPayer(seed: string) {
        const payer = Keypair.generate();
        await send([
          SystemProgram.transfer({
            fromPubkey: me,
            toPubkey: payer.publicKey,
            lamports: 1000000000,
          }),
        ]);
        const { miniFanout, task } = await scheduledFanout({
          seed,
          shares: [shareOf(Keypair.generate().publicKey, 100)],
          preTask: null,
          payer,
        });
        return {
          miniFanout,
          task,
          rentRefund: payer.publicKey,
          refunded: await lamportsOf(payer.publicKey),
        };
      }

      /**
       * A scheduled fanout whose pre task another payer queued, with the transaction the fanout
       * stores. The next task refunds to the wallet and the pre task refunds to that payer.
       */
      async function fanoutWithPreTaskOfAnotherPayer(seed: string) {
        const payer = Keypair.generate();
        await send([
          SystemProgram.transfer({
            fromPubkey: me,
            toPubkey: payer.publicKey,
            lamports: 1000000000,
          }),
        ]);
        const { miniFanout, task } = await fanoutWithPreTask(seed, {
          compiledV0: [memoPreTask],
        });
        const own = await tuktukProgram.account.taskV0.fetch(task);
        const taskQueueAuthority = taskQueueAuthorityKey(taskQueue, me)[0];
        await tuktukProgram.methods
          .dequeueTaskV0()
          .accounts({
            queueAuthority: me,
            rentRefund: own.rentRefund,
            taskQueueAuthority,
            taskQueue,
            task,
          })
          .rpc();
        await tuktukProgram.methods
          .queueTaskV0({
            id: own.id,
            trigger: own.trigger,
            transaction: own.transaction,
            crankReward: null,
            freeTasks: 0,
            description: own.description,
          })
          .accounts({
            payer: payer.publicKey,
            queueAuthority: me,
            taskQueueAuthority,
            taskQueue,
            task,
          })
          .signers([payer])
          .rpc();
        expect(await transactionOf(task)).to.equal(
          await storedPreTaskOf(miniFanout)
        );
        const { rentRefund } = await tuktukProgram.account.taskV0.fetch(task);
        expect(rentRefund.toBase58()).to.equal(payer.publicKey.toBase58());
        expect((await taskRentRefundOf(miniFanout)).toBase58()).to.equal(
          me.toBase58()
        );
        return {
          miniFanout,
          task,
          rentRefund: payer.publicKey,
          refunded: await lamportsOf(payer.publicKey),
        };
      }

      const tasks = [
        { name: "next task", seed: "next", fanout: fanoutWithNextTaskOfAnotherPayer },
        { name: "pre task", seed: "pre", fanout: fanoutWithPreTaskOfAnotherPayer },
      ];
      const instructions = [
        { name: "updated", seed: "update", run: rescheduleViaUpdate },
        { name: "closed", seed: "close", run: close },
      ];

      for (const { name: taskName, seed: taskSeed, fanout } of tasks) {
        for (const { name, seed, run } of instructions) {
          it(`refunds the ${taskName} to a writable remaining account when the fanout is ${name}`, async () => {
            const { miniFanout, task, rentRefund, refunded } = await fanout(
              `${taskSeed}-${seed}-remaining`
            );

            await run(miniFanout, [rentRefundMeta(rentRefund)]);

            expect(await readAccount(ctx, task)).to.equal(null);
            expect(await lamportsOf(rentRefund)).to.be.greaterThan(refunded);
          });

          it(`refuses when the rent refund of the ${taskName} is not passed and the fanout is ${name}`, async () => {
            const { miniFanout, task } = await fanout(
              `${taskSeed}-${seed}-missing`
            );

            expect(await programErrorLogs(run(miniFanout))).to.match(
              RENT_REFUND_MISSING
            );
            expect(await readAccount(ctx, task)).to.not.equal(null);
          });

          it(`refuses a read-only rent refund of the ${taskName} when the fanout is ${name}`, async () => {
            const { miniFanout, task, rentRefund } = await fanout(
              `${taskSeed}-${seed}-read-only`
            );

            expect(
              await programErrorLogs(
                run(miniFanout, [rentRefundMeta(rentRefund, false)])
              )
            ).to.match(RENT_REFUND_NOT_WRITABLE);
            expect(await readAccount(ctx, task)).to.not.equal(null);
          });
        }
      }
    });

    for (const each of shapes) {
      const { shape, preTask } = each;

      describe(`on a fanout with a ${shape} pre task`, () => {
        it("dequeues the pre task it stores when the fanout is updated", async () => {
          const { miniFanout, task } = await fanoutWithPreTask(
            `${shape}-own-update`,
            preTask
          );

          await rescheduleViaUpdate(miniFanout);

          expect(await readAccount(ctx, task)).to.equal(null);
        });

        it("dequeues the pre task it stores when the fanout is closed", async () => {
          const { miniFanout, task } = await fanoutWithPreTask(
            `${shape}-own-close`,
            preTask
          );

          await close(miniFanout);

          expect(await readAccount(ctx, task)).to.equal(null);
          expect(await readAccount(ctx, miniFanout)).to.equal(null);
        });

        it("leaves a task with a different transaction queued when the fanout is updated", async () => {
          const { miniFanout, task, queued } = await fanoutWithDifferentPreTask(
            `${shape}-other-update`,
            each
          );

          await rescheduleViaUpdate(miniFanout);

          expect(await readAccount(ctx, task)).to.deep.equal(queued);
          // The fanout queued a new pre task at another id.
          const acc = await program.account.miniFanoutV0.fetch(miniFanout);
          expect(acc.nextPreTask.toBase58()).to.not.equal(task.toBase58());
          expect(await transactionOf(acc.nextPreTask)).to.equal(
            await storedPreTaskOf(miniFanout)
          );
        });

        it("leaves a task with a different transaction queued when the fanout is closed", async () => {
          const { miniFanout, task, queued } = await fanoutWithDifferentPreTask(
            `${shape}-other-close`,
            each
          );

          await close(miniFanout);

          expect(await readAccount(ctx, task)).to.deep.equal(queued);
          expect(await readAccount(ctx, miniFanout)).to.equal(null);
        });
      });
    }
  });

  it("leaves a task larger than the decode limit queued when the fanout is updated", async () => {
    const { miniFanout, task, preTask } = await scheduledFanout({
      seed: "large-update",
      shares: Array.from({ length: 5 }, () =>
        shareOf(Keypair.generate().publicKey, 100)
      ),
    });
    // A compiled transaction with 90 account keys, no instructions and no signer seeds. It is
    // written onto the task directly.
    const largeTransaction = Buffer.concat([
      Buffer.from([0, 0, 0, 0, 90, 0, 0, 0]),
      Buffer.alloc(32 * 90, 7),
      Buffer.alloc(8),
    ]);
    const queued: Buffer[] = [];
    for (const address of [task, preTask]) {
      const own = (await readAccount(ctx, address))!;
      const transaction = tuktukProgram.coder.types.encode(
        "transactionSourceV0",
        tuktukProgram.coder.accounts.decode("taskV0", own).transaction
      );
      const at = own.indexOf(transaction);
      expect(at).to.be.greaterThan(-1);
      const large = Buffer.concat([
        own.subarray(0, at),
        largeTransaction,
        own.subarray(at + transaction.length),
      ]);
      expect(large.length).to.be.greaterThan(2048);
      await overwriteAccountData(ctx, address, large);
      queued.push(large);
    }

    await rescheduleViaUpdate(miniFanout);

    expect(await readAccount(ctx, task)).to.deep.equal(queued[0]);
    expect(await readAccount(ctx, preTask)).to.deep.equal(queued[1]);
    const acc = await program.account.miniFanoutV0.fetch(miniFanout);
    expect(acc.nextTask.toBase58()).to.not.equal(task.toBase58());
    expect(acc.nextPreTask.toBase58()).to.not.equal(preTask.toBase58());
  });

  it("rewrites an account the programs would not produce", async () => {
    // The capability the localnet suites lack, checked directly: a guard that only fires on
    // data a program refuses to write is unreachable without it.
    const original = await readAccount(ctx, taskQueue);
    expect(original).to.not.be.null;

    const scrambled = Buffer.from(original!);
    scrambled[scrambled.length - 1] ^= 0xff;
    await overwriteAccountData(ctx, taskQueue, scrambled);

    const readBack = await readAccount(ctx, taskQueue);
    expect(readBack!.equals(scrambled)).to.be.true;
    expect(readBack!.equals(original!)).to.be.false;

    // Owner and executable survive the rewrite, or later instructions fail for the wrong reason.
    const account = await ctx.banksClient.getAccount(taskQueue);
    expect(new PublicKey(account!.owner).toBase58()).to.equal(
      TUKTUK.toBase58()
    );

    await overwriteAccountData(ctx, taskQueue, original!);
    expect((await readAccount(ctx, taskQueue))!.equals(original!)).to.be.true;
  });
});
