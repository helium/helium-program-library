import * as anchor from "@coral-xyz/anchor";
import { PublicKey, TransactionSignature } from "@solana/web3.js";

interface GetTransactionSignaturesUptoBlockTimeArgs {
  programId: PublicKey;
  blockTime: number;
  provider: anchor.Provider;
}

export const getTransactionSignaturesUptoBlockTime = async ({
  programId,
  blockTime,
  provider,
}: Omit<
  GetTransactionSignaturesUptoBlockTimeArgs,
  "beforeSignature" | "transactionSignatures"
>): Promise<TransactionSignature[]> => {
  const results: TransactionSignature[] = [];
  let beforeSignature: TransactionSignature | undefined = undefined;

  try {
    while (true) {
      const transactions = await provider.connection.getSignaturesForAddress(
        programId,
        { before: beforeSignature },
        "finalized"
      );

      if (
        transactions.length === 0 ||
        (transactions[0].blockTime && transactions[0].blockTime < blockTime)
      ) {
        break;
      }

      const newSignatures = transactions
        .filter((tx) => !tx.err && tx.blockTime && tx.blockTime >= blockTime)
        .map((tx) => tx.signature);

      results.push(...newSignatures);
      beforeSignature = transactions[transactions.length - 1].signature;
    }

    return results;
  } catch (err) {
    console.error("Error fetching transaction signatures:", err);
    return results;
  }
};
