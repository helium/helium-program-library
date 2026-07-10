import { publicProcedure } from "../../../procedures";
import { PublicKey } from "@solana/web3.js";
import { createSolanaConnection } from "@/lib/solana";
import { createMemoInstruction } from "@solana/spl-memo";
import { buildSingleTransactionResponse } from "@/lib/utils/build-transaction";
import {
  generateTransactionTag,
  TRANSACTION_TYPES,
} from "@/lib/utils/transaction-tags";

export const memo = publicProcedure.tokens.memo.handler(
  async ({ input, errors }) => {
    const { walletAddress, memo: memoText } = input;

    const feePayer = new PublicKey(walletAddress);
    const { connection } = createSolanaConnection(walletAddress);

    const instructions = [createMemoInstruction(memoText, [feePayer])];

    const tag = generateTransactionTag({
      type: TRANSACTION_TYPES.MEMO,
      walletAddress,
      memo: memoText,
    });

    return buildSingleTransactionResponse({
      connection,
      instructions,
      feePayer,
      addressLookupTableAddresses: [],
      insufficientFundsMessage: "Insufficient SOL balance for transaction fees",
      errors,
      tag,
      transactionMetadata: { type: "memo", description: "Memo" },
      actionMetadata: { type: "memo" },
    });
  }
);
