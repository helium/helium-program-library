import { expect } from "chai";
import {
  Keypair,
  MessageV0,
  PublicKey,
  Transaction,
  TransactionInstruction,
  VersionedTransaction,
} from "@solana/web3.js";
import { AccountFetchCache } from "../src/accountFetchCache";

const payer = Keypair.generate().publicKey;
const writable = Keypair.generate().publicKey;
const programId = Keypair.generate().publicKey;
const instruction = new TransactionInstruction({
  programId,
  keys: [{ pubkey: writable, isSigner: false, isWritable: true }],
  data: Buffer.from([1]),
});

// A node that accepts any send and confirms it over the websocket on the next tick.
const fakeNode = () =>
  ({
    rpcEndpoint: "http://fake",
    commitment: "confirmed",
    sendTransaction: async () => "sig",
    sendRawTransaction: async () => "sig",
    onSignature: (_txid: string, callback: any) => {
      setImmediate(() => callback({ err: null }, { slot: 1 }));
      return 7;
    },
    removeSignatureListener: async () => {},
    getSignatureStatuses: async () => ({ value: [null] }),
  }) as any;

const sendThroughCache = async (tx: Transaction | VersionedTransaction) => {
  const connection = fakeNode();
  const cache = new AccountFetchCache({ connection, commitment: "confirmed" });
  const requeried: PublicKey[][] = [];
  let resolveRequery: () => void;
  const requery = new Promise<void>((resolve) => (resolveRequery = resolve));
  cache.requeryMissing = async (instructions) => {
    requeried.push(instructions.flatMap((i) => i.keys.map((k) => k.pubkey)));
    resolveRequery();
    return [];
  };
  const errors: any[] = [];
  const consoleError = console.error;
  console.error = (...args: any[]) => errors.push(args);
  try {
    await connection.sendTransaction(tx, []);
    await Promise.race([
      requery,
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
    // Let a rejected requery reach its console.error catch.
    await new Promise((resolve) => setImmediate(resolve));
  } finally {
    console.error = consoleError;
    cache.close();
  }
  return { requeried, errors };
};

describe("AccountFetchCache sendTransaction", () => {
  it("requeries the writable accounts of a VersionedTransaction", async () => {
    const tx = new VersionedTransaction(
      MessageV0.compile({
        payerKey: payer,
        instructions: [instruction],
        recentBlockhash: PublicKey.default.toBase58(),
      }),
    );

    const { requeried, errors } = await sendThroughCache(tx);

    expect(errors).to.deep.equal([]);
    expect(requeried).to.deep.equal([[writable]]);
  });

  it("requeries the writable accounts of a legacy Transaction", async () => {
    const tx = new Transaction().add(instruction);

    const { requeried, errors } = await sendThroughCache(tx);

    expect(errors).to.deep.equal([]);
    expect(requeried).to.deep.equal([[writable]]);
  });
});
