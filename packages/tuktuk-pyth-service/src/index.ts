import { AnchorProvider, BN, Program, Wallet } from "@coral-xyz/anchor";
import { convertIdlToCamelCase } from "@coral-xyz/anchor/dist/cjs/idl";
import cors from "@fastify/cors";
import { init as initHplCrons } from "@helium/hpl-crons-sdk";
import { truthy } from "@helium/spl-utils";
import { Tuktuk } from "@helium/tuktuk-idls/lib/types/tuktuk";
import { compileTransaction, customSignerKey, init, RemoteTaskTransactionV0 } from "@helium/tuktuk-sdk";
import { HermesClient } from "@pythnetwork/hermes-client";
import { parseAccumulatorUpdateData } from "@pythnetwork/price-service-sdk";
import { PythSolanaReceiver } from "@pythnetwork/pyth-solana-receiver";
import { getConfigPda, getGuardianSetPda, getTreasuryPda } from "@pythnetwork/pyth-solana-receiver/lib/address";
import { Connection, Keypair, PublicKey, TransactionInstruction } from "@solana/web3.js";
import Fastify, { FastifyInstance } from "fastify";
import { sign } from "tweetnacl";
import { KEYPAIR, PYTH_HERMES_URL, SOLANA_URL } from "./env";
import { PythPriceUpdate } from "./model";
import { IDL } from "./wormhole";

// @ts-ignore
const convertedIDL = convertIdlToCamelCase(IDL)

const server: FastifyInstance = Fastify({
  logger: true,
});

server.register(cors, {
  origin: "*",
});

server.get("/health", async () => {
  return { ok: true };
});

const wallet = new Wallet(KEYPAIR)

const provider = new AnchorProvider(
  new Connection(SOLANA_URL),
  wallet,
  { commitment: "confirmed" }
);
let tuktukProgram: Promise<Program<Tuktuk>> | null = null;
function getTuktukProgram() {
  if (!tuktukProgram) {
    tuktukProgram = init(provider)
  }
  return tuktukProgram;
}

interface ProcessVaaConfig {
  index: number;
  priceUpdateId: string;
}

const VAA_START = 46;

async function buildEncodedVaaCreateInstruction(wormholeProgram: Program<any>, vaa: Buffer, encodedVaaKeypair: Keypair) {
  const encodedVaaSize = vaa.length + VAA_START;
  // @ts-ignore
  return await wormholeProgram.account.encodedVaa.createInstruction(encodedVaaKeypair, encodedVaaSize)
}

