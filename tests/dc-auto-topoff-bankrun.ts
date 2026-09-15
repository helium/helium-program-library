import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Tuktuk } from "@helium/tuktuk-idls/lib/types/tuktuk";
import {
  compileTransaction,
  customSignerKey,
  init as initTuktuk,
  nextAvailableTaskIds,
  runTask,
  taskKey,
  taskQueueAuthorityKey,
  taskQueueKey,
  taskQueueNameMappingKey,
  tuktukConfigKey,
} from "@helium/tuktuk-sdk";
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
import { autoTopOffKey, queueAuthorityKey } from "../packages/dc-auto-top-sdk/src";
import { dcaKey } from "../packages/tuktuk-dca-sdk/src/pdas";
import { DcAutoTop } from "../target/types/dc_auto_top";
import {
  ensureCloned,
  ensureDumped,
  overwriteAccountData,
  readAccount,
  startBankrun,
  warpTo,
} from "./utils/bankrun";
import { DCA_TEST_SIGNER, DCA_TEST_URL } from "./utils/dca-test-server";
import { expectAnchorError } from "./utils/expectAnchorError";

const DC_AUTO_TOP = new PublicKey(
  "topqqzQZroCyRrgyM5zVq6xkFDVnfF13iixSjajydgU"
);
const TUKTUK = new PublicKey("tuktukUrfhXT6ZT77QTU8RQtvgL967uRuVagWF57zVA");
const TUKTUK_DCA = new PublicKey(
  "tdcam4m5U74pEZQrsQ7fVAav4AUXXc6z8fkhvExfRVN"
);
const TUKTUK_CONFIG = tuktukConfigKey()[0];
const TUKTUK_IDL = new PublicKey(
  "GkUxZMcw2RbwZ64VL3MvBtYNV8zim3y7UfzabFTybAUJ"
);
// The pro-receiver feeds dc-auto-top accepts. Cloned rather than faked so the staleness and
// verification-level constraints see the real shape.
const HNT_PRICE_FEED = new PublicKey(
  "He5mhwVQQNvjFxqjEjFDb7enJWFwFJ7Rq7zknqBz89A5"
);
const USDC_PRICE_FEED = new PublicKey(
  "6HAuqASbHEh4w4REJEUUUCginTLfj1kwCh215ZLtMkrT"
);
const DATA_CREDITS_PROGRAM = new PublicKey(
  "credMBJhYFzfn7NxBMdU4aUqFggAjgztaCcv2Fo6fPT"
);
const CIRCUIT_BREAKER_PROGRAM = new PublicKey(
  "circAbx64bbsscPbQzZAUvuXpHqrCe6fLMzc2uKXz9g"
);
// The DC leg parses the dao, the delegated data credits and its escrow, and each has_one ties
// the next to the one before. Cloned as a set so they agree, the way they do on chain.
const DAO = new PublicKey("BQ3MCuTT5zVBhNfQ4SjMh3NPVhFy73MPV8rjfq5d1zie");
const DELEGATED_DATA_CREDITS = new PublicKey(
  "6KCixqdRqQ1c85y6HK1f2q5EmxyiZnfM1fnG6xRHgLg8"
);
const ESCROW_ACCOUNT = new PublicKey(
  "38ZMM7WVJdUx4FxUyezuCrtLmhDv5bwDcMzJESVMSRoT"
);
const DC_MINT = new PublicKey("dcuc8Amr83Wz27ZkQ2K9NS6r8zRpf1J6cvArEBDZDmm");
const MAINNET_HNT_MINT = new PublicKey(
  "hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux"
);
const DATA_CREDITS = new PublicKey(
  "D1LbvrJQ9K2WbGPMbM3Fnrf5PSsDH1TDpjqJdHuvs81n"
);
const SUB_DAO = new PublicKey("Gm9xDCJawDEKDrrQW6haw94gABaYzQwCq4ZQU8h8bd22");
const CIRCUIT_BREAKER = new PublicKey(
  "sZgXQVqAv9atfSuwNJnHgSf4tqsos6kRajANmBaBmSx"
);

/** A fixed-width byte array field, as the IDL declares it. */
const padded = (text: string, width: number) => {
  const buf = Buffer.alloc(width);
  Buffer.from(text).copy(buf);
  return [...buf];
};

