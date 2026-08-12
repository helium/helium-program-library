import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
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
  AccountLayout,
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMint2Instruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
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

const MINI_FANOUT = new PublicKey("mfanLprNnaiP4RX9Zz1BMcDosYHCqnG24H1fMEbi9Gn");
const TUKTUK = new PublicKey("tuktukUrfhXT6ZT77QTU8RQtvgL967uRuVagWF57zVA");
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
    const lamports = await provider.connection.getMinimumBalanceForRentExemption(
      MINT_SIZE
    );
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
  async function ataWith(owner: PublicKey, amount: number, allowOwnerOffCurve = false) {
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
    const { nextTaskQueueId } = await tuktukProgram.account.tuktukConfigV0.fetch(
      TUKTUK_CONFIG
    );
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
   * A fanout with its distribution scheduled: the same state the localnet suite reaches by
   * waiting for a cron string two seconds out, minus the wait and the race.
   */
  async function scheduledFanout({
    seed,
    shares,
    funding = FANOUT_AMOUNT,
    preTask = { compiledV0: [memoPreTask as any] } as any,
  }: {
    seed: string;
    shares: any[];
    funding?: number;
    preTask?: any;
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

    const { taskBitmap } = await tuktukProgram.account.taskQueueV0.fetch(taskQueue);
    const [preTaskId, taskId] = nextAvailableTaskIds(taskBitmap, 2, false);
    await program.methods
      .scheduleTaskV0({ taskId, preTaskId })
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({ units: 1400000 }),
      ])
      .accounts({
        payer: me,
        miniFanout: miniFanout!,
        task: taskKey(taskQueue, taskId)[0],
        preTask: taskKey(taskQueue, preTaskId)[0],
      })
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
        { wallet: wallet3.publicKey, share: { fixed: { amount: new anchor.BN(100000000) } } },
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
    expect(await tuktukProgram.account.taskV0.fetch(acc.nextTask)).to.not.be.null;
    const nextPreTask = await tuktukProgram.account.taskV0.fetch(acc.nextPreTask);
    expect(nextPreTask.freeTasks).to.equal(0);
    expect(nextPreTask.transaction.compiledV0![0].instructions.length).to.equal(1);
    expect(nextPreTask.transaction.compiledV0![0].signerSeeds).to.deep.equal([]);
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
    expect(new PublicKey(account!.owner).toBase58()).to.equal(TUKTUK.toBase58());

    await overwriteAccountData(ctx, taskQueue, original!);
    expect((await readAccount(ctx, taskQueue))!.equals(original!)).to.be.true;
  });
});
