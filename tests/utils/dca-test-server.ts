import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import {
  compileTransaction,
  RemoteTaskTransactionV0,
  customSignerKey,
  taskKey,
  init as initTuktuk,
  runTask,
} from "@helium/tuktuk-sdk";
import { Tuktuk } from "@helium/tuktuk-idls/lib/types/tuktuk";
import {
  createTransferInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { ComputeBudgetProgram, Keypair, PublicKey } from "@solana/web3.js";
import { PythSolanaReceiver } from "@pythnetwork/pyth-solana-receiver";
import Fastify, { FastifyInstance } from "fastify";
import { sign } from "tweetnacl";
import { TuktukDca } from "../../target/types/tuktuk_dca";
import { sendInstructions } from "@helium/spl-utils";

// Calculate expected output based on oracle prices (matching check_repay_v0 logic)
function calculateExpectedOutput(
  swapAmount: BN,
  inputPriceUpdate: any,
  outputPriceUpdate: any
): BN {
  const inputPriceWithConf = inputPriceUpdate.priceMessage.price;
  const outputPriceWithConf = outputPriceUpdate.priceMessage.price;

  const expoDiff =
    inputPriceUpdate.priceMessage.exponent -
    outputPriceUpdate.priceMessage.exponent;
  let expectedOutput: BN;
  if (expoDiff > 0) {
    expectedOutput = swapAmount
      .mul(new BN(10).pow(new BN(Math.abs(expoDiff))))
      .mul(inputPriceWithConf)
      .div(outputPriceWithConf);
  } else if (expoDiff < 0) {
    expectedOutput = swapAmount
      .mul(inputPriceWithConf)
      .div(outputPriceWithConf)
      .div(new BN(10).pow(new BN(Math.abs(expoDiff))));
  } else {
    expectedOutput = swapAmount
      .mul(inputPriceWithConf)
      .div(outputPriceWithConf);
  }

  return expectedOutput;
}

export interface DcaServerConfig {
  program: Program<TuktukDca>;
  provider: anchor.AnchorProvider;
  taskQueue: PublicKey;
  outputMint: PublicKey;
  dcaSigner: Keypair;
  port?: number;
}

export async function createDcaServer(
  config: DcaServerConfig
): Promise<FastifyInstance> {
  const {
    program,
    provider,
    taskQueue,
    outputMint,
    dcaSigner,
    port = 8123,
  } = config;

  const dcaServer = Fastify({ logger: false });

  dcaServer.post("/dca/:dcaKey", async (request: any, reply: any) => {
    try {
      const dca = new PublicKey(request.params.dcaKey);
      const task = new PublicKey(request.body.task);
      const taskQueuedAt = new BN(request.body.task_queued_at);

      const dcaAccount = await program.account.dcaV0.fetch(dca);

      // Get swap payer PDA
      const [swapPayer, bump] = customSignerKey(taskQueue, [
        Buffer.from("dca_swap_payer"),
      ]);
      const bumpBuffer = Buffer.alloc(1);
      bumpBuffer.writeUint8(bump);

      // Calculate swap amounts based on fixed swap_amount_per_order
      const inputAccountInfo = await provider.connection.getAccountInfo(
        dcaAccount.inputAccount
      );
      const inputBalance = new BN(inputAccountInfo!.data.slice(64, 72), "le");
      // For the last order, use whatever is remaining; otherwise use the fixed amount
      const swapAmount =
        dcaAccount.numOrders === 1
          ? inputBalance
          : dcaAccount.swapAmountPerOrder;

      // Fetch PriceUpdateV2 accounts using the Pyth SDK
      const pythReceiver = new PythSolanaReceiver({
        connection: provider.connection,
        wallet: provider.wallet as anchor.Wallet,
      });

      const inputPriceUpdate =
        await pythReceiver.receiver.account.priceUpdateV2.fetch(
          dcaAccount.inputPriceOracle
        );
      const outputPriceUpdate =
        await pythReceiver.receiver.account.priceUpdateV2.fetch(
          dcaAccount.outputPriceOracle
        );

      console.log(
        `Input Price: ${inputPriceUpdate.priceMessage.price.toString()} (expo: ${inputPriceUpdate.priceMessage.exponent
        })`
      );
      console.log(
        `Output Price: ${outputPriceUpdate.priceMessage.price.toString()} (expo: ${outputPriceUpdate.priceMessage.exponent
        })`
      );

      // Calculate expected output using shared function
      const expectedOutput = calculateExpectedOutput(
        swapAmount,
        inputPriceUpdate,
        outputPriceUpdate
      );

      console.log(`Swap Amount (input): ${swapAmount.toString()}`);
      console.log(
        `Expected Output (oracle-based, with confidence): ${expectedOutput.toString()}`
      );

      // Lend instruction - this transfers input tokens from DCA to lend destination
      const swapPayerInputAccount = getAssociatedTokenAddressSync(
        dcaAccount.inputMint,
        swapPayer,
        true
      );
      const lendIx = await program.methods
        .lendV0()
        .accounts({
          dca,
          lendDestination: swapPayerInputAccount,
        })
        .instruction();

      // Transfer output tokens from swap payer to destination (simulating swap output)
      const swapSourceAccount = getAssociatedTokenAddressSync(
        outputMint,
        swapPayer,
        true
      );
      const destinationTokenAccount = getAssociatedTokenAddressSync(
        outputMint,
        dcaAccount.destinationWallet,
        true
      );

      const outputTransferIx = createTransferInstruction(
        swapSourceAccount,
        destinationTokenAccount,
        swapPayer,
        expectedOutput.toNumber()
      );

      const checkRepayIx = await program.methods
        .checkRepayV0({})
        .accounts({ dca })
        .instruction();

      const instructions = [lendIx, outputTransferIx, checkRepayIx];

      const { transaction, remainingAccounts } = await compileTransaction(
        instructions,
        [[Buffer.from("dca_swap_payer"), bumpBuffer]] // PDA seeds for swap payer
      );

      const remoteTx = new RemoteTaskTransactionV0({
        task,
        taskQueuedAt,
        transaction: {
          ...transaction,
          accounts: remainingAccounts.map((acc) => acc.pubkey),
        },
      });

      const tuktukProgram = await initTuktuk(provider);

      const serialized = await RemoteTaskTransactionV0.serialize(
        tuktukProgram.coder.accounts,
        remoteTx
      );

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
      });
    } catch (err: any) {
      console.error(err);
      reply.status(500).send({ error: err.message });
    }
  });

  try {
    await dcaServer.listen({ port, host: "0.0.0.0" });
    console.log(`DCA server listening on port ${port}`);
    return dcaServer;
  } catch (err: any) {
    console.error(err);
    throw err;
  }
}

