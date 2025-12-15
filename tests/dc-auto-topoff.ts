import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair as HeliumKeypair } from "@helium/crypto";
import {
  dataCreditsKey,
  delegatedDataCreditsKey,
  init as initDataCredits,
} from "@helium/data-credits-sdk";
import { init as initHem } from "@helium/helium-entity-manager-sdk";
import { daoKey, init as initHsd } from "@helium/helium-sub-daos-sdk";
import {
  createAtaAndTransfer,
  createMint,
  sendInstructions,
} from "@helium/spl-utils";
import { Tuktuk } from "@helium/tuktuk-idls/lib/types/tuktuk";
import {
  init as initTuktuk,
  nextAvailableTaskIds,
  taskKey,
  taskQueueKey,
  taskQueueNameMappingKey,
  tuktukConfigKey,
} from "@helium/tuktuk-sdk";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  ComputeBudgetProgram,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import { USDC_PRICE_FEED, HNT_PRICE_FEED } from "./tuktuk-dca";
import { expect } from "chai";
import { execSync } from "child_process";
import {
  autoTopOffKey,
  init,
  queueAuthorityKey,
} from "../packages/dc-auto-top-sdk/src";
import { init as initTuktukDca } from "../packages/tuktuk-dca-sdk/src";
import { DataCredits } from "../target/types/data_credits";
import { DcAutoTop } from "../target/types/dc_auto_top";
import { TuktukDca } from "../target/types/tuktuk_dca";
import { HeliumEntityManager } from "../target/types/helium_entity_manager";
import { HeliumSubDaos } from "../target/types/helium_sub_daos";
import {
  ensureDCIdl,
  ensureHEMIdl,
  ensureHSDIdl,
  initWorld,
  ensureTuktukDcaIdl,
} from "./utils/fixtures";
import {
  createDcaServer,
  runAllTasks as runAllTasksUtil,
} from "./utils/dca-test-server";
import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { customSignerKey } from "@helium/tuktuk-sdk";
import { createAtaAndMint } from "@helium/spl-utils";
import { FastifyInstance } from "fastify";

export const ANCHOR_PATH = "anchor";

export async function ensureIdls() {
  let programs = [
    {
      name: "dc_auto_top",
      pid: "topqqzQZroCyRrgyM5zVq6xkFDVnfF13iixSjajydgU",
    },
  ];
  await Promise.all(
    programs.map(async (program) => {
      try {
        execSync(
          `${ANCHOR_PATH} idl init --filepath ${__dirname}/../target/idl/${program.name}.json ${program.pid}`,
          { stdio: "inherit", shell: "/bin/bash" }
        );
      } catch {
        execSync(
          `${ANCHOR_PATH} idl upgrade --filepath ${__dirname}/../target/idl/${program.name}.json ${program.pid}`,
          { stdio: "inherit", shell: "/bin/bash" }
        );
      }
    })
  );
}

