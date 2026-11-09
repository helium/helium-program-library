import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import {
  cronJobKey,
  cronJobTransactionKey,
  PROGRAM_ID as CRON_PROGRAM,
} from "@helium/cron-sdk";
import {
  ComputeBudgetProgram,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import { BankrunProvider } from "anchor-bankrun";
import { expect } from "chai";
import { ProgramTestContext } from "solana-bankrun";
import { entityCronAuthorityKey } from "../packages/hpl-crons-sdk/src";
import {
  backfillRequiredLamports,
  backfillSelection,
  backfillTopUp,
  cronTransactionExists,
} from "../packages/helium-admin-cli/src/backfill-entity-claim-wallets";
import { HplCrons } from "../target/types/hpl_crons";
import { ensureDumped, readAccount, startBankrun } from "./utils/bankrun";
import { loadKeypair } from "./utils/solana";

const HPL_CRONS = new PublicKey("hcrLPFgFUY6sCUKzqLWxXx5bntDiDCrAZVcrXfx9AHu");
const CRON = new PublicKey("cronAjRZnJn3MTP3B9kE62NWDrjSuAPVXf9c4hu4grM");
// A TESTING build of hpl-crons keeps the mainnet oracle constants, so the claim it adds is the
// one a mainnet backfill adds.
const ORACLE_URL = "https://hnt-rewards.oracle.helium.io";
const ORACLE_SIGNER = new PublicKey(
  "orc1TYY5L4B4ZWDEMayTqu99ikPM9bQo9fqzoaCPP5Q"
);

/** The error name in a failed send, from its message or its program logs. */
const failureOf = async (run: Promise<unknown>): Promise<string> => {
  try {
    await run;
  } catch (e: any) {
    return `${e}\n${(e.logs ?? []).join("\n")}`;
  }
  throw new Error("expected the transaction to fail");
};

/** A cron transaction's remote source: 8-byte discriminator, id, cron job, then the source. */
const decodeRemoteSource = (data: Buffer) => {
  let offset = 8 + 4 + 32;
  const variant = data.readUInt8(offset);
  offset += 1;
  const urlLength = data.readUInt32LE(offset);
  offset += 4;
  const url = data.subarray(offset, offset + urlLength).toString("utf8");
  offset += urlLength;
  const signer = new PublicKey(data.subarray(offset, offset + 32));
  return { variant, url, signer };
};

describe("hpl-crons backfill of an empty entity claim cron", () => {
  let ctx: ProgramTestContext;
  let program: Program<HplCrons>;
  const backfillSigner = loadKeypair(
    __dirname + "/keypairs/backfill-signer-test.json"
  );

  before(async () => {
    ensureDumped("cron", CRON);
    ctx = await startBankrun([
      { name: "hpl_crons", programId: HPL_CRONS },
      { name: "cron", programId: CRON },
    ]);
    program = new Program<HplCrons>(
      require("../target/idl/hpl_crons.json"),
      new BankrunProvider(ctx)
    );
    ctx.setAccount(backfillSigner.publicKey, {
      lamports: 10 * LAMPORTS_PER_SOL,
      data: Buffer.alloc(0),
      owner: SystemProgram.programId,
      executable: false,
    });
  });

  /**
   * Put a cron in the state the wallet leaves it in: created by `init_entity_claim_cron_v0`,
   * with no transaction ever added. `removedFromQueue` marks a cron tuktuk dropped for want of SOL.
   * A nonzero `nextTransactionId` marks a cron that once had claims.
   */
  const emptyCronFor = async (
    wallet: PublicKey,
    removedFromQueue = false,
    nextTransactionId = 0
  ) => {
    const authority = entityCronAuthorityKey(wallet)[0];
    const cronJob = cronJobKey(authority, 0)[0];
    const data = await program.coder.accounts.encode("cronJobV0", {
      id: 0,
      userCronJobs: PublicKey.unique(),
      taskQueue: PublicKey.unique(),
      authority,
      freeTasksPerTransaction: 1,
      numTasksPerQueueCall: 1,
      schedule: "0 0 0 * * *",
      name: "entity_claim",
      currentExecTs: new anchor.BN(0),
      currentTransactionId: 0,
      numTransactions: 0,
      nextTransactionId,
      removedFromQueue,
      bumpSeed: cronJobKey(authority, 0)[1],
      nextScheduleTask: PublicKey.default,
    });
    ctx.setAccount(cronJob, {
      lamports: LAMPORTS_PER_SOL,
      data,
      owner: CRON,
      executable: false,
    });
    return { authority, cronJob };
  };

  const backfill = (
    signer: Keypair,
    wallet: PublicKey,
    authority: PublicKey,
    cronJob: PublicKey,
    preInstructions: anchor.web3.TransactionInstruction[] = []
  ) =>
    program.methods
      .backfillEntityClaimWalletV0()
      .preInstructions(preInstructions)
      .accounts({
        payer: signer.publicKey,
        wallet,
        cronJob,
        cronJobTransaction: cronJobTransactionKey(cronJob, 0)[0],
      })
      .signers([signer])
      .rpc();

  it("adds the owner's wallet claim as transaction 0", async () => {
    const wallet = Keypair.generate().publicKey;
    const { authority, cronJob } = await emptyCronFor(wallet);

    await backfill(backfillSigner, wallet, authority, cronJob);

    const source = decodeRemoteSource(
      (await readAccount(ctx, cronJobTransactionKey(cronJob, 0)[0]))!
    );
    expect(source.variant).to.eq(1);
    expect(source.url).to.eq(
      `${ORACLE_URL}/v1/tuktuk/wallet/${wallet.toBase58()}`
    );
    expect(source.signer.toBase58()).to.eq(ORACLE_SIGNER.toBase58());
    const cron = program.coder.accounts.decode(
      "cronJobV0",
      (await readAccount(ctx, cronJob))!
    );
    expect(cron.nextTransactionId).to.eq(1);
    expect(cron.numTransactions).to.eq(1);
  });

  it("adds the wallet claim to a cron removed from queue", async () => {
    const wallet = Keypair.generate().publicKey;
    const { authority, cronJob } = await emptyCronFor(wallet, true);

    await backfill(backfillSigner, wallet, authority, cronJob);

    const source = decodeRemoteSource(
      (await readAccount(ctx, cronJobTransactionKey(cronJob, 0)[0]))!
    );
    expect(source.url).to.eq(
      `${ORACLE_URL}/v1/tuktuk/wallet/${wallet.toBase58()}`
    );
    const cron = program.coder.accounts.decode(
      "cronJobV0",
      (await readAccount(ctx, cronJob))!
    );
    expect(cron.nextTransactionId).to.eq(1);
    expect(cron.removedFromQueue).to.eq(true);
  });

  it("refuses a cron that already has a claim", async () => {
    const wallet = Keypair.generate().publicKey;
    const { authority, cronJob } = await emptyCronFor(wallet);
    await backfill(backfillSigner, wallet, authority, cronJob);

    // A byte-identical resend is dropped as already processed, before the program runs.
    const failure = await failureOf(
      backfill(backfillSigner, wallet, authority, cronJob, [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }),
      ])
    );
    expect(failure).to.include("CronJobHasClaims");
  });

  it("refuses a cron whose claims were all removed", async () => {
    const wallet = Keypair.generate().publicKey;
    const { authority, cronJob } = await emptyCronFor(wallet, false, 1);

    const failure = await failureOf(
      backfill(backfillSigner, wallet, authority, cronJob)
    );
    expect(failure).to.include("CronJobHasClaims");
  });

  it("refuses any signer but the backfill signer", async () => {
    const wallet = Keypair.generate().publicKey;
    const { authority, cronJob } = await emptyCronFor(wallet);
    const stranger = Keypair.generate();
    ctx.setAccount(stranger.publicKey, {
      lamports: LAMPORTS_PER_SOL,
      data: Buffer.alloc(0),
      owner: SystemProgram.programId,
      executable: false,
    });

    const failure = await failureOf(
      backfill(stranger, wallet, authority, cronJob)
    );
    expect(failure).to.include("ConstraintAddress");
  });

  it("refuses a wallet that does not own the cron", async () => {
    const owner = Keypair.generate().publicKey;
    const { cronJob } = await emptyCronFor(owner);
    const other = Keypair.generate().publicKey;

    const failure = await failureOf(
      backfill(backfillSigner, other, entityCronAuthorityKey(other)[0], cronJob)
    );
    expect(failure).to.include("ConstraintHasOne");
  });
});

