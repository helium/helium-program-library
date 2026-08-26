import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Tuktuk } from "@helium/tuktuk-idls/lib/types/tuktuk";
import {
  customSignerKey,
  init as initTuktuk,
  nextAvailableTaskIds,
  runTask,
  taskKey,
  taskQueueKey,
  taskQueueNameMappingKey,
  tuktukConfigKey,
} from "@helium/tuktuk-sdk";
import {
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
import { createHash } from "crypto";
import { autoTopOffKey, queueAuthorityKey } from "../packages/dc-auto-top-sdk/src";
import { dcaKey } from "../packages/tuktuk-dca-sdk/src/pdas";
import { DcAutoTop } from "../target/types/dc_auto_top";
import {
  ensureCloned,
  ensureDumped,
  readAccount,
  startBankrun,
  warpTo,
} from "./utils/bankrun";

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

/**
 * `AutoTopOffV0` field offsets, discriminator included. Reaching the rent-shortfall branch
 * needs an account holding barely more than its own rent exemption, and
 * `initialize_auto_top_off_v0` funds one properly, so the state is written directly rather
 * than produced. `state.rs`'s layout test pins these same offsets from the Rust side.
 */
const OFF = {
  authority: 8,
  dataCredits: 40,
  taskQueue: 72,
  subDao: 104,
  nextTask: 136,
  nextHntTask: 168,
  delegatedDataCredits: 200,
  dcMint: 232,
  hntMint: 264,
  dao: 296,
  hntPriceOracle: 328,
  hntAccount: 360,
  dcAccount: 392,
  escrowAccount: 424,
  circuitBreaker: 456,
  bump: 488,
  queueAuthorityBump: 489,
  dcaIndex: 490,
  threshold: 496,
  schedule: 504,
  dcaUrl: 632,
  dcaSigner: 760,
  hntThreshold: 792,
  dcaMint: 800,
  dcaMintAccount: 832,
  dcaSwapAmount: 864,
  dcaIntervalSeconds: 872,
  dcaInputPriceOracle: 880,
  dca: 912,
  SIZE: 944,
};

const discriminator = (name: string) =>
  createHash("sha256").update(`account:${name}`).digest().subarray(0, 8);

describe("dc-auto-topoff under bankrun", () => {
  let ctx: ProgramTestContext;
  let provider: BankrunProvider;
  let program: Program<DcAutoTop>;
  let tuktukProgram: Program<Tuktuk>;
  let me: PublicKey;
  let taskQueue: PublicKey;
  let hntMint: PublicKey;
  let dcaMint: PublicKey;

  const queueAuthority = queueAuthorityKey()[0];

  const send = (instructions: anchor.web3.TransactionInstruction[]) =>
    provider.sendAndConfirm(new Transaction().add(...instructions));

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
    ctx = await startBankrun(
      [
        { name: "dc_auto_top", programId: DC_AUTO_TOP },
        { name: "tuktuk", programId: TUKTUK },
        { name: "tuktuk_dca", programId: TUKTUK_DCA },
      ],
      [
        ensureCloned("tuktuk_config", TUKTUK_CONFIG),
        ensureCloned("tuktuk_idl", TUKTUK_IDL),
        ensureCloned("hnt_price_feed", HNT_PRICE_FEED),
        ensureCloned("usdc_price_feed", USDC_PRICE_FEED),
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
  });

  /**
   * An AutoTopOffV0 written straight to the ledger, holding `spendableLamports` above its own
   * rent exemption. HNT sits below hnt_threshold so the run wants a DCA.
   */
  async function autoTopOffWith(
    spendableLamports: number,
    swapPayerLamports = 0,
    dcaMintFunding = 1_000_000_000n
  ) {
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
    const delegatedDataCredits = Keypair.generate().publicKey;
    const [autoTopOff, bump] = autoTopOffKey(delegatedDataCredits, me);
    const hntAccount = await ataWith(hntMint, autoTopOff, 10_00000000n);
    const dcaMintAccount = await ataWith(dcaMint, autoTopOff, dcaMintFunding);

    const data = Buffer.alloc(OFF.SIZE);
    discriminator("AutoTopOffV0").copy(data, 0);
    const put = (offset: number, key: PublicKey) => key.toBuffer().copy(data, offset);
    put(OFF.authority, me);
    put(OFF.taskQueue, taskQueue);
    // next_task/next_hnt_task pointing at the account itself is the "nothing scheduled"
    // sentinel schedule_task_v0 requires.
    put(OFF.nextTask, autoTopOff);
    put(OFF.nextHntTask, autoTopOff);
    put(OFF.delegatedDataCredits, delegatedDataCredits);
    put(OFF.hntMint, hntMint);
    put(OFF.hntPriceOracle, HNT_PRICE_FEED);
    put(OFF.hntAccount, hntAccount);
    put(OFF.dcaMint, dcaMint);
    put(OFF.dcaMintAccount, dcaMintAccount);
    put(OFF.dcaInputPriceOracle, USDC_PRICE_FEED);
    put(OFF.dcaSigner, Keypair.generate().publicKey);
    data.writeUInt8(bump, OFF.bump);
    data.writeUInt8(queueAuthorityKey()[1], OFF.queueAuthorityBump);
    data.writeUInt16LE(0, OFF.dcaIndex);
    Buffer.from("0 0 16 * * *").copy(data, OFF.schedule);
    Buffer.from("http://localhost:8129/dca").copy(data, OFF.dcaUrl);
    // 30 HNT wanted against 10 held, bought 250 units at a time.
    data.writeBigUInt64LE(30_00000000n, OFF.hntThreshold);
    data.writeBigUInt64LE(250_000000n, OFF.dcaSwapAmount);
    data.writeBigUInt64LE(300n, OFF.dcaIntervalSeconds);

    const rentExempt =
      await provider.connection.getMinimumBalanceForRentExemption(OFF.SIZE);
    ctx.setAccount(autoTopOff, {
      lamports: rentExempt + spendableLamports,
      data,
      owner: DC_AUTO_TOP,
      executable: false,
    });

    const { taskBitmap } = await tuktukProgram.account.taskQueueV0.fetch(
      taskQueue
    );
    const [taskId, hntTaskId] = nextAvailableTaskIds(taskBitmap, 2, false);
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

    return { autoTopOff, hntTask: taskKey(taskQueue, hntTaskId)[0] };
  }

  const crank = async (task: PublicKey) =>
    send([
      ComputeBudgetProgram.setComputeUnitLimit({ units: 1400000 }),
      ...(await runTask({ program: tuktukProgram, task, crankTurner: me })),
    ]);

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
    await crank(hntTask);

    const after = await program.account.autoTopOffV0.fetch(autoTopOff);
    expect(after.dcaIndex).to.equal(1, "the slot should advance once per DCA");
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
});
