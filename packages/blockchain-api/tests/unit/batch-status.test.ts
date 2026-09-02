import { expect } from "chai";
import { describe, it } from "mocha";
import {
  decideBatchStatus,
  type BatchTransactionRow,
} from "../../src/lib/utils/batch-status";
import type { MinimalSignatureStatus } from "../../src/lib/utils/submission-helpers";

const BATCH_ID = "0f3a2c1e-0000-4000-8000-000000000001";

const confirmed: MinimalSignatureStatus = {
  err: null,
  confirmationStatus: "confirmed",
};

const errored: MinimalSignatureStatus = {
  err: { InstructionError: [0, { Custom: 1 }] },
  confirmationStatus: "confirmed",
};

const processed: MinimalSignatureStatus = {
  err: null,
  confirmationStatus: "processed",
};

const pendingRow = (signature: string): BatchTransactionRow => ({
  signature,
  status: "pending",
  lastValidBlockHeight: 300,
});

/** Mirrors the still-pending filter the background loop applies before resubmitting. */
const stillPending = (
  statuses: Array<{ signature: string; status: string }>,
): string[] =>
  statuses.filter((s) => s.status === "pending").map((s) => s.signature);

describe("decideBatchStatus", () => {
  it("confirms a batch whose transactions landed between ticks, leaving nothing to resubmit", () => {
    const decision = decideBatchStatus({
      batchId: BATCH_ID,
      transactions: [pendingRow("sigA"), pendingRow("sigB")],
      signatureStatuses: new Map([
        ["sigA", confirmed],
        ["sigB", confirmed],
      ]),
      currentBlockHeight: 250,
    });

    expect(decision.batchStatus).to.equal("confirmed");
    expect(decision.confirmedCount).to.equal(2);
    expect(stillPending(decision.transactionStatuses)).to.deep.equal([]);
  });

  it("fails a transaction the cluster reports an error for", () => {
    const decision = decideBatchStatus({
      batchId: BATCH_ID,
      transactions: [pendingRow("sigA"), pendingRow("sigB")],
      signatureStatuses: new Map([
        ["sigA", confirmed],
        ["sigB", errored],
      ]),
      currentBlockHeight: 250,
    });

    expect(decision.transactionStatuses).to.deep.equal([
      { signature: "sigA", status: "confirmed" },
      { signature: "sigB", status: "failed" },
    ]);
    expect(decision.failedCount).to.equal(1);
    expect(decision.batchStatus).to.equal("partial");
  });

  it("keeps a transaction the cluster has never seen pending until its blockhash expires", () => {
    const decision = decideBatchStatus({
      batchId: BATCH_ID,
      transactions: [pendingRow("sigA")],
      signatureStatuses: new Map([["sigA", null]]),
      currentBlockHeight: 250,
    });

    expect(decision.batchStatus).to.equal("pending");
    expect(stillPending(decision.transactionStatuses)).to.deep.equal(["sigA"]);
  });

  it("expires a transaction the cluster has never seen past its last valid block height", () => {
    const decision = decideBatchStatus({
      batchId: BATCH_ID,
      transactions: [pendingRow("sigA")],
      signatureStatuses: new Map([["sigA", null]]),
      currentBlockHeight: 301,
    });

    expect(decision.transactionStatuses[0].status).to.equal("expired");
    expect(decision.batchStatus).to.equal("failed");
  });

  it("expiry-checks a transaction that is only processed, not yet confirmed", () => {
    const decision = decideBatchStatus({
      batchId: BATCH_ID,
      transactions: [pendingRow("sigA")],
      signatureStatuses: new Map([["sigA", processed]]),
      currentBlockHeight: 250,
    });

    expect(decision.transactionStatuses[0].status).to.equal("pending");
  });

  it("expires an old row that never recorded a last valid block height", () => {
    const decision = decideBatchStatus({
      batchId: BATCH_ID,
      transactions: [{ signature: "sigA", status: "pending" }],
      signatureStatuses: new Map([["sigA", null]]),
      currentBlockHeight: 250,
    });

    expect(decision.transactionStatuses[0].status).to.equal("expired");
  });

  it("rolls the batch up over rows that already reached a terminal status", () => {
    const decision = decideBatchStatus({
      batchId: BATCH_ID,
      transactions: [
        { signature: "sigA", status: "confirmed", lastValidBlockHeight: 300 },
        pendingRow("sigB"),
      ],
      signatureStatuses: new Map([["sigB", errored]]),
      currentBlockHeight: 250,
    });

    expect(decision.confirmedCount).to.equal(1);
    expect(decision.failedCount).to.equal(1);
    expect(decision.batchStatus).to.equal("partial");
  });

  it("keeps a confirmed row confirmed once the cluster no longer reports it", () => {
    const decision = decideBatchStatus({
      batchId: BATCH_ID,
      transactions: [
        { signature: "sigA", status: "confirmed", lastValidBlockHeight: 300 },
      ],
      signatureStatuses: new Map(),
      currentBlockHeight: 900,
    });

    expect(decision.transactionStatuses[0].status).to.equal("confirmed");
    expect(decision.batchStatus).to.equal("confirmed");
  });

  it("leaves a row that still holds a placeholder signature pending", () => {
    const decision = decideBatchStatus({
      batchId: BATCH_ID,
      transactions: [pendingRow(`${BATCH_ID}-0`)],
      signatureStatuses: new Map(),
      currentBlockHeight: 900,
    });

    expect(decision.transactionStatuses[0].status).to.equal("pending");
    expect(decision.batchStatus).to.equal("pending");
  });

  it("holds a merely confirmed transaction pending when finalization was asked for", () => {
    const decision = decideBatchStatus({
      batchId: BATCH_ID,
      transactions: [pendingRow("sigA")],
      signatureStatuses: new Map([["sigA", confirmed]]),
      currentBlockHeight: 250,
      commitment: "finalized",
    });

    expect(decision.transactionStatuses[0].status).to.equal("pending");
  });

  it("keeps the status the bundle check produced when no transaction resolved", () => {
    const decision = decideBatchStatus({
      batchId: BATCH_ID,
      transactions: [pendingRow("sigA")],
      signatureStatuses: new Map([["sigA", null]]),
      currentBlockHeight: 250,
      jitoBatchStatus: "failed",
    });

    expect(decision.batchStatus).to.equal("failed");
  });

  it("fails the batch when every transaction failed", () => {
    const decision = decideBatchStatus({
      batchId: BATCH_ID,
      transactions: [pendingRow("sigA")],
      signatureStatuses: new Map([["sigA", errored]]),
      currentBlockHeight: 250,
    });

    expect(decision.batchStatus).to.equal("failed");
  });
});