describe("dc-auto-topoff under bankrun", () => {
  let ctx: ProgramTestContext;
  let provider: BankrunProvider;
  let program: Program<DcAutoTop>;
  let tuktukProgram: Program<Tuktuk>;
  let me: PublicKey;
  let taskQueue: PublicKey;
  let hntMint: PublicKey;
  let dcaMint: PublicKey;
  // A second authority on the same queue, standing in for the other programs that hold one on
  // the production queue. What it queues is its own: it picks the id, and so the address, and it
  // picks the transaction the task carries.
  let otherAuthority: Keypair;

  const queueAuthority = queueAuthorityKey()[0];

  const lamportsOf = async (address: PublicKey) =>
    Number((await ctx.banksClient.getAccount(address))!.lamports);

  const send = (instructions: anchor.web3.TransactionInstruction[]) =>
    provider.sendAndConfirm(new Transaction().add(...instructions));

  // spl-utils' createMint/createAtaAndMint are the obvious reuse here and do not work under
  // bankrun: their existence check calls connection.getAccountInfo, which BankrunConnectionProxy
  // throws from rather than returning null for a missing account. The idempotent instruction
  // needs no such check, which is why mini-fanout-bankrun.ts builds these locally too.
  async function createMint(decimals: number): Promise<PublicKey> {
    const kp = Keypair.generate();
    const lamports =
      await provider.connection.getMinimumBalanceForRentExemption(MINT_SIZE);
    await provider.sendAndConfirm(
      new Transaction().add(
        SystemProgram.createAccount({
          fromPubkey: me,
          newAccountPubkey: kp.publicKey,
          space: MINT_SIZE,
          lamports,
          programId: TOKEN_PROGRAM_ID,
        }),
        createInitializeMint2Instruction(kp.publicKey, decimals, me, me)
      ),
      [kp]
    );
    return kp.publicKey;
  }

  async function ataWith(mint: PublicKey, owner: PublicKey, amount: bigint) {
    const ata = getAssociatedTokenAddressSync(mint, owner, true);
    const instructions = [
      createAssociatedTokenAccountIdempotentInstruction(me, ata, owner, mint),
    ];
    if (amount > 0n) {
      instructions.push(createMintToInstruction(mint, ata, me, amount));
    }
    await send(instructions);
    return ata;
  }

  before(async () => {
    ensureDumped("tuktuk", TUKTUK);
    ensureDumped("data_credits", DATA_CREDITS_PROGRAM);
    ensureDumped("circuit_breaker", CIRCUIT_BREAKER_PROGRAM);
    ctx = await startBankrun(
      [
        { name: "dc_auto_top", programId: DC_AUTO_TOP },
        { name: "tuktuk", programId: TUKTUK },
        { name: "tuktuk_dca", programId: TUKTUK_DCA },
        { name: "data_credits", programId: DATA_CREDITS_PROGRAM },
        { name: "circuit_breaker", programId: CIRCUIT_BREAKER_PROGRAM },
      ],
      [
        ensureCloned("tuktuk_config", TUKTUK_CONFIG),
        ensureCloned("tuktuk_idl", TUKTUK_IDL),
        ensureCloned("hnt_price_feed", HNT_PRICE_FEED),
        ensureCloned("usdc_price_feed", USDC_PRICE_FEED),
        ensureCloned("dao", DAO),
        ensureCloned("delegated_data_credits", DELEGATED_DATA_CREDITS),
        ensureCloned("dc_escrow", ESCROW_ACCOUNT),
      ]
    );
    provider = new BankrunProvider(ctx);
    program = new Program<DcAutoTop>(
      require("../target/idl/dc_auto_top.json"),
      provider
    );
    tuktukProgram = await initTuktuk(provider);
    me = provider.wallet.publicKey;

    hntMint = await createMint(8);
    dcaMint = await createMint(6);

    const name = "bankrun-dcauto";
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

    otherAuthority = Keypair.generate();
    await tuktukProgram.methods
      .addQueueAuthorityV0()
      .accounts({
        payer: me,
        queueAuthority: otherAuthority.publicKey,
        taskQueue,
      })
      .rpc();
  });

  /** Asserts the run failed, and failed for the named reason rather than any other. */
  async function expectError(name: string, run: Promise<unknown>) {
    let failure: string | null = null;
    try {
      await run;
    } catch (e: any) {
      failure = [e.message, e.toString(), ...(e.logs ?? [])].join("\n");
    }
    expect(failure, `expected ${name}, but the run succeeded`).to.not.equal(
      null
    );
    expect(failure, `expected ${name}, got: ${failure}`).to.contain(name);
  }

  /**
   * An AutoTopOffV0 written straight to the ledger, holding `spendableLamports` above its own
   * rent exemption. HNT sits below hnt_threshold so the run wants a DCA.
   */
  async function autoTopOffWith(
    spendableLamports: number,
    swapPayerLamports = 0,
    dcaMintFunding = 1_000_000_000n,
    overrides: Record<string, unknown> & {
      dcaUrl?: string;
      dcaSigner?: PublicKey;
    } = {}
  ) {
    // The url is stored padded and the signer as a key, so both are applied by hand below
    // rather than spread with the other field overrides.
    const { dcaUrl, dcaSigner, ...fieldOverrides } = overrides;
    // Set rather than transfer, and set it every time: the payer is one PDA shared by every
    // scenario, and rent_needed is measured against its balance, so a leftover balance from
    // an earlier test silently turns the shortfall case into the funded one.
    const [swapPayer] = customSignerKey(taskQueue, [
      Buffer.from("dca_swap_payer"),
    ]);
    ctx.setAccount(swapPayer, {
      lamports: swapPayerLamports,
      data: Buffer.alloc(0),
      owner: SystemProgram.programId,
      executable: false,
    });
    // Seeds the top off, so it cannot come from `overrides` after the fact.
    const delegatedDataCredits =
      (overrides.delegatedDataCredits as PublicKey) ??
      Keypair.generate().publicKey;
    const [autoTopOff, bump] = autoTopOffKey(delegatedDataCredits, me);
    const hntAccount = await ataWith(hntMint, autoTopOff, 10_00000000n);
    const dcaMintAccount = await ataWith(dcaMint, autoTopOff, dcaMintFunding);

    // Encoded by the program's own coder rather than by hand: AutoTopOffV0 is self-padded,
    // so borsh and its repr(C) layout agree, and a second copy of the layout here would be
    // one `state.rs` does not pin.
    const data = await program.coder.accounts.encode("autoTopOffV0", {
      authority: me,
      dataCredits: PublicKey.default,
      taskQueue,
      subDao: PublicKey.default,
      // next_task/next_hnt_task pointing at the account itself is the "nothing scheduled"
      // sentinel schedule_task_v0 requires.
      nextTask: autoTopOff,
      nextHntTask: autoTopOff,
      delegatedDataCredits,
      dcMint: PublicKey.default,
      hntMint,
      dao: PublicKey.default,
      hntPriceOracle: HNT_PRICE_FEED,
      hntAccount,
      dcAccount: PublicKey.default,
      escrowAccount: PublicKey.default,
      circuitBreaker: PublicKey.default,
      bump,
      queueAuthorityBump: queueAuthorityKey()[1],
      dcaIndex: 0,
      reserved: [0, 0, 0, 0],
      threshold: new anchor.BN(0),
      schedule: padded("0 0 16 * * *", 128),
      dcaUrl: padded(dcaUrl ?? DCA_TEST_URL, 128),
      dcaSigner: dcaSigner ?? DCA_TEST_SIGNER.publicKey,
      // 30 HNT wanted against 10 held, bought 250 units at a time.
      hntThreshold: new anchor.BN(30_00000000),
      dcaMint,
      dcaMintAccount,
      dcaSwapAmount: new anchor.BN(250_000000),
      dcaIntervalSeconds: new anchor.BN(300),
      dcaInputPriceOracle: USDC_PRICE_FEED,
      dca: PublicKey.default,
      // Nothing is scheduled yet; schedule_task_v0 below records both times.
      nextTaskTime: new anchor.BN(0),
      nextHntTaskTime: new anchor.BN(0),
      ...fieldOverrides,
    });

    const rentExempt =
      await provider.connection.getMinimumBalanceForRentExemption(data.length);
    ctx.setAccount(autoTopOff, {
      lamports: rentExempt + spendableLamports,
      data,
      owner: DC_AUTO_TOP,
      executable: false,
    });

    const { taskBitmap, capacity } =
      await tuktukProgram.account.taskQueueV0.fetch(taskQueue);
    const [taskId, hntTaskId] = nextAvailableTaskIds(
      taskBitmap,
      2,
      false,
      capacity
    );
    await program.methods
      .scheduleTaskV0({ taskId, hntTaskId })
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({ units: 1400000 }),
      ])
      .accounts({
        payer: me,
        autoTopOff,
        task: taskKey(taskQueue, taskId)[0],
        hntTask: taskKey(taskQueue, hntTaskId)[0],
      })
      .rpc();

    return {
      autoTopOff,
      taskId,
      hntTaskId,
      hntTask: taskKey(taskQueue, hntTaskId)[0],
    };
  }

  /**
   * Frees both task addresses the top off recorded, leaving `next_task` / `next_hnt_task`
   * naming addresses no task occupies.
   */
  async function dequeueBothLegs(autoTopOff: PublicKey) {
    const state = await program.account.autoTopOffV0.fetch(autoTopOff);
    // dequeue_task_v0 refunds to the task's own rent_refund, which is the payer for a task
    // queue_task_v0 created and the queue itself for one a run returned. A leg that was already
    // dequeued has no task to read, and update_auto_top_off_v0 skips it, so any address does.
    // Read through banksClient: anchor's fetchNullable goes through BankrunConnectionProxy,
    // which throws on a missing account rather than returning null.
    const refundFor = async (task: PublicKey) => {
      const data = await readAccount(ctx, task);
      return data && data.length > 0
        ? (tuktukProgram.coder.accounts.decode("taskV0", data)
            .rentRefund as PublicKey)
        : me;
    };
    await program.methods
      .updateAutoTopOffV0({
        schedule: null,
        threshold: null,
        hntThreshold: null,
        dcaSwapAmount: null,
        dcaIntervalSeconds: null,
        dcaInputPriceOracle: null,
      })
      .accounts({
        authority: me,
        payer: me,
        autoTopOff,
        taskQueue,
        nextTask: state.nextTask,
        nextHntTask: state.nextHntTask,
        taskRentRefund: await refundFor(state.nextTask),
        hntTaskRentRefund: await refundFor(state.nextHntTask),
        // The mint is not being changed, so the leg keeps the one it has.
        dcaMint: null,
        dcaMintAccount: null,
        currentDcaMintAccount: null,
      })
      .rpc();
  }

  /**
   * Frees both task addresses and puts them back in the fields, leaving the top off naming
   * addresses no task occupies. That is the state a run leaves behind: it records the free
   * task it was handed, and the slot is reusable the moment that task is gone.
   */
  async function freeRecordedLegs(autoTopOff: PublicKey) {
    const { nextTask, nextHntTask } =
      await program.account.autoTopOffV0.fetch(autoTopOff);
    await dequeueBothLegs(autoTopOff);
    const state = await program.account.autoTopOffV0.fetch(autoTopOff);
    await overwriteAccountData(
      ctx,
      autoTopOff,
      await program.coder.accounts.encode("autoTopOffV0", {
        ...state,
        nextTask,
        nextHntTask,
      }),
    );
  }

  /**
   * Puts a task of the other authority's own making at `taskId`, carrying a top_off_hnt_v0 call
   * whose accounts this caller chose.
   */
  async function queueTopOffAt({
    autoTopOff,
    taskId,
    destination,
    swapPayerSeed = "dca_swap_payer",
    extraAccount,
  }: {
    autoTopOff: PublicKey;
    taskId: number;
    destination?: PublicKey;
    swapPayerSeed?: string;
    extraAccount?: PublicKey;
  }) {
    const seed = Buffer.from(swapPayerSeed);
    const [swapPayer, bump] = customSignerKey(taskQueue, [seed]);
    const state = await program.account.autoTopOffV0.fetch(autoTopOff);
    const dca = dcaKey(autoTopOff, dcaMint, hntMint, state.dcaIndex)[0];
    const instruction = await program.methods
      .topOffHntV0()
      .accounts({
        autoTopOff,
        taskQueue,
        hntAccount: state.hntAccount,
        hntMint,
        dcaMint,
        dcaMintAccount: state.dcaMintAccount,
        dcaInputPriceOracle: USDC_PRICE_FEED,
        hntPriceOracle: HNT_PRICE_FEED,
        dca,
        dcaInputAccount: getAssociatedTokenAddressSync(dcaMint, dca, true),
        dcaDestinationTokenAccount: destination ?? state.hntAccount,
        dcaCustomSigner: swapPayer,
      })
      .remainingAccounts(
        extraAccount
          ? [{ pubkey: extraAccount, isSigner: false, isWritable: false }]
          : []
      )
      .instruction();
    // compileTransaction leaves the account list out of the transaction; queue_task_v0 folds the
    // remaining accounts into it, which is what keeps the queued task inside a transaction size.
    const { transaction, remainingAccounts } = compileTransaction(
      [instruction],
      [[seed, Buffer.from([bump])]]
    );
    await tuktukProgram.methods
      .queueTaskV0({
        id: taskId,
        trigger: { now: {} },
        transaction: { compiledV0: [transaction] },
        crankReward: null,
        freeTasks: 2,
        description: "second hnt topoff",
      })
      .accounts({
        payer: me,
        queueAuthority: otherAuthority.publicKey,
        taskQueueAuthority: taskQueueAuthorityKey(
          taskQueue,
          otherAuthority.publicKey
        )[0],
        taskQueue,
        task: taskKey(taskQueue, taskId)[0],
      })
      .remainingAccounts(
        remainingAccounts.map((account) => ({
          ...account,
          isSigner: false,
          isWritable: false,
        }))
      )
      .signers([otherAuthority])
      .rpc();
    return taskKey(taskQueue, taskId)[0];
  }

  // Every transaction in one bankrun context carries the same blockhash, so two cranks of the
  // same task address would sign identically and the second would be refused as already
  // processed. Counting the limit down keeps each one its own transaction, well above the
  // ~250k any run consumes.
  let crankBudget = 1400000;
  const crank = async (task: PublicKey) =>
    send([
      ComputeBudgetProgram.setComputeUnitLimit({ units: crankBudget-- }),
      ...(await runTask({ program: tuktukProgram, task, crankTurner: me })),
    ]);

  const tokenBalance = async (account: PublicKey) =>
    AccountLayout.decode((await readAccount(ctx, account))!).amount;

  /** The DCA the HNT leg opened at `index`, decoded through tuktuk-dca's own IDL. */
  const dcaAt = async (autoTopOff: PublicKey, index: number) => {
    const dcaProgram = new anchor.Program(
      require("../target/idl/tuktuk_dca.json"),
      provider,
    );
    return dcaProgram.account.dcaV0.fetch(
      dcaKey(autoTopOff, dcaMint, hntMint, index)[0],
    ) as Promise<{ initialNumOrders: number; numOrders: number }>;
  };

  /**
   * The HNT one order buys, from the two feeds the leg reads and at the leg's own decimals.
   * Derived rather than assumed so a fixture can name a gap in whole orders.
   */
  async function hntPerOrder(swapAmount: anchor.BN): Promise<anchor.BN> {
    const { PythSolanaReceiver } =
      await import("@pythnetwork/pyth-solana-receiver");
    const receiver = new PythSolanaReceiver({
      connection: provider.connection,
      wallet: provider.wallet as anchor.Wallet,
    }).receiver;
    const decode = async (feed: PublicKey) =>
      receiver.coder.accounts.decode(
        "priceUpdateV2",
        (await readAccount(ctx, feed))!,
      ).priceMessage;
    const input = await decode(USDC_PRICE_FEED);
    const output = await decode(HNT_PRICE_FEED);
    const expoDiff = input.exponent - output.exponent;
    const scale = new anchor.BN(10).pow(new anchor.BN(Math.abs(expoDiff)));
    const product = swapAmount.mul(input.price);
    let perOrder: anchor.BN;
    if (expoDiff > 0) {
      perOrder = product.mul(scale).div(output.price);
    } else if (expoDiff < 0) {
      perOrder = product.div(output.price).div(scale);
    } else {
      perOrder = product.div(output.price);
    }
    // The DCA mint has 6 decimals against HNT's 8.
    return perOrder.muln(100);
  }

  // The control for the test below. Identical fixture but funded, so it establishes that
  // everything other than the rent shortfall is satisfied -- without it, "no DCA was created"
  // would pass just as well for a fixture that never reached the DCA at all.
  it("creates the DCA when it can fund the rent", async () => {
    // The swap payer must hold its own rent exemption on top of what the DCA consumes:
    // dc-auto-top sizes the DCA by dca_url.len() that tuktuk-dca does not allocate, so the
    // payer keeps that difference and a 0-data account below 890,880 lamports fails the
    // runtime's rent check. Production keeps it funded; the fixture has to as well.
    const { autoTopOff, hntTask } = await autoTopOffWith(50_000_000, 1_000_000_000);

    const task = await tuktukProgram.account.taskV0.fetch(hntTask);
    await warpTo(ctx, BigInt(task.trigger.timestamp![0].toString()) + 1n);
    const before = await program.account.autoTopOffV0.fetch(autoTopOff);
    await crank(hntTask);

    const after = await program.account.autoTopOffV0.fetch(autoTopOff);
    expect(
      after.nextHntTaskTime.toNumber(),
      "the leg should now be due at the slot after the one it just ran"
    ).to.be.greaterThan(before.nextHntTaskTime.toNumber());
    expect(after.dcaIndex).to.equal(1, "the slot should advance once per DCA");
    expect(after.dca.toBase58()).to.equal(
      dcaKey(autoTopOff, dcaMint, hntMint, 0)[0].toBase58(),
      "dca should name the DCA just created, not a slot that has since closed"
    );
    expect(
      await readAccount(ctx, dcaKey(autoTopOff, dcaMint, hntMint, 0)[0]),
      "the DCA should have been created in slot 0"
    ).to.not.equal(null);
  });

  it("skips the DCA rather than reverting when the USDC is short", async () => {
    // initialize_dca_nested_v0 moves the whole run's USDC up front, so a short balance fails
    // the transfer, fails the CPI, and reverts the run -- which never reschedules. The DCA is
    // sized against a 20 HNT gap, so a single unit of dca_mint cannot cover any of it.
    const { autoTopOff, hntTask } = await autoTopOffWith(50_000_000, 1_000_000_000, 1n);

    const task = await tuktukProgram.account.taskV0.fetch(hntTask);
    await warpTo(ctx, BigInt(task.trigger.timestamp![0].toString()) + 1n);
    const before = await lamportsOf(autoTopOff);
    await crank(hntTask);

    // The reward was debited for two tasks because a DCA was wanted; one task was returned,
    // so exactly one min_crank_reward (1 in this queue) should have left the account.
    expect(await lamportsOf(autoTopOff)).to.equal(
      before - 1,
      "the unused task's crank reward should have been returned"
    );

    const after = await program.account.autoTopOffV0.fetch(autoTopOff);
    expect(after.nextHntTask.toBase58()).to.not.equal(
      autoTopOff.toBase58(),
      "leg should have rescheduled itself rather than stopping"
    );
    expect(after.dcaIndex).to.equal(
      0,
      "no DCA was created, so the slot should not advance"
    );
    expect(
      await readAccount(ctx, dcaKey(autoTopOff, dcaMint, hntMint, 0)[0]),
      "no DCA account should exist"
    ).to.equal(null);
  });

  // A stored dca_signer or dca_url that does not name the pinned DCA service fails the CPI
  // into tuktuk-dca, which reverts the run.
  async function expectDcaRejected(
    pin: { dcaUrl?: string; dcaSigner?: PublicKey },
    errorName: string
  ) {
    const { hntTask } = await autoTopOffWith(
      50_000_000,
      1_000_000_000,
      1_000_000_000n,
      pin
    );
    const task = await tuktukProgram.account.taskV0.fetch(hntTask);
    await warpTo(ctx, BigInt(task.trigger.timestamp![0].toString()) + 1n);
    await expectAnchorError(crank(hntTask), errorName);
  }

  it("refuses a DCA whose signer is not the pinned one", async () => {
    await expectDcaRejected(
      { dcaSigner: Keypair.generate().publicKey },
      "InvalidDcaSigner"
    );
  });

  it("refuses a DCA whose url only shares the pinned prefix", async () => {
    await expectDcaRejected(
      { dcaUrl: `${DCA_TEST_URL}.other.example` },
      "InvalidDcaUrl"
    );
  });

  it("skips the DCA rather than debiting past rent exemption", async () => {
    // A DCA refunds its rent when it drains and closes, so this only bites once one has been
    // abandoned and the replacement has to find rent again. Debiting anyway fails the run,
    // and a failed run never reschedules, so the leg would stop for want of ~0.008 SOL.
    // 1000 lamports covers the crank reward (2) and nothing near the DCA's rent.
    const { autoTopOff, hntTask } = await autoTopOffWith(1000);

    const task = await tuktukProgram.account.taskV0.fetch(hntTask);
    await warpTo(ctx, BigInt(task.trigger.timestamp![0].toString()) + 1n);
    await crank(hntTask);

    const after = await program.account.autoTopOffV0.fetch(autoTopOff);
    expect(after.nextHntTask.toBase58()).to.not.equal(
      autoTopOff.toBase58(),
      "leg should have rescheduled itself rather than stopping"
    );
    expect(after.dcaIndex).to.equal(
      0,
      "no DCA was created, so the slot should not advance"
    );
    expect(
      await readAccount(ctx, dcaKey(autoTopOff, dcaMint, hntMint, 0)[0]),
      "no DCA account should exist"
    ).to.equal(null);
  });

  describe("a second task at the address the HNT leg recorded", () => {
    /**
     * Frees the recorded address and lets the other authority put its own task there, so the
     * only thing the run has going for it is that the address matches.
     */
    async function reoccupy(
      options: { destination?: PublicKey; swapPayerSeed?: string } = {}
    ) {
      const { autoTopOff, hntTaskId } = await autoTopOffWith(
        50_000_000,
        1_000_000_000
      );
      const { nextHntTaskTime } = await program.account.autoTopOffV0.fetch(
        autoTopOff
      );
      await freeRecordedLegs(autoTopOff);
      const task = await queueTopOffAt({ autoTopOff, taskId: hntTaskId, ...options });
      return { autoTopOff, task, dueAt: BigInt(nextHntTaskTime.toString()) };
    }

    it("does not run before the leg is due", async () => {
      // Every other account is the one the top off itself would have named, so the time is the
      // only thing left to reject it on.
      const { task } = await reoccupy();
      await expectError("TaskNotDue", crank(task));
    });

    it("does not send the DCA output anywhere but the top off's HNT account", async () => {
      const destination = await ataWith(hntMint, Keypair.generate().publicKey, 0n);
      const { task, dueAt } = await reoccupy({ destination });
      await warpTo(ctx, dueAt + 1n);
      await expectError("InvalidDcaDestination", crank(task));
    });

    it("does not pay DCA rent to a signer other than the queue's swap payer", async () => {
      const { task, dueAt } = await reoccupy({ swapPayerSeed: "other_payer" });
      await warpTo(ctx, dueAt + 1n);
      await expectError("ConstraintSeeds", crank(task));
    });

    it("does not record a next task that is not the free task tuktuk was given", async () => {
      // The extra account lands ahead of the free tasks tuktuk appends, so remaining_accounts[0]
      // is a live account rather than the free task this run's own ids name.
      const { autoTopOff, hntTaskId } = await autoTopOffWith(
        50_000_000,
        1_000_000_000
      );
      const { nextHntTaskTime } = await program.account.autoTopOffV0.fetch(
        autoTopOff
      );
      await freeRecordedLegs(autoTopOff);
      const task = await queueTopOffAt({
        autoTopOff,
        taskId: hntTaskId,
        extraAccount: autoTopOff,
      });
      await warpTo(ctx, BigInt(nextHntTaskTime.toString()) + 1n);
      await expectError("InvalidFreeTask", crank(task));
    });
  });

  describe("sizing the refill", () => {
    const swapAmount = new anchor.BN(250_000000);

    /**
     * A top off whose gap is exactly `orders` orders wide, so the order count the leg derives
     * from the gap is that number and any smaller count is a cap the leg applied.
     */
    async function gapOf(
      orders: number,
      overrides: Record<string, unknown> = {},
      dcaMintFunding = 1_000_000_000n,
    ) {
      const perOrder = await hntPerOrder(swapAmount);
      return autoTopOffWith(50_000_000, 1_000_000_000, dcaMintFunding, {
        dcaSwapAmount: swapAmount,
        // The fixture funds the HNT account with 10 HNT.
        hntThreshold: new anchor.BN(10_00000000).add(perOrder.muln(orders)),
        ...overrides,
      });
    }

    it("buys the orders the balance covers rather than skipping the refill", async () => {
      // Daily, so the slot is 86400 seconds and at a 300 second interval leaves room for far
      // more than ten orders: the balance is the only cap that can bind here.
      const affordable = 3;
      const { autoTopOff, hntTask } = await gapOf(
        10,
        {},
        BigInt(swapAmount.muln(affordable).toString()),
      );
      const state = await program.account.autoTopOffV0.fetch(autoTopOff);
      const before = await tokenBalance(state.dcaMintAccount);

      const task = await tuktukProgram.account.taskV0.fetch(hntTask);
      await warpTo(ctx, BigInt(task.trigger.timestamp![0].toString()) + 1n);
      await crank(hntTask);

      const dca = await dcaAt(autoTopOff, 0);
      expect(dca.initialNumOrders).to.equal(
        affordable,
        "the DCA should carry every order the balance covers",
      );
      expect(
        (before - (await tokenBalance(state.dcaMintAccount))).toString(),
      ).to.equal(
        swapAmount.muln(affordable).toString(),
        "the DCA should have taken one swap amount per order",
      );
    });

    it("buys no more orders than come due before the next run", async () => {
      // Hourly, so the slot the leg is about to schedule is 3600 seconds wide.
      const { autoTopOff, hntTask } = await gapOf(
        10,
        { schedule: padded("0 0 * * * *", 128) },
        BigInt(swapAmount.muln(10).toString()),
      );
      const task = await tuktukProgram.account.taskV0.fetch(hntTask);
      // 1500 seconds short of the next slot, against a 300 second order interval.
      await warpTo(
        ctx,
        BigInt(task.trigger.timestamp![0].toString()) + 3600n - 1500n,
      );
      await crank(hntTask);

      const dca = await dcaAt(autoTopOff, 0);
      expect(dca.initialNumOrders).to.equal(
        5,
        "1500 seconds at 300 per order is five orders",
      );
    });

    it("still buys the order that fires now when the interval outlasts the slot", async () => {
      // Hourly again, but a 7200 second order interval is wider than the 1500 seconds left in
      // the slot, so only the order that fires straight away comes due before the next run.
      const { autoTopOff, hntTask } = await gapOf(
        10,
        {
          schedule: padded("0 0 * * * *", 128),
          dcaIntervalSeconds: new anchor.BN(7200),
        },
        BigInt(swapAmount.muln(10).toString()),
      );
      const task = await tuktukProgram.account.taskV0.fetch(hntTask);
      await warpTo(
        ctx,
        BigInt(task.trigger.timestamp![0].toString()) + 3600n - 1500n,
      );
      await crank(hntTask);

      const dca = await dcaAt(autoTopOff, 0);
      expect(dca.initialNumOrders).to.equal(
        1,
        "the first order fires now, so one order always fits the slot",
      );
    });
  });

  describe("an update that dequeues both legs", () => {
    it("leaves both legs unscheduled, so they can be scheduled again", async () => {
      const { autoTopOff } = await autoTopOffWith(50_000_000, 1_000_000_000);
      await dequeueBothLegs(autoTopOff);

      const after = await program.account.autoTopOffV0.fetch(autoTopOff);
      expect(after.nextTask.toBase58()).to.equal(
        autoTopOff.toBase58(),
        "the dequeued DC task should read as nothing scheduled",
      );
      expect(after.nextHntTask.toBase58()).to.equal(
        autoTopOff.toBase58(),
        "the dequeued HNT task should read as nothing scheduled",
      );

      const { taskBitmap, capacity } =
        await tuktukProgram.account.taskQueueV0.fetch(taskQueue);
      const [taskId, hntTaskId] = nextAvailableTaskIds(
        taskBitmap,
        2,
        false,
        capacity,
      );
      await program.methods
        .scheduleTaskV0({ taskId, hntTaskId })
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({ units: 1400000 }),
        ])
        .accounts({
          payer: me,
          autoTopOff,
          task: taskKey(taskQueue, taskId)[0],
          hntTask: taskKey(taskQueue, hntTaskId)[0],
        })
        .rpc();

      const scheduled = await program.account.autoTopOffV0.fetch(autoTopOff);
      expect(scheduled.nextTask.toBase58()).to.equal(
        taskKey(taskQueue, taskId)[0].toBase58(),
      );
      expect(scheduled.nextHntTask.toBase58()).to.equal(
        taskKey(taskQueue, hntTaskId)[0].toBase58(),
      );
    });

    it("leaves the DCA mint alone when it is not passed", async () => {
      const { autoTopOff } = await autoTopOffWith(50_000_000, 1_000_000_000);
      const before = await program.account.autoTopOffV0.fetch(autoTopOff);
      await dequeueBothLegs(autoTopOff);

      const after = await program.account.autoTopOffV0.fetch(autoTopOff);
      expect(after.dcaMint.toBase58()).to.equal(before.dcaMint.toBase58());
      expect(after.dcaMintAccount.toBase58()).to.equal(
        before.dcaMintAccount.toBase58(),
      );
    });

    /** The update, with every argument and optional account the caller chooses. */
    async function update(
      autoTopOff: PublicKey,
      args: Record<string, unknown>,
      accounts: Record<string, unknown>,
    ) {
      const state = await program.account.autoTopOffV0.fetch(autoTopOff);
      await program.methods
        .updateAutoTopOffV0({
          schedule: null,
          threshold: null,
          hntThreshold: null,
          dcaSwapAmount: null,
          dcaIntervalSeconds: null,
          dcaInputPriceOracle: null,
          ...args,
        } as any)
        .accounts({
          authority: me,
          payer: me,
          autoTopOff,
          taskQueue,
          nextTask: state.nextTask,
          nextHntTask: state.nextHntTask,
          taskRentRefund: me,
          hntTaskRentRefund: me,
          dcaMint: null,
          dcaMintAccount: null,
          currentDcaMintAccount: null,
          ...accounts,
        })
        .rpc();
    }

    it("refuses an interval of zero, which would come due never", async () => {
      const { autoTopOff } = await autoTopOffWith(50_000_000, 1_000_000_000, 0n);
      await expectError(
        "InvalidDcaInterval",
        update(autoTopOff, { dcaIntervalSeconds: new anchor.BN(0) }, {}),
      );
    });

    it("refuses a mint without the account it is spent from", async () => {
      const { autoTopOff } = await autoTopOffWith(50_000_000, 1_000_000_000, 0n);
      const state = await program.account.autoTopOffV0.fetch(autoTopOff);
      await expectError(
        "IncompleteDcaMintChange",
        update(
          autoTopOff,
          {},
          {
            dcaMint: await createMint(6),
            dcaMintAccount: null,
            currentDcaMintAccount: state.dcaMintAccount,
          },
        ),
      );
    });

    it("refuses an account the top off does not own", async () => {
      const { autoTopOff } = await autoTopOffWith(50_000_000, 1_000_000_000, 0n);
      const state = await program.account.autoTopOffV0.fetch(autoTopOff);
      const newMint = await createMint(6);
      await expectError(
        "ConstraintTokenOwner",
        update(
          autoTopOff,
          {},
          {
            dcaMint: newMint,
            dcaMintAccount: await ataWith(newMint, me, 0n),
            currentDcaMintAccount: state.dcaMintAccount,
          },
        ),
      );
    });
  });

  describe("moving the DCA mint", () => {
    /** Points the leg at `newMint`, handing back the account it spends from today. */
    async function changeMintTo(autoTopOff: PublicKey, newMint: PublicKey) {
      const state = await program.account.autoTopOffV0.fetch(autoTopOff);
      await program.methods
        .updateAutoTopOffV0({
          schedule: null,
          threshold: null,
          hntThreshold: null,
          dcaSwapAmount: null,
          dcaIntervalSeconds: null,
          dcaInputPriceOracle: null,
        })
        .accounts({
          authority: me,
          payer: me,
          autoTopOff,
          taskQueue,
          nextTask: state.nextTask,
          nextHntTask: state.nextHntTask,
          taskRentRefund: me,
          hntTaskRentRefund: me,
          dcaMint: newMint,
          dcaMintAccount: getAssociatedTokenAddressSync(
            newMint,
            autoTopOff,
            true,
          ),
          currentDcaMintAccount: state.dcaMintAccount,
        })
        .rpc();
    }

    it("refuses while the account it spends from still holds a balance", async () => {
      const { autoTopOff } = await autoTopOffWith(
        50_000_000,
        1_000_000_000,
        1_000_000_000n,
      );
      await expectError(
        "DcaMintAccountNotEmpty",
        changeMintTo(autoTopOff, await createMint(6)),
      );
    });

    // The control for the test above: the same change, differing only in the balance left
    // behind, so the refusal there is the balance and not the rest of the fixture.
    it("moves both fields once that account is empty", async () => {
      const { autoTopOff } = await autoTopOffWith(
        50_000_000,
        1_000_000_000,
        0n,
      );
      const newMint = await createMint(6);
      await changeMintTo(autoTopOff, newMint);

      const after = await program.account.autoTopOffV0.fetch(autoTopOff);
      expect(after.dcaMint.toBase58()).to.equal(newMint.toBase58());
      expect(after.dcaMintAccount.toBase58()).to.equal(
        getAssociatedTokenAddressSync(newMint, autoTopOff, true).toBase58(),
      );
    });
  });

  it("runs the DC leg on its own schedule, not on the address alone", async () => {
    const { autoTopOff, taskId } = await autoTopOffWith(
      50_000_000,
      1_000_000_000,
      1_000_000_000n,
      {
        delegatedDataCredits: DELEGATED_DATA_CREDITS,
        dataCredits: DATA_CREDITS,
        subDao: SUB_DAO,
        dao: DAO,
        dcMint: DC_MINT,
        hntMint: MAINNET_HNT_MINT,
        escrowAccount: ESCROW_ACCOUNT,
        circuitBreaker: CIRCUIT_BREAKER,
        dcAccount: Keypair.generate().publicKey,
      }
    );

    /** The DC top off call the leg's own task carries, as schedule_task_v0 compiles it. */
    const dcTopOffIx = async (state: any) =>
      program.methods
        .topOffDcV0()
        .accounts({
          autoTopOff,
          taskQueue,
          delegatedDataCredits: DELEGATED_DATA_CREDITS,
          dataCredits: DATA_CREDITS,
          dcMint: DC_MINT,
          hntMint: MAINNET_HNT_MINT,
          dao: DAO,
          subDao: SUB_DAO,
          fromAccount: state.dcAccount,
          fromHntAccount: state.hntAccount,
          hntAccount: state.hntAccount,
          hntPriceOracle: HNT_PRICE_FEED,
          escrowAccount: ESCROW_ACCOUNT,
          circuitBreaker: CIRCUIT_BREAKER,
        })
        .instruction();

    /** Puts the other authority's own task at `id`, carrying that same call. */
    const queueDcTopOffAt = async (id: number) => {
      const state = await program.account.autoTopOffV0.fetch(autoTopOff);
      const { transaction, remainingAccounts } = compileTransaction(
        [await dcTopOffIx(state)],
        []
      );
      await tuktukProgram.methods
        .queueTaskV0({
          id,
          trigger: { now: {} },
          transaction: { compiledV0: [transaction] },
          crankReward: null,
          freeTasks: 1,
          description: "second dc topoff",
        })
        .accounts({
          payer: me,
          queueAuthority: otherAuthority.publicKey,
          taskQueueAuthority: taskQueueAuthorityKey(
            taskQueue,
            otherAuthority.publicKey
          )[0],
          taskQueue,
          task: taskKey(taskQueue, id)[0],
        })
        .remainingAccounts(
          remainingAccounts.map((account) => ({
            ...account,
            isSigner: false,
            isWritable: false,
          }))
        )
        .signers([otherAuthority])
        .rpc();
      return taskKey(taskQueue, id)[0];
    };

    // Before its time, the recorded address buys a second task nothing.
    await freeRecordedLegs(autoTopOff);
    await expectError("TaskNotDue", crank(await queueDcTopOffAt(taskId)));

    // At its time the leg runs, and the run moves the leg on to the next slot.
    const due = await program.account.autoTopOffV0.fetch(autoTopOff);
    await warpTo(ctx, BigInt(due.nextTaskTime.toString()) + 1n);
    await crank(taskKey(taskQueue, taskId)[0]);
    const after = await program.account.autoTopOffV0.fetch(autoTopOff);
    expect(
      after.nextTaskTime.toNumber(),
      "the leg should now be due at the slot after the one it just ran"
    ).to.be.greaterThan(due.nextTaskTime.toNumber());

    // So a second task at the address the run just recorded is early in its turn.
    const rescheduled = await tuktukProgram.account.taskV0.fetch(after.nextTask);
    await freeRecordedLegs(autoTopOff);
    await expectError("TaskNotDue", crank(await queueDcTopOffAt(rescheduled.id)));
  });
});
