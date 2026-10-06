import { ed25519 } from "@noble/curves/ed25519";
import {
  ComputeBudgetProgram,
  Keypair,
  MessageV1,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  VersionedTransaction,
} from "@solana/web3.js";
import { expect } from "chai";
import { setLoadedAccountsDataSizeLimit } from "../src/priorityFees";
import { toVersionedTx } from "../src/transaction";
import { exceedsV1Limits, toV1TransactionConfig } from "../src/v1Transaction";

const payer = Keypair.generate();
const transfer = SystemProgram.transfer({
  fromPubkey: payer.publicKey,
  toPubkey: Keypair.generate().publicKey,
  lamports: 1,
});
const limit = (units: number) =>
  ComputeBudgetProgram.setComputeUnitLimit({ units });
const price = (microLamports: number) =>
  ComputeBudgetProgram.setComputeUnitPrice({ microLamports });
const heap = (bytes: number) =>
  ComputeBudgetProgram.requestHeapFrame({ bytes });

describe("toV1TransactionConfig", () => {
  it("strips every ComputeBudget ix into the header", () => {
    const { instructions, config } = toV1TransactionConfig([
      heap(64 * 1024),
      limit(200_000),
      price(1_000_000),
      setLoadedAccountsDataSizeLimit(1024 * 1024),
      transfer,
    ]);
    expect(instructions).to.deep.equal([transfer]);
    expect(config).to.deep.equal({
      heapSize: 64 * 1024,
      computeUnitLimit: 200_000,
      priorityFeeLamports: 200_000n,
      loadedAccountsDataSizeLimit: 1024 * 1024,
    });
  });

  it("rounds the priority fee up to a whole lamport", () => {
    const { config } = toV1TransactionConfig([
      limit(1_400_000),
      price(1),
      transfer,
    ]);
    expect(config.priorityFeeLamports).to.equal(2n);
  });

  it("keeps u64 micro-lamport precision without a cap", () => {
    const { config } = toV1TransactionConfig([
      limit(1_400_000),
      price(Number.MAX_SAFE_INTEGER),
      transfer,
    ]);
    // ceil(9007199254740991 * 1400000 / 1000000), computed by hand.
    expect(config.priorityFeeLamports).to.equal(12_610_078_956_637_388n);
  });

  it("defaults a missing CU limit to the table and data size to 64 MiB", () => {
    const { config } = toV1TransactionConfig([transfer]);
    expect(config).to.deep.equal({
      // System program ceiling 3000 × FALLBACK_CU_MARGIN 2.0.
      computeUnitLimit: 6000,
      loadedAccountsDataSizeLimit: 64 * 1024 * 1024,
    });
    expect(config.computeUnitLimit).to.be.greaterThan(0);
  });

  it("rejects a duplicate ComputeBudget type", () => {
    expect(() =>
      toV1TransactionConfig([limit(1000), limit(2000), transfer])
    ).to.throw(/duplicate/i);
  });
});

describe("toVersionedTx", () => {
  const draft = (version?: 0 | 1 | "auto") => ({
    feePayer: payer.publicKey,
    recentBlockhash: PublicKey.default.toBase58(),
    instructions: [limit(200_000), price(5), transfer],
    addressLookupTables: [],
    version,
  });

  for (const version of [undefined, 0 as const, "auto" as const]) {
    it(`builds v0 with the ix list untouched for version ${version}`, async () => {
      const tx = await toVersionedTx(draft(version));
      expect(tx.version).to.equal(0);
      expect(
        tx.message.compiledInstructions.map((ix) => Buffer.from(ix.data))
      ).to.deep.equal(draft().instructions.map((ix) => ix.data));
    });
  }

  it("builds a v1 tx that signs and round-trips through the wire bytes", async () => {
    const tx = await toVersionedTx(draft(1));
    expect(tx.version).to.equal(1);
    tx.sign([payer]);

    const wire = tx.serialize();
    const decoded = VersionedTransaction.deserialize(wire);
    const message = decoded.message as MessageV1;
    expect(decoded.version).to.equal(1);
    expect(message.transactionConfig).to.deep.include({
      computeUnitLimit: 200_000,
      priorityFee: 1,
    });
    expect(message.compiledInstructions).to.have.length(1);
    expect(decoded.signatures).to.deep.equal(tx.signatures);

    const messageBytes = wire.slice(0, wire.length - 64);
    expect(
      ed25519.verify(tx.signatures[0], messageBytes, payer.publicKey.toBytes())
    ).to.equal(true);
  });

  it("refuses to sign a v1 tx with a non-signer key", async () => {
    const tx = await toVersionedTx(draft(1));
    expect(() => tx.sign([Keypair.generate()])).to.throw(
      /Cannot sign with non signer key/
    );
  });

  it("serializes signatures added after build", async () => {
    const tx = await toVersionedTx(draft(1));
    const signature = new Uint8Array(64).fill(7);
    tx.addSignature(payer.publicKey, signature);
    expect(tx.serialize().slice(-64)).to.deep.equal(signature);
  });
});

describe("exceedsV1Limits", () => {
  it("allows 64 instructions", () => {
    expect(exceedsV1Limits(payer.publicKey, Array(64).fill(transfer))).to.equal(
      false
    );
  });

  it("rejects 65 instructions", () => {
    expect(exceedsV1Limits(payer.publicKey, Array(65).fill(transfer))).to.equal(
      true
    );
  });
});
