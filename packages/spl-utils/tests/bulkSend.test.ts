import {
  Keypair,
  PublicKey,
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
// Txs paid by `stuckPayer` never land, so their blockhash expires. Txs paid
// by `failingPayer` land with an instruction error.
const fakeNode = (stuckPayer?: PublicKey, failingPayer?: PublicKey) => {
  const failed = new Set<string>();
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
      if (
        tx.signatures.every((sig) => sig.some((b) => b !== 0)) &&
        !(stuckPayer && tx.message.staticAccountKeys[0].equals(stuckPayer))
      ) {
        landed.add(txid);
        if (
          failingPayer &&
          tx.message.staticAccountKeys[0].equals(failingPayer)
        ) {
          failed.add(txid);
        }
      }
      return txid;
    },
    getTransactions: async (txids: string[]) =>
      txids.map((txid) =>
        landed.has(txid)
          ? {
              meta: {
                err: failed.has(txid) ? { InstructionError: [0, 1] } : null,
              },
            }
          : null,
      ),
    getTransaction: async () => null,
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

const sigOf = (raw: Buffer) =>
  bs58.encode(VersionedTransaction.deserialize(raw).signatures[0]);

const signedTransferFrom = (from: Keypair, recentBlockhash: string) => {
  const tx = new VersionedTransaction(
    new TransactionMessage({
      payerKey: from.publicKey,
      recentBlockhash,
      instructions: transferFrom(from).instructions,
    }).compileToV0Message(),
  );
  tx.sign([from]);
  return tx;
};

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
    expect((error as any)?.landedSignatures).to.deep.equal([sigOf(sent[0])]);
    expect(sent.map(payerOf).map((key) => key.toBase58())).to.deep.equal([
      wallet.publicKey.toBase58(),
    ]);
  });

  it("reports the unsigned tx and the expiry when another tx's blockhash expires", async () => {
    const wallet = Keypair.generate();
    const stranger = Keypair.generate();
    const { connection } = fakeNode(wallet.publicKey);
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
        1,
      );
    } catch (e: any) {
      error = e;
    }

    expect(error?.message).to.equal(
      `Failed to submit all txs after blockhashes expired, 1 remain. Missing signature for public key ${stranger.publicKey.toBase58()}`,
    );
  });

  it("reports the unsigned tx and the on-chain failure", async () => {
    const wallet = Keypair.generate();
    const stranger = Keypair.generate();
    const { connection } = fakeNode(undefined, wallet.publicKey);
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
        [transferFrom(stranger), transferFrom(wallet)],
        undefined,
        2,
      );
    } catch (e: any) {
      error = e;
    }

    expect(error?.message).to.equal(
      `Failed to run txs. Missing signature for public key ${stranger.publicKey.toBase58()}`,
    );
  });

  it("keeps the signatures of a landed chunk when a later chunk fails on chain", async () => {
    const wallet = Keypair.generate();
    const failer = Keypair.generate();
    const { connection, sent } = fakeNode(undefined, failer.publicKey);
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

    let error: any;
    try {
      await bulkSendTransactions(
        provider,
        [transferFrom(wallet), { ...transferFrom(failer), signers: [failer] }],
        undefined,
        2,
        [failer],
        1,
      );
    } catch (e: any) {
      error = e;
    }

    expect(error?.message).to.equal("Failed to run txs");
    expect(error?.landedSignatures).to.deep.equal([sigOf(sent[0])]);
  });

  it("rethrows the original error when nothing landed and every tx was signed", async () => {
    const wallet = Keypair.generate();
    const rejection = new Error("User rejected the request");
    const provider: any = {
      connection: fakeNode().connection,
      wallet: {
        publicKey: wallet.publicKey,
        signAllTransactions: async () => {
          throw rejection;
        },
      },
    };

    let error: any;
    try {
      await bulkSendTransactions(provider, [transferFrom(wallet)]);
    } catch (e: any) {
      error = e;
    }

    expect(error).to.equal(rejection);
    expect(error.landedSignatures).to.equal(undefined);
  });

  it("keeps the landed signatures and the cause when a later chunk's signing throws", async () => {
    const wallet = Keypair.generate();
    const rejection = new Error("User rejected the request");
    const { connection, sent } = fakeNode();
    let signings = 0;
    const provider: any = {
      connection,
      wallet: {
        publicKey: wallet.publicKey,
        signAllTransactions: async (txs: VersionedTransaction[]) => {
          if (++signings > 1) throw rejection;
          txs.forEach((tx) => tx.sign([wallet]));
          return txs;
        },
      },
    };

    let error: any;
    try {
      await bulkSendTransactions(
        provider,
        [transferFrom(wallet), transferFrom(wallet)],
        undefined,
        2,
        [],
        1,
      );
    } catch (e: any) {
      error = e;
    }

    expect(error?.message).to.equal("User rejected the request");
    expect(error?.landedSignatures).to.deep.equal([sigOf(sent[0])]);
    expect(error?.cause).to.equal(rejection);
  });
});

