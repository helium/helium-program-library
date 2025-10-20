import * as anchor from "@coral-xyz/anchor"
import { Program, BN } from "@coral-xyz/anchor"
import { init as initTuktuk, taskKey, taskQueueKey, taskQueueNameMappingKey, tuktukConfigKey, runTask, nextAvailableTaskIds, compileTransaction, RemoteTaskTransactionV0, customSignerKey } from "@helium/tuktuk-sdk"
// @ts-ignore
import { Tuktuk } from "@helium/tuktuk-idls/lib/types/tuktuk"
import { createMint, createTransferInstruction, getAccount, getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token"
import { ComputeBudgetProgram, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js"
import { expect } from "chai"
import { execSync } from "child_process"
import { sendInstructions, createAtaAndMint } from "@helium/spl-utils"
import { init, PROGRAM_ID, dcaKey, queueAuthorityKey } from "../packages/tuktuk-dca-sdk/src"
import { TuktukDca } from "../target/types/tuktuk_dca"
import Fastify, { FastifyInstance } from "fastify"
import { sign } from "tweetnacl"
import { ensureTuktukDcaIdl } from "./utils/fixtures"

export const ANCHOR_PATH = "anchor"

// Pyth price feed addresses on devnet
const USDC_PRICE_FEED = new PublicKey("Gnt27xtC473ZT2Mw5u8wZ68Z3gULkSTb5DuxJy7eJotD") // USDC/USD
const HNT_PRICE_FEED = new PublicKey("7moA1i5vQUpfDwSpK6Pw9s56ahB7WFGidtbL2ujWrVvm") // HNT/USD

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

    // Mint HNT to the swap payer's ATA
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

        // Build instructions: lend -> transfer -> check_repay
        const lendIx = await program.methods
          .lendV0()
          .accounts({ dca })
          .instruction()

        // Calculate swap output (simplified)
        const inputAccountInfo = await provider.connection.getAccountInfo(dcaAccount.inputAccount)
        const inputBalance = new BN(inputAccountInfo!.data.slice(64, 72), "le")
        const swapAmount = inputBalance.div(new BN(dcaAccount.numOrders))
        const expectedHntOutput = swapAmount.div(new BN(1000000)).mul(new BN(100000000)).div(new BN(25)).mul(new BN(10))

        const swapSourceAccount = getAssociatedTokenAddressSync(hntMint, swapPayer, true)
        const destinationTokenAccount = getAssociatedTokenAddressSync(hntMint, dcaAccount.destinationWallet, true)

        const swapTransferIx = createTransferInstruction(
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
          swapTransferIx,
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
    const intervalSeconds = new anchor.BN(60)
    const slippageBps = 5000 // 50% slippage for testing (very loose)

    beforeEach(async () => {
      dca = dcaKey(me, usdcMint, hntMint, dcaIndex)[0]
      inputAccount = getAssociatedTokenAddressSync(usdcMint, dca, true)
      destinationTokenAccount = getAssociatedTokenAddressSync(hntMint, destinationWallet, true)

      const taskQueueAcc = await tuktukProgram.account.taskQueueV0.fetch(taskQueue)
      const [taskId] = nextAvailableTaskIds(taskQueueAcc.taskBitmap, 1)
      task = taskKey(taskQueue, taskId)[0]

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
      })
      // Initialize DCA
      await program.methods
        .initializeDcaV0({
          index: dcaIndex,
          numOrders,
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

      // Mint USDC to the DCA's input account
      await createAtaAndMint(
        provider,
        usdcMint,
        new BN(1000_000000), // 1000 USDC
        dca
      )

      // Mint HNT to the DCA's destination wallet just to make sure it has some balance
      await createAtaAndMint(
        provider,
        hntMint,
        new BN(1),
        destinationWallet
      )
    })

    it("executes a full DCA swap cycle through tuktuk", async () => {
      let dcaAccount = await program.account.dcaV0.fetch(dca)
      expect(dcaAccount.numOrders).to.equal(numOrders)
      expect(dcaAccount.isSwapping).to.be.false

      const inputBalanceBefore = (await getAccount(provider.connection, inputAccount)).amount
      console.log(`Input balance before: ${inputBalanceBefore}`)

      // Wait a bit for the task to be schedulable
      await new Promise(resolve => setTimeout(resolve, 2000))

      // Run the task through Tuktuk
      console.log("Running task", task.toBase58())
      const runTaskIxs = await runTask({
        program: tuktukProgram,
        task,
        crankTurner: me,
      })

      await sendInstructions(provider, [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 1400000 }),
        ...runTaskIxs
      ])

      console.log("✅ Executed DCA task through Tuktuk")

      // Verify final state
      dcaAccount = await program.account.dcaV0.fetch(dca)
      expect(dcaAccount.isSwapping).to.be.false
      expect(dcaAccount.numOrders).to.equal(numOrders - 1)
      expect(dcaAccount.preSwapDestinationBalance.toNumber()).to.equal(0)

      const inputBalanceAfter = (await getAccount(provider.connection, inputAccount)).amount
      const hntBalance = (await getAccount(provider.connection, destinationTokenAccount)).amount

      console.log(`Input balance after: ${inputBalanceAfter}`)
      console.log(`HNT balance: ${hntBalance}`)

      expect(Number(inputBalanceAfter)).to.be.lessThan(Number(inputBalanceBefore))
      expect(Number(hntBalance)).to.be.greaterThan(0)
    })

    it("closes a DCA", async () => {
      // Close DCA
      await program.methods
        .closeDcaV0()
        .accounts({
          dca,
          rentRefund: me,
        })
        .rpc({ skipPreflight: true })

      // Verify DCA is closed
      const dcaAccount = await program.account.dcaV0.fetchNullable(dca)
      expect(dcaAccount).to.be.null
    })
  })
})

