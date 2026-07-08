import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { expect } from "chai";
import {
  INSTRUCTION_CU_TABLE,
  MAX_COMPUTE_UNITS,
  tableComputeUnits,
  tableComputeUnitsForInstructions,
} from "../packages/spl-utils/src/computeUnitTable";
import {
  COMPUTE_BUDGET_IX_DATA_SIZE,
  COMPUTE_BUDGET_IX_LIMIT,
  COMPUTE_BUDGET_IX_PRICE,
  DEFAULT_LOADED_ACCOUNTS_DATA_SIZE_LIMIT,
  estimateComputeBudget,
  prependComputeBudgetIxs,
  setLoadedAccountsDataSizeLimit,
  withPriorityFees,
} from "../packages/spl-utils/src/priorityFees";
import { batchInstructionsToTxsWithPriorityFee } from "../packages/spl-utils/src/transaction";

// No localnet needed: withPriorityFees only touches the connection through
// these three methods, so a stub exercises the real branching logic.
// Pass `simTxs` to capture the transaction handed to simulateTransaction —
// tests assert on the sim tx's ComputeBudget prefix, the invariant that
// decides whether a data-size ceiling counts as validated.
const stubConnection = ({
  sim,
  fee = 100,
  simTxs,
}: {
  sim?: any;
  fee?: number;
  simTxs?: any[];
}): Connection =>
  ({
    _rpcRequest: async () => ({ result: { priorityFeeEstimate: fee } }),
    _buildArgs: (args: any[]) => args,
    simulateTransaction: async (tx: any) => {
      simTxs?.push(tx);
      if (!sim) throw new Error("unexpected simulateTransaction call");
      return { value: sim };
    },
  } as unknown as Connection);

const cbIxs = (ixs: TransactionInstruction[], discriminator: number) =>
  ixs.filter(
    (ix) =>
      ix.programId.equals(ComputeBudgetProgram.programId) &&
      ix.data[0] === discriminator
  );

// ComputeBudget ixs inside a captured (compiled) sim transaction.
const simCbIxs = (tx: any, discriminator: number) =>
  tx.message.compiledInstructions.filter(
    (ci: any) =>
      tx.message.staticAccountKeys[ci.programIdIndex].equals(
        ComputeBudgetProgram.programId
      ) && ci.data[0] === discriminator
  );

const feePayer = Keypair.generate().publicKey;
const transferIx = SystemProgram.transfer({
  fromPubkey: feePayer,
  toPubkey: Keypair.generate().publicKey,
  lamports: 1,
});

// Compile a v0 VersionedTransaction — the shape estimateComputeBudget and the
// table fallback (and migration-service) operate on.
const compileTx = (ixs: TransactionInstruction[]): VersionedTransaction =>
  new VersionedTransaction(
    new TransactionMessage({
      payerKey: feePayer,
      recentBlockhash: PublicKey.default.toBase58(),
      instructions: ixs,
    }).compileToV0Message()
  );

describe("setLoadedAccountsDataSizeLimit", () => {
  it("encodes discriminator 4 followed by the u32le byte limit", () => {
    const ix = setLoadedAccountsDataSizeLimit(16 * 1024 * 1024);
    expect(ix.programId.equals(ComputeBudgetProgram.programId)).to.be.true;
    expect(ix.keys).to.be.empty;
    expect(ix.data.length).to.eq(5);
    expect(ix.data.readUInt8(0)).to.eq(COMPUTE_BUDGET_IX_DATA_SIZE);
    expect(ix.data.readUInt32LE(1)).to.eq(16 * 1024 * 1024);
  });
});

