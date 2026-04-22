import { publicProcedure } from "../../../procedures";
import { PublicKey, SystemProgram, Connection } from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  getMint,
} from "@solana/spl-token";
import {
  buildVersionedTransaction,
  serializeTransaction,
} from "@/lib/utils/build-transaction";
import {
  generateTransactionTag,
  TRANSACTION_TYPES,
} from "@/lib/utils/transaction-tags";
import { TOKEN_MINTS, TOKEN_NAMES } from "@/lib/constants/tokens";
import {
  getTransactionFee,
  calculateRequiredBalance,
  RENT_COSTS,
} from "@/lib/utils/balance-validation";
import { toTokenAmountOutput } from "@/lib/utils/token-math";
import { NATIVE_MINT } from "@solana/spl-token";
import BN from "bn.js";

export const transfer = publicProcedure.tokens.transfer.handler(
  async ({ input, errors }) => {
    const { walletAddress, destination, tokenAmount } = input;

    const feePayer = new PublicKey(walletAddress);
    const destKey = new PublicKey(destination);
    const connection = new Connection(process.env.SOLANA_RPC_URL!);

    let rawAmount: bigint;

    try {
      rawAmount = BigInt(tokenAmount.amount);
    } catch (e) {
      throw errors.BAD_REQUEST({
        message: `Invalid amount: ${
          e instanceof Error ? e.message : "could not parse amount"
        }`,
      });
    }

    if (rawAmount <= BigInt(0)) {
      throw errors.BAD_REQUEST({ message: "Amount must be greater than 0" });
    }

    const isSol = tokenAmount.mint === TOKEN_MINTS.WSOL;

    const instructions: (
      | ReturnType<typeof SystemProgram.transfer>
      | ReturnType<typeof createAssociatedTokenAccountIdempotentInstruction>
      | ReturnType<typeof createTransferCheckedInstruction>
    )[] = [];

    let needsAta = false;

    if (isSol) {
      const lamports = rawAmount;

      instructions.push(
        SystemProgram.transfer({
          fromPubkey: feePayer,
          toPubkey: destKey,
          lamports,
        }),
      );
    } else {
      const mintKey = new PublicKey(tokenAmount.mint);
      const senderAta = getAssociatedTokenAddressSync(mintKey, feePayer, true);
      const destAta = getAssociatedTokenAddressSync(mintKey, destKey, true);

      const destAtaInfo = await connection.getAccountInfo(destAta);
      needsAta = !destAtaInfo;

      const mintInfo = await getMint(connection, mintKey);

      instructions.push(
        createAssociatedTokenAccountIdempotentInstruction(
          feePayer,
          destAta,
          destKey,
          mintKey,
        ),
      );

      instructions.push(
        createTransferCheckedInstruction(
          senderAta,
          mintKey,
          destAta,
          feePayer,
          rawAmount,
          mintInfo.decimals,
        ),
      );
    }

    const tx = await buildVersionedTransaction({
      connection,
      draft: { instructions, feePayer, addressLookupTableAddresses: [] },
    });

    const tag = generateTransactionTag({
      type: TRANSACTION_TYPES.TOKEN_TRANSFER,
      walletAddress,
      destination,
      mint: tokenAmount.mint,
      amount: tokenAmount.amount,
    });

    // For SOL transfers, no rent. For SPL, ATA rent if needed
    const rentCost = needsAta ? RENT_COSTS.ATA : 0;
    const txFee = getTransactionFee(tx);
    const estimatedSolFeeLamports = calculateRequiredBalance(txFee, rentCost);

    const walletBalance = await connection.getBalance(feePayer);
    const totalCost = isSol
      ? Number(rawAmount) + estimatedSolFeeLamports
      : estimatedSolFeeLamports;
    if (walletBalance < totalCost) {
      throw errors.INSUFFICIENT_FUNDS({
        message: isSol
          ? "Insufficient SOL balance for transfer and transaction fees"
          : "Insufficient SOL balance for transaction fees",
        data: { required: totalCost, available: walletBalance },
      });
    }

    const transferTokenAmount = await toTokenAmountOutput(
      new BN(tokenAmount.amount),
      tokenAmount.mint,
    );
    const tokenName = TOKEN_NAMES[tokenAmount.mint];

    return {
      transactionData: {
        transactions: [
          {
            serializedTransaction: serializeTransaction(tx),
            metadata: {
              type: "token_transfer",
              description: `Transfer ${tokenName ?? "Token"}`,
              tokenAmount: transferTokenAmount,
              tokenName,
              recipient: destination,
            },
          },
        ],
        parallel: false,
        tag,
        actionMetadata: {
          type: "token_transfer",
          tokenAmount: transferTokenAmount,
          tokenName,
          recipient: destination,
        },
      },
      estimatedSolFee: await toTokenAmountOutput(
        new BN(estimatedSolFeeLamports),
        NATIVE_MINT.toBase58(),
      ),
    };
  },
);
