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
  getTransactionFee,
  RENT_COSTS,
} from "@/lib/utils/balance-validation";
import { NATIVE_MINT } from "@solana/spl-token";
import { toTokenAmountOutput } from "@/lib/utils/token-math";
import { TOKEN_NAMES } from "@/lib/constants/tokens";
import { classifyJupiterError } from "@/lib/utils/jupiter-errors";
import BN from "bn.js";

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
      }
    );

    if (!instructionsResponse.ok) {
      const errorText = await instructionsResponse.text();
      console.error("Jupiter API error:", errorText);

      const classification = classifyJupiterError({
        status: instructionsResponse.status,
        body: errorText,
        operation: "Failed to get swap instructions from Jupiter",
      });
      if (classification.kind === "BAD_REQUEST") {
        throw errors.BAD_REQUEST({ message: classification.message });
      }
      if (classification.kind === "RATE_LIMITED") {
        throw errors.RATE_LIMITED();
      }
      throw errors.JUPITER_ERROR({ message: classification.message });
    }

    const instructions = await instructionsResponse.json();

    if (instructions.error) {
      throw errors.JUPITER_ERROR({
        message: `Jupiter API returned error: ${instructions.error}`,
      });
    }

    const connection = new Connection(process.env.SOLANA_RPC_URL!);

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
            }) => deserializeInstruction(instruction)
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
            (address: string) => new PublicKey(address)
          ),
      },
    });

    // Check wallet has sufficient balance using actual transaction fees
    const [walletBalance, txFee] = await Promise.all([
      connection.getBalance(new PublicKey(userPublicKey)),
      getTransactionFee(connection, tx),
    ]);
    const rentCost = destinationTokenAccount ? 0 : RENT_COSTS.ATA;
    const solInputAmount =
      quoteResponse.inputMint === NATIVE_MINT.toBase58()
        ? Number(quoteResponse.inAmount)
        : 0;
    const required = calculateRequiredBalance(txFee, rentCost + solInputAmount);

    if (walletBalance < required) {
      throw errors.INSUFFICIENT_FUNDS({
        message: "Insufficient SOL balance to execute swap",
        data: { required, available: walletBalance },
      });
    }

    // Generate transaction tag. The destination is part of it because it is
    // where the output lands: two swaps that differ only in where the tokens
    // go are different swaps and must not share a tag.
    const tag = generateTransactionTag({
      type: TRANSACTION_TYPES.SWAP,
      userAddress: userPublicKey,
      inputMint: quoteResponse.inputMint,
      outputMint: quoteResponse.outputMint,
      amount: quoteResponse.inAmount,
      destinationTokenAccount,
    });

    // A destination names an account other than the signer's own, so the
    // signer is told where the output goes before signing for it.
    const destinationSuffix = destinationTokenAccount
      ? ` to ${destinationTokenAccount}`
      : "";

    return {
      transactions: [
        {
          serializedTransaction: serializeTransaction(tx),
          metadata: {
            type: "swap",
            description: `Swap ${quoteResponse.inAmount} ${quoteResponse.inputMint} for ${quoteResponse.outAmount} ${quoteResponse.outputMint}${destinationSuffix}`,
            inputMint: quoteResponse.inputMint,
            outputMint: quoteResponse.outputMint,
            inputAmount: quoteResponse.inAmount,
            outputAmount: quoteResponse.outAmount,
            destinationTokenAccount,
          },
        },
      ],
      parallel: false,
      tag,
      actionMetadata: {
        type: "swap",
        destinationTokenAccount,
        inputTokenAmount: await toTokenAmountOutput(
          new BN(quoteResponse.inAmount),
          quoteResponse.inputMint
        ),
        outputTokenAmount: await toTokenAmountOutput(
          new BN(quoteResponse.outAmount),
          quoteResponse.outputMint
        ),
        inputTokenName: TOKEN_NAMES[quoteResponse.inputMint],
        outputTokenName: TOKEN_NAMES[quoteResponse.outputMint],
      },
    };
  }
);
