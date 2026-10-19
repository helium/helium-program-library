import { AnchorProvider } from "@anchor-lang/core";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  TransactionInstruction,
  VersionedTransaction,
} from "@solana/web3.js";
import { expect } from "chai";
import {
  batchInstructionsToTxsWithPriorityFee,
  batchParallelInstructions,
  batchParallelInstructionsWithPriorityFee,
  batchSequentialParallelInstructions,
  toVersionedTx,
} from "../src/transaction";
import { TransactionDraft } from "../src/draft";
import {
  COMPUTE_BUDGET_IX_DATA_SIZE,
  setLoadedAccountsDataSizeLimit,
} from "../src/priorityFees";
import { resetTxVersionCache, WALLET_SIGNED } from "../src/txVersion";

const FEE_PAYER_KEYPAIR = Keypair.generate();
const FEE_PAYER = FEE_PAYER_KEYPAIR.publicKey;
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

const serializedSize = async (draft: TransactionDraft) =>
  (await toVersionedTx(draft)).serialize().length;

// The batcher prices each chunk with a limit + price pair, so a fixture is
// measured the same way the emitted tx will be.
const measure = async (
  ixs: TransactionInstruction[],
  version: 0 | 1,
  budgetIxs: TransactionInstruction[] = []
) =>
  (
    await toVersionedTx({
      instructions: [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 200000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 }),
        ...budgetIxs,
        ...ixs,
      ],
      feePayer: FEE_PAYER,
      recentBlockhash: BLOCKHASH,
      addressLookupTableAddresses: [],
      version,
    })
  ).serialize().length;

// Two ixs whose tx serializes to exactly `target` bytes.
const pairAt = async (
  target: number,
  first: number,
  version: 0 | 1,
  budgetIxs: TransactionInstruction[] = []
) => {
  const base = 200;
  const size = await measure(
    [dataIx(first), dataIx(base)],
    version,
    budgetIxs
  );
  return [dataIx(first), dataIx(base + target - size)];
};

// An ix the CU table prices at its `programId:discriminator` entry.
const tabledIx = (key: string) => {
  const [programId, discriminator] = key.split(":");
  return new TransactionInstruction({
    programId: new PublicKey(programId),
    keys: [],
    data: Buffer.from(discriminator, "hex"),
  });
};
const CRON_380K = "hcrLPFgFUY6sCUKzqLWxXx5bntDiDCrAZVcrXfx9AHu:3f865a9ff98338b5";
const HEM_277K = "hemjuPXBpNvggtaUnN1MwT3wrdhttKEfosTcc2P9Pg8:1351db1e0a220c50";
const HEM_811K = "hemjuPXBpNvggtaUnN1MwT3wrdhttKEfosTcc2P9Pg8:e8c27a44a7f677c5";

