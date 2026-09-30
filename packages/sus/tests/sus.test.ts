import { toVersionedTx } from "@helium/spl-utils";
import {
  ComputeBudgetProgram,
  Ed25519Program,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import { expect } from "chai";
import { sus } from "../src";

const payer = Keypair.generate();
const recipient = Keypair.generate().publicKey;

const systemAccount = (lamports: number) => ({
  lamports,
  owner: SystemProgram.programId,
  data: Buffer.alloc(0),
  executable: false,
  rentEpoch: 0,
});

// Stands in for the RPC node. Records every raw JSON-RPC call; only the
// payer and recipient exist on chain.
const fakeConnection = (feeForMessage: number | null = null) => {
  const requests: { method: string; args: any[] }[] = [];
  const onChain: Record<string, number> = {
    [payer.publicKey.toBase58()]: LAMPORTS_PER_SOL,
    [recipient.toBase58()]: 0,
  };
  const connection: any = {
    rpcEndpoint: "http://node",
    commitment: "confirmed",
    getLatestBlockhash: async () => ({
      blockhash: PublicKey.default.toBase58(),
      lastValidBlockHeight: 1,
    }),
    getMultipleAccountsInfo: async (keys: PublicKey[]) =>
      keys.map((key) =>
        key.toBase58() in onChain
          ? systemAccount(onChain[key.toBase58()])
          : null
      ),
    _rpcRequest: async (method: string, args: any[]) => {
      requests.push({ method, args });
      // null is what the node returns once the blockhash has expired.
      if (method === "getFeeForMessage") {
        return { result: { context: { slot: 1 }, value: feeForMessage } };
      }
      return {
        result: {
          context: { slot: 1 },
          value: {
            err: null,
            logs: ["Program 11111111111111111111111111111111 success"],
            unitsConsumed: 150,
            accounts: args[1].accounts.addresses.map(() => ({
              lamports: 1,
              owner: SystemProgram.programId.toBase58(),
              data: ["", "base64"],
              executable: false,
              rentEpoch: 0,
            })),
          },
        },
      };
    },
  };
  return { connection, requests };
};

describe("sus", () => {
  it("simulates, prices and links a v1 transaction from its original bytes", async () => {
    const tx = await toVersionedTx({
      feePayer: payer.publicKey,
      recentBlockhash: Keypair.generate().publicKey.toBase58(),
      instructions: [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 1000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 2_000_000 }),
        SystemProgram.transfer({
          fromPubkey: payer.publicKey,
          toPubkey: recipient,
          lamports: 1,
        }),
      ],
      addressLookupTables: [],
      version: 1,
    });
    tx.sign([payer]);
    const wire = Buffer.from(tx.serialize());
    const messageBytes = wire.subarray(0, wire.length - 64);

    const { connection, requests } = fakeConnection();
    const [result] = await sus({
      connection,
      wallet: payer.publicKey,
      serializedTransactions: [wire],
    });

    const simulate = requests.find((r) => r.method === "simulateTransaction")!;
    expect(simulate.args[0]).to.equal(wire.toString("base64"));
    expect(simulate.args[1]).to.deep.include({
      encoding: "base64",
      sigVerify: false,
      replaceRecentBlockhash: true,
    });
    expect(simulate.args[1].accounts.addresses).to.have.members([
      payer.publicKey.toBase58(),
      recipient.toBase58(),
    ]);

    expect(result.error).to.equal(undefined);
    expect(result.logs).to.have.length(1);
    expect(result.solFee).to.equal(5000);
    // Header fee: 1000 CU at 2,000,000 micro-lamports per CU.
    expect(result.priorityFee).to.equal(2000);
    expect(result.explorerLink).to.equal(
      `https://explorer.solana.com/tx/inspector?cluster=mainnet-beta&message=${encodeURIComponent(
        messageBytes.toString("base64")
      )}`
    );
  });

  const v1TxWithEd25519 = async (signatures: number) => {
    const tx = await toVersionedTx({
      feePayer: payer.publicKey,
      recentBlockhash: Keypair.generate().publicKey.toBase58(),
      instructions: [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 1000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 2_000_000 }),
        // The precompile header's first byte is its signature count.
        new TransactionInstruction({
          programId: Ed25519Program.programId,
          keys: [],
          data: Buffer.from([signatures, 0]),
        }),
        SystemProgram.transfer({
          fromPubkey: payer.publicKey,
          toPubkey: recipient,
          lamports: 1,
        }),
      ],
      addressLookupTables: [],
      version: 1,
    });
    tx.sign([payer]);
    return Buffer.from(tx.serialize());
  };

  it("charges the base fee for each ed25519 precompile signature in a v1 transaction", async () => {
    const wire = await v1TxWithEd25519(2);

    const { connection } = fakeConnection();
    const [result] = await sus({
      connection,
      wallet: payer.publicKey,
      serializedTransactions: [wire],
    });

    expect(result.error).to.equal(undefined);
    // One message signature plus two precompile signatures.
    expect(result.solFee).to.equal(15000);
    expect(result.priorityFee).to.equal(2000);
  });

  it("prices a v1 transaction from the node when the node can price it", async () => {
    const wire = await v1TxWithEd25519(2);
    const messageBytes = wire.subarray(0, wire.length - 64);

    const { connection, requests } = fakeConnection(30000);
    const [result] = await sus({
      connection,
      wallet: payer.publicKey,
      serializedTransactions: [wire],
    });

    const feeRequest = requests.find((r) => r.method === "getFeeForMessage")!;
    expect(feeRequest.args[0]).to.equal(messageBytes.toString("base64"));
    expect(result.solFee).to.equal(28000);
    expect(result.priorityFee).to.equal(2000);
  });
});