async function generateAllVaaInstructions(vaa: Buffer, priceUpdateId: string, taskQueue: PublicKey, pythProgram: PythSolanaReceiver) {
  const encodedVaaKeypair = new Keypair();
  const priceUpdate = await pythProgram.receiver.account.priceUpdateV2.fetch(new PublicKey(priceUpdateId));
  const feedId = priceUpdate.priceMessage.feedId;
  const [tuktukEncodedVaa, bump] = customSignerKey(taskQueue, [Buffer.from("vaa"), Buffer.from(feedId)]);
  const wormholeProgram = new Program(convertedIDL, pythProgram.provider);

  const vaaExists = await provider.connection.getAccountInfo(tuktukEncodedVaa);
  const initInstructions: { instruction: TransactionInstruction, accountsSize: number }[] = [];
  if (vaaExists) {
    const { instruction: closeInstruction } = await pythProgram.buildCloseEncodedVaaInstruction(tuktukEncodedVaa);
    initInstructions.push({ instruction: closeInstruction, accountsSize: 32 });
  }

  // Create and init instructions
  const createInstruction = await buildEncodedVaaCreateInstruction(wormholeProgram, vaa, encodedVaaKeypair);
  const initInstruction = await wormholeProgram.methods
    .initEncodedVaa()
    .accounts({
      encodedVaa: encodedVaaKeypair.publicKey,
    })
    .instruction()
  initInstructions.push(
    { instruction: createInstruction, accountsSize: 32 },
    { instruction: initInstruction, accountsSize: 32 },
  );


  // VAA write instructions with proper chunking
  const chunkSize = 370;
  const writeInstructions: { instruction: TransactionInstruction, accountsSize: number }[] = [];
  let writeIndex = 0;
  for (let i = 0; i < vaa.length; i += chunkSize) {
    const chunk = vaa.subarray(i, Math.min(i + chunkSize, vaa.length));

    const writeInstruction = await wormholeProgram.methods
      .writeEncodedVaa({
        index: i,
        data: chunk,
      })
      .accounts({
        draftVaa: encodedVaaKeypair.publicKey,
      })
      .instruction()

    writeInstructions.push({ instruction: writeInstruction, accountsSize: 32 });
    writeIndex++;
  }

  // Verify instruction
  const verifyInstruction = await wormholeProgram.methods
    .verifyEncodedVaaV1()
    .accounts({
      guardianSet: getGuardianSetPda(vaa.readUInt32BE(1), wormholeProgram.programId),
      draftVaa: encodedVaaKeypair.publicKey,
    })
    .instruction();

  // Get price update data for final instruction
  const priceUpdateModel = await PythPriceUpdate.findByPk(priceUpdateId);
  if (!priceUpdateModel) {
    throw new Error(`Price update not found for price update id: ${priceUpdateId}`);
  }
  const accumulatorUpdateData = parseAccumulatorUpdateData(Buffer.from(priceUpdateModel.priceUpdate, "base64"));

  // Final price update instruction
  const priceUpdateInstruction = await pythProgram.pushOracle.methods.updatePriceFeed({
    merklePriceUpdate: {
      message: accumulatorUpdateData.updates[0].message,
      proof: accumulatorUpdateData.updates[0].proof,
    },
    treasuryId: 0,
  }, 0, Array.from(feedId))
    .accounts({
      encodedVaa: tuktukEncodedVaa,
      priceFeedAccount: new PublicKey(priceUpdateId),
      treasury: getTreasuryPda(0, pythProgram.receiver.programId),
      config: getConfigPda(pythProgram.receiver.programId),
      pythSolanaReceiver: pythProgram.receiver.programId,
    })
    .instruction();

  return {
    allInstructions: [...initInstructions, ...writeInstructions, { instruction: verifyInstruction, accountsSize: 32 }, { instruction: priceUpdateInstruction, accountsSize: 5 * 32 }],
    encodedVaaAddress: encodedVaaKeypair.publicKey,
    tuktukEncodedVaa,
    bump
  };
}

const MAX_SERIALIZED_LENGTH = 702;

