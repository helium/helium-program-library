import { Program } from "@coral-xyz/anchor";
import cors from "@fastify/cors";
import Address from "@helium/address";
import { ED25519_KEY_TYPE } from "@helium/address/build/KeyTypes";
import { LazyTransactions } from "@helium/idls/lib/types/lazy_transactions";
import {
  blockKey,
  init,
  lazySignerKey,
  lazyTransactionsKey,
} from "@helium/lazy-transactions-sdk";
import {
  ComputeBudgetProgram,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import AWS from "aws-sdk";
import Fastify, { FastifyInstance } from "fastify";
import { Pool } from "pg";
import { LAZY_TRANSACTIONS_NAME } from "./env";
import { getMigrateTransactions } from "./ledger";
import { provider, wallet } from "./solana";
import { decompress, decompressSigners, shouldThrottle } from "./utils";

export const chunks = <T>(array: T[], size: number): T[][] =>
  Array.apply(0, new Array(Math.ceil(array.length / size))).map((_, index) =>
    array.slice(index * size, (index + 1) * size)
  );

const host = process.env.PGHOST || "localhost";
const isRds = host.includes("rds.amazonaws.com");
const port = Number(process.env.PGPORT) || 5432;
const pool = new Pool({
  password: async () => {
    let password = process.env.PGPASSWORD;
    if (isRds && !password) {
      const signer = new AWS.RDS.Signer({
        region: process.env.AWS_REGION,
        hostname: process.env.PGHOST,
        port,
        username: process.env.PGUSER,
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

const lazySigner = lazySignerKey(LAZY_TRANSACTIONS_NAME)[0];
const lazyTransactions = lazyTransactionsKey(LAZY_TRANSACTIONS_NAME)[0];
let program: Program<LazyTransactions>;

const server: FastifyInstance = Fastify({
  logger: true,
});
server.register(cors, {
  origin: "*",
});
server.get("/health", async () => {
  return { ok: true };
});

server.get<{ Params: { heliumWallet: string } }>(
  "/helium/:heliumWallet",
  async (request) => {
    const addr = Address.fromB58(request.params.heliumWallet);

    return { solanaAddress: new PublicKey(addr.publicKey).toBase58() };
  }
);

server.get<{ Params: { solanaWallet: string } }>(
  "/solana/:solanaWallet",
  async (request) => {
    const pkey = new PublicKey(request.params.solanaWallet);
    const heliumAddr = new Address(0, 0, ED25519_KEY_TYPE, pkey.toBytes());
    return { heliumAddress: heliumAddr.b58 };
  }
);

server.get("/top-wallets", async () => {
  const client = await pool.connect();
  try {
    const results = (
      await client.query(
        `SELECT wallet_transactions.wallet, count(*)
         FROM transactions 
         JOIN wallet_transactions ON transactions.id = wallet_transactions.txid
         GROUP BY wallet_transactions.wallet
         ORDER BY count DESC
        `
      )
    ).rows.map((row) => ({ ...row, count: Number(row.count) }));

    return results;
  } catch (e: any) {
    console.error(e);
    throw e;
  } finally {
    await client.release();
  }
});

async function getTransactions(
  results: any[],
  luts: any[]
): Promise<Array<number[]>> {
  const recentBlockhash = (await provider.connection.getLatestBlockhash())
    .blockhash;

  console.log(`Found ${results.length} transactions to migrate}`);
  const blocks = results.map((r) => blockKey(lazyTransactions, r.id)[0]);
  const blocksExist = (
    await Promise.all(
      chunks(blocks, 100).map(
        async (chunk) =>
          await provider.connection.getMultipleAccountsInfo(
            chunk as PublicKey[],
            "confirmed"
          )
      )
    )
  ).flat();
  const lazyTxns = await program.account.lazyTransactionsV0.fetch(
    lazyTransactions
  );

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
          const hasRun = blocksExist[idx];
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
                  pubkey: new PublicKey(Buffer.from(p, "hex")),
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
    const lookupTableAccs = await Promise.all(
      luts.map(
        async (lut) =>
          (
            await provider.connection.getAddressLookupTable(new PublicKey(lut))
          ).value
      )
    );
    return await Promise.all(
      asExecuteTxs.map((val) => {
        const { transaction: tx, id } = val;
        const ret = new VersionedTransaction(
          tx.compileToV0Message(lookupTableAccs)
        );

        try {
          ret.sign([wallet]);
          return Buffer.from(ret.serialize()).toJSON().data;
        } catch (e: any) {
          console.error("Failed to serialize tx with id", id);
          PublicKey.prototype.toString = PublicKey.prototype.toBase58;
          console.error(ret);
          console.error(ret.message.addressTableLookups);
          throw e;
        }
      })
    );
  }
}

const ATTESTATION =
  "I attest that both the source and destination wallets are owned and controlled by the same individual or entity, and that I have legal authority to perform this transaction on behalf of that individual or entity.";
server.post<{
  Body: { from: string; to: string; attestation: string };
}>("/ledger/migrate", async (request, reply) => {
  const from = new PublicKey(request.body.from);
  const to = new PublicKey(request.body.to);
  if (request.body.attestation !== ATTESTATION) {
    return reply.code(400).send({ error: "Invalid attestation" });
  }

  return (await getMigrateTransactions(from, to)).map(
    (tx) =>
      Buffer.from(tx.serialize({ requireAllSignatures: false })).toJSON().data
  );
});

server.get<{
  Querystring: { limit?: number; offset?: number };
  Params: { wallet: string };
}>("/migrate/:wallet", async (request, reply) => {
  if (shouldThrottle()) {
    reply.code(503).send();
  }

  const { wallet: userWallet } = request.params;
  const { limit, offset } = request.query;
  const client = await pool.connect();

  try {
    const results = (
      await client.query(
        `SELECT transactions.*, transaction_proofs.proof FROM transactions
        JOIN wallet_transactions ON transactions.id = wallet_transactions.txid
        JOIN transaction_proofs ON transactions.id = transaction_proofs.id
        WHERE wallet_transactions.wallet = $1
        LIMIT $2
        OFFSET $3
        `,
        [userWallet, limit || 200, offset || 0]
      )
    ).rows;
    const luts = (
      await client.query("SELECT * FROM lookup_tables", [])
    ).rows.map((row) => row.pubkey);
    const transactions = await getTransactions(results, luts);
    return {
      transactions: transactions || [],
      count: Number(
        (
          await client.query(
            "SELECT count(*) FROM wallet_transactions WHERE wallet = $1",
            [userWallet]
          )
        ).rows[0].count
      ),
    };
  } catch (e: any) {
    console.error(e);
    throw e;
  } finally {
    await client.release();
  }
});

server.get<{
  Querystring: { limit?: number; offset?: number };
  Params: { hotspot: string };
}>("/migrate/hotspot/:hotspot", async (request, reply) => {
  const { hotspot } = request.params;
  const { limit, offset } = request.query;
  const client = await pool.connect();

  try {
    const results = (
      await client.query(
        `SELECT transactions.*, transaction_proofs.proof FROM transactions
        JOIN hotspot_transactions ON transactions.id = hotspot_transactions.txid
        JOIN transaction_proofs ON transactions.id = transaction_proofs.id
        WHERE hotspot_transactions.hotspot = $1
        LIMIT $2
        OFFSET $3
        `,
        [hotspot, limit || 200, offset || 0]
      )
    ).rows;
    const luts = (
      await client.query("SELECT * FROM lookup_tables", [])
    ).rows.map((row) => row.pubkey);
    const transactions = await getTransactions(results, luts);
    return {
      transactions: transactions || [],
      count: Number(
        (
          await client.query(
            "SELECT count(*) FROM hotspot_transactions WHERE hotspot = $1",
            [hotspot]
          )
        ).rows[0].count
      ),
    };
  } catch (e: any) {
    console.error(e);
    throw e;
  } finally {
    await client.release();
  }
});

server.get<{
  Querystring: { limit?: number; offset?: number };
  Params: { hotspot: string };
}>("/migrate/hotspots", async (request, reply) => {
  const { limit, offset } = request.query;
  const client = await pool.connect();

  try {
    const results = (
      await client.query(
        `SELECT transactions.*, transaction_proofs.proof FROM transactions
        JOIN hotspot_transactions ON transactions.id = hotspot_transactions.txid
        JOIN transaction_proofs ON transactions.id = transaction_proofs.id
        LIMIT $1
        OFFSET $2
        `,
        [limit || 200, offset || 0]
      )
    ).rows;
    const luts = (
      await client.query("SELECT * FROM lookup_tables", [])
    ).rows.map((row) => row.pubkey);
    const transactions = await getTransactions(results, luts);
    return {
      transactions: transactions || [],
      count: Number(
        (
          await client.query(
            "SELECT count(*) FROM hotspot_transactions",
            []
          )
        ).rows[0].count
      ),
    };
  } catch (e: any) {
    console.error(e);
    throw e;
  } finally {
    await client.release();
  }
});

server.get<{
  Querystring: { limit?: number; offset?: number };
}>("/migrate", async (request, reply) => {
  const { limit, offset } = request.query;
  const client = await pool.connect();

  try {
    const results = (
      await client.query(
        `SELECT transactions.*, transaction_proofs.proof
        FROM transactions 
        JOIN transaction_proofs ON transactions.id = transaction_proofs.id
        ORDER BY is_router DESC, ID ASC 
        LIMIT $1 
        OFFSET $2
        `,
        [limit || 200, offset || 0]
      )
    ).rows;
    const luts = (
      await client.query("SELECT * FROM lookup_tables", [])
    ).rows.map((row) => row.pubkey);
    const transactions = await getTransactions(results, luts);
    return {
      transactions: transactions || [],
      count: Number(
        (await client.query("SELECT count(*) FROM transactions", [])).rows[0]
          .count
      ),
    };
  } catch (e: any) {
    console.error(e);
    throw e;
  } finally {
    await client.release();
  }
});

const start = async () => {
  try {
    program = await init(provider);
    await server.listen({ port: 8081, host: "0.0.0.0" });

    const address = server.server.address();
    const port = typeof address === "string" ? address : address?.port;
    console.log(`Running on 0.0.0.0:${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};
start();
