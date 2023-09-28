import cors from '@fastify/cors';
import {
  blockKey,
  init,
  isExecuted,
  lazySignerKey,
  lazyTransactionsKey,
} from '@helium/lazy-transactions-sdk';
import { chunks } from '@helium/spl-utils';
import {
  ComputeBudgetProgram,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import AWS from 'aws-sdk';
import Fastify, { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import {
  LAZY_TRANSACTIONS_NAME,
  PGDATABASE,
  PGHOST,
  PGPASSWORD,
  PGPORT,
  PGUSER,
  AWS_REGION,
} from './env';
import { provider, wallet } from './solana';
import { decompress, decompressSigners } from './utils';

(async () => {
  const [lazySigner] = lazySignerKey(LAZY_TRANSACTIONS_NAME);
  const [lazyTransactions] = lazyTransactionsKey(LAZY_TRANSACTIONS_NAME);
  const program = await init(provider);
  const isRds = PGHOST.includes('rds.amazonaws.com');
  const pool = new Pool({
    port: PGPORT,
    host: PGHOST,
    database: PGDATABASE,
    user: PGUSER,
    password: async () => {
      let password = PGPASSWORD;
      if (isRds && !password) {
        const signer = new AWS.RDS.Signer({
          region: AWS_REGION,
          hostname: PGHOST,
          port: PGPORT,
          username: PGUSER,
        });
        password = await new Promise((resolve, reject) =>
          signer.getAuthToken({}, (err, token) => {
            if (err) {
              return reject(err);
            }
            resolve(token);
          })
        );
      }
      return password;
    },
  });

  async function getTransactions(results: any[]): Promise<Array<number[]>> {
    const recentBlockhash = (await provider.connection.getLatestBlockhash())
      .blockhash;

    console.log(`Found ${results.length} transactions to execute}`);
    const lt = await program.account.lazyTransactionsV0.fetch(lazyTransactions);
    const executed = lt.executed;
    const lazyTxns = await program.account.lazyTransactionsV0.fetch(
      lazyTransactions
    );

    // @ts-ignore
    const asExecuteTxs: { id: number; transaction: TransactionMessage }[] = (
      await Promise.all(
        results.map(
          async (
            {
              proof,
              compiled,
              id,
              signers: signersRaw,
              compute,
            }: {
              id: number;
              compiled: Buffer;
              proof: string[];
              signers: Buffer;
              compute: number;
            },
            idx
          ) => {
            const hasRun = isExecuted(executed, idx);
            const compiledTx = decompress(compiled);
            const block = blockKey(lazyTransactions, id)[0];
            const signers = decompressSigners(signersRaw);

            if (!hasRun && compiledTx.instructions.length > 0) {
              const ix = await program.methods
                .executeTransactionV0({
                  instructions: compiledTx.instructions,
                  index: compiledTx.index,
                  signerSeeds: signers,
                })
                .accountsStrict({
                  payer: provider.wallet.publicKey,
                  lazyTransactions,
                  canopy: lazyTxns.canopy,
                  lazySigner,
                  block,
                  systemProgram: SystemProgram.programId,
                })
                .remainingAccounts([
                  ...compiledTx.accounts,
                  ...proof.map((p) => ({
                    pubkey: new PublicKey(Buffer.from(p, 'hex')),
                    isWritable: false,
                    isSigner: false,
                  })),
                ])
                .instruction();

              return {
                id,
                transaction: new TransactionMessage({
                  payerKey: provider.wallet.publicKey,
                  recentBlockhash,
                  instructions: [
                    ComputeBudgetProgram.setComputeUnitLimit({
                      units: compute,
                    }),
                    ix,
                  ],
                }),
              };
            }
          }
        )
      )
    ).filter((v) => Boolean(v && v.transaction));

    if (asExecuteTxs.length > 0) {
      return await Promise.all(
        asExecuteTxs.map((val) => {
          const { transaction: tx, id } = val;
          const ret = new VersionedTransaction(tx.compileToV0Message());

          try {
            ret.sign([wallet]);
            return Buffer.from(ret.serialize()).toJSON().data;
          } catch (e: any) {
            console.error('Failed to serialize tx with id', id);
            PublicKey.prototype.toString = PublicKey.prototype.toBase58;
            console.error(ret);
            console.error(ret.message.addressTableLookups);
            throw e;
          }
        })
      );
    }

    return [];
  }

  const server: FastifyInstance = Fastify({ logger: true });
  server.register(cors, { origin: '*' });

  server.get('/health', async () => ({ ok: true }));

  server.get<{
    Querystring: { limit?: number; offset?: number };
  }>('/migrate', async (req, res) => {
    const { limit, offset } = req.query;
    const client = await pool.connect();

    try {
      const results = (
        await client.query(
          `SELECT transactions.*, transaction_proofs.proof
        FROM transactions
        JOIN transaction_proofs ON transactions.id = transaction_proofs.id
        ORDER BY ID ASC
        LIMIT $1
        OFFSET $2
        `,
          [limit || 200, offset || 0]
        )
      ).rows;

      const transactions = await getTransactions(results);

      res.code(200).send({
        transactions: results || [],
        count: Number(
          (await client.query('SELECT count(*) FROM transactions', [])).rows[0]
            .count
        ),
      });
    } catch (err) {
      res.code(500).send(err);
      console.error(err);
      throw err;
    } finally {
      client.release();
    }
  });

  try {
    await server.listen({ port: 8081, host: '0.0.0.0' });
    const address = server.server.address();
    const port = typeof address === 'string' ? address : address?.port;
    console.log(`Running on 0.0.0.0:${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
})();