describe("tableComputeUnitsForInstructions", () => {
  it("sums table entries and applies the fallback margin", () => {
    const [key, cu] = Object.entries(INSTRUCTION_CU_TABLE)[0];
    const [programId, discriminatorHex] = key.split(":");
    const ix = new TransactionInstruction({
      programId: new PublicKey(programId),
      keys: [],
      data: Buffer.from(discriminatorHex, "hex"),
    });
    expect(tableComputeUnitsForInstructions([ix])).to.eq(Math.ceil(cu * 1.2));
  });

  it("returns MAX_COMPUTE_UNITS when any instruction is unknown", () => {
    const unknown = new TransactionInstruction({
      programId: Keypair.generate().publicKey,
      keys: [],
      data: Buffer.alloc(8),
    });
    expect(tableComputeUnitsForInstructions([transferIx, unknown])).to.eq(
      MAX_COMPUTE_UNITS
    );
  });

  it("ignores compute-budget instructions, and returns MAX for none left", () => {
    const cbOnly = [ComputeBudgetProgram.setComputeUnitLimit({ units: 1 })];
    expect(tableComputeUnitsForInstructions(cbOnly)).to.eq(MAX_COMPUTE_UNITS);
  });
});

describe("tableComputeUnits", () => {
  it("resolves program ids from a compiled VersionedTransaction (staticAccountKeys[programIdIndex]) and matches the per-instruction table", () => {
    // The sim-failure path and migration-service both price a compiled tx.
    const tx = compileTx([transferIx]);
    expect(tableComputeUnits(tx)).to.eq(
      tableComputeUnitsForInstructions([transferIx])
    );
  });
});

describe("estimateComputeBudget", () => {
  it("clamps the CU request to MAX_COMPUTE_UNITS", async () => {
    // unitsConsumed × 1.1 overshoots the 1.4M ceiling — must be clamped.
    const budget = await estimateComputeBudget(
      stubConnection({
        sim: { err: null, unitsConsumed: MAX_COMPUTE_UNITS },
      }),
      compileTx([transferIx])
    );
    expect(budget.simulated).to.be.true;
    expect(budget.computeUnits).to.eq(MAX_COMPUTE_UNITS);
  });

  it("falls back to the table when a successful sim reports unitsConsumed 0", async () => {
    const tx = compileTx([transferIx]);
    const budget = await estimateComputeBudget(
      stubConnection({ sim: { err: null, unitsConsumed: 0 } }),
      tx
    );
    expect(budget.simulated).to.be.false;
    expect(budget.computeUnits).to.eq(tableComputeUnits(tx));
  });

  it("falls back to the table when simulateTransaction throws on both attempts (transport error)", async () => {
    const tx = compileTx([transferIx]);
    // stubConnection with no `sim` throws on every simulateTransaction call.
    const budget = await estimateComputeBudget(stubConnection({}), tx);
    expect(budget.simulated).to.be.false;
    expect(budget.simErr).to.be.null;
    expect(budget.computeUnits).to.eq(tableComputeUnits(tx));
  });
});

