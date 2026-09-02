import { expect } from "chai";
import { describe, it } from "mocha";
import {
  readBatchStatus,
  type BatchStatusRpc,
} from "../../src/lib/utils/batch-status-read";
import type { BatchTransactionRow } from "../../src/lib/utils/batch-status";
import type { MinimalSignatureStatus } from "../../src/lib/utils/submission-helpers";

const BATCH_ID = "0f3a2c1e-0000-4000-8000-000000000001";

const pendingRow = (signature: string): BatchTransactionRow => ({
  signature,
  status: "pending",
  lastValidBlockHeight: 300,
});

interface RpcCalls {
  blockHeightCalls: number;
  signatureCalls: string[][];
  searchedHistory: boolean[];
  probedBlockhashes: string[];
}

const fakeRpc = (
  overrides: {
    blockHeight?: () => Promise<number>;
    statuses?: (
      signatures: string[],
    ) => Promise<(MinimalSignatureStatus | null)[]>;
    blockhashValid?: (blockhash: string) => Promise<boolean>;
  } = {},
): { rpc: BatchStatusRpc; calls: RpcCalls } => {
  const calls: RpcCalls = {
    blockHeightCalls: 0,
    signatureCalls: [],
    searchedHistory: [],
    probedBlockhashes: [],
  };

  const rpc: BatchStatusRpc = {
    async getBlockHeight() {
      calls.blockHeightCalls += 1;
      return overrides.blockHeight ? overrides.blockHeight() : 250;
    },
    async getSignatureStatuses(signatures, config) {
      calls.signatureCalls.push(signatures);
      calls.searchedHistory.push(config.searchTransactionHistory);
      const value = overrides.statuses
        ? await overrides.statuses(signatures)
        : signatures.map(() => null);
      return { value };
    },
    async isBlockhashValid(blockhash) {
      calls.probedBlockhashes.push(blockhash);
      const value = overrides.blockhashValid
        ? await overrides.blockhashValid(blockhash)
        : true;
      return { value };
    },
  };

  return { rpc, calls };
};

describe("readBatchStatus", () => {
  it("skips the batch when the block-height read fails", async () => {
    const { rpc } = fakeRpc({
      blockHeight: () => Promise.reject(new Error("503 Service Unavailable")),
    });

    const decision = await readBatchStatus({
      rpc,
      batchId: BATCH_ID,
      transactions: [pendingRow("sig-a")],
    });

    expect(decision).to.equal(null);
  });

  it("skips the batch when the signature-status read fails", async () => {
    const { rpc } = fakeRpc({
      statuses: () => Promise.reject(new Error("500 Internal Server Error")),
    });

    const decision = await readBatchStatus({
      rpc,
      batchId: BATCH_ID,
      transactions: [pendingRow("sig-a")],
    });

    expect(decision).to.equal(null);
  });

  it("reads every still-pending signature in one history-searching call", async () => {
    const { rpc, calls } = fakeRpc({
      statuses: (signatures) =>
        Promise.resolve(
          signatures.map(() => ({
            err: null,
            confirmationStatus: "confirmed",
          })),
        ),
    });

    const decision = await readBatchStatus({
      rpc,
      batchId: BATCH_ID,
      transactions: [pendingRow("sig-a"), pendingRow("sig-b")],
    });

    expect(calls.blockHeightCalls).to.equal(1);
    expect(calls.signatureCalls).to.deep.equal([["sig-a", "sig-b"]]);
    expect(calls.searchedHistory).to.deep.equal([true]);
    expect(decision?.batchStatus).to.equal("confirmed");
  });

  it("does not look up placeholder signatures or rows that already settled", async () => {
    const { rpc, calls } = fakeRpc();

    await readBatchStatus({
      rpc,
      batchId: BATCH_ID,
      transactions: [
        { signature: `${BATCH_ID}-0`, status: "pending" },
        { signature: "sig-b", status: "confirmed" },
        pendingRow("sig-c"),
      ],
    });

    expect(calls.signatureCalls).to.deep.equal([["sig-c"]]);
  });

  it("probes each open row's own blockhash once and expires the rows it rejects", async () => {
    const { rpc, calls } = fakeRpc({
      blockhashValid: () => Promise.resolve(false),
    });

    const decision = await readBatchStatus({
      rpc,
      batchId: BATCH_ID,
      transactions: [
        { ...pendingRow("sig-a"), blockhash: "hashA" },
        { ...pendingRow("sig-b"), blockhash: "hashA" },
      ],
    });

    expect(calls.probedBlockhashes).to.deep.equal(["hashA"]);
    expect(decision?.batchStatus).to.equal("failed");
  });

  it("does not probe the blockhash of a row that already settled", async () => {
    const { rpc, calls } = fakeRpc();

    await readBatchStatus({
      rpc,
      batchId: BATCH_ID,
      transactions: [
        { signature: "sig-a", status: "confirmed", blockhash: "hashA" },
        { ...pendingRow("sig-b"), blockhash: "hashB" },
      ],
    });

    expect(calls.probedBlockhashes).to.deep.equal(["hashB"]);
  });
});
