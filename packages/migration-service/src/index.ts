import cors from "@fastify/cors";
import Address from "@helium/address";
import { ED25519_KEY_TYPE } from "@helium/address/build/KeyTypes";
import { LazyTransactions } from "@helium/idls/lib/types/lazy_transactions";
import {
  blockKey, init,
  lazySignerKey,
  lazyTransactionsKey
} from "@helium/lazy-transactions-sdk";
import { truthy } from "@helium/spl-utils";
import { Program } from "@project-serum/anchor";
import {
  ComputeBudgetProgram,
  PublicKey,
  SystemProgram, TransactionMessage,
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



server.get<{ Params: { wallet: string } }>(
  "/migrate/:wallet",
  async (request, reply) => {
    const { wallet: userWallet } = request.params;
    const client = await pool.connect();

    try {
      const results = (
        await client.query(
          "SELECT * FROM transactions WHERE wallet = $1",
          [userWallet]
        )
      ).rows;
      const recentBlockhash = (await provider.connection.getLatestBlockhash())
        .blockhash;

      console.log(`Found ${results.length} transactions to migrate}`)
      const asExecuteTxs: TransactionMessage[] = (
        await Promise.all(
          results.map(
            async ({
              proof,
              compiled,
              id,
            }: {
              id: number;
              lookup_table: string;
              compiled: Buffer;
              proof: string[];
            }) => {
              const compiledTx = decompress(compiled);
              const block = blockKey(lazyTransactions, id)[0];
              const hasRun = await provider.connection.getAccountInfo(
                block,
                "confirmed"
              );
              if (!hasRun) {
                const ix = await program.methods
                  .executeTransactionV0({
                    proof: proof.map(
                      (p) => Buffer.from(p, "hex").toJSON().data
                    ),
                    instructions: compiledTx.instructions,
                    index: compiledTx.index,
                  })
                  .accountsStrict({
                    payer: provider.wallet.publicKey,
                    lazyTransactions,
                    lazySigner,
                    block,
                    systemProgram: SystemProgram.programId,
                  })
                  .remainingAccounts(compiledTx.accounts)
                  .instruction();

                return new TransactionMessage({
                  payerKey: provider.wallet.publicKey,
                  recentBlockhash,
                  instructions: [
                    ComputeBudgetProgram.setComputeUnitLimit({ units: 350000 }),
                    ix,
                  ],
                });
              }
            }
          )
        )
      ).filter(truthy);

      if (asExecuteTxs.length > 0) {
        const lookupTableAcc = (
          await provider.connection.getAddressLookupTable(
            new PublicKey(results[0].lookup_table)
          )
        ).value;
        return {
          transactions: await Promise.all(
            asExecuteTxs.map((tx, idx) => {
              const ret = new VersionedTransaction(
                tx.compileToV0Message([lookupTableAcc])
              );

              ret.sign([wallet]);
              return Buffer.from(ret.serialize()).toJSON().data;
            })
          ),
        };
      }
      return {
        transactions: [],
      };
    }  catch (e: any) {
      console.error(e);
      throw e;
    }
    finally {
      await client.release();
    }
  }
);

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