describe("withPriorityFees", () => {
  it("omits the data-size instruction when computeUnits is explicit (no simulation validated a ceiling)", async () => {
    const ixs = await withPriorityFees({
      connection: stubConnection({}),
      computeUnits: 200000,
      instructions: [transferIx],
      feePayer,
    });
    const [limit] = cbIxs(ixs, COMPUTE_BUDGET_IX_LIMIT);
    expect(limit.data.readUInt32LE(1)).to.eq(200000);
    expect(cbIxs(ixs, COMPUTE_BUDGET_IX_DATA_SIZE)).to.be.empty;
  });

  it("an explicit loadedAccountsDataSizeLimit always wins", async () => {
    const ixs = await withPriorityFees({
      connection: stubConnection({}),
      computeUnits: 200000,
      instructions: [transferIx],
      feePayer,
      loadedAccountsDataSizeLimit: 64 * 1024,
    });
    const [dataSize] = cbIxs(ixs, COMPUTE_BUDGET_IX_DATA_SIZE);
    expect(dataSize.data.readUInt32LE(1)).to.eq(64 * 1024);
  });

  it("derives the data-size limit from simulation, rounded up to the 32 KiB quantum", async () => {
    const ixs = await withPriorityFees({
      connection: stubConnection({
        sim: {
          err: null,
          unitsConsumed: 50000,
          loadedAccountsDataSize: 100000,
        },
      }),
      instructions: [transferIx],
      feePayer,
    });
    const [limit] = cbIxs(ixs, COMPUTE_BUDGET_IX_LIMIT);
    expect(limit.data.readUInt32LE(1)).to.eq(Math.ceil(50000 * 1.1));
    const [dataSize] = cbIxs(ixs, COMPUTE_BUDGET_IX_DATA_SIZE);
    // ceil(100000 * 1.1 / 32768) * 32768
    expect(dataSize.data.readUInt32LE(1)).to.eq(131072);
  });

  it("clamps the derived data-size request to the default ceiling when the measured size exceeds it", async () => {
    const ixs = await withPriorityFees({
      connection: stubConnection({
        sim: {
          err: null,
          unitsConsumed: 50000,
          // Well above the 16 MiB default ceiling even before headroom.
          loadedAccountsDataSize: 20 * 1024 * 1024,
        },
      }),
      instructions: [transferIx],
      feePayer,
    });
    const [dataSize] = cbIxs(ixs, COMPUTE_BUDGET_IX_DATA_SIZE);
    expect(dataSize.data.readUInt32LE(1)).to.eq(
      DEFAULT_LOADED_ACCOUNTS_DATA_SIZE_LIMIT
    );
  });

  it("keeps the default data-size limit when simulation succeeds but the RPC omits the field", async () => {
    const ixs = await withPriorityFees({
      connection: stubConnection({ sim: { err: null, unitsConsumed: 50000 } }),
      instructions: [transferIx],
      feePayer,
    });
    const [dataSize] = cbIxs(ixs, COMPUTE_BUDGET_IX_DATA_SIZE);
    expect(dataSize.data.readUInt32LE(1)).to.eq(
      DEFAULT_LOADED_ACCOUNTS_DATA_SIZE_LIMIT
    );
  });

  it("omits the data-size instruction when simulation fails (table fallback)", async () => {
    const ixs = await withPriorityFees({
      connection: stubConnection({
        sim: { err: { InstructionError: [0, "ProgramFailedToComplete"] } },
      }),
      instructions: [transferIx],
      feePayer,
    });
    expect(cbIxs(ixs, COMPUTE_BUDGET_IX_DATA_SIZE)).to.be.empty;
    // CU limit falls back to the table (system transfer ceiling × margin).
    const [limit] = cbIxs(ixs, COMPUTE_BUDGET_IX_LIMIT);
    expect(limit.data.readUInt32LE(1)).to.eq(
      tableComputeUnitsForInstructions([transferIx])
    );
  });

  // A caller-supplied price ix must not suppress simulation of the other
  // two types — only the exact types the caller set stay out of the sim tx.
  it("still injects the sim CU limit and data-size ceiling when the caller set only a price ix", async () => {
    const callerPrice = ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: 5,
    });
    const simTxs: any[] = [];
    const ixs = await withPriorityFees({
      connection: stubConnection({
        sim: {
          err: null,
          unitsConsumed: 50000,
          loadedAccountsDataSize: 100000,
        },
        simTxs,
      }),
      instructions: [callerPrice, transferIx],
      feePayer,
    });
    // The sim tx carries our MAX limit and default ceiling, and exactly one
    // price ix — the caller's, never a duplicate.
    expect(simTxs.length).to.eq(1);
    const [simLimit] = simCbIxs(simTxs[0], COMPUTE_BUDGET_IX_LIMIT);
    expect(Buffer.from(simLimit.data).readUInt32LE(1)).to.eq(MAX_COMPUTE_UNITS);
    const [simDataSize] = simCbIxs(simTxs[0], COMPUTE_BUDGET_IX_DATA_SIZE);
    expect(Buffer.from(simDataSize.data).readUInt32LE(1)).to.eq(
      DEFAULT_LOADED_ACCOUNTS_DATA_SIZE_LIMIT
    );
    expect(simCbIxs(simTxs[0], COMPUTE_BUDGET_IX_PRICE).length).to.eq(1);
    // Output gets the sim-derived limit and data-size; caller's price wins.
    const [limit] = cbIxs(ixs, COMPUTE_BUDGET_IX_LIMIT);
    expect(limit.data.readUInt32LE(1)).to.eq(Math.ceil(50000 * 1.1));
    const [dataSize] = cbIxs(ixs, COMPUTE_BUDGET_IX_DATA_SIZE);
    expect(dataSize.data.readUInt32LE(1)).to.eq(131072);
    const prices = cbIxs(ixs, COMPUTE_BUDGET_IX_PRICE);
    expect(prices.length).to.eq(1);
  });

  it("keeps the default data-size limit when the caller set only a price ix and the RPC omits the measured size", async () => {
    const callerPrice = ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: 5,
    });
    const ixs = await withPriorityFees({
      connection: stubConnection({ sim: { err: null, unitsConsumed: 50000 } }),
      instructions: [callerPrice, transferIx],
      feePayer,
    });
    // Our ceiling was in the sim tx (the caller only set a price), so the
    // sim validated it and requesting it is safe.
    const [dataSize] = cbIxs(ixs, COMPUTE_BUDGET_IX_DATA_SIZE);
    expect(dataSize.data.readUInt32LE(1)).to.eq(
      DEFAULT_LOADED_ACCOUNTS_DATA_SIZE_LIMIT
    );
  });

  it("does not inject a data-size ix into the sim tx when the caller set their own", async () => {
    const callerDataSize = setLoadedAccountsDataSizeLimit(20 * 1024 * 1024);
    const simTxs: any[] = [];
    const ixs = await withPriorityFees({
      connection: stubConnection({
        sim: { err: null, unitsConsumed: 50000 },
        simTxs,
      }),
      instructions: [callerDataSize, transferIx],
      feePayer,
    });
    // Exactly one data-size ix in the sim tx — the caller's own ceiling.
    const simDataSizes = simCbIxs(simTxs[0], COMPUTE_BUDGET_IX_DATA_SIZE);
    expect(simDataSizes.length).to.eq(1);
    expect(Buffer.from(simDataSizes[0].data).readUInt32LE(1)).to.eq(
      20 * 1024 * 1024
    );
    // And exactly one in the output, still the caller's.
    const dataSizes = cbIxs(ixs, COMPUTE_BUDGET_IX_DATA_SIZE);
    expect(dataSizes.length).to.eq(1);
    expect(dataSizes[0].data.readUInt32LE(1)).to.eq(20 * 1024 * 1024);
  });

  it("drops an explicit data-size limit that simulation proved too low", async () => {
    const ixs = await withPriorityFees({
      connection: stubConnection({
        sim: { err: "MaxLoadedAccountsDataSizeExceeded" },
      }),
      instructions: [transferIx],
      feePayer,
      loadedAccountsDataSizeLimit: 64 * 1024,
    });
    // Sending the caller's ceiling would burn the fee on-chain (sends skip
    // preflight); fall back to the runtime 64 MiB default instead.
    expect(cbIxs(ixs, COMPUTE_BUDGET_IX_DATA_SIZE)).to.be.empty;
    const [limit] = cbIxs(ixs, COMPUTE_BUDGET_IX_LIMIT);
    expect(limit.data.readUInt32LE(1)).to.eq(
      tableComputeUnitsForInstructions([transferIx])
    );
  });

  it("keeps an explicit data-size limit when simulation fails for an unrelated reason", async () => {
    const ixs = await withPriorityFees({
      connection: stubConnection({
        sim: { err: { InstructionError: [0, "ProgramFailedToComplete"] } },
      }),
      instructions: [transferIx],
      feePayer,
      loadedAccountsDataSizeLimit: 64 * 1024,
    });
    const [dataSize] = cbIxs(ixs, COMPUTE_BUDGET_IX_DATA_SIZE);
    expect(dataSize.data.readUInt32LE(1)).to.eq(64 * 1024);
  });

  it("never duplicates a ComputeBudget instruction type the caller already set", async () => {
    const callerLimit = ComputeBudgetProgram.setComputeUnitLimit({
      units: 123456,
    });
    const ixs = await withPriorityFees({
      connection: stubConnection({}),
      computeUnits: 200000,
      instructions: [callerLimit, transferIx],
      feePayer,
      loadedAccountsDataSizeLimit: 64 * 1024,
    });
    const limits = cbIxs(ixs, COMPUTE_BUDGET_IX_LIMIT);
    expect(limits.length).to.eq(1);
    expect(limits[0].data.readUInt32LE(1)).to.eq(123456);
    expect(cbIxs(ixs, COMPUTE_BUDGET_IX_PRICE).length).to.eq(1);
    expect(cbIxs(ixs, COMPUTE_BUDGET_IX_DATA_SIZE).length).to.eq(1);
  });
});

