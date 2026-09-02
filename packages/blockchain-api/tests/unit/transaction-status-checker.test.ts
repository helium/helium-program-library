import { Connection } from "@solana/web3.js";
import { expect } from "chai";
import { after, afterEach, before, describe, it } from "mocha";
import type PendingTransactionModel from "../../src/lib/models/pending-transaction";
import type TransactionBatchModel from "../../src/lib/models/transaction-batch";

/**
 * Type-only, so naming the checker here does not import it: the module reads a
 * validated env at load, which only exists once `before` has set one up.
 */
type CheckerModule =
  typeof import("../../src/lib/utils/transaction-status-checker");

const BATCH_ID = "batch-1";

interface FakeRow {
  id: number;
  signature: string;
  status: string;
  blockhash: string;
  lastValidBlockHeight: number;
  serializedTransaction?: string;
  /** What the row reads as after another writer moved it. */
  reloadsTo?: string;
  reload: () => Promise<void>;
}

const row = (
  id: number,
  signature: string,
  status = "pending",
  reloadsTo?: string,
): FakeRow => {
  const r: FakeRow = {
    id,
    signature,
    status,
    blockhash: `hash-${id}`,
    lastValidBlockHeight: 1_000,
    serializedTransaction: "AAAA",
    reloadsTo,
    reload: async () => {
      if (r.reloadsTo) {
        r.status = r.reloadsTo;
      }
    },
  };
  return r;
};

const batch = (status: string) =>
  ({
    id: BATCH_ID,
    status,
    submissionType: "single",
    payer: "payer",
  }) as unknown as TransactionBatchModel;

