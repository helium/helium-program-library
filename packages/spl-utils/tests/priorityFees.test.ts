import {
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  TransactionInstruction,
  VersionedTransaction,
} from "@solana/web3.js";
import { expect } from "chai";
import {
  COMPUTE_BUDGET_IX_DATA_SIZE,
  DEFAULT_LOADED_ACCOUNTS_DATA_SIZE_LIMIT,
  estimatePrioritizationFee,
  MAX_PRIO_FEE,
  withPriorityFees,
} from "../src/priorityFees";

const ix = new TransactionInstruction({
  programId: Keypair.generate().publicKey,
  keys: [
    { pubkey: Keypair.generate().publicKey, isSigner: false, isWritable: true },
  ],
  data: Buffer.alloc(0),
});

// Stands in for an RPC node without getPriorityFeeEstimate, so the estimate
// takes the getRecentPrioritizationFees fallback.
const fallbackConnection = (fees: number[]) =>
  ({
    _buildArgs: (args: unknown[]) => args,
    _rpcRequest: async () => {
      throw new Error("Method not found");
    },
    getRecentPrioritizationFees: async (_: {
      lockedWritableAccounts: PublicKey[];
    }) => fees.map((prioritizationFee, slot) => ({ slot, prioritizationFee })),
  }) as any;

describe("estimatePrioritizationFee fallback", () => {
  const quietConsoleError = console.error;
  before(() => {
    console.error = () => {};
  });
  after(() => {
    console.error = quietConsoleError;
  });

  it("caps the recent-fee median at maxPriorityFee", async () => {
    const fee = await estimatePrioritizationFee(
      fallbackConnection([
        MAX_PRIO_FEE * 10,
        MAX_PRIO_FEE * 10,
        MAX_PRIO_FEE * 10,
      ]),
      [ix]
    );
    expect(fee).to.equal(MAX_PRIO_FEE);
  });

  it("caps basePriorityFee at maxPriorityFee when no recent fees exist", async () => {
    const fee = await estimatePrioritizationFee(
      fallbackConnection([]),
      [ix],
      5000,
      1000
    );
    expect(fee).to.equal(1000);
  });

  it("returns the median when it is under the cap", async () => {
    const fee = await estimatePrioritizationFee(
      fallbackConnection([100, 200, 300]),
      [ix]
    );
    expect(fee).to.equal(200);
  });
});

type Sim = {
  err: unknown;
  unitsConsumed?: number;
  loadedAccountsDataSize?: number;
};

// Answers each simulation with the next result and keeps the simulated txs.
const simConnection = (sims: Sim[]) => {
  const simulated: VersionedTransaction[] = [];
  const connection = {
    _buildArgs: (args: unknown[]) => args,
    _rpcRequest: async () => ({ result: { priorityFeeEstimate: 10 } }),
    simulateTransaction: async (tx: VersionedTransaction) => {
      simulated.push(tx);
      return { value: sims.shift() };
    },
  } as any;
  return { connection, simulated };
};

// The data-size limit a list of ixs requests, or undefined without the ix.
const dataSizeLimit = (ixs: TransactionInstruction[]) => {
  const dataSizeIx = ixs.find(
    (i) =>
      i.programId.equals(ComputeBudgetProgram.programId) &&
      i.data[0] === COMPUTE_BUDGET_IX_DATA_SIZE
  );
  return dataSizeIx?.data.readUInt32LE(1);
};

// The data-size limit a simulated tx ran under, read from its compiled ixs.
const simulatedDataSizeLimit = (tx: VersionedTransaction) => {
  const keys = tx.message.staticAccountKeys;
  const dataSizeIx = tx.message.compiledInstructions.find(
    (i) =>
      keys[i.programIdIndex].equals(ComputeBudgetProgram.programId) &&
      i.data[0] === COMPUTE_BUDGET_IX_DATA_SIZE
  );
  return dataSizeIx && Buffer.from(dataSizeIx.data).readUInt32LE(1);
};

const MEASURED = { err: null, unitsConsumed: 1000, loadedAccountsDataSize: 20000 };
// 20000 bytes × 1.1, rounded up to the 32 KiB fee quantum.
const DERIVED = 32 * 1024;