describe("bulkSendRawTransactions", () => {
  it("keeps the signatures of a landed chunk when a later send throws", async () => {
    const { connection } = fakeNode();
    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash();
    // One more than a send batch, so the last tx goes in a second chunk.
    const txs = Array.from({ length: 101 }, () =>
      signedTransferFrom(Keypair.generate(), blockhash),
    );
    const rpcError = new Error("fetch failed");
    const send = connection.sendRawTransaction;
    let sends = 0;
    connection.sendRawTransaction = async (raw: Buffer) => {
      if (++sends > 100) throw rpcError;
      return send(raw);
    };

    let error: any;
    try {
      await bulkSendRawTransactions(
        connection,
        txs.map((tx) => Buffer.from(tx.serialize())),
        undefined,
        lastValidBlockHeight,
      );
    } catch (e: any) {
      error = e;
    }

    expect(error?.landedSignatures).to.deep.equal(
      txs.slice(0, 100).map((tx) => bs58.encode(tx.signatures[0])),
    );
    expect(error?.cause).to.equal(rpcError);
  });

  it("returns a tx that lands in the poll that sees its blockhash expire, without resending it", async () => {
    const { connection, sent } = fakeNode();
    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash();
    const tx = signedTransferFrom(Keypair.generate(), blockhash);
    // The node reports the tx only once the chain passes its last valid
    // height. The clock jumps past the 4s resend interval at that point, so
    // a resend after expiry would show in `sent`.
    const realValueOf = Date.prototype.valueOf;
    let clockOffset = 0;
    let expired = false;
    connection.getBlockHeight = async () => {
      if (expired) return lastValidBlockHeight + 1;
      if (sent.length === 0) return 0;
      expired = true;
      clockOffset += 5_000;
      return lastValidBlockHeight + 1;
    };
    const getTransactions = connection.getTransactions;
    connection.getTransactions = async (txids: string[]) =>
      expired ? getTransactions(txids) : txids.map(() => null);

    let landed: string[];
    Date.prototype.valueOf = function () {
      return realValueOf.call(this) + clockOffset;
    };
    try {
      landed = await bulkSendRawTransactions(
        connection,
        [Buffer.from(tx.serialize())],
        undefined,
        lastValidBlockHeight,
      );
    } finally {
      Date.prototype.valueOf = realValueOf;
    }

    expect(landed).to.deep.equal([bs58.encode(tx.signatures[0])]);
    expect(sent).to.have.length(1);
  });

  it("keeps the signatures that landed in the same batch as an on-chain failure", async () => {
    const wallet = Keypair.generate();
    const failer = Keypair.generate();
    const { connection } = fakeNode(undefined, failer.publicKey);
    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash();
    const landed = signedTransferFrom(wallet, blockhash);
    const failing = signedTransferFrom(failer, blockhash);

    let error: any;
    try {
      await bulkSendRawTransactions(
        connection,
        [landed, failing].map((tx) => Buffer.from(tx.serialize())),
        undefined,
        lastValidBlockHeight,
      );
    } catch (e: any) {
      error = e;
    }

    expect(error?.message).to.equal("Failed to run txs");
    expect(error?.landedSignatures).to.deep.equal([
      bs58.encode(landed.signatures[0]),
    ]);
  });

  it("reports the unsigned tx and the on-chain failure", async () => {
    const wallet = Keypair.generate();
    const stranger = Keypair.generate();
    const { connection } = fakeNode(undefined, wallet.publicKey);
    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash();
    const unsigned = compileV1Transaction({
      feePayer: stranger.publicKey,
      recentBlockhash: blockhash,
      instructions: transferFrom(stranger).instructions,
    });

    let error: Error | undefined;
    try {
      await bulkSendRawTransactions(
        connection,
        [unsigned, signedTransferFrom(wallet, blockhash)].map((tx) =>
          Buffer.from(tx.serialize()),
        ),
        undefined,
        lastValidBlockHeight,
      );
    } catch (e: any) {
      error = e;
    }

    expect(error?.message).to.equal(
      `Failed to run txs. Missing signature for public key ${stranger.publicKey.toBase58()}`,
    );
  });

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

  it("reports the unsigned tx when the signed tx's blockhash expires", async () => {
    const wallet = Keypair.generate();
    const stranger = Keypair.generate();
    const lander = Keypair.generate();
    const { connection } = fakeNode(wallet.publicKey);
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

    const landed = signedTransferFrom(lander, blockhash);

    let error: any;
    try {
      await bulkSendRawTransactions(
        connection,
        [signed, unsigned, landed].map((tx) => Buffer.from(tx.serialize())),
        undefined,
        lastValidBlockHeight,
      );
    } catch (e: any) {
      error = e;
    }

    expect(error?.message).to.equal(
      `Missing signature for public key ${stranger.publicKey.toBase58()}`,
    );
    expect(error?.landedSignatures).to.deep.equal([
      bs58.encode(landed.signatures[0]),
    ]);
  });
});

describe("bulk send progress", () => {
  it("counts only the txs sent as totalTxs in both bulk functions", async () => {
    const wallet = Keypair.generate();
    const stranger = Keypair.generate();
    const provider: any = {
      connection: fakeNode().connection,
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
    const bulkTotals: number[] = [];
    await bulkSendTransactions(
      provider,
      [transferFrom(wallet), transferFrom(stranger)],
      ({ totalTxs }) => bulkTotals.push(totalTxs),
    ).catch(() => {});

    const { connection } = fakeNode();
    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash();
    const unsigned = compileV1Transaction({
      feePayer: stranger.publicKey,
      recentBlockhash: blockhash,
      instructions: transferFrom(stranger).instructions,
    });
    const rawTotals: number[] = [];
    await bulkSendRawTransactions(
      connection,
      [signedTransferFrom(wallet, blockhash), unsigned].map((tx) =>
        Buffer.from(tx.serialize()),
      ),
      ({ totalTxs }) => rawTotals.push(totalTxs),
      lastValidBlockHeight,
    ).catch(() => {});

    expect(bulkTotals).to.deep.equal([1]);
    expect(rawTotals).to.deep.equal([1]);
  });
});
