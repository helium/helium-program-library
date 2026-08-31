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
      dcaUrl: padded("http://localhost:8129/dca", 128),
      dcaSigner: Keypair.generate().publicKey,
      // 30 HNT wanted against 10 held, bought 250 units at a time.
      hntThreshold: new anchor.BN(30_00000000),
      dcaMint,
      dcaMintAccount,
      dcaSwapAmount: new anchor.BN(250_000000),
      dcaIntervalSeconds: new anchor.BN(300),
      dcaInputPriceOracle: USDC_PRICE_FEED,
      dca: PublicKey.default,
    });

    const rentExempt =
      await provider.connection.getMinimumBalanceForRentExemption(data.length);
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
