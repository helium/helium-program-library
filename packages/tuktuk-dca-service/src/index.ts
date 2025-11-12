import { AnchorProvider, BN, Program, Wallet } from "@coral-xyz/anchor";
import cors from "@fastify/cors";
import { Tuktuk } from "@helium/tuktuk-idls/lib/types/tuktuk";
import { compileTransaction, customSignerKey, init, RemoteTaskTransactionV0 } from "@helium/tuktuk-sdk";
import { Connection, Keypair, PublicKey, TransactionInstruction, VersionedTransaction, Transaction } from "@solana/web3.js";
import Fastify, { FastifyInstance } from "fastify";
import { sign } from "tweetnacl";
import { init as initTuktukDca } from "@helium/tuktuk-dca-sdk";
import { DCA_SIGNER, JUPITER_API_URL, PORT, SOLANA_URL } from "./env";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

const server: FastifyInstance = Fastify({
  logger: true,
});

server.register(cors, {
  origin: "*",
});

server.get("/health", async () => {
  return { ok: true };
});

const wallet = new Wallet(DCA_SIGNER);

const provider = new AnchorProvider(
  new Connection(SOLANA_URL),
  wallet,
  { commitment: "confirmed" }
);

let tuktukProgram: Promise<Program<Tuktuk>> | null = null;
function getTuktukProgram() {
  if (!tuktukProgram) {
    tuktukProgram = init(provider);
  }
  return tuktukProgram;
}

// Jupiter Lite API types
interface JupiterQuoteResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  platformFee?: {
    amount: string;
    feeBps: number;
  };
  priceImpactPct: string;
  routePlan: Array<{
    swapInfo: {
      ammKey: string;
      label: string;
      inputMint: string;
      inAmount: string;
      outputMint: string;
      outAmount: string;
      notEnoughLiquidity: boolean;
      minInAmount: string;
      minOutAmount: string;
      priceImpactPct: string;
    };
    percent: number;
  }>;
  contextSlot: number;
  timeTaken: number;
}

interface JupiterSwapInstructionsResponse {
  otherInstructions: TransactionInstruction[];
  computeBudgetInstructions: TransactionInstruction[];
  setupInstructions: TransactionInstruction[];
  swapInstruction: TransactionInstruction;
  cleanupInstruction?: TransactionInstruction;
  addressLookupTableAddresses: string[];
}