describe("withPriorityFees loaded-accounts data size", () => {
  const quietConsoleWarn = console.warn;
  before(() => {
    console.warn = () => {};
  });
  after(() => {
    console.warn = quietConsoleWarn;
  });

  const fees = (
    connection: any,
    options: Partial<Parameters<typeof withPriorityFees>[0]> = {}
  ) =>
    withPriorityFees({
      connection,
      instructions: [ix],
      feePayer: Keypair.generate().publicKey,
      addressLookupTables: [],
      ...options,
    });

  it("derives the limit from simulation for a keypair fee payer", async () => {
    const { connection, simulated } = simConnection([MEASURED]);
    const ixs = await fees(connection, { signing: { feePayer: "keypair" } });
    expect(dataSizeLimit(ixs)).to.equal(DERIVED);
    expect(simulatedDataSizeLimit(simulated[0])).to.equal(
      DEFAULT_LOADED_ACCOUNTS_DATA_SIZE_LIMIT
    );
  });

  it("derives the limit when no signing is given", async () => {
    const { connection } = simConnection([MEASURED]);
    expect(dataSizeLimit(await fees(connection))).to.equal(DERIVED);
  });

  it("omits the limit for a wallet fee payer, in the simulation too", async () => {
    const { connection, simulated } = simConnection([MEASURED]);
    const ixs = await fees(connection, { signing: { feePayer: "wallet" } });
    expect(dataSizeLimit(ixs)).to.equal(undefined);
    expect(simulatedDataSizeLimit(simulated[0])).to.equal(undefined);
  });

  it("honors an explicit limit for a wallet fee payer", async () => {
    const { connection } = simConnection([MEASURED]);
    const ixs = await fees(connection, {
      signing: { feePayer: "wallet" },
      loadedAccountsDataSizeLimit: 100000,
    });
    expect(dataSizeLimit(ixs)).to.equal(100000);
  });

  it("derives for a wallet fee payer when deriveLoadedAccountsDataSizeLimit is true", async () => {
    const { connection } = simConnection([MEASURED]);
    const ixs = await fees(connection, {
      signing: { feePayer: "wallet" },
      deriveLoadedAccountsDataSizeLimit: true,
    });
    expect(dataSizeLimit(ixs)).to.equal(DERIVED);
  });

  it("omits the limit for a keypair fee payer when deriveLoadedAccountsDataSizeLimit is false", async () => {
    const { connection } = simConnection([MEASURED]);
    const ixs = await fees(connection, {
      signing: { feePayer: "keypair" },
      deriveLoadedAccountsDataSizeLimit: false,
    });
    expect(dataSizeLimit(ixs)).to.equal(undefined);
  });

  it("omits the limit when the simulation fails", async () => {
    const { connection } = simConnection([
      { err: { InstructionError: [0, "Custom"] } },
    ]);
    const ixs = await fees(connection, { signing: { feePayer: "keypair" } });
    expect(dataSizeLimit(ixs)).to.equal(undefined);
  });

  it("re-simulates without a ceiling when the default ceiling is exceeded", async () => {
    const measured = 20 * 1024 * 1024;
    const { connection, simulated } = simConnection([
      { err: "MaxLoadedAccountsDataSizeExceeded" },
      { err: null, unitsConsumed: 1000, loadedAccountsDataSize: measured },
    ]);
    const ixs = await fees(connection, { signing: { feePayer: "keypair" } });
    expect(simulated).to.have.length(2);
    expect(simulatedDataSizeLimit(simulated[1])).to.equal(undefined);
    expect(dataSizeLimit(ixs)).to.equal(
      Math.ceil((measured * 1.1) / (32 * 1024)) * 32 * 1024
    );
  });

  it("adds no limit with an explicit computeUnits, even for a keypair", async () => {
    const { connection, simulated } = simConnection([]);
    const ixs = await fees(connection, {
      signing: { feePayer: "keypair" },
      computeUnits: 200000,
    });
    expect(simulated).to.have.length(0);
    expect(dataSizeLimit(ixs)).to.equal(undefined);
  });
});
