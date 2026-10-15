import { Keypair, PublicKey, TransactionInstruction } from "@solana/web3.js";
import { expect } from "chai";
import { estimatePrioritizationFee, MAX_PRIO_FEE } from "../src/priorityFees";

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
