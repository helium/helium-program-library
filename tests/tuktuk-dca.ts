import * as anchor from "@coral-xyz/anchor"
import { BN, Program } from "@coral-xyz/anchor"
import { customSignerKey, init as initTuktuk, nextAvailableTaskIds, taskKey, taskQueueAuthorityKey, taskQueueKey, taskQueueNameMappingKey, tuktukConfigKey } from "@helium/tuktuk-sdk"
// @ts-ignore
import { createAtaAndMint, sendInstructions } from "@helium/spl-utils"
import { Tuktuk } from "@helium/tuktuk-idls/lib/types/tuktuk"
import { PythSolanaReceiver } from "@pythnetwork/pyth-solana-receiver"
import { createMint, getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token"
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js"
import { expect } from "chai"
import { FastifyInstance } from "fastify"
import { dcaKey, init, queueAuthorityKey } from "../packages/tuktuk-dca-sdk/src"
import { TuktukDca } from "../target/types/tuktuk_dca"
import { calculateExpectedOutput, createDcaServer, runAllTasks as runAllTasksUtil } from "./utils/dca-test-server"
import { ensureTuktukDcaIdl } from "./utils/fixtures"

export const ANCHOR_PATH = "anchor"

// Pyth Solana Receiver sponsored price feed addresses on devnet
// These are PriceUpdateV2 accounts, not Hermes feed IDs
// Get the latest addresses from: https://www.pyth.network/developers/price-feed-ids
export const USDC_PRICE_FEED = new PublicKey("Dpw1EAVrSB1ibxiDQyTAW6Zip3J4Btk2x4SgApQCeFbX") // USDC/USD
export const HNT_PRICE_FEED = new PublicKey("4DdmDswskDxXGpwHrXUfn2CNUm9rt21ac79GHNTN3J33") // HNT/USD

describe("tuktuk-dca", () => {
  anchor.setProvider(anchor.AnchorProvider.local("http://127.0.0.1:8899"))

  const provider = anchor.getProvider() as anchor.AnchorProvider
  const me = provider.wallet.publicKey

  let taskQueueName = `test-${Math.random().toString(36).substring(2, 15)}`
  let program: Program<TuktukDca>
  let tuktukProgram: Program<Tuktuk>
  let usdcMint: PublicKey
  let hntMint: PublicKey
  const tuktukConfig: PublicKey = tuktukConfigKey()[0]
  const queueAuthority = queueAuthorityKey()[0]

  let taskQueue: PublicKey
  let dcaServer: FastifyInstance
  let dcaSigner: Keypair

  before(async () => {
    await ensureTuktukDcaIdl()
    program = await init(provider)
    tuktukProgram = await initTuktuk(provider)

    // DCA signer will also be the swap source for simplicity
    dcaSigner = Keypair.generate()

    await sendInstructions(provider, [
      SystemProgram.transfer({
        fromPubkey: me,
        toPubkey: dcaSigner.publicKey,
        lamports: LAMPORTS_PER_SOL,
      }),
    ])

    const config = await tuktukProgram.account.tuktukConfigV0.fetch(tuktukConfig)
    const nextTaskQueueId = config.nextTaskQueueId
    taskQueue = taskQueueKey(tuktukConfig, nextTaskQueueId)[0]

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
        taskQueueNameMapping: taskQueueNameMappingKey(tuktukConfig, taskQueueName)[0],
      })
      .rpc({ skipPreflight: true })

    await tuktukProgram.methods
      .addQueueAuthorityV0()
      .accounts({
        taskQueue,
        payer: me,
        queueAuthority,
      })
      .rpc({ skipPreflight: true })

    // Create test mints
    usdcMint = await createMint(
      provider.connection,
      (provider.wallet as anchor.Wallet).payer,
      me,
      me,
      6 // USDC decimals
    )

    hntMint = await createMint(
      provider.connection,
      (provider.wallet as anchor.Wallet).payer,
      me,
      me,
      8 // HNT decimals
    )

    // Create PDA for swap source (similar to claim_payer in distributor-oracle)
    const [swapPayer] = customSignerKey(taskQueue, [Buffer.from("swap_payer")])

    // Fund the swap payer PDA
    await sendInstructions(provider, [
      SystemProgram.transfer({
        fromPubkey: me,
        toPubkey: swapPayer,
        lamports: LAMPORTS_PER_SOL,
      }),
    ])

    // Create USDC ATA for swap payer (to receive input tokens)
    await createAtaAndMint(
      provider,
      usdcMint,
      new BN(0), // No initial USDC needed
      swapPayer
    )

    // Mint HNT to the swap payer's ATA (to provide output tokens)
    await createAtaAndMint(
      provider,
      hntMint,
      new BN(100_00000000 * 100), // Mint 10,000 HNT for testing
      swapPayer
    )

    console.log("Starting DCA server")
    dcaServer = await createDcaServer({
      program,
      provider,
      taskQueue,
      outputMint: hntMint,
      dcaSigner,
      port: 8123,
    })
    console.log("DCA server started")
  })

  after(async () => {
    if (dcaServer) {
      await dcaServer.close()
    }
  })

  describe("with an initialized dca", () => {
    const dcaIndex = 0
    let dca: PublicKey
    let inputAccount: PublicKey
    const destinationKeypair = Keypair.generate()
    let destinationWallet: PublicKey = destinationKeypair.publicKey
    let destinationTokenAccount: PublicKey
    let task: PublicKey
    const numOrders = 4
    const intervalSeconds = new anchor.BN(1)
    const slippageBps = 0 // 0% slippage, we know the output
    const crankTurner = Keypair.generate()
    const dcaAuthority = Keypair.generate()

    beforeEach(async () => {
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
      ])
      dca = dcaKey(dcaAuthority.publicKey, usdcMint, hntMint, dcaIndex)[0]
      inputAccount = getAssociatedTokenAddressSync(usdcMint, dca, true)
      destinationTokenAccount = getAssociatedTokenAddressSync(hntMint, destinationWallet, true)
      await createAtaAndMint(
        provider,
        hntMint,
        new BN(0),
        destinationWallet
      )

      const taskQueueAcc = await tuktukProgram.account.taskQueueV0.fetch(taskQueue)
      const [taskId] = nextAvailableTaskIds(taskQueueAcc.taskBitmap, 1)
      task = taskKey(taskQueue, taskId)[0]

      // Mint USDC to the authority's account
      // swap_amount_per_order will be 235 USDC per order x 4 orders = 940 USDC total
      const swapAmountPerOrder = new BN(235_000000) // 235 USDC per order
      const totalAmount = swapAmountPerOrder.muln(numOrders) // 940 USDC total
      await createAtaAndMint(
        provider,
        usdcMint,
        totalAmount,
        me
      )

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
      })
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
          dcaUrl: "http://localhost:8123/dca",
          crankReward: new anchor.BN(15000),
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
          taskQueueAuthority: taskQueueAuthorityKey(taskQueue, queueAuthorityKey()[0])[0],
        })
        .signers([dcaAuthority])
        .rpc({ skipPreflight: true })

      console.log("DCA initialized", dca.toBase58())

      // Mint HNT to the DCA's destination wallet just to make sure it has some balance
      await createAtaAndMint(
        provider,
        hntMint,
        new BN(1),
        destinationWallet
      )
    })

    async function runAllTasks() {
      await runAllTasksUtil(provider, tuktukProgram, taskQueue, crankTurner)
    }

    it("executes a full DCA swap cycle through multiple runs", async () => {
      let dcaAccount = await program.account.dcaV0.fetch(dca)
      expect(dcaAccount.numOrders).to.equal(numOrders)
      expect(dcaAccount.isSwapping).to.eq(0)

      const swapAmountPerOrder = dcaAccount.swapAmountPerOrder // 235 USDC per order
      const initialInputBalance = swapAmountPerOrder.muln(numOrders) // 940 USDC total
      console.log(`Fixed swap amount per order: ${swapAmountPerOrder.toString()} USDC`)

      // Get initial payer balance (for rent refund verification)
      const initialPayerBalance = await provider.connection.getBalance(me)

      let currentInputBalance = initialInputBalance
      let totalHntReceived = new BN(1) // Start with 1 bone from initial mint

      // Fetch price updates once (they should be stable for the test)
      const pythReceiver = new PythSolanaReceiver({
        connection: provider.connection,
        wallet: provider.wallet as anchor.Wallet
      })

      const usdcPriceUpdate = await pythReceiver.receiver.account.priceUpdateV2.fetch(dcaAccount.inputPriceOracle)
      const hntPriceUpdate = await pythReceiver.receiver.account.priceUpdateV2.fetch(dcaAccount.outputPriceOracle)

      console.log(`USDC Price: ${usdcPriceUpdate.priceMessage.price.toString()} (expo: ${usdcPriceUpdate.priceMessage.exponent})`)
      console.log(`HNT Price: ${hntPriceUpdate.priceMessage.price.toString()} (expo: ${hntPriceUpdate.priceMessage.exponent})`)

      // Run through all 4 swaps
      for (let i = 0; i < numOrders; i++) {
        console.log(`\n=== DCA Swap ${i + 1}/${numOrders} ===`)

        dcaAccount = await program.account.dcaV0.fetch(dca)
        const ordersRemaining = dcaAccount.numOrders

        // Calculate expected swap amount:
        // - For all but the last order: use the fixed swap_amount_per_order
        // - For the last order: use whatever is remaining (to handle rounding)
        const expectedSwapAmount = (i === numOrders - 1) ? currentInputBalance : swapAmountPerOrder
        console.log(`Expected swap amount: ${expectedSwapAmount.toString()} USDC`)

        // Calculate expected HNT output
        const expectedHntOutput = calculateExpectedOutput(expectedSwapAmount, usdcPriceUpdate, hntPriceUpdate)
        console.log(`Expected HNT output: ${expectedHntOutput.toString()}`)

        // Wait a bit for the task to be schedulable
        await new Promise(resolve => setTimeout(resolve, 2000))

        // Run all tasks
        await runAllTasks()

        // Verify state after swap
        const dcaAccountNow = await program.account.dcaV0.fetchNullable(dca)
        if (dcaAccountNow) {
          expect(dcaAccountNow.isSwapping).to.eq(0)
          expect(dcaAccountNow.numOrders).to.equal(numOrders - (i + 1))
          expect(dcaAccountNow.preSwapDestinationBalance.toNumber()).to.equal(0)
        }

        // Check balances
        const inputBalanceAfter = dcaAccountNow ? (await getAccount(provider.connection, inputAccount)).amount : new BN(0)
        const hntBalance = (await getAccount(provider.connection, destinationTokenAccount)).amount

        // Update tracking
        currentInputBalance = currentInputBalance.sub(expectedSwapAmount)
        totalHntReceived = totalHntReceived.add(expectedHntOutput)

        console.log(`Input balance after swap ${i + 1}: ${inputBalanceAfter.toString()}`)
        console.log(`HNT balance after swap ${i + 1}: ${hntBalance.toString()}`)
        console.log(`Expected input remaining: ${currentInputBalance.toString()}`)
        console.log(`Expected total HNT: ${totalHntReceived.toString()}`)

        // Verify balances match expectations
        expect(inputBalanceAfter.toString()).to.equal(currentInputBalance.toString())
        expect(hntBalance.toString()).to.equal(totalHntReceived.toString())

        if (i === numOrders - 1) {
          console.log(`✅ Final swap complete - all USDC swapped!`)
          expect(inputBalanceAfter.toString()).to.equal("0")

          // Verify accounts are closed
          const dcaAccountInfo = await provider.connection.getAccountInfo(dca)
          const inputAccountInfo = await provider.connection.getAccountInfo(inputAccount)
          expect(dcaAccountInfo).to.be.null
          expect(inputAccountInfo).to.be.null
          console.log(`✅ DCA account and input account closed`)

          // Verify rent was refunded
          const finalPayerBalance = await provider.connection.getBalance(me)
          expect(finalPayerBalance).to.be.greaterThan(initialPayerBalance)
          console.log(`✅ Rent refunded to payer (initial: ${initialPayerBalance}, final: ${finalPayerBalance})`)
        } else {
          console.log(`✅ Swap ${i + 1} complete, ${ordersRemaining - 1} orders remaining`)
        }
      }

      console.log(`\n=== DCA Complete ===`)
      console.log(`Total USDC swapped: ${initialInputBalance.toString()}`)
      console.log(`Total HNT received: ${totalHntReceived.toString()}`)
    })

    it("closes a DCA", async () => {
      // Close DCA
      await program.methods
        .closeDcaV0()
        .accountsPartial({
          dca,
          authority: dcaAuthority.publicKey,
        })
        .signers([dcaAuthority])
        .rpc({ skipPreflight: true })

      // Verify DCA is closed
      const dcaAccount = await program.account.dcaV0.fetchNullable(dca)
      expect(dcaAccount).to.be.null
    })
  })
})