describe("dc-auto-topoff", () => {
  anchor.setProvider(anchor.AnchorProvider.local("http://127.0.0.1:8899"));

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const me = provider.wallet.publicKey;

  let taskQueueName = `test-${Math.random().toString(36).substring(2, 15)}`;
  let program: Program<DcAutoTop>;
  let tuktukProgram: Program<Tuktuk>;
  let dcProgram: Program<DataCredits>;
  let hsdProgram: Program<HeliumSubDaos>;
  let hemProgram: Program<HeliumEntityManager>;
  let tuktukDcaProgram: Program<TuktukDca>;
  let fanoutName: string;
  let mint: PublicKey;
  let hntMint: PublicKey;
  let delegatedDataCredits: PublicKey;
  let dcMint: PublicKey;
  let dcaMint: PublicKey;
  let routerKey: string;
  let subDao: PublicKey;
  const tuktukConfig: PublicKey = tuktukConfigKey()[0];
  const queueAuthority = queueAuthorityKey()[0];
  const crankTurner = Keypair.generate();

  let taskQueue: PublicKey;
  let dcaServer: FastifyInstance;
  let dcaSigner: Keypair;
  before(async () => {
    await ensureHSDIdl();
    await ensureIdls();
    await ensureDCIdl();
    await ensureHEMIdl();
    await ensureTuktukDcaIdl();

    dcaMint = await createMint(provider, 6, me, me);
    await createAtaAndMint(provider, dcaMint, new anchor.BN(1000000000000), me);
    hemProgram = await initHem(provider);
    hsdProgram = await initHsd(provider);
    program = await init(provider);
    tuktukProgram = await initTuktuk(provider);
    dcProgram = await initDataCredits(provider);
    tuktukDcaProgram = await initTuktukDca(provider);

    const config = await tuktukProgram.account.tuktukConfigV0.fetch(
      tuktukConfig
    );
    const nextTaskQueueId = config.nextTaskQueueId;
    taskQueue = taskQueueKey(tuktukConfig, nextTaskQueueId)[0];

    await tuktukProgram.methods
      .initializeTaskQueueV0({
        name: taskQueueName,
        minCrankReward: new anchor.BN(1),
        capacity: 20000,
        lookupTables: [],
        staleTaskAge: 10000,
      })
      .accounts({
        tuktukConfig,
        payer: me,
        updateAuthority: me,
        taskQueue,
        taskQueueNameMapping: taskQueueNameMappingKey(
          tuktukConfig,
          taskQueueName
        )[0],
      })
      .rpc({ skipPreflight: true });

    await tuktukProgram.methods
      .addQueueAuthorityV0()
      .accounts({
        payer: me,
        queueAuthority,
        taskQueue,
      })
      .rpc({ skipPreflight: true });

    // Set up DCA server
    dcaSigner = Keypair.generate();
    await sendInstructions(provider, [
      SystemProgram.transfer({
        fromPubkey: me,
        toPubkey: dcaSigner.publicKey,
        lamports: 10 * LAMPORTS_PER_SOL,
      }),
      SystemProgram.transfer({
        fromPubkey: me,
        toPubkey: crankTurner.publicKey,
        lamports: 10 * LAMPORTS_PER_SOL,
      }),
    ]);

    ({
      dao: { mint: hntMint },
      dataCredits: { dcMint },
      subDao: { subDao },
    } = await initWorld(provider, hemProgram, hsdProgram, dcProgram));

    dcaServer = await createDcaServer({
      program: tuktukDcaProgram,
      provider,
      taskQueue,
      outputMint: hntMint,
      dcaSigner,
      port: 8124, // Different port from tuktuk-dca test
    });
  });

  after(async () => {
    if (dcaServer) {
      await dcaServer.close();
    }
  });

  beforeEach(async () => {
    routerKey = (await HeliumKeypair.makeRandom()).address.b58;
    delegatedDataCredits = delegatedDataCreditsKey(subDao, routerKey)[0];
    // Create and fund swap payer for DCA
    const [swapPayer] = customSignerKey(taskQueue, [
      Buffer.from("dca_swap_payer"),
    ]);
    await sendInstructions(provider, [
      SystemProgram.transfer({
        fromPubkey: me,
        toPubkey: swapPayer,
        lamports: 10 * LAMPORTS_PER_SOL,
      }),
    ]);

    await dcProgram.methods
      .delegateDataCreditsV0({
        routerKey,
        amount: new anchor.BN(0),
      })
      .preInstructions([
        createAssociatedTokenAccountIdempotentInstruction(
          me,
          getAssociatedTokenAddressSync(dcMint, me, true),
          me,
          dcMint
        ),
      ])
      .accountsPartial({
        payer: me,
        subDao: subDao,
        delegatedDataCredits,
        dcMint,
        dao: daoKey(hntMint)[0],
        fromAccount: getAssociatedTokenAddressSync(dcMint, me, true),
        dataCredits: dataCreditsKey(dcMint)[0],
      })
      .rpc({ skipPreflight: true });

    // Create DCA mint ATA for swap payer (will receive tokens during lend, so 0 starting balance)
    const swapPayerDcaAta = getAssociatedTokenAddressSync(
      dcaMint,
      swapPayer,
      true
    );
    if (!(await provider.connection.getAccountInfo(swapPayerDcaAta))) {
      await sendInstructions(provider, [
        createAssociatedTokenAccountIdempotentInstruction(
          me,
          swapPayerDcaAta,
          swapPayer,
          dcaMint
        ),
      ]);
    }

    // Create HNT account for swap payer and fund it (it provides HNT output)
    await createAtaAndTransfer(
      provider,
      hntMint,
      new anchor.BN(1000_00000000),
      me,
      swapPayer
    ); // 1000 HNT
  });

  it("should initialize an auto topoff", async () => {
    console.log("creating auto topoff");
    const {
      pubkeys: { autoTopOff },
    } = await program.methods
      .initializeAutoTopOffV0({
        schedule: "0 0 * * * *",
        threshold: new anchor.BN(10000000),
        routerKey,
        hntThreshold: new anchor.BN(10000000),
        dcaSwapAmount: new anchor.BN(10000000),
        dcaIntervalSeconds: new anchor.BN(10000000),
        dcaSigner: dcaSigner.publicKey,
        dcaUrl: "http://localhost:8124/dca",
      })
      .accounts({
        dcaInputPriceOracle: USDC_PRICE_FEED,
        payer: me,
        authority: me,
        taskQueue,
        delegatedDataCredits,
        hntPriceOracle: HNT_PRICE_FEED,
        dcaMint,
      })
      .rpcAndKeys();

    const autoTopOffAcc = await program.account.autoTopOffV0.fetch(autoTopOff);

    expect(
      Buffer.from(autoTopOffAcc.schedule).toString("utf-8").replace(/\0/g, "")
    ).to.equal("0 0 * * * *");
    expect(autoTopOffAcc.threshold.toString()).to.equal("10000000");
  });

  describe("with an auto topoff", () => {
    let autoTopOff: PublicKey;

    beforeEach(async () => {
      const taskQueueAcc = await tuktukProgram.account.taskQueueV0.fetch(
        taskQueue
      );
      const [nextTask, nextHntTask] = nextAvailableTaskIds(
        taskQueueAcc.taskBitmap,
        2,
        false
      );

      const now = new Date();
      let nextSeconds = now.getSeconds() + 2;
      let nextMinutes = now.getMinutes();
      if (nextSeconds > 59) {
        nextSeconds = 0 + (nextSeconds - 59);
        nextMinutes = now.getMinutes() + 1;
      }
      const {
        pubkeys: { autoTopOff: autoTopOffK },
      } = await program.methods
        .initializeAutoTopOffV0({
          schedule: `${nextSeconds} ${nextMinutes} * * * *`,
          threshold: new anchor.BN(10000000),
          routerKey,
          hntThreshold: new anchor.BN(10000000),
          dcaSwapAmount: new anchor.BN(10000000),
          dcaIntervalSeconds: new anchor.BN(10000000),
          dcaSigner: dcaSigner.publicKey,
          dcaUrl: "http://localhost:8124/dca",
        })
        .accounts({
          dcaInputPriceOracle: USDC_PRICE_FEED,
          payer: me,
          authority: me,
          taskQueue,
          delegatedDataCredits,
          hntPriceOracle: new PublicKey(
            "4DdmDswskDxXGpwHrXUfn2CNUm9rt21ac79GHNTN3J33"
          ),
          dcaMint,
        })
        .rpcAndKeys({ skipPreflight: true });
      autoTopOff = autoTopOffK;

      await sendInstructions(provider, [
        SystemProgram.transfer({
          fromPubkey: me,
          toPubkey: autoTopOff,
          lamports: LAMPORTS_PER_SOL * 10,
        }),
      ]);

      await program.methods
        .scheduleTaskV0({
          taskId: nextTask,
          hntTaskId: nextHntTask,
        })
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({ units: 1400000 }),
        ])
        .accounts({
          payer: me,
          autoTopOff,
          task: taskKey(taskQueue, nextTask)[0],
          hntTask: taskKey(taskQueue, nextHntTask)[0],
        })
        .rpc({ skipPreflight: true });
    });

    it("should allow updating schedule", async () => {
      const taskQueueAcc = await tuktukProgram.account.taskQueueV0.fetch(
        taskQueue
      );
      const existingAccount = await program.account.autoTopOffV0.fetch(
        autoTopOff
      );
      const taskRentRefund = (
        await tuktukProgram.account.taskV0.fetch(existingAccount.nextTask)
      ).rentRefund;
      const hntTaskRentRefund = (
        await tuktukProgram.account.taskV0.fetch(existingAccount.nextHntTask)
      ).rentRefund;
      const [nextTask, nextHntTask] = nextAvailableTaskIds(
        taskQueueAcc.taskBitmap,
        2,
        false
      );

      // Update the auto topoff configuration
      await program.methods
        .updateAutoTopOffV0({
          schedule: "0 0 * * * *",
          threshold: new anchor.BN(10000000),
          hntPriceOracle: null,
          hntThreshold: null,
          dcaSwapAmount: null,
          dcaIntervalSeconds: null,
          dcaInputPriceOracle: null,
        })
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({ units: 1400000 }),
        ])
        .accounts({
          payer: me,
          autoTopOff,
          taskRentRefund,
          hntTaskRentRefund,
          dcaMint: dcaMint,
        })
        .rpc({ skipPreflight: true });

      // Schedule new tasks separately
      await program.methods
        .scheduleTaskV0({
          taskId: nextTask,
          hntTaskId: nextHntTask,
        })
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({ units: 1400000 }),
        ])
        .accounts({
          payer: me,
          autoTopOff,
          task: taskKey(taskQueue, nextTask)[0],
          hntTask: taskKey(taskQueue, nextHntTask)[0],
        })
        .rpc({ skipPreflight: true });

      const autoTopOffAcc = await program.account.autoTopOffV0.fetch(
        autoTopOff
      );
      expect(
        Buffer.from(autoTopOffAcc.schedule).toString("utf-8").replace(/\0/g, "")
      ).to.equal("0 0 * * * *");
      expect(autoTopOffAcc.nextTask.toBase58()).to.equal(
        taskKey(taskQueue, nextTask)[0].toBase58()
      );
      expect(autoTopOffAcc.nextHntTask.toBase58()).to.equal(
        taskKey(taskQueue, nextHntTask)[0].toBase58()
      );
    });

    async function runAllTasks() {
      await runAllTasksUtil(provider, tuktukProgram, taskQueue, crankTurner);
    }

    it("should topoff the delegated data credits", async () => {
      await createAtaAndTransfer(
        provider,
        hntMint,
        10000000000,
        me,
        autoTopOff
      );
      await new Promise((resolve) => setTimeout(resolve, 3000));
      await runAllTasks();
      const delegatedDataCreditsAcc =
        await dcProgram.account.delegatedDataCreditsV0.fetch(
          delegatedDataCredits
        );
      const escrow = delegatedDataCreditsAcc.escrowAccount;
      const escrowBalance = await getAccount(provider.connection, escrow);
      expect(Number(escrowBalance.amount)).to.equal(10000000);
    });

    it("should trigger DCA when HNT is below threshold", async () => {
      // Setup: We want exactly 2 DCA swaps with 1 second interval
      // to bring HNT balance from 10 HNT to exactly 30 HNT (threshold)
      const startingHnt = new anchor.BN(10_00000000); // 10 HNT starting balance
      const hntThreshold = new anchor.BN(30_00000000); // 30 HNT threshold
      const hntNeeded = hntThreshold.sub(startingHnt); // 20 HNT needed
      const numOrders = 2;
      const dcaIntervalSeconds = new anchor.BN(1); // 1 second between swaps

      // Fetch oracle prices to calculate exact swap amounts needed
      const { PythSolanaReceiver } = await import(
        "@pythnetwork/pyth-solana-receiver"
      );
      const pythReceiver = new PythSolanaReceiver({
        connection: provider.connection,
        wallet: provider.wallet as anchor.Wallet,
      });

      const inputPriceUpdate =
        await pythReceiver.receiver.account.priceUpdateV2.fetch(
          USDC_PRICE_FEED
        );
      const outputPriceUpdate =
        await pythReceiver.receiver.account.priceUpdateV2.fetch(HNT_PRICE_FEED);

      console.log(
        `Input (USDC) Price: ${inputPriceUpdate.priceMessage.price.toString()} (expo: ${
          inputPriceUpdate.priceMessage.exponent
        })`
      );
      console.log(
        `Output (HNT) Price: ${outputPriceUpdate.priceMessage.price.toString()} (expo: ${
          outputPriceUpdate.priceMessage.exponent
        })`
      );

      // Calculate required input amount per swap to get exactly hntNeeded/numOrders HNT per swap
      // Formula: outputAmount = inputAmount * (inputPrice / outputPrice)
      // (dollars / dollars) / (dollars / hnt) = hnt / dollars
      // So: inputAmount = outputAmount * (outputPrice / inputPrice)
      const hntPerSwap = hntNeeded.divn(numOrders); // 10 HNT per swap

      const inputPrice = inputPriceUpdate.priceMessage.price;
      const outputPrice = outputPriceUpdate.priceMessage.price;
      const expoDiff =
        inputPriceUpdate.priceMessage.exponent -
        outputPriceUpdate.priceMessage.exponent;

      let dcaSwapAmount: anchor.BN;
      if (expoDiff > 0) {
        dcaSwapAmount = hntPerSwap
          .mul(outputPrice)
          .div(inputPrice)
          .div(new anchor.BN(10).pow(new anchor.BN(Math.abs(expoDiff))))
          // Decimal difference between USDC and HNT
          .div(new anchor.BN(100))
          .add(new anchor.BN(1));
      } else if (expoDiff < 0) {
        dcaSwapAmount = hntPerSwap
          .mul(outputPrice)
          .div(inputPrice)
          .mul(new anchor.BN(10).pow(new anchor.BN(Math.abs(expoDiff))))
          // Decimal difference between USDC and HNT
          .div(new anchor.BN(100))
          .add(new anchor.BN(1));
      } else {
        dcaSwapAmount = hntPerSwap
          .mul(outputPrice)
          .div(inputPrice)
          // Decimal difference between USDC and HNT
          .div(new anchor.BN(100))
          .add(new anchor.BN(1));
      }

      console.log(
        `Calculated DCA swap amount: ${dcaSwapAmount.toString()} dcaMint tokens per order`
      );
      console.log(
        `Expected HNT per swap: ${hntPerSwap.toString()} (${
          hntPerSwap.toNumber() / 100000000
        } HNT)`
      );

      // Update the existing auto topoff with the specific DCA parameters for this test
      const taskQueueAcc2 = await tuktukProgram.account.taskQueueV0.fetch(
        taskQueue
      );
      const existingAccount = await program.account.autoTopOffV0.fetch(
        autoTopOff
      );
      const taskRentRefund = (
        await tuktukProgram.account.taskV0.fetch(existingAccount.nextTask)
      ).rentRefund;
      const hntTaskRentRefund = (
        await tuktukProgram.account.taskV0.fetch(existingAccount.nextHntTask)
      ).rentRefund;
      const [nextHntTask2, nextTask2] = nextAvailableTaskIds(
        taskQueueAcc2.taskBitmap,
        2,
        false
      );

      // Update the auto topoff with specific DCA configuration for this test
      const now = new Date();
      let nextSeconds = now.getSeconds() + 2;
      let nextMinutes = now.getMinutes();
      if (nextSeconds > 59) {
        nextSeconds = 0 + (nextSeconds - 59);
        nextMinutes = now.getMinutes() + 1;
      }

      await program.methods
        .updateAutoTopOffV0({
          schedule: `${nextSeconds} ${nextMinutes} * * * *`, // Run in 2 seconds
          threshold: new anchor.BN(0), // No dc threshold or it'll mess with our expected HNT
          hntPriceOracle: new PublicKey(
            "4DdmDswskDxXGpwHrXUfn2CNUm9rt21ac79GHNTN3J33"
          ),
          hntThreshold,
          dcaSwapAmount,
          dcaIntervalSeconds,
          dcaInputPriceOracle: USDC_PRICE_FEED,
        })
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({ units: 1400000 }),
        ])
        .accounts({
          payer: me,
          autoTopOff,
          taskRentRefund,
          hntTaskRentRefund,
          dcaMint: dcaMint,
        })
        .rpc({ skipPreflight: true });

      // Schedule new tasks with DCA configuration
      await program.methods
        .scheduleTaskV0({
          taskId: nextTask2,
          hntTaskId: nextHntTask2,
        })
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({ units: 1400000 }),
        ])
        .accounts({
          payer: me,
          autoTopOff,
          task: taskKey(taskQueue, nextTask2)[0],
          hntTask: taskKey(taskQueue, nextHntTask2)[0],
        })
        .rpc({ skipPreflight: true });

      // Fund with exactly the starting HNT amount (below threshold)
      await createAtaAndTransfer(
        provider,
        hntMint,
        startingHnt.toNumber(),
        me,
        autoTopOff
      );

      // Fund with enough DCA mint tokens for exactly 2 swaps
      const totalDcaMintNeeded = dcaSwapAmount.muln(numOrders);
      await createAtaAndTransfer(
        provider,
        dcaMint,
        totalDcaMintNeeded.toNumber(),
        me,
        autoTopOff
      );

      console.log("Waiting for scheduled topoff with DCA...");
      await new Promise((resolve) => setTimeout(resolve, 4000));

      const hntAccountBefore = await getAccount(
        provider.connection,
        getAssociatedTokenAddressSync(hntMint, autoTopOff, true)
      );
      console.log(`HNT balance before topoff: ${hntAccountBefore.amount}`);
      expect(hntAccountBefore.amount.toString()).to.equal(
        startingHnt.toString(),
        "Starting HNT balance should be exactly 10 HNT"
      );

      // Wait to be scheduled
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Run the topoff task which should initialize the DCA
      await runAllTasks();

      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Run first DCA swap
      await runAllTasks();

      const hntAccountAfterFirstSwap = await getAccount(
        provider.connection,
        getAssociatedTokenAddressSync(hntMint, autoTopOff, true)
      );
      const expectedAfterFirstSwap = startingHnt.add(hntPerSwap);
      // Allow for 1 bone tolerance due to rounding in DCA calculations
      const actualAmount = new anchor.BN(
        hntAccountAfterFirstSwap.amount.toString()
      );
      console.log(`Actual amount after first swap: ${actualAmount.toString()}`);
      console.log(
        `Expected amount after first swap: ${expectedAfterFirstSwap.toString()}`
      );
      const difference = actualAmount.gt(expectedAfterFirstSwap)
        ? actualAmount.sub(expectedAfterFirstSwap)
        : expectedAfterFirstSwap.sub(actualAmount);
      expect(difference.toNumber()).to.be.lessThanOrEqual(
        1,
        "After first swap, should have approximately 10 HNT (allowing for 1 bone rounding)"
      );

      // Wait for second DCA swap (1 second interval)
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Run second DCA swap
      await runAllTasks();

      // Check that HNT balance is now at or above the threshold (allowing for rounding)
      const hntAccountFinal = await getAccount(
        provider.connection,
        getAssociatedTokenAddressSync(hntMint, autoTopOff, true)
      );
      console.log(
        `HNT balance after second swap: ${
          hntAccountFinal.amount
        } (expected: ${hntThreshold.toString()})`
      );
      const finalAmount = new anchor.BN(hntAccountFinal.amount.toString());
      // Allow for 2 bones tolerance - the DCA should be at or above threshold
      expect(finalAmount.gte(hntThreshold.sub(new anchor.BN(2)))).to.equal(
        true,
        "After two swaps, HNT should be at or above threshold (allowing for 1 bone rounding)"
      );

      // Verify DCA mint tokens were fully consumed
      const dcaMintAccountFinal = await getAccount(
        provider.connection,
        getAssociatedTokenAddressSync(dcaMint, autoTopOff, true)
      );
      console.log(
        `DCA mint balance after swaps: ${dcaMintAccountFinal.amount}`
      );
      expect(dcaMintAccountFinal.amount.toString()).to.equal(
        "0",
        "All DCA mint tokens should be consumed"
      );
    });

    it("should close the auto topoff", async () => {
      await program.methods
        .closeAutoTopOffV0()
        .accounts({
          autoTopOff,
          rentRefund: me,
        })
        .rpc({ skipPreflight: true });

      const autoTopOffAcc = await program.account.autoTopOffV0.fetchNullable(
        autoTopOff
      );
      expect(autoTopOffAcc).to.be.null;

      const escrow = await provider.connection.getAccountInfo(
        getAssociatedTokenAddressSync(dcMint, autoTopOff, true)
      );
      expect(escrow).to.be.null;

      const dc = await provider.connection.getAccountInfo(
        getAssociatedTokenAddressSync(dcMint, autoTopOff, true)
      );
      expect(dc).to.be.null;
    });
  });
});
