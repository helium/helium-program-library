import { AnchorProvider } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  TransactionInstruction,
  VersionedTransaction,
} from "@solana/web3.js";
import { expect } from "chai";
import { describe, it } from "mocha";
import { batchInstructionsToTxsWithPriorityFee } from "../../../spl-utils/src/transaction";
import { estimateComputeUnits } from "../../../spl-utils/src/priorityFees";

const FEE_PAYER = Keypair.generate().publicKey;
const NOOP_PROGRAM = Keypair.generate().publicKey;

// Minimal fake connection: enough surface for the batcher's blockhash fetch,
// priority-fee estimation, and compute-unit simulation. No network.
const makeFakeConnection = () =>
  ({
    _rpcEndpoint: "http://localhost:0",
    rpcEndpoint: "http://localhost:0",
    getLatestBlockhash: async () => ({
      blockhash: "EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N",
      lastValidBlockHeight: 1,
    }),
    _rpcRequest: async () => ({
      result: { priorityFeeEstimate: 1 },
    }),
    _buildArgs: (args: unknown[]) => args,
    getRecentPrioritizationFees: async () => [],
    simulateTransaction: async () => ({
      context: { slot: 1 },
      value: { err: null, unitsConsumed: 100000, logs: [] },
    }),
  }) as unknown as Connection;

const makeProvider = (connection: Connection) =>
  ({
    connection,
    wallet: { publicKey: FEE_PAYER },
  }) as unknown as AnchorProvider;

// ~600 bytes of instruction data so two groups overflow one 1232-byte tx,
// forcing the batcher's overflow/close path (where the aliasing bug lived).
const makeBigIx = () =>
  new TransactionInstruction({
    programId: NOOP_PROGRAM,
    keys: [],
    data: Buffer.alloc(600, 1),
  });

describe("batchInstructionsToTxsWithPriorityFee", () => {
  it("does not mutate the caller's instruction group arrays", async () => {
    const provider = makeProvider(makeFakeConnection());
    const groups = [[makeBigIx()], [makeBigIx()], [makeBigIx()]];

    await batchInstructionsToTxsWithPriorityFee(provider, groups, {
      computeUnitLimit: 200000,
    });

    for (const [i, group] of groups.entries()) {
      expect(group, `group ${i} was mutated by the batcher`).to.have.length(1);
    }
  });

  it("returns the same packing when called repeatedly with the same groups", async () => {
    const provider = makeProvider(makeFakeConnection());
    const groups = [[makeBigIx()], [makeBigIx()], [makeBigIx()]];

    const first = await batchInstructionsToTxsWithPriorityFee(
      provider,
      groups,
      { computeUnitLimit: 200000 },
    );
    const second = await batchInstructionsToTxsWithPriorityFee(
      provider,
      groups,
      { computeUnitLimit: 200000 },
    );

    expect(second.length).to.equal(first.length);
    expect(
      second.map((d) => d.instructions.length),
      "repeat call produced txs with extra (duplicated) instructions",
    ).to.deep.equal(first.map((d) => d.instructions.length));
  });
});

describe("estimateComputeUnits", () => {
  it("falls back to max compute units when simulateTransaction rejects", async () => {
    const connection = {
      simulateTransaction: async () => {
        throw new Error(
          "failed to simulate transaction: base64 encoded solana_transaction::versioned::VersionedTransaction too large: 1804 bytes (max: encoded/raw 1644/1232)",
        );
      },
    } as unknown as Connection;

    const units = await estimateComputeUnits(
      connection,
      // Never serialized/sent — the fake rejects before touching it.
      {} as unknown as VersionedTransaction,
    );

    expect(units).to.equal(1400000);
  });
});
