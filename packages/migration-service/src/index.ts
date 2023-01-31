import cors from "@fastify/cors";
import Address from "@helium/address";
import { ED25519_KEY_TYPE } from "@helium/address/build/KeyTypes";
import { LazyTransactions } from "@helium/idls/lib/types/lazy_transactions";
import {
  blockKey,
  init,
  lazySignerKey,
  lazyTransactionsKey
} from "@helium/lazy-transactions-sdk";
import { chunks } from "@helium/spl-utils";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, transferInstructionData } from "@solana/spl-token";
import { Program } from "@coral-xyz/anchor";
import {
  ComputeBudgetProgram,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction
} from "@solana/web3.js";
import Fastify, { FastifyInstance } from "fastify";
import { Pool } from "pg";
import { LAZY_TRANSACTIONS_NAME } from "./env";
import { provider, wallet } from "./solana";
import { decompress } from "./utils";

const pool = new Pool();

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

async function getTransactions(results: any[], luts: any[]): Promise<Array<number[]>> {
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
  const lazyTxns = await program.account.lazyTransactionsV0.fetch(lazyTransactions);

  const asExecuteTxs: { id: number; transaction: TransactionMessage }[] = (
    await Promise.all(
      results.map(
        async (
          {
            proof,
            compiled,
            id,
            signers: signersRaw,
            compute
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
    // console.log(compiledTx.accounts);
    // console.log(compiledTx.instructions);
    compiledTx.instructions.forEach(i => {
      const pid = compiledTx.accounts[i.programIdIndex].pubkey;
      if (pid.equals(ASSOCIATED_TOKEN_PROGRAM_ID)) {
        console.log("mint", compiledTx.accounts[i.accounts[3]].pubkey);
      } else if (pid.equals(TOKEN_PROGRAM_ID)) {
      // console.log(compiledTx.accounts[i.accounts[1]].pubkey);
      console.log(transferInstructionData.decode(i.data));
      }

    })

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

server.get<{
  Querystring: { limit?: number; offset?: number };
  Params: { wallet: string };
}>("/migrate/:wallet", async (request, reply) => {
  const { wallet: userWallet } = request.params;
  const { limit, offset } = request.query;
  const client = await pool.connect();

  try {
    const results = (
      await client.query(
        `SELECT * FROM transactions
        JOIN wallet_transactions ON transactions.id = wallet_transactions.txid
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
}>("/migrate", async (request, reply) => {
  const { limit, offset } = request.query;
  const client = await pool.connect();

  try {
    const results = (
      await client.query(
        "SELECT * FROM transactions ORDER BY is_router DESC, ID ASC LIMIT $1 OFFSET $2",
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
            "SELECT count(*) FROM transactions",
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
