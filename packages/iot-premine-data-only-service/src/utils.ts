import * as borsh from '@coral-xyz/borsh';
import { chunks } from '@helium/spl-utils';
import lo from '@solana/buffer-layout';
import { PublicKey } from '@solana/web3.js';
import { Client as PgClient } from 'pg';
import format from 'pg-format';
import {
  CompiledTransaction,
  compileNoMerkle,
  compiledIxLayout,
  numBytesCompiledTx,
} from '../../lazy-transactions-sdk';
import { EnrichedIxGroup, TransactionsReturn } from './types';

const acctLayout = borsh.struct([
  borsh.bool('isSigner'),
  borsh.bool('isWritable'),
  borsh.publicKey('pubkey'),
]);

const schema: lo.Layout<CompiledTransaction> = borsh.struct([
  borsh.vec(acctLayout, 'accounts'),
  borsh.vec(compiledIxLayout, 'instructions'),
  borsh.u32('index'),
]);

export const inflatePubkeys = (transactions: any[]) => {
  transactions.forEach((instructions) => {
    instructions.forEach((instruction) => {
      instruction.programId = new PublicKey(instruction.programId);
      instruction.keys.forEach((key) => {
        key.pubkey = new PublicKey(key.pubkey);
      });
      instruction.data = Buffer.from(instruction.data);
    });
  });
};

export const compress = (ct: CompiledTransaction): Buffer => {
  const len =
    4 * 2 +
    4 +
    ct.accounts.length * (32 + 2) +
    ct.instructions.reduce((acc, ix) => {
      return acc + numBytesCompiledTx(ix);
    }, 0);
  const buf = Buffer.alloc(len);
  schema.encode(ct, buf);
  return buf;
};

export const decompress = (ct: Buffer): CompiledTransaction => {
  return schema.decode(ct);
};

export const decompressSigners = (signersRaw: Buffer): Buffer[][] => {
  let signers: Buffer[][] = [];

  let offset = 0;
  let currSigner = 0;
  while (offset < signersRaw.length) {
    let curr = signersRaw.subarray(offset, signersRaw.length);
    const length = curr.readUInt8();
    console.log(length);
    signers[currSigner] = [];

    offset += 1; // Account for the readUint we're about to do
    for (let i = 0; i < length; i++) {
      curr = signersRaw.subarray(offset, signersRaw.length);
      let length = curr.readUInt8();
      offset += 1;
      offset += length;
      signers[currSigner].push(curr.subarray(1, 1 + length));
    }

    currSigner += 1;
  }

  return signers;
};

const MAX_TX_SIZE = 1200;
const MAX_COMPUTE = 1000000;
const baseTxSize =
  32 + // recent blockhash
  12 + // header
  3 + // Array lengths
  8 + // descriminator
  1 + // signer seeds size
  4 + //
  32 + // program id
  32 + // payer signer
  32 + // block
  32 + // compute budget
  62 + // signature
  3 * 32; // Leave room for proofs

export const packTransactions = (
  instructions: EnrichedIxGroup[]
): TransactionsReturn[] => {
  const txs: TransactionsReturn[] = [];
  let currTx: TransactionsReturn = {
    size: baseTxSize,
    compute: 0,
    wallets: new Set<string>(),
    instructions: [],
    signerSeeds: [],
  };

  for (const ix of instructions) {
    if (
      currTx.size + ix.size <= MAX_TX_SIZE &&
      currTx.compute + ix.compute <= MAX_COMPUTE
    ) {
      currTx.instructions.push(...ix.instructions);
      currTx.compute += ix.compute;
      currTx.size += ix.size;
      currTx.signerSeeds.push(...ix.signerSeeds);
      if (ix.wallet) {
        currTx.wallets.add(ix.wallet);
      }
    } else {
      txs.push(currTx);
      currTx = {
        size: baseTxSize + ix.size,
        compute: ix.compute,
        wallets: new Set(ix.wallet ? [ix.wallet] : []),
        instructions: ix.instructions,
        signerSeeds: ix.signerSeeds,
      };
    }
  }

  // Always push last one.
  txs.push(currTx);
  return txs;
};

export const insertTransactions = async (
  lazySigner: PublicKey,
  db: PgClient,
  ixs: EnrichedIxGroup[]
) => {
  const chunkSize = 10000;
  const parallelism = 8;

  const max = (await db.query('SELECT max(id) FROM transactions', [])).rows[0]
    .max;

  const currId = max ? Number(max) + 1 : 0;

  const flatTransactions = packTransactions(ixs);
  const compiledTransactions = compileNoMerkle(lazySigner, flatTransactions);
  const rows = compiledTransactions.map((compiledTransaction, index) => {
    compiledTransaction.index = currId + compiledTransaction.index;
    return [
      compiledTransaction.index,
      compress(compiledTransaction),

      // Compress seeds as [len, bytes]
      compiledTransaction.signerSeeds.reduce((acc, seeds) => {
        return Buffer.concat([
          acc,
          Buffer.from([seeds.length]),
          seeds.reduce(
            (acc, s) => Buffer.concat([acc, Buffer.from([s.length]), s]),
            Buffer.from([])
          ),
        ]);
      }, Buffer.from([])),
      flatTransactions[index].compute || 200000,
    ];
  });

  await Promise.all(
    chunks(chunks(rows, chunkSize), parallelism).map(async (chunk) => {
      for (const c of chunk) {
        const query = format(
          `
        INSERT INTO transactions(
          id, compiled, signers, compute
        )
        VALUES %L
      `,
          c
        );
        await db.query(query);
      }
    })
  );

  const walletRows = flatTransactions
    .map((flatTransaction, index) => {
      const txid = currId + index;
      return Array.from(flatTransaction.wallets).map((wallet) => [
        wallet,
        txid,
      ]);
    })
    .flat();

  await Promise.all(
    chunks(chunks(walletRows, chunkSize), parallelism).map(async (chunk) => {
      for (const c of chunk) {
        const query = format(
          `
        INSERT INTO wallet_transactions(
          wallet, txid
        )
        VALUES %L
      `,
          c
        );
        await db.query(query);
      }
    })
  );
};
