import { publicProcedure } from "../../../procedures";
import { env } from "@/lib/env";
import { Connection, PublicKey, TransactionInstruction } from "@solana/web3.js";
import {
  buildVersionedTransaction,
  serializeTransaction,
} from "@/lib/utils/build-transaction";
import {
  generateTransactionTag,
  TRANSACTION_TYPES,
} from "@/lib/utils/transaction-tags";
import {
  calculateRequiredBalance,
  BASE_TX_FEE_LAMPORTS,
  RENT_COSTS,
} from "@/lib/utils/balance-validation";
import { NATIVE_MINT } from "@solana/spl-token";

/**
 * Get swap transaction instructions from Jupiter and build a transaction.
 */
export const getInstructions = publicProcedure.swap.getInstructions.handler(
  async ({ input, errors }) => {
    const {
      quoteResponse,
      userPublicKey,
      destinationTokenAccount,
      dynamicComputeUnitLimit,
      prioritizationFeeLamports,
    } = input;

    // Get swap instructions from Jupiter
    const instructionsResponse = await fetch(
      `${env.JUPITER_API_URL}/swap/v1/swap-instructions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": env.JUPITER_API_KEY,
        },
        body: JSON.stringify({
          quoteResponse,
          userPublicKey,
          destinationTokenAccount,
          dynamicComputeUnitLimit,
          prioritizationFeeLamports: prioritizationFeeLamports || {
            priorityLevelWithMaxLamports: {
              maxLamports: 1000000,
              priorityLevel: "medium",
            },
          },
        }),
      },
    );

    if (!instructionsResponse.ok) {
      const errorText = await instructionsResponse.text();
      console.error("Jupiter API error:", errorText);
      throw errors.JUPITER_ERROR({
        message: `Failed to get swap instructions from Jupiter: HTTP ${instructionsResponse.status}`,
      });
    }

    const instructions = await instructionsResponse.json();

    if (instructions.error) {
      throw errors.JUPITER_ERROR({
        message: `Jupiter API returned error: ${instructions.error}`,
      });
    }

    // Check wallet has sufficient balance
    // Estimate: Jupiter may create output token ATA
    // If destinationTokenAccount is provided, assume it exists; otherwise assume ATA creation
    const connection = new Connection(process.env.SOLANA_RPC_URL!);
    const walletBalance = await connection.getBalance(
      new PublicKey(userPublicKey),
    );
    const rentCost = destinationTokenAccount ? 0 : RENT_COSTS.ATA;
    // When swapping SOL, the input amount also comes from the wallet balance
    const solInputAmount =
      quoteResponse.inputMint === NATIVE_MINT.toBase58()
        ? Number(quoteResponse.inAmount)
        : 0;
    const required = calculateRequiredBalance(
      BASE_TX_FEE_LAMPORTS,
      rentCost + solInputAmount,
    );

    if (walletBalance < required) {
      throw errors.INSUFFICIENT_FUNDS({
        message: "Insufficient SOL balance to execute swap",
        data: { required, available: walletBalance },
      });
    }

    // Build the transaction using the same pattern
    const deserializeInstruction = (instruction: {
      programId: string;
      accounts: { pubkey: string; isSigner: boolean; isWritable: boolean }[];
      data: string;
    }) => {
      return new TransactionInstruction({
        programId: new PublicKey(instruction.programId),
        keys: instruction.accounts.map((key) => ({
          pubkey: new PublicKey(key.pubkey),
          isSigner: key.isSigner,
          isWritable: key.isWritable,
        })),
        data: Buffer.from(instruction.data, "base64"),
      });
    };

    const jupIxs = [
      ...(instructions.setupInstructions
        ? instructions.setupInstructions.map(
            (instruction: {
              programId: string;
              accounts: {
                pubkey: string;
                isSigner: boolean;
                isWritable: boolean;
              }[];
              data: string;
            }) => deserializeInstruction(instruction),
          )
        : []),
      // Swap instruction
      deserializeInstruction(instructions.swapInstruction),
      // Cleanup instruction if present
      ...(instructions.cleanupInstruction
        ? [deserializeInstruction(instructions.cleanupInstruction)]
        : []),
    ];

    const tx = await buildVersionedTransaction({
      connection,
      draft: {
        instructions: jupIxs,
        feePayer: new PublicKey(userPublicKey),
        addressLookupTableAddresses:
          instructions.addressLookupTableAddresses.map(
            (address: string) => new PublicKey(address),
          ),
      },
    });

    // Generate transaction tag
    const tag = generateTransactionTag({
      type: TRANSACTION_TYPES.SWAP,
      userAddress: userPublicKey,
      inputMint: quoteResponse.inputMint,
      outputMint: quoteResponse.outputMint,
      amount: quoteResponse.inAmount,
    });

    return {
      transactions: [
        {
          serializedTransaction: serializeTransaction(tx),
          metadata: {
            type: "swap",
            description: `Swap ${quoteResponse.inAmount} ${quoteResponse.inputMint} for ${quoteResponse.outAmount} ${quoteResponse.outputMint}`,
          },
        },
      ],
      parallel: false,
      tag,
    };
  },
);