// An extra signer, an ix that needs its signature, and one that only reads it.
const signer = Keypair.generate();
const signerIx = new TransactionInstruction({
  programId: NOOP_PROGRAM,
  keys: [{ pubkey: signer.publicKey, isSigner: true, isWritable: false }],
  data: Buffer.alloc(800, 1),
});
// Same key, read-only: must not pull the signer into this chunk.
const readIx = new TransactionInstruction({
  programId: NOOP_PROGRAM,
  keys: [{ pubkey: signer.publicKey, isSigner: false, isWritable: false }],
  data: Buffer.alloc(800, 1),
});

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

  it("counts the loaded-accounts-data-size ix when sizing a v0 pair", async () => {
    // Explicit computeUnitLimit and loadedAccountsDataSizeLimit emit the
    // data-size ix without simulating.
    const drafts = await batchInstructionsToTxsWithPriorityFee(
      makeProvider(),
      await pairAt(1233, 500, 0, [setLoadedAccountsDataSizeLimit(100000)]),
      { ...OPTIONS, loadedAccountsDataSizeLimit: 100000, version: 0 }
    );
    expect(drafts).to.have.length(2);
  });

  // A provider whose simulation measures a loaded-accounts data size.
  const simulatingProvider = () =>
    ({
      connection: {
        ...makeConnection(),
        simulateTransaction: async () => ({
          value: { err: null, unitsConsumed: 1000, loadedAccountsDataSize: 1 },
        }),
      },
      wallet: { publicKey: FEE_PAYER },
    } as unknown as AnchorProvider);

  const hasDataSizeIx = (draft: TransactionDraft) =>
    draft.instructions.some(
      (ix) =>
        ix.programId.equals(ComputeBudgetProgram.programId) &&
        ix.data[0] === COMPUTE_BUDGET_IX_DATA_SIZE
    );

  it("sizes a keypair chunk with an explicit CU limit without a data-size ix, as it is sent", async () => {
    const drafts = await batchInstructionsToTxsWithPriorityFee(
      makeProvider(),
      await pairAt(1232, 500, 0),
      { computeUnitLimit: 200000, signing: { feePayer: "keypair" }, version: 0 }
    );
    expect(drafts).to.have.length(1);
    expect(hasDataSizeIx(drafts[0])).to.equal(false);
    expect(await serializedSize(drafts[0])).to.equal(1232);
  });

  it("sizes a simulated keypair chunk with the data-size ix it is sent with", async () => {
    const drafts = await batchInstructionsToTxsWithPriorityFee(
      simulatingProvider(),
      await pairAt(1232, 500, 0, [setLoadedAccountsDataSizeLimit(1)]),
      { signing: { feePayer: "keypair" }, version: 0 }
    );
    expect(drafts).to.have.length(1);
    expect(hasDataSizeIx(drafts[0])).to.equal(true);
    expect(await serializedSize(drafts[0])).to.equal(1232);
  });

  it("sizes a simulated wallet chunk without a data-size ix, as it is sent", async () => {
    const drafts = await batchInstructionsToTxsWithPriorityFee(
      simulatingProvider(),
      await pairAt(1232, 500, 0),
      { signing: { feePayer: "wallet" } }
    );
    expect(drafts).to.have.length(1);
    expect(hasDataSizeIx(drafts[0])).to.equal(false);
    expect(await serializedSize(drafts[0])).to.equal(1232);
  });

  it("sizes a simulated keypair chunk with a wallet co-signer without a data-size ix, as it is sent", async () => {
    const drafts = await batchInstructionsToTxsWithPriorityFee(
      simulatingProvider(),
      await pairAt(1232, 500, 0),
      { signing: { feePayer: "keypair", coSigners: ["wallet"] }, version: 0 }
    );
    expect(drafts).to.have.length(1);
    expect(hasDataSizeIx(drafts[0])).to.equal(false);
    expect(await serializedSize(drafts[0])).to.equal(1232);
  });

  it("sizes a simulated keypair chunk with a versions co-signer with the data-size ix it is sent with", async () => {
    const drafts = await batchInstructionsToTxsWithPriorityFee(
      simulatingProvider(),
      await pairAt(1232, 500, 0, [setLoadedAccountsDataSizeLimit(1)]),
      {
        signing: {
          feePayer: "keypair",
          coSigners: [{ versions: ["legacy", 0] }],
        },
        version: 0,
      }
    );
    expect(drafts).to.have.length(1);
    expect(hasDataSizeIx(drafts[0])).to.equal(true);
    expect(await serializedSize(drafts[0])).to.equal(1232);
  });

  it("sizes a wallet chunk with an explicit CU limit without a data-size ix, as it is sent", async () => {
    const drafts = await batchInstructionsToTxsWithPriorityFee(
      makeProvider(),
      await pairAt(1232, 500, 0),
      { computeUnitLimit: 200000, signing: WALLET_SIGNED }
    );
    expect(drafts).to.have.length(1);
    expect(hasDataSizeIx(drafts[0])).to.equal(false);
    expect(await serializedSize(drafts[0])).to.equal(1232);
  });

  it("infers a wallet fee payer from an adapter provider", async () => {
    const drafts = await batchInstructionsToTxsWithPriorityFee(
      simulatingProvider(),
      await pairAt(1232, 500, 0)
    );
    expect(drafts).to.have.length(1);
    expect(hasDataSizeIx(drafts[0])).to.equal(false);
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

  it("packs a pair whose table CU (raw × 2.0) fits 1.4M into one tx", async () => {
    // Raw 380865 + 277706 = 658571: × 2.0 fits 1.4M, × 2.2 would not.
    const drafts = await batchInstructionsToTxsWithPriorityFee(
      makeProvider(),
      [tabledIx(CRON_380K), tabledIx(HEM_277K)],
      { ...OPTIONS, version: 0 }
    );
    expect(drafts).to.have.length(1);
  });

  it("stops growth once table CU reaches 1.4M", async () => {
    const drafts = await batchInstructionsToTxsWithPriorityFee(
      makeProvider(),
      [tabledIx(HEM_811K), tabledIx(HEM_811K)],
      { ...OPTIONS, version: 0 }
    );
    expect(drafts).to.have.length(2);
  });

  it("packs by size alone when an ix misses the CU table", async () => {
    const drafts = await batchInstructionsToTxsWithPriorityFee(
      makeProvider(),
      [tabledIx(HEM_811K), dataIx(10), tabledIx(HEM_811K)],
      { ...OPTIONS, version: 0 }
    );
    expect(drafts).to.have.length(1);
  });

  it("never rejects a lone group for its CU", async () => {
    const drafts = await batchInstructionsToTxsWithPriorityFee(
      makeProvider(),
      [[tabledIx(HEM_811K), tabledIx(HEM_811K)]],
      { ...OPTIONS, version: 0 }
    );
    expect(drafts).to.have.length(1);
  });

  it("lists an extra signer only on chunks that need its signature", async () => {
    const drafts = await batchInstructionsToTxsWithPriorityFee(
      makeProvider(),
      [signerIx, readIx],
      { ...OPTIONS, version: 0, extraSigners: [signer] }
    );
    expect(drafts.map((d) => d.signers.length)).to.deep.equal([1, 0]);
  });
});