async function processVaaInstructions(
  request: any,
  reply: any,
  priceUpdateId: string,
  index: number = 0
) {
  const tuktukProgram = await getTuktukProgram();
  const task = new PublicKey(request.body.task);
  const taskQueue = new PublicKey(request.body.task_queue);
  const taskQueuedAt = new BN(request.body.task_queued_at);
  const [payer, payerBump] = customSignerKey(taskQueue, [Buffer.from("pyth-payer")]);
  const hplCronsProgram = await initHplCrons(provider)

  const pythProgram: PythSolanaReceiver = new PythSolanaReceiver({
    connection: new Connection(SOLANA_URL),
    wallet: {
      publicKey: payer
    } as Wallet,
  })

  const priceUpdate = await pythProgram.receiver.account.priceUpdateV2.fetch(new PublicKey(priceUpdateId));
  const feedId = priceUpdate.priceMessage.feedId;
  const [tuktukEncodedVaa, bump] = customSignerKey(taskQueue, [Buffer.from("vaa"), Buffer.from(feedId)]);

  // Get price update data
  const priceUpdateModel = await PythPriceUpdate.findByPk(priceUpdateId);
  if (!priceUpdateModel) {
    throw new Error(`Price update not found for price update id: ${priceUpdateId}`);
  }
  const accumulatorUpdateData = parseAccumulatorUpdateData(Buffer.from(priceUpdateModel.priceUpdate, "base64"));

  // Generate all instructions
  const { allInstructions, encodedVaaAddress } =
    await generateAllVaaInstructions(accumulatorUpdateData.vaa, priceUpdateId, taskQueue, pythProgram);

  // Try to fit as many instructions as possible in this batch
  let currentIndex = index;
  let hasMoreInstructions = true;

  const instructions: { instruction: TransactionInstruction, accountsSize: number }[] = [];
  while (currentIndex < allInstructions.length && hasMoreInstructions) {
    const currentInstruction = allInstructions[currentIndex];

    // Map the encoded VAA address for VAA-related instructions
    const mappedInstruction = {
      programId: currentInstruction.instruction.programId,
      keys: currentInstruction.instruction.keys.map(key =>
        key.pubkey.equals(encodedVaaAddress) ? {
          isSigner: true,
          isWritable: true,
          pubkey: tuktukEncodedVaa,
        } : key
      ),
      data: currentInstruction.instruction.data,
    };

    const testInstructions = [...instructions, { instruction: mappedInstruction, accountsSize: currentInstruction.accountsSize }];

    // Determine if we need to requeue
    const nextIndex = currentIndex + 1;
    const isLastInstruction = nextIndex >= allInstructions.length;

    let requeueInstruction: TransactionInstruction | null = null;
    if (!isLastInstruction) {
      requeueInstruction = await hplCronsProgram.methods.returnPythTaskV0({
        index: nextIndex,
        // If next time we're at the last instruction, we don't need to requeue
        freeTasks: (nextIndex + 1) >= allInstructions.length ? 0 : 1,
      }).accounts({
        task: task,
      }).instruction();
    }

    // Test serialization with potential requeue instruction
    const finalTestInstructions = requeueInstruction
      ? [...testInstructions, { instruction: requeueInstruction, accountsSize: 0 }]
      : testInstructions;

    const allAccounts = finalTestInstructions.map(i => i.instruction.keys).flat();
    const bumpBuffer = Buffer.alloc(1);
    bumpBuffer.writeUint8(bump);
    const payerBumpBuffer = Buffer.alloc(1);
    payerBumpBuffer.writeUint8(payerBump);

    const { transaction, remainingAccounts } = await compileTransaction(
      finalTestInstructions.map(i => i.instruction),
      [
        allAccounts.some(acc => acc.pubkey.equals(tuktukEncodedVaa) && acc.isSigner) ? [Buffer.from("vaa"), Buffer.from(feedId), bumpBuffer] : undefined,
        allAccounts.some(acc => acc.pubkey.equals(payer) && acc.isSigner) ? [Buffer.from("pyth-payer"), payerBumpBuffer] : undefined,
      ].filter(truthy)
    );

    const testRemoteTx = new RemoteTaskTransactionV0({
      task,
      taskQueuedAt,
      transaction: {
        ...transaction,
        accounts: remainingAccounts.map((acc) => acc.pubkey),
      },
    });

    // There's more accounts in the first bit
    let testSerialized: Buffer = Buffer.alloc(MAX_SERIALIZED_LENGTH + 1);
    try {
      testSerialized = await RemoteTaskTransactionV0.serialize(
        tuktukProgram.coder.accounts,
        testRemoteTx
      );
    } catch (error) {
      // Overflow, most likely
    }

    const len = testSerialized.length + testInstructions.reduce((acc, i) => acc + i.accountsSize, 0)

    // Check if it fits within the limit
    if (len <= MAX_SERIALIZED_LENGTH) {
      instructions.push({ instruction: mappedInstruction, accountsSize: currentInstruction.accountsSize })
      currentIndex++;
    } else {
      const isLastInstruction = currentIndex >= allInstructions.length;
      if (!isLastInstruction) {
        instructions.push({
          instruction: await hplCronsProgram.methods.returnPythTaskV0({
            index: currentIndex,
            freeTasks: (currentIndex + 1) >= allInstructions.length ? 0 : 1,
          }).accounts({
            task: task,
          }).instruction(), accountsSize: 0
        })
      }
      // If we can't fit this instruction, stop here and requeue
      hasMoreInstructions = false;
    }
  }

  // Final transaction compilation and response
  const bumpBuffer = Buffer.alloc(1);
  bumpBuffer.writeUint8(bump);
  const payerBumpBuffer = Buffer.alloc(1);
  payerBumpBuffer.writeUint8(payerBump);

  const allAccounts = instructions.map(i => i.instruction.keys).flat();
  const { transaction, remainingAccounts } = await compileTransaction(
    instructions.map(i => i.instruction),
    [
      allAccounts.some(acc => acc.pubkey.equals(tuktukEncodedVaa) && acc.isSigner) ? [Buffer.from("vaa"), Buffer.from(feedId), bumpBuffer] : undefined,
      allAccounts.some(acc => acc.pubkey.equals(payer) && acc.isSigner) ? [Buffer.from("pyth-payer"), payerBumpBuffer] : undefined,
    ].filter(truthy)
  );

  const remoteTx = new RemoteTaskTransactionV0({
    task,
    taskQueuedAt,
    transaction: {
      ...transaction,
      accounts: remainingAccounts.map((acc) => acc.pubkey),
    },
  });

  const serialized = await RemoteTaskTransactionV0.serialize(
    tuktukProgram.coder.accounts,
    remoteTx
  );

  const resp = {
    transaction: serialized.toString("base64"),
    signature: Buffer.from(
      sign.detached(Uint8Array.from(serialized), KEYPAIR.secretKey)
    ).toString("base64"),
    remaining_accounts: remainingAccounts.map((acc) => ({
      pubkey: acc.pubkey.toBase58(),
      is_signer: acc.isSigner,
      is_writable: acc.isWritable,
    })),
  };
  reply.status(200).send(resp);
}

