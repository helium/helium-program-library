import { expect } from "chai";
import { SignatureStatus } from "@solana/web3.js";
import { TransactionCompletionQueue } from "../src/transactionCompletionQueue";

const status = (
  confirmationStatus: SignatureStatus["confirmationStatus"],
  err: SignatureStatus["err"] = null,
): SignatureStatus => ({
  slot: 1,
  confirmations: confirmationStatus == "finalized" ? null : 1,
  err,
  confirmationStatus,
});

// A node whose websocket never notifies, so only the REST poll can settle a wait.
const queueOverRest = (polls: SignatureStatus[]) => {
  let pollCount = 0;
  const connection = {
    onSignature: () => 7,
    removeSignatureListener: async () => {},
    getSignatureStatuses: async () => ({
      value: [polls[Math.min(pollCount++, polls.length - 1)]],
    }),
  } as any;
  return {
    queue: new TransactionCompletionQueue({ connection, log: false }),
    pollCount: () => pollCount,
  };
};

describe("TransactionCompletionQueue.wait over the REST poll", () => {
  it("resolves a wait at confirmed when the node reports finalized", async () => {
    const { queue } = queueOverRest([status("finalized")]);

    const result = await queue.wait("confirmed", "sig", 8000);

    expect(result).to.deep.equal(status("finalized"));
  });

  it("resolves a wait at processed when the node reports confirmed", async () => {
    const { queue } = queueOverRest([status("confirmed")]);

    const result = await queue.wait("processed", "sig", 8000);

    expect(result).to.deep.equal(status("confirmed"));
  });

  it("resolves a wait at processed or confirmed when the node reports that same level", async () => {
    const cases = [
      ["processed", status("processed")],
      ["confirmed", status("confirmed")],
    ] as const;

    const results = await Promise.all(
      cases.map(([commitment, reported]) =>
        queueOverRest([reported]).queue.wait(commitment, "sig", 8000),
      ),
    );

    expect(results).to.deep.equal([status("processed"), status("confirmed")]);
  });

  it("keeps polling a wait at finalized past confirmed until the node reports finalized", async function () {
    // Polls land 2 s to 4 s apart, so the second one can take 8 s.
    this.timeout(15000);
    const { queue, pollCount } = queueOverRest([
      status("confirmed"),
      status("finalized"),
    ]);

    const result = await queue.wait("finalized", "sig", 12000);

    expect(result).to.deep.equal(status("finalized"));
    expect(pollCount()).to.equal(2);
  });

  it("resolves a wait at each deprecated commitment alias when the node reports finalized", async () => {
    const aliases = [
      "recent",
      "single",
      "singleGossip",
      "root",
      "max",
    ] as const;

    const results = await Promise.all(
      aliases.map((alias) =>
        queueOverRest([status("finalized")]).queue.wait(alias, "sig", 8000),
      ),
    );

    expect(results).to.deep.equal(aliases.map(() => status("finalized")));
  });

  it("resolves a wait at each deprecated commitment alias at the lowest level the alias names", async () => {
    const cases = [
      ["recent", status("processed")],
      ["single", status("confirmed")],
      ["singleGossip", status("confirmed")],
    ] as const;

    const results = await Promise.all(
      cases.map(([alias, reported]) =>
        queueOverRest([reported]).queue.wait(alias, "sig", 8000),
      ),
    );

    expect(results).to.deep.equal([
      status("processed"),
      status("confirmed"),
      status("confirmed"),
    ]);
  });

  it("does not resolve a wait at a deprecated commitment alias while the node reports a level below the one the alias names", async () => {
    const cases = [
      ["single", status("processed")],
      ["singleGossip", status("processed")],
      ["root", status("confirmed")],
      ["max", status("confirmed")],
    ] as const;

    const outcomes = await Promise.all(
      cases.map(([alias, reported]) =>
        queueOverRest([reported])
          .queue.wait(alias, "sig", 6000)
          .then(
            () => "resolved",
            (e) => e,
          ),
      ),
    );

    expect(outcomes).to.deep.equal([
      { timeout: true },
      { timeout: true },
      { timeout: true },
      { timeout: true },
    ]);
  });

  it("rejects with the transaction error when the node reports one", async () => {
    const err = { InstructionError: [0, { Custom: 1 }] };
    const { queue } = queueOverRest([status("finalized", err)]);

    let rejection: unknown;
    try {
      await queue.wait("confirmed", "sig", 8000);
    } catch (e) {
      rejection = e;
    }

    expect(rejection).to.deep.equal(err);
  });

  it("resolves when the node reports confirmations without a confirmation status", async () => {
    const { queue } = queueOverRest([status(undefined)]);

    const result = await queue.wait("finalized", "sig", 8000);

    expect(result).to.deep.equal(status(undefined));
  });
});

describe("TransactionCompletionQueue.wait over the websocket", () => {
  it("resolves with the notified slot when the signature notification arrives", async () => {
    const connection = {
      onSignature: (
        _txid: string,
        callback: (result: { err: null }, context: { slot: number }) => void,
      ) => {
        setTimeout(() => callback({ err: null }, { slot: 5 }), 0);
        return 7;
      },
      removeSignatureListener: async () => {},
      getSignatureStatuses: async () => ({ value: [null] }),
    } as any;
    const queue = new TransactionCompletionQueue({ connection, log: false });

    const result = await queue.wait("confirmed", "sig", 8000);

    expect(result).to.deep.equal({ err: null, slot: 5, confirmations: 0 });
  });
});