describe("prependComputeBudgetIxs", () => {
  it("omits instructions whose value is unset", () => {
    const ixs = prependComputeBudgetIxs([transferIx], {
      computeUnits: 200000,
      microLamports: 1,
    });
    expect(cbIxs(ixs, COMPUTE_BUDGET_IX_LIMIT).length).to.eq(1);
    expect(cbIxs(ixs, COMPUTE_BUDGET_IX_PRICE).length).to.eq(1);
    expect(cbIxs(ixs, COMPUTE_BUDGET_IX_DATA_SIZE)).to.be.empty;
    expect(ixs[ixs.length - 1]).to.eq(transferIx);
  });

  it("skips any type the caller already set instead of duplicating it", () => {
    const callerLimit = ComputeBudgetProgram.setComputeUnitLimit({
      units: 123456,
    });
    const ixs = prependComputeBudgetIxs([callerLimit, transferIx], {
      computeUnits: 200000,
      microLamports: 1,
    });
    const limits = cbIxs(ixs, COMPUTE_BUDGET_IX_LIMIT);
    expect(limits.length).to.eq(1);
    expect(limits[0].data.readUInt32LE(1)).to.eq(123456);
    expect(cbIxs(ixs, COMPUTE_BUDGET_IX_PRICE).length).to.eq(1);
  });
});