server.post<{
  Body: { task_queue: string; task: string; task_queued_at: string };
  Params: { priceUpdateId: string };
  Querystring: { i?: string };
}>("/v1/write/:priceUpdateId", async (request, reply) => {
  const index = parseInt(request.query.i || "0", 10);
  const priceUpdateId = request.params.priceUpdateId;
  const taskQueue = new PublicKey(request.body.task_queue);
  const [payer, payerBump] = customSignerKey(taskQueue, [Buffer.from("pyth-payer")]);
  const pythProgram: PythSolanaReceiver = new PythSolanaReceiver({
    connection: new Connection(SOLANA_URL),
    wallet: {
      publicKey: payer
    } as Wallet,
  })
  const priceUpdate = await pythProgram.receiver.account.priceUpdateV2.fetch(new PublicKey(priceUpdateId));
  const feedId = priceUpdate.priceMessage.feedId
  const priceServiceConnection = new HermesClient(
    PYTH_HERMES_URL,
    {}
  );

  async function getData() {
    const priceUpdates = (
      await priceServiceConnection.getLatestPriceUpdates(
        [Buffer.from(feedId).toString("hex")],
        { encoding: "base64" }
      )
    );
    const priceUpdateData = priceUpdates.binary.data[0]
    return priceUpdateData
  }

  const existingUpdate = await PythPriceUpdate.findByPk(priceUpdateId)
  if (existingUpdate) {
    // Fresh price within 30 seconds
    if (index === 0 && existingUpdate.updatedAt > new Date(Date.now() - 1000 * 30)) {
      await PythPriceUpdate.update({
        priceUpdate: await getData(),
      }, { where: { priceUpdateId } })
    }
  } else {
    await PythPriceUpdate.create({
      priceUpdateId,
      priceUpdate: await getData(),
    })
  }

  // Use the new unified processing function
  await processVaaInstructions(request, reply, priceUpdateId, index);
})

const start = async () => {
  try {
    const port = process.env.PORT ? Number(process.env.PORT) : 8081;
    await server.listen({
      port,
      host: "0.0.0.0",
    });

    await PythPriceUpdate.sync({ alter: true });

    server.server.address();
    console.log(`Started server on 0.0.0.0:${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
