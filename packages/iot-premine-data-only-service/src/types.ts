import { TransactionInstruction } from '@solana/web3.js';
import { LazyTransaction } from '@helium/lazy-transactions-sdk';

export type EnrichedIxGroup = {
  signerSeeds: Buffer[][];
  instructions: TransactionInstruction[];
  compute: number;
  size: number;
  wallet: string | undefined;
};

export type TransactionsReturn = LazyTransaction & {
  size: number;
  compute: number;
  wallets: Set<string>;
};
