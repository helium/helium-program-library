import cors from "@fastify/cors";
import { LazyTransactions } from "@helium/idls/lib/types/lazy_transactions";
import {
  blockKey, compile,
  init,
  lazySignerKey,
  lazyTransactionsKey
} from "@helium/lazy-transactions-sdk";
import { truthy } from "@helium/spl-utils";
import { Program } from "@project-serum/anchor";
import { PublicKey, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import Fastify, { FastifyInstance } from "fastify";
import fs from "fs";
import { TRANSACTIONS_PATH } from "./env";
import { provider, wallet } from "./solana";
import { inflatePubkeys } from "./utils";


const { lazyTransactions: lazyTransactionsName, transactions, lookupTable, byWallet } = JSON.parse(
  fs.readFileSync(TRANSACTIONS_PATH, "utf8")
);

const lazySigner = lazySignerKey(lazyTransactionsName)[0];
const lazyTransactions = lazyTransactionsKey(lazyTransactionsName)[0];
let program: Program<LazyTransactions>;


inflatePubkeys(transactions);

const { merkleTree, compiledTransactions } = compile(lazySigner, transactions);

const server: FastifyInstance = Fastify({
  logger: true,
});
server.register(cors, {
  origin: "*",
});
server.get("/health", async () => {
  return { ok: true };
});

server.get<{ Params: { wallet: string } }>(
  "/migrate/:wallet",
  async (request, reply) => {
    const { wallet: userWallet } = request.params;
    const txs = byWallet[userWallet] as number[];
    
    const recentBlockhash = (await provider.connection.getLatestBlockhash())
      .blockhash;
    const asExecuteTxs: TransactionMessage[] = (
      await Promise.all(
        txs.map(async (index: number) => {
          const hasRun = await provider.connection.getAccountInfo(
            blockKey(lazyTransactions, index)[0]
          );
          if (!hasRun) {
            const compiledTx = compiledTransactions[index];
            const ix = await program.methods
              .executeTransactionV0({
                proof: merkleTree
                  .getProof(compiledTx.index)
                  .proof.map((p) => p.toJSON().data),
                instructions: compiledTx.instructions,
                index: compiledTx.index,
              })
              .accounts({ lazyTransactions, lazySigner })
              .remainingAccounts(compiledTx.accounts)
              .instruction();

            return new TransactionMessage({
              payerKey: provider.wallet.publicKey,
              recentBlockhash,
              instructions: [
                ix,
              ],
            })
          }
        })
      )
    ).filter(truthy);

    if (asExecuteTxs.length > 0) {
      const lookupTableAcc = (
        await provider.connection.getAddressLookupTable(new PublicKey(lookupTable))
      ).value;
      return {
        transactions: await Promise.all(
          asExecuteTxs.map((tx) => {
            const ret = new VersionedTransaction(
              tx.compileToV0Message([lookupTableAcc])
            )
            ret.sign([wallet])
            return Buffer.from(ret.serialize()).toJSON().data;
          })
        ),
      };
    }
    return {
      transactions: [],
    };
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