export async function runAllTasks(
  provider: anchor.AnchorProvider,
  tuktukProgram: Program<Tuktuk>,
  taskQueue: PublicKey,
  crankTurner: Keypair
) {
  const taskQueueAcc = await tuktukProgram.account.taskQueueV0.fetch(
    taskQueue
  );

  // Find all task IDs that need to be executed (have a 1 in the bitmap)
  const taskIds: number[] = [];
  for (let i = 0; i < taskQueueAcc.taskBitmap.length; i++) {
    const byte = taskQueueAcc.taskBitmap[i];
    for (let bit = 0; bit < 8; bit++) {
      if ((byte & (1 << bit)) !== 0) {
        taskIds.push(i * 8 + bit);
      }
    }
  }

  // Execute all tasks
  for (const taskId of taskIds) {
    const task = taskKey(taskQueue, taskId)[0];
    const taskAcc = await tuktukProgram.account.taskV0.fetch(task);
    if (
      ((taskAcc.trigger.timestamp?.[0]?.toNumber() || 0) >
        new Date().getTime() / 1000) || taskAcc.transaction.remoteV0?.url?.includes(".helium.io")
    ) {
      continue;
    }
    console.log("Running task", taskId);

    const runTaskIxs = await runTask({
      program: tuktukProgram,
      task,
      crankTurner: crankTurner.publicKey,
    });
    await sendInstructions(
      provider,
      [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 1400000 }),
        ...runTaskIxs,
      ],
      [crankTurner],
      crankTurner.publicKey
    );
  }
}

export { calculateExpectedOutput };