describe("checkAndUpdateBatchStatus", () => {
  let checkAndUpdateBatchStatus: CheckerModule["checkAndUpdateBatchStatus"];
  let PendingTransaction: typeof PendingTransactionModel;
  let TransactionBatch: typeof TransactionBatchModel;
  let sequelize: typeof import("../../src/lib/db").sequelize;

  const originals: Record<string, unknown> = {};
  let rows: FakeRow[] = [];
  /** What the cluster reports for each signature. */
  let landed = new Set<string>();
  let rowUpdates: { values: Record<string, unknown>; where: unknown }[] = [];
  let batchUpdates: { values: Record<string, unknown>; where: unknown }[] = [];
  /** Rows the fake database lets a compare-and-swap win. */
  let rowUpdateWins: (where: { id: number; status: string }) => number = () =>
    1;
  let batchUpdateWins = 1;

  before(async () => {
    process.env.PG_USER = "test";
    process.env.PG_NAME = "test";
    process.env.PG_HOST = "localhost";
    process.env.PG_PORT = "5432";
    process.env.PRIVY_APP_SECRET = "test";
    process.env.BRIDGE_API_KEY = "test";
    process.env.JUPITER_API_KEY = "test";
    process.env.NEXT_PUBLIC_PRIVY_APP_ID = "test";
    process.env.NO_PG = "true";
    process.env.NEXT_PUBLIC_SOLANA_CLUSTER = "devnet";
    ({ checkAndUpdateBatchStatus } =
      await import("../../src/lib/utils/transaction-status-checker"));
    PendingTransaction = (
      await import("../../src/lib/models/pending-transaction")
    ).default;
    TransactionBatch = (await import("../../src/lib/models/transaction-batch"))
      .default;
    ({ sequelize } = await import("../../src/lib/db"));

    originals.getBlockHeight = Connection.prototype.getBlockHeight;
    originals.getSignatureStatuses = Connection.prototype.getSignatureStatuses;
    originals.isBlockhashValid = Connection.prototype.isBlockhashValid;
    originals.findAll = PendingTransaction.findAll;
    originals.rowUpdate = PendingTransaction.update;
    originals.batchUpdate = TransactionBatch.update;
    originals.transaction = sequelize.transaction;

    Connection.prototype.getBlockHeight = async () => 100;
    Connection.prototype.getSignatureStatuses = async (signatures: string[]) =>
      ({
        context: { slot: 1 },
        value: signatures.map((s) =>
          landed.has(s)
            ? {
                slot: 1,
                confirmations: 1,
                err: null,
                confirmationStatus: "confirmed",
              }
            : null,
        ),
      }) as any;
    Connection.prototype.isBlockhashValid = async () =>
      ({ context: { slot: 1 }, value: true }) as any;
    (PendingTransaction as any).findAll = async () => rows;
    (PendingTransaction as any).update = async (
      values: Record<string, unknown>,
      options: { where: { id: number; status: string } },
    ) => {
      rowUpdates.push({ values, where: options.where });
      return [rowUpdateWins(options.where)];
    };
    (TransactionBatch as any).update = async (
      values: Record<string, unknown>,
      options: { where: unknown },
    ) => {
      batchUpdates.push({ values, where: options.where });
      return [batchUpdateWins];
    };
    (sequelize as any).transaction = async () => ({
      commit: async () => {},
      rollback: async () => {},
    });
  });

  afterEach(() => {
    rows = [];
    landed = new Set();
    rowUpdates = [];
    batchUpdates = [];
    rowUpdateWins = () => 1;
    batchUpdateWins = 1;
  });

  after(() => {
    Connection.prototype.getBlockHeight = originals.getBlockHeight as any;
    Connection.prototype.getSignatureStatuses =
      originals.getSignatureStatuses as any;
    Connection.prototype.isBlockhashValid = originals.isBlockhashValid as any;
    (PendingTransaction as any).findAll = originals.findAll;
    (PendingTransaction as any).update = originals.rowUpdate;
    (TransactionBatch as any).update = originals.batchUpdate;
    (sequelize as any).transaction = originals.transaction;
  });

  it("writes each row and the batch as a compare-and-swap on the status it decided from", async () => {
    rows = [row(1, "sig-1"), row(2, "sig-2")];
    landed = new Set(["sig-1", "sig-2"]);
    const b = batch("pending");

    const result = await checkAndUpdateBatchStatus(b);

    expect(rowUpdates.map((u) => u.where)).to.deep.equal([
      { id: 1, status: "pending" },
      { id: 2, status: "pending" },
    ]);
    expect(rowUpdates.map((u) => u.values.status)).to.deep.equal([
      "confirmed",
      "confirmed",
    ]);
    expect(batchUpdates).to.have.length(1);
    expect(batchUpdates[0].where).to.deep.equal({
      id: BATCH_ID,
      status: "pending",
    });
    expect(batchUpdates[0].values.status).to.equal("confirmed");
    expect(result.batchStatus).to.equal("confirmed");
    expect(b.status).to.equal("confirmed");
  });

  it("rolls the batch up from the rows as stored when a row's write lost the race", async () => {
    // The cluster says sig-1 landed, but another writer failed the row first.
    rows = [row(1, "sig-1", "pending", "failed"), row(2, "sig-2")];
    landed = new Set(["sig-1", "sig-2"]);
    rowUpdateWins = (where) => (where.id === 1 ? 0 : 1);

    const result = await checkAndUpdateBatchStatus(batch("pending"));

    expect(batchUpdates).to.have.length(1);
    expect(batchUpdates[0].values.status).to.equal("partial");
    expect(result.batchStatus).to.equal("partial");
    expect(result.transactionStatuses.map((t) => t.status)).to.deep.equal([
      "failed",
      "confirmed",
    ]);
    expect(result.confirmedCount).to.equal(1);
    expect(result.failedCount).to.equal(1);
  });

  it("keeps the stored batch status when the batch's own write lost the race", async () => {
    rows = [row(1, "sig-1")];
    landed = new Set(["sig-1"]);
    batchUpdateWins = 0;
    const b = batch("pending");

    const result = await checkAndUpdateBatchStatus(b);

    expect(b.status).to.equal("pending");
    expect(result.batchStatus).to.equal("pending");
  });

  it("does not reopen a terminal batch from a tick that learned nothing", async () => {
    // A reaped batch that never got its rows: the rollup over no rows is
    // "pending", which must not be written over "expired".
    rows = [];
    const b = batch("expired");

    const result = await checkAndUpdateBatchStatus(b);

    expect(batchUpdates).to.deep.equal([]);
    expect(b.status).to.equal("expired");
    expect(result.batchStatus).to.equal("expired");
  });

  it("does not reopen a terminal batch whose rows are still pending", async () => {
    rows = [row(1, "sig-1")];
    const b = batch("expired");

    const result = await checkAndUpdateBatchStatus(b);

    expect(rowUpdates).to.deep.equal([]);
    expect(batchUpdates).to.deep.equal([]);
    expect(result.batchStatus).to.equal("expired");
  });
});
