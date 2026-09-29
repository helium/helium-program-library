import { AnchorProvider } from "@anchor-lang/core";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  SystemProgram,
  TransactionInstruction,
  VersionedTransaction,
} from "@solana/web3.js";
import { expect } from "chai";
import {
  MAX_COMPUTE_UNITS,
  tableComputeUnitsForInstructions,
} from "../src/computeUnitTable";
import {
  batchInstructionsToTxsWithPriorityFee,
  batchParallelInstructions,
  toVersionedTx,
} from "../src/transaction";
import { TransactionDraft } from "../src/draft";
import { resetTxVersionCache } from "../src/txVersion";

const FEE_PAYER = Keypair.generate().publicKey;
const NOOP_PROGRAM = Keypair.generate().publicKey;
const BLOCKHASH = "EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N";

// Enough surface for the blockhash fetch and the priority-fee estimate. An
// explicit computeUnitLimit plus deriveLoadedAccountsDataSizeLimit: false
// keeps withPriorityFees off the simulation path.
const makeConnection = () =>
  ({
    rpcEndpoint: "http://localhost:0",
    getLatestBlockhash: async () => ({
      blockhash: BLOCKHASH,
      lastValidBlockHeight: 1,
    }),
    _rpcRequest: async () => ({ result: { priorityFeeEstimate: 1 } }),
    _buildArgs: (args: unknown[]) => args,
  } as unknown as Connection);

const makeProvider = () =>
  ({
    connection: makeConnection(),
    wallet: { publicKey: FEE_PAYER },
  } as unknown as AnchorProvider);

const OPTIONS = {
  computeUnitLimit: 200000,
  deriveLoadedAccountsDataSizeLimit: false,
};

const dataIx = (bytes: number) =>
  new TransactionInstruction({
    programId: NOOP_PROGRAM,
    keys: [],
    data: Buffer.alloc(bytes, 1),
  });

const keysIx = (count: number, isSigner = false) =>
  new TransactionInstruction({
    programId: NOOP_PROGRAM,
    keys: Array.from({ length: count }, () => ({
      pubkey: Keypair.generate().publicKey,
      isSigner,
      isWritable: false,
    })),
    data: Buffer.alloc(0),
  });

// Header ComputeBudget ixs are not part of a v1 tx body.
const bodyIxs = (draft: TransactionDraft) =>
  draft.instructions.filter(
    (ix) => !ix.programId.equals(ComputeBudgetProgram.programId)
  );

const transfer = () =>
  SystemProgram.transfer({
    fromPubkey: FEE_PAYER,
    toPubkey: Keypair.generate().publicKey,
    lamports: 1,
  });

const serializedSize = async (draft: TransactionDraft) =>
  (await toVersionedTx(draft)).serialize().length;

// The batcher prices each chunk with a limit + price pair, so a fixture is
// measured the same way the emitted tx will be.
const measure = async (ixs: TransactionInstruction[], version: 0 | 1) =>
  (
    await toVersionedTx({
      instructions: [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 200000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 }),
        ...ixs,
      ],
      feePayer: FEE_PAYER,
      recentBlockhash: BLOCKHASH,
      addressLookupTableAddresses: [],
      version,
    })
  ).serialize().length;

// Two ixs whose tx serializes to exactly `target` bytes.
const pairAt = async (target: number, first: number, version: 0 | 1) => {
  const base = 200;
  const size = await measure([dataIx(first), dataIx(base)], version);
  return [dataIx(first), dataIx(base + target - size)];
};

