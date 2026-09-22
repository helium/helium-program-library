import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import {
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
// @ts-ignore
import { createAtaAndMint, sendInstructions } from "@helium/spl-utils";
import { Tuktuk } from "@helium/tuktuk-idls/lib/types/tuktuk";
import { PythSolanaReceiver } from "@pythnetwork/pyth-solana-receiver";
import {
  createMint,
  getAccount,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  ComputeBudgetProgram,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { expect } from "chai";
import { FastifyInstance } from "fastify";
import {
  dcaKey,
  init,
  queueAuthorityKey,
} from "../packages/tuktuk-dca-sdk/src";
import { TuktukDca } from "../target/types/tuktuk_dca";
import {
  calculateExpectedOutput,
  createDcaServer,
  DCA_TEST_SIGNER,
  DCA_TEST_URL,
  runAllTasks as runAllTasksUtil,
  setDcaServerRepayBps,
  setDcaServerSkipLend,
} from "./utils/dca-test-server";
import { expectAnchorError } from "./utils/expectAnchorError";
import { ensureTuktukDcaIdl } from "./utils/fixtures";

export const ANCHOR_PATH = "anchor";

// Pyth pro-receiver (rec2...) sponsored PriceUpdateV2 accounts, cloned from
// mainnet in Anchor.toml. These are PriceUpdateV2 accounts, not Hermes feed IDs.
export const USDC_PRICE_FEED = new PublicKey(
  "6HAuqASbHEh4w4REJEUUUCginTLfj1kwCh215ZLtMkrT",
); // USDC/USD
export const HNT_PRICE_FEED = new PublicKey(
  "He5mhwVQQNvjFxqjEjFDb7enJWFwFJ7Rq7zknqBz89A5",
); // HNT/USD

describe("tuktuk-dca", () => {
  anchor.setProvider(anchor.AnchorProvider.local("http://127.0.0.1:8899"));

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const me = provider.wallet.publicKey;

  let taskQueueName = `test-${Math.random().toString(36).substring(2, 15)}`;
  let program: Program<TuktukDca>;
  let tuktukProgram: Program<Tuktuk>;
  let usdcMint: PublicKey;
  let hntMint: PublicKey;
  const tuktukConfig: PublicKey = tuktukConfigKey()[0];
  const queueAuthority = queueAuthorityKey()[0];

  let taskQueue: PublicKey;
  let dcaServer: FastifyInstance;
  let dcaSigner: Keypair;

  before(async () => {
    await ensureTuktukDcaIdl();
    program = await init(provider);
    tuktukProgram = await initTuktuk(provider);

    // DCA signer will also be the swap source for simplicity
    dcaSigner = DCA_TEST_SIGNER;

    await sendInstructions(provider, [
      SystemProgram.transfer({
        fromPubkey: me,
        toPubkey: dcaSigner.publicKey,
        lamports: LAMPORTS_PER_SOL,
      }),
    ]);

    const config =
      await tuktukProgram.account.tuktukConfigV0.fetch(tuktukConfig);
    const nextTaskQueueId = config.nextTaskQueueId;
    taskQueue = taskQueueKey(tuktukConfig, nextTaskQueueId)[0];

    await tuktukProgram.methods
      .initializeTaskQueueV0({
        name: taskQueueName,
        minCrankReward: new anchor.BN(1),
        capacity: 1000,
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
          taskQueueName,
        )[0],
      })
      .rpc({ skipPreflight: true });

    await tuktukProgram.methods
      .addQueueAuthorityV0()
      .accounts({
        taskQueue,
        payer: me,
        queueAuthority,
      })
      .rpc({ skipPreflight: true });

    // Create test mints
    usdcMint = await createMint(
      provider.connection,
      (provider.wallet as anchor.Wallet).payer,
      me,
      me,
      6, // USDC decimals
    );

    hntMint = await createMint(
      provider.connection,
      (provider.wallet as anchor.Wallet).payer,
      me,
      me,
      8, // HNT decimals
    );

    // Create PDA for swap source (similar to claim_payer in distributor-oracle)
    const [swapPayer] = customSignerKey(taskQueue, [
      Buffer.from("dca_swap_payer"),
    ]);

    // Fund the swap payer PDA
    await sendInstructions(provider, [
      SystemProgram.transfer({
        fromPubkey: me,
        toPubkey: swapPayer,
        lamports: LAMPORTS_PER_SOL,
      }),
    ]);

    // Create USDC ATA for swap payer (to receive input tokens)
    await createAtaAndMint(
      provider,
      usdcMint,
      new BN(0), // No initial USDC needed
      swapPayer,
    );

    // Mint HNT to the swap payer's ATA (to provide output tokens)
    await createAtaAndMint(
      provider,
      hntMint,
      new BN(100_00000000 * 100), // Mint 10,000 HNT for testing
      swapPayer,
    );

    console.log("Starting DCA server");
    dcaServer = await createDcaServer({
      program,
      provider,
      outputMint: hntMint,
      dcaSigner,
    });
    console.log("DCA server started");
  });

  after(async () => {
    if (dcaServer) {
      await dcaServer.close();
    }
  });

  describe("the pinned remote task", () => {
    const rejectedIndex = 9;

    async function initializeWith(overrides: {
      dcaSigner?: PublicKey;
      dcaUrl?: string;
      slippageBpsFromOracle?: number;
    }) {
      const authority = Keypair.generate();
      await sendInstructions(provider, [
        SystemProgram.transfer({
          fromPubkey: me,
          toPubkey: authority.publicKey,
          lamports: LAMPORTS_PER_SOL,
        }),
      ]);
      const destinationWallet = Keypair.generate().publicKey;
      await createAtaAndMint(provider, hntMint, new BN(0), destinationWallet);
      const swapAmountPerOrder = new BN(1_000000);
      await createAtaAndMint(provider, usdcMint, swapAmountPerOrder, me);

      const taskQueueAcc =
        await tuktukProgram.account.taskQueueV0.fetch(taskQueue);
      const [taskId] = nextAvailableTaskIds(
        taskQueueAcc.taskBitmap,
        1,
        false,
        taskQueueAcc.capacity,
      );

      return program.methods
        .initializeDcaV0({
          index: rejectedIndex,
          numOrders: 1,
          swapAmountPerOrder,
          intervalSeconds: new anchor.BN(1),
          slippageBpsFromOracle: overrides.slippageBpsFromOracle ?? 0,
          taskId,
          dcaSigner: overrides.dcaSigner ?? DCA_TEST_SIGNER.publicKey,
          dcaUrl: overrides.dcaUrl ?? DCA_TEST_URL,
        })
        .accountsPartial({
          core: {
            rentPayer: me,
            dcaPayer: me,
            authority: authority.publicKey,
            inputMint: usdcMint,
            outputMint: hntMint,
            inputPriceOracle: USDC_PRICE_FEED,
            outputPriceOracle: HNT_PRICE_FEED,
            destinationTokenAccount: getAssociatedTokenAddressSync(
              hntMint,
              destinationWallet,
              true,
            ),
            taskQueue,
          },
          task: taskKey(taskQueue, taskId)[0],
          queueAuthority,
          taskQueueAuthority: taskQueueAuthorityKey(taskQueue, queueAuthority)[0],
        })
        .signers([authority])
        .rpc({ skipPreflight: false });
    }


    it("rejects a signer other than the pinned one", async () => {
      await expectAnchorError(
        initializeWith({ dcaSigner: Keypair.generate().publicKey }),
        "InvalidDcaSigner",
      );
    });

    it("rejects a url whose host only shares the pinned prefix", async () => {
      await expectAnchorError(
        initializeWith({ dcaUrl: `${DCA_TEST_URL}.other.example` }),
        "InvalidDcaUrl",
      );
    });

    it("rejects a url for another host", async () => {
      await expectAnchorError(
        initializeWith({ dcaUrl: "http://other.example/dca" }),
        "InvalidDcaUrl",
      );
    });

    it("rejects slippage of a whole 100%", async () => {
      await expectAnchorError(
        initializeWith({ slippageBpsFromOracle: 10000 }),
        "InvalidSlippage",
      );
    });
  });

  describe("with an initialized dca", () => {
    const dcaIndex = 0;
    let dca: PublicKey;
    let inputAccount: PublicKey;
    const destinationKeypair = Keypair.generate();
    let destinationWallet: PublicKey = destinationKeypair.publicKey;
    let destinationTokenAccount: PublicKey;
    let task: PublicKey;
    // Both overridden by the large-order suite below, which needs an order whose oracle
    // arithmetic does not fit in 64 bits.
    let numOrders = 4;
    let swapAmountPerOrder = new BN(235_000000); // 235 USDC per order
    const intervalSeconds = new anchor.BN(1);
    // Overridden by the shortfall suite below, which needs a floor the fake swap can miss.
    let slippageBps = 0; // 0% slippage, we know the output
    const crankTurner = Keypair.generate();
    // A fresh authority per test, so each one gets its own DCA at `dcaIndex` whether or not the
    // test before it left its DCA open.
    let dcaAuthority: Keypair;

    beforeEach(async () => {
      dcaAuthority = Keypair.generate();
      await sendInstructions(provider, [
        SystemProgram.transfer({
          fromPubkey: me,
          toPubkey: crankTurner.publicKey,
          lamports: LAMPORTS_PER_SOL,
        }),
        SystemProgram.transfer({
          fromPubkey: me,
          toPubkey: dcaAuthority.publicKey,
          lamports: LAMPORTS_PER_SOL,
        }),
      ]);
      dca = dcaKey(dcaAuthority.publicKey, usdcMint, hntMint, dcaIndex)[0];
      inputAccount = getAssociatedTokenAddressSync(usdcMint, dca, true);
      destinationTokenAccount = getAssociatedTokenAddressSync(
        hntMint,
        destinationWallet,
        true,
      );
      await createAtaAndMint(provider, hntMint, new BN(0), destinationWallet);

      const taskQueueAcc =
        await tuktukProgram.account.taskQueueV0.fetch(taskQueue);
      const [taskId] = nextAvailableTaskIds(
        taskQueueAcc.taskBitmap,
        1,
        false,
        taskQueueAcc.capacity,
      );
      task = taskKey(taskQueue, taskId)[0];

      // Mint USDC to the authority's account: swap_amount_per_order per order, numOrders of them
      const totalAmount = swapAmountPerOrder.muln(numOrders);
      await createAtaAndMint(provider, usdcMint, totalAmount, me);

      console.log("Initializing DCA", {
        crankTurner: crankTurner.publicKey.toBase58(),
        payer: me.toBase58(),
        authority: dcaAuthority.publicKey.toBase58(),
        inputMint: usdcMint.toBase58(),
        outputMint: hntMint.toBase58(),
        inputPriceOracle: USDC_PRICE_FEED.toBase58(),
        outputPriceOracle: HNT_PRICE_FEED.toBase58(),
        destinationWallet: destinationWallet.toBase58(),
        task: task.toBase58(),
        taskQueue: taskQueue.toBase58(),
        swapAmountPerOrder: swapAmountPerOrder.toString(),
      });
      // Initialize DCA
      await program.methods
        .initializeDcaV0({
          index: dcaIndex,
          numOrders,
          swapAmountPerOrder,
          intervalSeconds,
          slippageBpsFromOracle: slippageBps,
          taskId,
          dcaSigner: dcaSigner.publicKey,
          dcaUrl: DCA_TEST_URL,
        })
        .accountsPartial({
          core: {
            rentPayer: me,
            dcaPayer: me,
            authority: dcaAuthority.publicKey,
            inputMint: usdcMint,
            outputMint: hntMint,
            inputPriceOracle: USDC_PRICE_FEED,
            outputPriceOracle: HNT_PRICE_FEED,
            destinationTokenAccount,
            taskQueue,
          },
          task,
          queueAuthority: queueAuthorityKey()[0],
          taskQueueAuthority: taskQueueAuthorityKey(
            taskQueue,
            queueAuthorityKey()[0],
          )[0],
        })
        .signers([dcaAuthority])
        .rpc({ skipPreflight: true });

      console.log("DCA initialized", dca.toBase58());

      // Mint HNT to the DCA's destination wallet just to make sure it has some balance
      await createAtaAndMint(provider, hntMint, new BN(1), destinationWallet);
    });

    async function runAllTasks() {
      return runAllTasksUtil(provider, tuktukProgram, taskQueue, crankTurner);
    }

    /** The deepest `Program … invoke [n]` any program reached in this transaction. */
    async function maxCpiDepth(signature: string): Promise<number> {
      const tx = await provider.connection.getTransaction(signature, {
        maxSupportedTransactionVersion: 0,
        commitment: "confirmed",
      });
      const logs = tx?.meta?.logMessages ?? [];
      expect(logs.length, `no logs for ${signature}`).to.be.greaterThan(0);
      return Math.max(
        ...logs
          .filter((l) => l.includes(" invoke ["))
          .map((l) => Number(l.split("invoke [")[1].replace("]", ""))),
      );
    }

    it("executes a full DCA swap cycle through multiple runs", async () => {
      let dcaAccount = await program.account.dcaV0.fetch(dca);
      expect(dcaAccount.numOrders).to.equal(numOrders);
      expect(dcaAccount.isSwapping).to.eq(0);

      const swapAmountPerOrder = dcaAccount.swapAmountPerOrder; // 235 USDC per order
      const initialInputBalance = swapAmountPerOrder.muln(numOrders); // 940 USDC total
      console.log(
        `Fixed swap amount per order: ${swapAmountPerOrder.toString()} USDC`,
      );

      // Get initial payer balance (for rent refund verification)
      const initialPayerBalance = await provider.connection.getBalance(me);

      let currentInputBalance = initialInputBalance;
      let totalHntReceived = new BN(1); // Start with 1 bone from initial mint

      // Fetch price updates once (they should be stable for the test)
      const pythReceiver = new PythSolanaReceiver({
        connection: provider.connection,
        wallet: provider.wallet as anchor.Wallet,
      });

      const usdcPriceUpdate =
        await pythReceiver.receiver.account.priceUpdateV2.fetch(
          dcaAccount.inputPriceOracle,
        );
      const hntPriceUpdate =
        await pythReceiver.receiver.account.priceUpdateV2.fetch(
          dcaAccount.outputPriceOracle,
        );

      console.log(
        `USDC Price: ${usdcPriceUpdate.priceMessage.price.toString()} (expo: ${usdcPriceUpdate.priceMessage.exponent})`,
      );
      console.log(
        `HNT Price: ${hntPriceUpdate.priceMessage.price.toString()} (expo: ${hntPriceUpdate.priceMessage.exponent})`,
      );

      // Run through all 4 swaps
      for (let i = 0; i < numOrders; i++) {
        console.log(`\n=== DCA Swap ${i + 1}/${numOrders} ===`);

        dcaAccount = await program.account.dcaV0.fetch(dca);
        const ordersRemaining = dcaAccount.numOrders;

        // Calculate expected swap amount:
        // - For all but the last order: use the fixed swap_amount_per_order
        // - For the last order: use whatever is remaining (to handle rounding)
        const expectedSwapAmount =
          i === numOrders - 1 ? currentInputBalance : swapAmountPerOrder;
        console.log(
          `Expected swap amount: ${expectedSwapAmount.toString()} USDC`,
        );

        // Calculate expected HNT output
        const expectedHntOutput = calculateExpectedOutput(
          expectedSwapAmount,
          usdcPriceUpdate,
          hntPriceUpdate,
          6,
          8,
        );
        console.log(`Expected HNT output: ${expectedHntOutput.toString()}`);

        // Wait a bit for the task to be schedulable
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Run all tasks
        const runSignatures = await runAllTasks();

        // A DCA run spends CPI stack frames, and the runtime allows five. Here the wrapped
        // callee is the token program, which calls nothing further, so the run bottoms out at
        // three: run_task_v0, then swap_v0, then the token program. Mainnet spends two more,
        // because a Jupiter route is three frames deep on its own (Jupiter, the AMM, the token
        // program) where this stand-in is one -- which puts the real chain at the limit with
        // nothing to spare. A frame added anywhere on this side is therefore a frame the real
        // route does not have, so this number is pinned rather than bounded.
        // An empty list would make the loop below a no-op and the assertion vacuous.
        expect(
          runSignatures.length,
          "no task ran, so the depth assertion would assert nothing",
        ).to.be.greaterThan(0);
        for (const signature of runSignatures) {
          expect(
            await maxCpiDepth(signature),
            `CPI depth changed for ${signature}. Mainnet runs this chain two frames deeper, ` +
              `and the runtime limit is five, so any increase here overflows a real route.`,
          ).to.equal(3);
        }

        // Verify state after swap
        const dcaAccountNow = await program.account.dcaV0.fetchNullable(dca);
        if (dcaAccountNow) {
          expect(dcaAccountNow.isSwapping).to.eq(0);
          expect(dcaAccountNow.numOrders).to.equal(numOrders - (i + 1));
          expect(dcaAccountNow.preSwapDestinationBalance.toNumber()).to.equal(
            0,
          );
        }

        // Check balances
        const inputBalanceAfter = dcaAccountNow
          ? (await getAccount(provider.connection, inputAccount)).amount
          : new BN(0);
        const hntBalance = (
          await getAccount(provider.connection, destinationTokenAccount)
        ).amount;

        // Update tracking
        currentInputBalance = currentInputBalance.sub(expectedSwapAmount);
        totalHntReceived = totalHntReceived.add(expectedHntOutput);

        console.log(
          `Input balance after swap ${i + 1}: ${inputBalanceAfter.toString()}`,
        );
        console.log(
          `HNT balance after swap ${i + 1}: ${hntBalance.toString()}`,
        );
        console.log(
          `Expected input remaining: ${currentInputBalance.toString()}`,
        );
        console.log(`Expected total HNT: ${totalHntReceived.toString()}`);

        // Verify balances match expectations
        expect(inputBalanceAfter.toString()).to.equal(
          currentInputBalance.toString(),
        );
        expect(hntBalance.toString()).to.equal(totalHntReceived.toString());

        if (i === numOrders - 1) {
          console.log(`✅ Final swap complete - all USDC swapped!`);
          expect(inputBalanceAfter.toString()).to.equal("0");

          // Verify accounts are closed
          const dcaAccountInfo = await provider.connection.getAccountInfo(dca);
          const inputAccountInfo =
            await provider.connection.getAccountInfo(inputAccount);
          expect(dcaAccountInfo).to.be.null;
          expect(inputAccountInfo).to.be.null;
          console.log(`✅ DCA account and input account closed`);

          // Verify rent was refunded
          const finalPayerBalance = await provider.connection.getBalance(me);
          expect(finalPayerBalance).to.be.greaterThan(initialPayerBalance);
          console.log(
            `✅ Rent refunded to payer (initial: ${initialPayerBalance}, final: ${finalPayerBalance})`,
          );
        } else {
          console.log(
            `✅ Swap ${i + 1} complete, ${ordersRemaining - 1} orders remaining`,
          );
        }
      }

      console.log(`\n=== DCA Complete ===`);
      console.log(`Total USDC swapped: ${initialInputBalance.toString()}`);
      console.log(`Total HNT received: ${totalHntReceived.toString()}`);
    });

    it("closes a DCA", async () => {
      // Close DCA
      await program.methods
        .closeDcaV0()
        .accountsPartial({
          dca,
          authority: dcaAuthority.publicKey,
        })
        .signers([dcaAuthority])
        .rpc({ skipPreflight: true });

      // Verify DCA is closed
      const dcaAccount = await program.account.dcaV0.fetchNullable(dca);
      expect(dcaAccount).to.be.null;
    });

    it("refuses a close that sends the input somewhere other than the authority's account", async () => {
      const stranger = Keypair.generate().publicKey;
      await createAtaAndMint(provider, usdcMint, new BN(0), stranger);

      await expectAnchorError(
        program.methods
          .closeDcaV0()
          .accountsPartial({
            dca,
            authority: dcaAuthority.publicKey,
            authorityInputAccount: getAssociatedTokenAddressSync(
              usdcMint,
              stranger,
              true,
            ),
          })
          .signers([dcaAuthority])
          .rpc(),
        "ConstraintTokenOwner",
      );
    });

    it("refuses a check_repay called outside the DCA's own task", async () => {
      await expectAnchorError(
        program.methods
          .checkRepayV0({})
          .accountsPartial({ dca })
          .rpc(),
        "InvalidCpiContext",
      );
    });

    // swap_v0 runs only as a CPI from the DCA's own run_task_v0, the same binding
    // check_repay_v0 carries. Called directly it must refuse on the binding, not on state.
    it("refuses a swap called outside a tuktuk task run", async () => {
      await expectAnchorError(
        program.methods
          .swapV0({ data: Buffer.from([]) })
          .accountsPartial({ dca })
          .rpc(),
        "InvalidCpiContext",
      );
    });

    // swap_v0 runs only in the window lend_v0 opens. The server leaves lend_v0 and
    // check_repay_v0 out of this run, so the swap is alone in the task and swap_v0's own guard
    // is the one that refuses it; with check_repay_v0 present its guard would refuse first.
    describe("when the swap runs without a lend", () => {
      before(() => {
        setDcaServerSkipLend(true);
      });

      after(() => {
        setDcaServerSkipLend(false);
      });

      it("refuses the swap", async () => {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        // Sent raw rather than through runAllTasks, which reports a failed run without the
        // logs the error name is read from. The crank turner pays, as it does there.
        const runTaskIxs = await runTask({
          program: tuktukProgram,
          task,
          crankTurner: crankTurner.publicKey,
        });
        const tx = new Transaction().add(
          ComputeBudgetProgram.setComputeUnitLimit({ units: 1400000 }),
          ...runTaskIxs,
        );
        tx.recentBlockhash = (
          await provider.connection.getLatestBlockhash("confirmed")
        ).blockhash;
        tx.feePayer = crankTurner.publicKey;
        tx.sign(crankTurner);
        await expectAnchorError(
          provider.connection.sendRawTransaction(tx.serialize()),
          "LendNotCalled",
        );
      });
    });

    // swap_v0 forwards instruction data it does not interpret, so the callee is pinned by
    // address rather than taken from that data. A TESTING build pins a different program than
    // mainnet does, so the pin itself is what this asserts, not which program it names.
    it("refuses a swap against a program other than the pinned one", async () => {
      await expectAnchorError(
        program.methods
          .swapV0({ data: Buffer.from([]) })
          .accountsPartial({ dca, swapProgram: SystemProgram.programId })
          .rpc(),
        "ConstraintAddress",
      );
    });

    describe("when the swap repays less than fair value", () => {
      before(() => {
        slippageBps = 50;
        setDcaServerRepayBps(9900);
      });

      after(() => {
        slippageBps = 0;
        setDcaServerRepayBps(10000);
      });

      it("refuses the repayment", async () => {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        // Sent raw rather than through runAllTasks, which reports a failed run without the
        // logs the error name is read from. The crank turner pays, as it does there.
        const runTaskIxs = await runTask({
          program: tuktukProgram,
          task,
          crankTurner: crankTurner.publicKey,
        });
        const tx = new Transaction().add(
          ComputeBudgetProgram.setComputeUnitLimit({ units: 1400000 }),
          ...runTaskIxs,
        );
        tx.recentBlockhash = (
          await provider.connection.getLatestBlockhash("confirmed")
        ).blockhash;
        tx.feePayer = crankTurner.publicKey;
        tx.sign(crankTurner);
        await expectAnchorError(
          provider.connection.sendRawTransaction(tx.serialize()),
          "SlippageExceeded",
        );
      });
    });

    describe("with an order too large for 64-bit intermediates", () => {
      before(() => {
        // 2,000 USDC. At an 8-decimal price and a scale of 2, the input amount times the
        // scale factor times the price passes 2^64, so the floor has to be computed wider.
        numOrders = 1;
        swapAmountPerOrder = new BN(2_000_000000);
      });

      after(() => {
        numOrders = 4;
        swapAmountPerOrder = new BN(235_000000);
      });

      it("prices the floor and settles the order", async () => {
        const before = (
          await getAccount(provider.connection, destinationTokenAccount)
        ).amount;
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // This DCA's own task only, sent raw with the crank turner paying, so a run that
        // failed to price the floor surfaces here rather than in an unrelated task.
        const runTaskIxs = await runTask({
          program: tuktukProgram,
          task,
          crankTurner: crankTurner.publicKey,
        });
        const tx = new Transaction().add(
          ComputeBudgetProgram.setComputeUnitLimit({ units: 1400000 }),
          ...runTaskIxs,
        );
        tx.recentBlockhash = (
          await provider.connection.getLatestBlockhash("confirmed")
        ).blockhash;
        tx.feePayer = crankTurner.publicKey;
        tx.sign(crankTurner);
        const signature = await provider.connection.sendRawTransaction(
          tx.serialize(),
        );
        await provider.connection.confirmTransaction(signature, "confirmed");

        const after = (
          await getAccount(provider.connection, destinationTokenAccount)
        ).amount;
        expect(Number(after - before)).to.be.greaterThan(
          0,
          "the order should have settled",
        );
        expect(
          await program.account.dcaV0.fetchNullable(dca),
          "the only order ran, so the DCA should have closed",
        ).to.be.null;
      });
    });
  });
});