describe("batchInstructionsToTxsWithPriorityFee", () => {
  const stubProvider = (connection: Connection) => {
    (connection as any).getLatestBlockhash = async () => ({
      blockhash: PublicKey.default.toBase58(),
      lastValidBlockHeight: 0,
    });
    return { connection, wallet: { publicKey: feePayer } } as any;
  };
  // Enough unique transfers to overflow one tx and force reuse on later txs.
  const manyTransfers = () =>
    Array.from({ length: 60 }, () =>
      SystemProgram.transfer({
        fromPubkey: feePayer,
        toPubkey: Keypair.generate().publicKey,
        lamports: 1,
      })
    );

  it("does not reuse the sim-derived data-size limit beyond the tx it was measured on", async () => {
    const provider = stubProvider(
      stubConnection({
        sim: {
          err: null,
          unitsConsumed: 50000,
          loadedAccountsDataSize: 100000,
        },
      })
    );
    const txs = await batchInstructionsToTxsWithPriorityFee(
      provider,
      manyTransfers(),
      { useFirstEstimateForAll: true }
    );
    expect(txs.length).to.be.greaterThan(2);
    // First tx keeps its own sim-derived limit; every later tx — including the
    // final flush — reuses the first estimate (CU limit + price) instead of
    // re-estimating, and must NOT inherit the sim-derived data-size limit
    // (they'd fail on-chain if they load more data).
    expect(
      cbIxs(txs[0].instructions, COMPUTE_BUDGET_IX_DATA_SIZE).length
    ).to.eq(1);
    for (const tx of txs.slice(1)) {
      expect(cbIxs(tx.instructions, COMPUTE_BUDGET_IX_DATA_SIZE)).to.be.empty;
      expect(cbIxs(tx.instructions, COMPUTE_BUDGET_IX_LIMIT).length).to.eq(1);
      expect(cbIxs(tx.instructions, COMPUTE_BUDGET_IX_PRICE).length).to.eq(1);
    }
  });

  it("reuses an explicit batch-wide data-size limit on every tx", async () => {
    const provider = stubProvider(
      stubConnection({
        sim: { err: null, unitsConsumed: 50000 },
      })
    );
    const txs = await batchInstructionsToTxsWithPriorityFee(
      provider,
      manyTransfers(),
      { useFirstEstimateForAll: true, loadedAccountsDataSizeLimit: 64 * 1024 }
    );
    expect(txs.length).to.be.greaterThan(2);
    for (const tx of txs) {
      const [dataSize] = cbIxs(tx.instructions, COMPUTE_BUDGET_IX_DATA_SIZE);
      expect(dataSize.data.readUInt32LE(1)).to.eq(64 * 1024);
    }
  });
});