// Get quote from Jupiter Lite API
async function getJupiterQuote(
  inputMint: string,
  outputMint: string,
  amount: string,
  slippageBps: number
): Promise<JupiterQuoteResponse> {
  const params = new URLSearchParams({
    inputMint,
    outputMint,
    amount,
    slippageBps: slippageBps.toString(),
    swapMode: "ExactIn",
    onlyDirectRoutes: "true",
  });

  const response = await fetch(`${JUPITER_API_URL}/swap/v1/quote?${params}`);
  if (!response.ok) {
    throw new Error(`Jupiter Lite API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

// Get swap instructions from Jupiter Lite API
async function getJupiterSwapInstructions(
  quoteResponse: JupiterQuoteResponse,
  sourcePublicKey: string,
  destinationTokenAccount: string,
): Promise<JupiterSwapInstructionsResponse> {
  const jupUrl = `${JUPITER_API_URL}/swap/v1/swap-instructions`;
  console.log("Jupiter URL", jupUrl);
  const response = await fetch(jupUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      userPublicKey: sourcePublicKey,
      destinationTokenAccount,
      quoteResponse,
      dynamicComputeUnitLimit: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Jupiter Lite swap-instructions API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

// Convert Jupiter instruction format to Solana TransactionInstruction
function convertJupiterInstruction(jupiterInstruction: any): TransactionInstruction {
  return {
    programId: new PublicKey(jupiterInstruction.programId),
    keys: jupiterInstruction.accounts.map((account: any) => ({
      pubkey: new PublicKey(account.pubkey),
      isSigner: account.isSigner,
      isWritable: account.isWritable,
    })),
    data: Buffer.from(jupiterInstruction.data, 'base64'),
  };
}

server.post<{
  Body: { task_queue: string; task: string; task_queued_at: string };
  Params: { dcaKey: string };
}>("/dca/:dcaKey", async (request, reply) => {
  try {
    const dca = new PublicKey(request.params.dcaKey);
    const task = new PublicKey(request.body.task);
    const taskQueue = new PublicKey(request.body.task_queue);
    const taskQueuedAt = new BN(request.body.task_queued_at);

    const tuktukProgram = await getTuktukProgram();
    const dcaProgram = await initTuktukDca(provider);

    // Fetch DCA account
    const dcaAccount = await dcaProgram.account.dcaV0.fetch(dca);

    // Get swap payer PDA
    const [swapPayer, bump] = customSignerKey(taskQueue, [
      Buffer.from("dca_swap_payer"),
    ]);
    const bumpBuffer = Buffer.alloc(1);
    bumpBuffer.writeUint8(bump);

    // Get input account balance
    const inputAccountInfo = await provider.connection.getAccountInfo(
      dcaAccount.inputAccount
    );
    const inputBalance = new BN(inputAccountInfo!.data.slice(64, 72), "le");

    // Calculate swap amount (use remaining balance for last order)
    const swapAmount =
      dcaAccount.numOrders === 1
        ? inputBalance
        : dcaAccount.swapAmountPerOrder;

    console.log(`DCA ${dca.toBase58()}: Swapping ${swapAmount.toString()} tokens`);
    console.log(`Input mint: ${dcaAccount.inputMint.toBase58()}`);
    console.log(`Output mint: ${dcaAccount.outputMint.toBase58()}`);
    console.log("Swap payer", swapPayer.toBase58());

    // Get quote from Jupiter
    const quote = await getJupiterQuote(
      dcaAccount.inputMint.toBase58(),
      dcaAccount.outputMint.toBase58(),
      swapAmount.toString(),
      dcaAccount.slippageBpsFromOracle
    );

    console.log(`Jupiter quote: ${quote.outAmount} output tokens`);
    console.log(`Price impact: ${quote.priceImpactPct}%`);

    // Create lend instruction to transfer input tokens
    const lendIx = await dcaProgram.methods
      .lendV0()
      .accounts({
        dca,
        lendDestination: getAssociatedTokenAddressSync(dcaAccount.inputMint, swapPayer, true),
      })
      .instruction();

    // Get Jupiter swap instructions
    const swapInstructions = await getJupiterSwapInstructions(
      quote,
      swapPayer.toBase58(),
      dcaAccount.destinationTokenAccount.toBase58(),
    );

    console.log("Lookup table addresses", swapInstructions.addressLookupTableAddresses);

    // Convert Jupiter instructions to Solana TransactionInstructions
    const jupiterInstructions = [
      ...swapInstructions.setupInstructions.map(convertJupiterInstruction),
      convertJupiterInstruction(swapInstructions.swapInstruction),
      ...(swapInstructions.cleanupInstruction ? [convertJupiterInstruction(swapInstructions.cleanupInstruction)] : []),
      ...swapInstructions.otherInstructions.map(convertJupiterInstruction),
    ];

    console.log("Jupiter instructions", jupiterInstructions);

    // Create check repay instruction
    const checkRepayIx = await dcaProgram.methods
      .checkRepayV0({})
      .accounts({ dca })
      .instruction();

    // Combine all instructions: lend, Jupiter swap, check repay
    const instructions = [lendIx, ...jupiterInstructions, checkRepayIx];

    // Compile transaction
    const { transaction, remainingAccounts } = await compileTransaction(
      instructions,
      [[Buffer.from("dca_swap_payer"), bumpBuffer]]
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

    reply.status(200).send({
      transaction: serialized.toString("base64"),
      signature: Buffer.from(
        sign.detached(Uint8Array.from(serialized), DCA_SIGNER.secretKey)
      ).toString("base64"),
      remaining_accounts: remainingAccounts.map((acc) => ({
        pubkey: acc.pubkey.toBase58(),
        is_signer: acc.isSigner,
        is_writable: acc.isWritable,
      })),
    });
  } catch (err: any) {
    console.error("DCA swap error:", err);
    reply.status(500).send({ error: err.message });
  }
});

const start = async () => {
  try {
    const port = Number(PORT);
    await server.listen({
      port,
      host: "0.0.0.0",
    });

    console.log(`DCA service listening on 0.0.0.0:${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();