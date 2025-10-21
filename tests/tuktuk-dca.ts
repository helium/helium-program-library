import * as anchor from "@coral-xyz/anchor"
import { Program, BN } from "@coral-xyz/anchor"
import { init as initTuktuk, taskKey, taskQueueKey, taskQueueNameMappingKey, tuktukConfigKey, runTask, nextAvailableTaskIds, compileTransaction, RemoteTaskTransactionV0, customSignerKey } from "@helium/tuktuk-sdk"
// @ts-ignore
import { Tuktuk } from "@helium/tuktuk-idls/lib/types/tuktuk"
import { createMint, createTransferInstruction, getAccount, getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token"
import { ComputeBudgetProgram, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js"
import { PythSolanaReceiver } from "@pythnetwork/pyth-solana-receiver"
import { expect } from "chai"
import { execSync } from "child_process"
import { sendInstructions, createAtaAndMint } from "@helium/spl-utils"
import { init, PROGRAM_ID, dcaKey, queueAuthorityKey } from "../packages/tuktuk-dca-sdk/src"
import { TuktukDca } from "../target/types/tuktuk_dca"
import Fastify, { FastifyInstance } from "fastify"
import { sign } from "tweetnacl"
import { ensureTuktukDcaIdl } from "./utils/fixtures"

export const ANCHOR_PATH = "anchor"

// Pyth Solana Receiver sponsored price feed addresses on devnet
// These are PriceUpdateV2 accounts, not Hermes feed IDs
// Get the latest addresses from: https://www.pyth.network/developers/price-feed-ids
const USDC_PRICE_FEED = new PublicKey("Dpw1EAVrSB1ibxiDQyTAW6Zip3J4Btk2x4SgApQCeFbX") // USDC/USD
const HNT_PRICE_FEED = new PublicKey("4DdmDswskDxXGpwHrXUfn2CNUm9rt21ac79GHNTN3J33") // HNT/USD

// Calculate expected output based on oracle prices (matching check_repay_v0 logic)
function calculateExpectedOutput(
  swapAmount: BN,
  inputPriceUpdate: any,
  outputPriceUpdate: any
): BN {
  const inputPriceWithConf = inputPriceUpdate.priceMessage.price
  const outputPriceWithConf = outputPriceUpdate.priceMessage.price

  const expoDiff = inputPriceUpdate.priceMessage.exponent - outputPriceUpdate.priceMessage.exponent
  let expectedOutput: BN
  if (expoDiff > 0) {
    expectedOutput = swapAmount.mul(new BN(10).pow(new BN(Math.abs(expoDiff)))).mul(inputPriceWithConf).div(outputPriceWithConf)
  } else if (expoDiff < 0) {
    expectedOutput = swapAmount.mul(inputPriceWithConf).div(outputPriceWithConf).div(new BN(10).pow(new BN(Math.abs(expoDiff))))
  } else {
    expectedOutput = swapAmount.mul(inputPriceWithConf).div(outputPriceWithConf)
  }

  return expectedOutput
}

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

    console.log("Initializing DCA server")
    // Start simple test DCA server
    dcaServer = Fastify({ logger: false })

    dcaServer.post("/dca/:dcaKey", async (request: any, reply: any) => {
      try {
        const dca = new PublicKey(request.params.dcaKey)
        const task = new PublicKey(request.body.task)
        const taskQueuedAt = new BN(request.body.task_queued_at)

        const dcaAccount = await program.account.dcaV0.fetch(dca)

        // Get swap payer PDA
        const [swapPayer, bump] = customSignerKey(taskQueue, [Buffer.from("swap_payer")])
        const bumpBuffer = Buffer.alloc(1)
        bumpBuffer.writeUint8(bump)

        // Build instructions: lend -> swap transfer -> check_repay

        // Calculate swap amounts based on fixed swap_amount_per_order
        const inputAccountInfo = await provider.connection.getAccountInfo(dcaAccount.inputAccount)
        const inputBalance = new BN(inputAccountInfo!.data.slice(64, 72), "le")
        // For the last order, use whatever is remaining; otherwise use the fixed amount
        const swapAmount = dcaAccount.numOrders === 1 ? inputBalance : dcaAccount.swapAmountPerOrder

        // Fetch PriceUpdateV2 accounts using the Pyth SDK (matching check_repay_v0 logic)
        const pythReceiver = new PythSolanaReceiver({
          connection: provider.connection,
          wallet: provider.wallet as anchor.Wallet
        })

        const usdcPriceUpdate = await pythReceiver.receiver.account.priceUpdateV2.fetch(dcaAccount.inputPriceOracle)
        const hntPriceUpdate = await pythReceiver.receiver.account.priceUpdateV2.fetch(dcaAccount.outputPriceOracle)

        console.log(`USDC Price: ${usdcPriceUpdate.priceMessage.price.toString()} (expo: ${usdcPriceUpdate.priceMessage.exponent})`)
        console.log(`HNT Price: ${hntPriceUpdate.priceMessage.price.toString()} (expo: ${hntPriceUpdate.priceMessage.exponent})`)

        // Calculate expected output using shared function
        const expectedHntOutput = calculateExpectedOutput(swapAmount, usdcPriceUpdate, hntPriceUpdate)

        console.log(`Swap Amount (USDC): ${swapAmount.toString()}`)
        console.log(`Expected HNT Output (oracle-based, with confidence): ${expectedHntOutput.toString()}`)

        // Lend instruction - this transfers input tokens from DCA to lend destination
        const swapPayerUsdcAccount = getAssociatedTokenAddressSync(dcaAccount.inputMint, swapPayer, true)
        const lendIx = await program.methods
          .lendV0()
          .accounts({
            dca,
            lendDestination: swapPayerUsdcAccount,
          })
          .instruction()

        // Transfer output HNT from swap payer to destination (simulating swap output)
        const swapSourceAccount = getAssociatedTokenAddressSync(hntMint, swapPayer, true)
        const destinationTokenAccount = getAssociatedTokenAddressSync(hntMint, dcaAccount.destinationWallet, true)

        const outputTransferIx = createTransferInstruction(
          swapSourceAccount,
          destinationTokenAccount,
          swapPayer,
          expectedHntOutput.toNumber()
        )

        const checkRepayIx = await program.methods
          .checkRepayV0({})
          .accounts({ dca })
          .instruction()

        const instructions = [
          lendIx,
          outputTransferIx,
          checkRepayIx,
        ]

        const { transaction, remainingAccounts } = await compileTransaction(
          instructions,
          [[Buffer.from("swap_payer"), bumpBuffer]] // PDA seeds for swap payer
        )

        const remoteTx = new RemoteTaskTransactionV0({
          task,
          taskQueuedAt,
          transaction: {
            ...transaction,
            accounts: remainingAccounts.map((acc) => acc.pubkey),
          },
        })

        const serialized = await RemoteTaskTransactionV0.serialize(
          tuktukProgram.coder.accounts,
          remoteTx
        )

        reply.status(200).send({
          transaction: serialized.toString("base64"),
          signature: Buffer.from(
            sign.detached(Uint8Array.from(serialized), dcaSigner.secretKey)
          ).toString("base64"),
          remaining_accounts: remainingAccounts.map((acc) => ({
            pubkey: acc.pubkey.toBase58(),
            is_signer: acc.isSigner,
            is_writable: acc.isWritable,
          })),
        })
      } catch (err: any) {
        console.error(err)
        reply.status(500).send({ error: err.message })
      }
    })

    console.log("Starting DCA server")
    try {
      await dcaServer.listen({ port: 8123, host: "0.0.0.0" })
    } catch (err: any) {
      console.error(err)
      throw err
    }
    console.log("DCA server listening on port 8123")
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

    beforeEach(async () => {
      await sendInstructions(provider, [
        SystemProgram.transfer({
          fromPubkey: me,
          toPubkey: crankTurner.publicKey,
          lamports: LAMPORTS_PER_SOL,
        }),
      ])
      dca = dcaKey(me, usdcMint, hntMint, dcaIndex)[0]
      inputAccount = getAssociatedTokenAddressSync(usdcMint, dca, true)
      destinationTokenAccount = getAssociatedTokenAddressSync(hntMint, destinationWallet, true)

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
        payer: me.toBase58(),
        authority: me.toBase58(),
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
        })
        .accounts({
          payer: me,
          authority: me,
          inputMint: usdcMint,
          outputMint: hntMint,
          inputPriceOracle: USDC_PRICE_FEED,
          outputPriceOracle: HNT_PRICE_FEED,
          destinationWallet,
          task,
          taskQueue,
        })
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
      const taskQueueAcc = await tuktukProgram.account.taskQueueV0.fetch(taskQueue)

      // Find all task IDs that need to be executed (have a 1 in the bitmap)
      const taskIds: number[] = []
      for (let i = 0; i < taskQueueAcc.taskBitmap.length; i++) {
        const byte = taskQueueAcc.taskBitmap[i]
        for (let bit = 0; bit < 8; bit++) {
          if ((byte & (1 << bit)) !== 0) {
            taskIds.push(i * 8 + bit)
          }
        }
      }

      // Execute all tasks
      for (const taskId of taskIds) {
        const task = taskKey(taskQueue, taskId)[0]
        const taskAcc = await tuktukProgram.account.taskV0.fetch(task)
        if ((taskAcc.trigger.timestamp?.[0]?.toNumber() || 0) > (new Date().getTime() / 1000)) {
          continue
        }
        console.log("Running task", taskId)
        await sendInstructions(
          provider,
          [
            ComputeBudgetProgram.setComputeUnitLimit({ units: 1400000 }),
            ...await runTask({
              program: tuktukProgram,
              task,
              crankTurner: crankTurner.publicKey,
            })
          ],
          [crankTurner],
          crankTurner.publicKey
        )
      }
    }

    it("executes a full DCA swap cycle through multiple runs", async () => {
      let dcaAccount = await program.account.dcaV0.fetch(dca)
      expect(dcaAccount.numOrders).to.equal(numOrders)
      expect(dcaAccount.isSwapping).to.be.false

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
          expect(dcaAccountNow.isSwapping).to.be.false
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
        .accounts({
          dca,
        })
        .rpc({ skipPreflight: true })

      // Verify DCA is closed
      const dcaAccount = await program.account.dcaV0.fetchNullable(dca)
      expect(dcaAccount).to.be.null
    })
  })
})