describe("batchInstructionsToTxsWithPriorityFee", () => {
  it("packs a v0 tx of exactly 1232 bytes into one tx", async () => {
    const drafts = await batchInstructionsToTxsWithPriorityFee(
      makeProvider(),
      await pairAt(1232, 500, 0),
      { ...OPTIONS, version: 0 }
    );
    expect(drafts).to.have.length(1);
    expect(await serializedSize(drafts[0])).to.equal(1232);
  });

  it("splits a v0 pair one byte over 1232", async () => {
    const drafts = await batchInstructionsToTxsWithPriorityFee(
      makeProvider(),
      await pairAt(1233, 500, 0),
      { ...OPTIONS, version: 0 }
    );
    expect(drafts).to.have.length(2);
  });

  it("packs a v1 tx of exactly 4096 bytes into one tx", async () => {
    const drafts = await batchInstructionsToTxsWithPriorityFee(
      makeProvider(),
      await pairAt(4096, 2000, 1),
      { ...OPTIONS, version: 1 }
    );
    expect(drafts).to.have.length(1);
    expect(drafts[0].version).to.equal(1);
    expect(await serializedSize(drafts[0])).to.equal(4096);
  });

  it("splits a v1 pair one byte over 4096", async () => {
    const drafts = await batchInstructionsToTxsWithPriorityFee(
      makeProvider(),
      await pairAt(4097, 2000, 1),
      { ...OPTIONS, version: 1 }
    );
    expect(drafts).to.have.length(2);
  });

  it("throws on a lone group that fits neither version, naming both limits", async () => {
    let error: Error | undefined;
    try {
      await batchInstructionsToTxsWithPriorityFee(
        makeProvider(),
        [[dataIx(100)], [dataIx(3000), dataIx(1500)], [dataIx(100)]],
        { ...OPTIONS, version: 1 }
      );
    } catch (e: any) {
      error = e;
    }
    expect(error?.message).to.include("4096").and.include("1232");
  });

  it("throws on a lone group over 1232 bytes when only v0 is allowed", async () => {
    let error: Error | undefined;
    try {
      await batchInstructionsToTxsWithPriorityFee(
        makeProvider(),
        [dataIx(1300)],
        { ...OPTIONS, version: 0 }
      );
    } catch (e: any) {
      error = e;
    }
    expect(error?.message).to.include("1232");
  });

  it("splits a v1 chunk at 64 unique accounts, counting payer and program", async () => {
    // payer + program + 2 keys × 31 ixs = 64 accounts; a 32nd ix makes 66.
    const drafts = await batchInstructionsToTxsWithPriorityFee(
      makeProvider(),
      Array.from({ length: 40 }, () => keysIx(2)),
      { ...OPTIONS, version: 1 }
    );
    expect(drafts[0].version).to.equal(1);
    expect(bodyIxs(drafts[0])).to.have.length(31);
  });

  it("splits a v1 chunk at 12 signers, counting the payer", async () => {
    const drafts = await batchInstructionsToTxsWithPriorityFee(
      makeProvider(),
      Array.from({ length: 20 }, () => keysIx(1, true)),
      { ...OPTIONS, version: 1 }
    );
    expect(drafts[0].version).to.equal(1);
    expect(bodyIxs(drafts[0])).to.have.length(11);
  });

  it("sends a chunk that fits either version as v0", async () => {
    const drafts = await batchInstructionsToTxsWithPriorityFee(
      makeProvider(),
      [dataIx(10), dataIx(10)],
      { ...OPTIONS, version: 1 }
    );
    expect(drafts).to.have.length(1);
    expect(drafts[0].version).to.equal(0);
  });

  it("batches a v1 group that carries its own setComputeUnitLimit", async () => {
    const drafts = await batchInstructionsToTxsWithPriorityFee(
      makeProvider(),
      [
        [
          ComputeBudgetProgram.setComputeUnitLimit({ units: 300000 }),
          dataIx(10),
        ],
      ],
      { ...OPTIONS, version: 1 }
    );
    expect(drafts).to.have.length(1);
  });

  it("stops growth once table CU × computeScaleUp passes 1.4M", async () => {
    const tableCu = (count: number) =>
      tableComputeUnitsForInstructions(
        Array.from({ length: count }, transfer),
        { throwOnMiss: true }
      );
    // Between the 3- and 4-transfer bounds: 3 fit, 4 do not.
    const computeScaleUp = (2 * MAX_COMPUTE_UNITS) / (tableCu(3) + tableCu(4));
    const drafts = await batchInstructionsToTxsWithPriorityFee(
      makeProvider(),
      Array.from({ length: 10 }, transfer),
      { ...OPTIONS, version: 0, computeScaleUp }
    );
    expect(drafts.map((d) => bodyIxs(d).length)).to.deep.equal([3, 3, 3, 1]);
  });

  it("packs by size alone when an ix misses the CU table", async () => {
    const drafts = await batchInstructionsToTxsWithPriorityFee(
      makeProvider(),
      [transfer(), dataIx(10), transfer(), transfer()],
      { ...OPTIONS, version: 0, computeScaleUp: 1e9 }
    );
    expect(drafts).to.have.length(1);
  });

  it("never rejects a lone group for its CU", async () => {
    const drafts = await batchInstructionsToTxsWithPriorityFee(
      makeProvider(),
      [transfer()],
      { ...OPTIONS, version: 0, computeScaleUp: 1e9 }
    );
    expect(drafts).to.have.length(1);
  });
});

describe("batchParallelInstructions", () => {
  const SIGNED = new Error("signed");

  // Captures the txs handed to the wallet, then stops before any send.
  const packed = async (
    instructions: TransactionInstruction[],
    envVersion: "v0" | "v1"
  ): Promise<VersionedTransaction[]> => {
    process.env.HPL_TX_VERSION = envVersion;
    resetTxVersionCache();
    let txs: VersionedTransaction[] = [];
    const provider = {
      connection: makeConnection(),
      wallet: {
        publicKey: FEE_PAYER,
        signAllTransactions: async (signing: VersionedTransaction[]) => {
          txs = signing;
          throw SIGNED;
        },
      },
    } as unknown as AnchorProvider;
    try {
      await batchParallelInstructions({ provider, instructions });
    } catch (e) {
      if (e !== SIGNED) throw e;
    }
    return txs;
  };

  afterEach(() => {
    delete process.env.HPL_TX_VERSION;
    resetTxVersionCache();
  });

  it("packs into one v1 tx what v0 splits three ways", async () => {
    const ixs = [dataIx(1000), dataIx(1000), dataIx(1000)];
    expect((await packed(ixs, "v1")).map((tx) => tx.version)).to.deep.equal([
      1,
    ]);
    expect((await packed(ixs, "v0")).map((tx) => tx.version)).to.deep.equal([
      0, 0, 0,
    ]);
  });

  it("sends a chunk that fits either version as v0", async () => {
    const txs = await packed([dataIx(10), dataIx(10)], "v1");
    expect(txs.map((tx) => tx.version)).to.deep.equal([0]);
  });

  it("throws on a lone ix that fits neither version, naming both limits", async () => {
    let error: Error | undefined;
    try {
      await packed([dataIx(100), dataIx(4100)], "v1");
    } catch (e: any) {
      error = e;
    }
    expect(error?.message).to.include("4096").and.include("1232");
  });
});