describe("batchParallelInstructions", () => {
  const SIGNED = new Error("signed");

  // Captures the txs handed to the wallet, then stops before any send.
  const packed = async (
    instructions: TransactionInstruction[],
    envVersion: "v0" | "v1",
    version?: 0 | 1
  ): Promise<VersionedTransaction[]> => {
    process.env.HPL_TX_VERSION = envVersion;
    resetTxVersionCache();
    let txs: VersionedTransaction[] = [];
    const provider = {
      connection: makeConnection(),
      wallet: {
        publicKey: FEE_PAYER,
        payer: FEE_PAYER_KEYPAIR,
        signAllTransactions: async (signing: VersionedTransaction[]) => {
          txs = signing;
          throw SIGNED;
        },
      },
    } as unknown as AnchorProvider;
    try {
      await batchParallelInstructions({ provider, instructions, version });
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

  it("keeps a pinned version 0 when HPL_TX_VERSION is v1", async () => {
    const ixs = [dataIx(1000), dataIx(1000), dataIx(1000)];
    expect((await packed(ixs, "v1", 0)).map((tx) => tx.version)).to.deep.equal(
      [0, 0, 0]
    );
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

  it("signs each chunk only with the extra signers its ixs need", async () => {
    const sent: VersionedTransaction[] = [];
    const provider = {
      connection: {
        ...makeConnection(),
        getBlockHeight: async () => 0,
        sendRawTransaction: async (raw: Buffer) => {
          sent.push(VersionedTransaction.deserialize(raw));
          return `sig${sent.length}`;
        },
        getTransactions: async (txids: string[]) =>
          txids.map(() => ({ meta: { err: null } })),
      },
      wallet: {
        publicKey: FEE_PAYER,
        signAllTransactions: async (signing: VersionedTransaction[]) => {
          signing.forEach((tx) => tx.sign([FEE_PAYER_KEYPAIR]));
          return signing;
        },
      },
    } as unknown as AnchorProvider;

    await batchParallelInstructions({
      provider,
      instructions: [signerIx, readIx],
      extraSigners: [signer],
    });

    expect(
      sent.map((tx) => tx.message.header.numRequiredSignatures)
    ).to.deep.equal([2, 1]);
  });

  it("batchParallelInstructionsWithPriorityFee signs with the extra signers its ixs need", async () => {
    const sent: VersionedTransaction[] = [];
    const provider = {
      connection: {
        ...makeConnection(),
        getBlockHeight: async () => 0,
        sendRawTransaction: async (raw: Buffer) => {
          sent.push(VersionedTransaction.deserialize(raw));
          return `sig${sent.length}`;
        },
        getTransactions: async (txids: string[]) =>
          txids.map(() => ({ meta: { err: null } })),
      },
      wallet: {
        publicKey: FEE_PAYER,
        signAllTransactions: async (signing: VersionedTransaction[]) => {
          signing.forEach((tx) => tx.sign([FEE_PAYER_KEYPAIR]));
          return signing;
        },
      },
    } as unknown as AnchorProvider;

    await batchParallelInstructionsWithPriorityFee(
      provider,
      [signerIx, readIx],
      { computeUnitLimit: 200000, extraSigners: [signer] }
    );

    expect(
      sent.map((tx) => tx.message.header.numRequiredSignatures)
    ).to.deep.equal([2, 1]);
  });
});

describe("version pins on the priority-fee batchers", () => {
  const SIGNED = new Error("signed");

  // Captures the txs handed to the wallet, then stops before any send.
  const packed = async (
    send: (provider: AnchorProvider) => Promise<void>
  ): Promise<VersionedTransaction[]> => {
    process.env.HPL_TX_VERSION = "v1";
    resetTxVersionCache();
    let txs: VersionedTransaction[] = [];
    const provider = {
      connection: {
        ...makeConnection(),
        // batchSequentialParallelInstructions takes no computeUnitLimit, so
        // it always simulates.
        simulateTransaction: async () => ({
          value: { err: null, unitsConsumed: 1000 },
        }),
      },
      wallet: {
        publicKey: FEE_PAYER,
        signAllTransactions: async (signing: VersionedTransaction[]) => {
          txs = signing;
          throw SIGNED;
        },
      },
    } as unknown as AnchorProvider;
    try {
      await send(provider);
    } catch (e) {
      if (e !== SIGNED) throw e;
    }
    return txs;
  };

  afterEach(() => {
    delete process.env.HPL_TX_VERSION;
    resetTxVersionCache();
  });

  it("batchSequentialParallelInstructions keeps a pinned version 0 when HPL_TX_VERSION is v1", async () => {
    const ixs = [dataIx(1000), dataIx(1000), dataIx(1000)];
    const txs = await packed((provider) =>
      batchSequentialParallelInstructions({
        provider,
        instructions: [ixs],
        version: 0,
      })
    );
    expect(txs.map((tx) => tx.version)).to.deep.equal([0, 0, 0]);
  });

  it("batchParallelInstructionsWithPriorityFee keeps a pinned version 0 when HPL_TX_VERSION is v1", async () => {
    const ixs = [dataIx(1000), dataIx(1000), dataIx(1000)];
    const txs = await packed((provider) =>
      batchParallelInstructionsWithPriorityFee(provider, ixs, {
        computeUnitLimit: 200000,
        version: 0,
      })
    );
    expect(txs.map((tx) => tx.version)).to.deep.equal([0, 0, 0]);
  });
});