describe("helium-admin-cli backfill selection and top-up", () => {
  const minCrankReward = new anchor.BN(10_000);
  const minRuns = 365;

  it("backfills a cron removed from queue without a top-up", () => {
    expect(
      backfillSelection({
        nextTransactionId: 0,
        transactionExists: false,
      })
    ).to.equal("ready");
    expect(
      backfillTopUp({
        removedFromQueue: true,
        spendable: new anchor.BN(0),
        minCrankReward,
        minRuns,
      }).toString()
    ).to.equal("0");
  });

  it("tops a queued cron up to minRuns runs at 2 tasks per run", () => {
    expect(
      backfillTopUp({
        removedFromQueue: false,
        spendable: new anchor.BN(1_000_000),
        minCrankReward,
        minRuns,
      }).toString()
    ).to.equal("6300000");
  });

  it("does not top up a queued cron funded for minRuns runs", () => {
    expect(
      backfillTopUp({
        removedFromQueue: false,
        spendable: new anchor.BN(10_000_000),
        minCrankReward,
        minRuns,
      }).toString()
    ).to.equal("0");
  });

  it("skips a cron that has had claims", () => {
    expect(
      backfillSelection({ nextTransactionId: 1, transactionExists: false })
    ).to.equal("hasClaims");
  });

  it("skips a cron whose transaction 0 exists", () => {
    expect(
      backfillSelection({ nextTransactionId: 0, transactionExists: true })
    ).to.equal("transactionExists");
  });

  it("counts transaction 0 as taken only when the cron program owns it", () => {
    expect(cronTransactionExists(null)).to.equal(false);
    expect(cronTransactionExists({ owner: SystemProgram.programId })).to.equal(
      false
    );
    expect(cronTransactionExists({ owner: CRON_PROGRAM })).to.equal(true);
  });

  it("sums the signer's need past 2^26 lamports", () => {
    // About 650 crons' claim rent.
    expect(
      backfillRequiredLamports({
        topUpLamports: new anchor.BN(330_000_000),
        rentLamports: 1_536_031_152,
      }).toString()
    ).to.equal("1916031152");
  });
});
