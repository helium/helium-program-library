import {
  Keypair,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";
import { expect } from "chai";
import {
  bulkSendRawTransactions,
  bulkSendTransactions,
} from "../src/transaction";
import { compileV1Transaction } from "../src/v1Transaction";

// A node that confirms every signed tx it is sent and never lands one with a
// zeroed signature slot, the way a real node drops it at sigverify. Each
// block height read moves the chain one block closer to blockhash expiry.
const fakeNode = () => {
  const sent: Buffer[] = [];
  const landed = new Set<string>();
  let height = 0;
  const connection: any = {
    rpcEndpoint: `http://node-${Math.random()}`,
    getLatestBlockhash: async () => ({
      blockhash: Keypair.generate().publicKey.toBase58(),
      lastValidBlockHeight: height + 3,
    }),
    getBlockHeight: async () => height++,
    sendRawTransaction: async (raw: Buffer) => {
      sent.push(Buffer.from(raw));
      const tx = VersionedTransaction.deserialize(raw);
      const txid = bs58.encode(tx.signatures[0]);
      if (tx.signatures.every((sig) => sig.some((b) => b !== 0))) {
        landed.add(txid);
      }
      return txid;
    },
    getTransactions: async (txids: string[]) =>
      txids.map((txid) => (landed.has(txid) ? { meta: { err: null } } : null)),
  };
  return { connection, sent };
};

const transferFrom = (from: Keypair) => ({
  feePayer: from.publicKey,
  instructions: [
    SystemProgram.transfer({
      fromPubkey: from.publicKey,
      toPubkey: Keypair.generate().publicKey,
      lamports: 1,
    }),
  ],
  version: 0 as const,
});

const payerOf = (raw: Buffer) =>
  VersionedTransaction.deserialize(raw).message.staticAccountKeys[0];

describe("bulkSendTransactions", () => {
  it("sends the signed txs and fails the unsigned one without resending it", async () => {
    const { connection, sent } = fakeNode();
    const wallet = Keypair.generate();
    const stranger = Keypair.generate();
    const provider: any = {
      connection,
      wallet: {
        publicKey: wallet.publicKey,
        signAllTransactions: async (txs: VersionedTransaction[]) => {
          txs.forEach((tx) => {
            if (tx.message.staticAccountKeys[0].equals(wallet.publicKey)) {
              tx.sign([wallet]);
            }
          });
          return txs;
        },
      },
    };

    let error: Error | undefined;
    try {
      await bulkSendTransactions(
        provider,
        [transferFrom(wallet), transferFrom(stranger)],
        undefined,
        2,
      );
    } catch (e: any) {
      error = e;
    }

    expect(error?.message).to.equal(
      `Missing signature for public key ${stranger.publicKey.toBase58()}`,
    );
    expect(sent.map(payerOf).map((key) => key.toBase58())).to.deep.equal([
      wallet.publicKey.toBase58(),
    ]);
  });
});

describe("bulkSendRawTransactions", () => {
  it("sends the signed v0 tx and fails the unsigned v1 one without sending it", async () => {
    const { connection, sent } = fakeNode();
    const wallet = Keypair.generate();
    const stranger = Keypair.generate();
    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash();
    const signed = new VersionedTransaction(
      new TransactionMessage({
        payerKey: wallet.publicKey,
        recentBlockhash: blockhash,
        instructions: transferFrom(wallet).instructions,
      }).compileToV0Message(),
    );
    signed.sign([wallet]);
    const unsigned = compileV1Transaction({
      feePayer: stranger.publicKey,
      recentBlockhash: blockhash,
      instructions: transferFrom(stranger).instructions,
    });

    let error: Error | undefined;
    try {
      await bulkSendRawTransactions(
        connection,
        [signed, unsigned].map((tx) => Buffer.from(tx.serialize())),
        undefined,
        lastValidBlockHeight,
      );
    } catch (e: any) {
      error = e;
    }

    expect(error?.message).to.equal(
      `Missing signature for public key ${stranger.publicKey.toBase58()}`,
    );
    expect(sent.map(payerOf).map((key) => key.toBase58())).to.deep.equal([
      wallet.publicKey.toBase58(),
    ]);
  });
});
