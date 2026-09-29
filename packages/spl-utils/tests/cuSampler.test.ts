import {
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  TransactionConfig,
} from "@solana/web3.js";
import bs58 from "bs58";
import { expect } from "chai";
import { sampleComputeUnits } from "../src/cuSampler";

const program = Keypair.generate().publicKey;

const parsedIx = (programId: PublicKey, data: Buffer) => ({
  programId,
  accounts: [],
  data: bs58.encode(data),
});

// Stands in for the RPC node: one signature, answered by one parsed tx.
const fakeConnection = (message: object) =>
  ({
    getSignaturesForAddress: async () => [{ signature: "sig", err: null }],
    getParsedTransactions: async () => [
      {
        transaction: { message },
        meta: {
          err: null,
          computeUnitsConsumed: 1234,
          logMessages: [],
          innerInstructions: [],
        },
      },
    ],
  } as any);

const requestedCuOf = async (message: object) => {
  const { txStats } = await sampleComputeUnits(fakeConnection(message), {
    programs: { [program.toBase58()]: "program" },
    throttleMs: 0,
  });
  return txStats.program[0][1];
};

describe("sampleComputeUnits", () => {
  it("reads the requested CU from a v1 header with no ComputeBudget ixs", async () => {
    const transactionConfig: TransactionConfig = {
      computeUnitLimit: 300_000,
      heapSize: null,
      loadedAccountsDataSizeLimit: 64 * 1024 * 1024,
      priorityFee: 60,
    };
    expect(
      await requestedCuOf({
        instructions: [parsedIx(program, Buffer.from([9]))],
        transactionConfig,
      })
    ).to.equal(300_000);
  });

  it("reads the requested CU from a SetComputeUnitLimit ix", async () => {
    const limit = ComputeBudgetProgram.setComputeUnitLimit({ units: 250_000 });
    expect(
      await requestedCuOf({
        instructions: [
          parsedIx(limit.programId, limit.data),
          parsedIx(program, Buffer.from([9])),
        ],
      })
    ).to.equal(250_000);
  });
});
