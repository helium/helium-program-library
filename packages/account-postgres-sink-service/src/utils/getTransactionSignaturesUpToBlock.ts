import * as anchor from '@coral-xyz/anchor';
import { PublicKey, TransactionSignature } from '@solana/web3.js';

interface GetTransactionSignaturesUptoBlockTimeArgs {
  programId: PublicKey;
  provider: anchor.Provider;
  blockTime: number;
  beforeSignature?: TransactionSignature;
  transactionSignatures?: TransactionSignature[];
}

export const getTransactionSignaturesUptoBlockTime = async ({
  programId,
  blockTime,
  beforeSignature = undefined,
  transactionSignatures = [],
  provider,
}: GetTransactionSignaturesUptoBlockTimeArgs): Promise<
  TransactionSignature[]
> => {
  try {
    const connection = provider.connection;
    // Fetch transaction signatures for the address with pagination
    const transactions = await connection.getSignaturesForAddress(
      programId,
      {
        before: beforeSignature,
      },
      'confirmed'
    );

    if (transactions.length === 0 || transactions[0].blockTime < blockTime) {
      return transactionSignatures;
    }

    transactions.forEach((transaction) => {
      if (!transaction.err && transaction.blockTime >= blockTime) {
        transactionSignatures.push(transaction.signature);
      }
    });

    return getTransactionSignaturesUptoBlockTime({
      programId,
      blockTime,
      beforeSignature: transactions[transactions.length - 1].signature,
      transactionSignatures,
      provider,
    });
  } catch (err) {
    console.error('Error fetching transaction signatures:', err);
    return [];
  }
};
