import { ed25519 } from "@noble/curves/ed25519";
import {
  Keypair,
  SystemProgram,
  TransactionInstruction,
  VersionedTransaction,
} from "@solana/web3.js";
import { expect } from "chai";
import {
  sendInstructions,
  sendInstructionsWithPriorityFee,
} from "../src/transaction";
import { resetTxVersionCache } from "../src/txVersion";

// A 4.2 node with `enable_tx_v1` active that confirms whatever it is sent
// and keeps the wire bytes.
const fakeV1Node = () => {
  const sent: Buffer[] = [];
  const gate = Buffer.alloc(9);
  gate[0] = 1;
  const connection: any = {
    rpcEndpoint: `http://node-${Math.random()}`,
    getVersion: async () => ({ "solana-core": "4.2.0" }),
    getAccountInfo: async () => ({ data: gate }),
    getSlot: async () => 200,
    getLatestBlockhash: async () => ({
      blockhash: Keypair.generate().publicKey.toBase58(),
      lastValidBlockHeight: 1000,
    }),
    sendRawTransaction: async (raw: Buffer) => {
      sent.push(Buffer.from(raw));
      return "sig";
    },
    onSignature: (_txid: string, callback: any) => {
      callback({ err: null }, { slot: 1 });
      return 1;
    },
    getSignatureStatuses: async () => ({ value: [null] }),
  };
  return { connection, sent };
};

// Signs the way Anchor's NodeWallet does, for legacy and versioned txs alike.
const signWith = (payer: Keypair) => async (tx: any) => {
  if ("version" in tx) tx.sign([payer]);
  else tx.partialSign(payer);
  return tx;
};

const keypairWallet = (payer: Keypair) => ({
  payer,
  publicKey: payer.publicKey,
  signTransaction: signWith(payer),
});

// The message bytes the signatures cover: v1 puts the signatures last.
const signedBytes = (wire: Buffer, tx: VersionedTransaction) =>
  tx.version === 1
    ? wire.subarray(0, wire.length - 64 * tx.signatures.length)
    : tx.message.serialize();

describe("sendInstructions", () => {
  beforeEach(() => resetTxVersionCache());

  it("sends v1 signed by the wallet and the extra signers for a keypair wallet on a v1 node", async () => {
    const { connection, sent } = fakeV1Node();
    const payer = Keypair.generate();
    const newAccount = Keypair.generate();
    const provider: any = { connection, wallet: keypairWallet(payer) };

    await sendInstructions(
      provider,
      [
        SystemProgram.createAccount({
          fromPubkey: payer.publicKey,
          newAccountPubkey: newAccount.publicKey,
          lamports: 1,
          space: 0,
          programId: SystemProgram.programId,
        }),
      ],
      [newAccount],
    );

    const tx = VersionedTransaction.deserialize(sent[0]);
    expect(tx.version).to.equal(1);
    const message = signedBytes(sent[0], tx);
    [payer, newAccount].forEach((signer, i) =>
      expect(
        ed25519.verify(tx.signatures[i], message, signer.publicKey.toBytes()),
      ).to.equal(true),
    );
  });

  it("sends v0 for a wallet adapter without v1", async () => {
    const { connection, sent } = fakeV1Node();
    const payer = Keypair.generate();
    const wallet = {
      publicKey: payer.publicKey,
      supportedTransactionVersions: new Set(["legacy", 0]),
      signTransaction: signWith(payer),
    };
    const provider: any = { connection, wallet };

    await sendInstructions(provider, [
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: Keypair.generate().publicKey,
        lamports: 1,
      }),
    ]);

    const tx = VersionedTransaction.deserialize(sent[0]);
    expect(tx.version).to.equal(0);
    expect(
      ed25519.verify(
        tx.signatures[0],
        signedBytes(sent[0], tx),
        payer.publicKey.toBytes(),
      ),
    ).to.equal(true);
  });
  it("rejects without sending when a required signer has not signed", async () => {
    const { connection, sent } = fakeV1Node();
    const wallet = Keypair.generate();
    const payer = Keypair.generate();
    const provider: any = { connection, wallet: keypairWallet(wallet) };

    let error: Error | undefined;
    try {
      await sendInstructions(
        provider,
        [
          SystemProgram.transfer({
            fromPubkey: payer.publicKey,
            toPubkey: Keypair.generate().publicKey,
            lamports: 1,
          }),
        ],
        [],
        payer.publicKey,
      );
    } catch (e: any) {
      error = e;
    }
    expect(error?.message).to.equal(
      `Missing signature for public key ${payer.publicKey.toBase58()}`,
    );
    expect(sent).to.have.length(0);
  });

  it("sends v0 for a keypair wallet on a v1 node when the ixs exceed v1 limits", async () => {
    const { connection, sent } = fakeV1Node();
    const payer = Keypair.generate();
    const provider: any = { connection, wallet: keypairWallet(payer) };
    const tiny = new TransactionInstruction({
      programId: SystemProgram.programId,
      keys: [],
      data: Buffer.alloc(0),
    });

    await sendInstructions(provider, Array(65).fill(tiny));

    expect(VersionedTransaction.deserialize(sent[0]).version).to.equal(0);
  });

  it("sends v0 through the priority-fee path when the ixs exceed v1 limits", async () => {
    const { connection, sent } = fakeV1Node();
    connection._rpcRequest = async () => ({
      result: { priorityFeeEstimate: 1 },
    });
    connection._buildArgs = (args: unknown[]) => args;
    const payer = Keypair.generate();
    const provider: any = { connection, wallet: keypairWallet(payer) };
    const tiny = new TransactionInstruction({
      programId: SystemProgram.programId,
      keys: [],
      data: Buffer.alloc(0),
    });

    await sendInstructionsWithPriorityFee(provider, Array(65).fill(tiny), {
      computeUnitLimit: 200000,
    });

    expect(VersionedTransaction.deserialize(sent[0]).version).to.equal(0);
  });

  it("sends the per-call version over node detection", async () => {
    const { connection, sent } = fakeV1Node();
    const payer = Keypair.generate();
    const provider: any = { connection, wallet: keypairWallet(payer) };

    await sendInstructions(
      provider,
      [
        SystemProgram.transfer({
          fromPubkey: payer.publicKey,
          toPubkey: Keypair.generate().publicKey,
          lamports: 1,
        }),
      ],
      [],
      payer.publicKey,
      "confirmed",
      new Map(),
      0,
    );

    expect(VersionedTransaction.deserialize(sent[0]).version).to.equal(0);
  });
});
