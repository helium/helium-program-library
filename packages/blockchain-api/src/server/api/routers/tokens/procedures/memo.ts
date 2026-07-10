import { publicProcedure } from "../../../procedures";
import { PublicKey } from "@solana/web3.js";
import { createSolanaConnection } from "@/lib/solana";
import { createMemoInstruction } from "@solana/spl-memo";
import { NATIVE_MINT } from "@solana/spl-token";
import {
  buildVersionedTransaction,
  serializeTransaction,
} from "@/lib/utils/build-transaction";
import {
  generateTransactionTag,
  TRANSACTION_TYPES,
} from "@/lib/utils/transaction-tags";
import {
  getTransactionFee,
  calculateRequiredBalance,
} from "@/lib/utils/balance-validation";
import { toTokenAmountOutput } from "@/lib/utils/token-math";
import BN from "bn.js";

export const memo = publicProcedure.tokens.memo.handler(
  async ({ input, errors }) => {
    const { walletAddress, memo: memoText } = input;

    const feePayer = new PublicKey(walletAddress);
    const { connection } = createSolanaConnection(walletAddress);

    const instructions = [createMemoInstruction(memoText, [feePayer])];

    const tx = await buildVersionedTransaction({
      connection,
      draft: { instructions, feePayer, addressLookupTableAddresses: [] },
    });

    const tag = generateTransactionTag({
      type: TRANSACTION_TYPES.MEMO,
      walletAddress,
      memo: memoText,
    });

    const estimatedSolFeeLamports = calculateRequiredBalance(
      getTransactionFee(tx),
      0,
    );
    const walletBalance = await connection.getBalance(feePayer);
    if (walletBalance < estimatedSolFeeLamports) {
      throw errors.INSUFFICIENT_FUNDS({
        message: "Insufficient SOL balance for transaction fees",
        data: { required: estimatedSolFeeLamports, available: walletBalance },
      });
    }

    return {
      transactionData: {
        transactions: [
          {
            serializedTransaction: serializeTransaction(tx),
            metadata: {
              type: "memo",
              description: "Memo",
            },
          },
        ],
        parallel: false,
        tag,
        actionMetadata: {
          type: "memo",
        },
      },
      estimatedSolFee: await toTokenAmountOutput(
        new BN(estimatedSolFeeLamports),
        NATIVE_MINT.toBase58(),
      ),
    };
  },
);
