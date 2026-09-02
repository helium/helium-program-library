import { Connection, Keypair, TransactionInstruction } from "@solana/web3.js";
import { expect } from "chai";
import { before, describe, it } from "mocha";

/**
 * Type-only, so naming the builder here does not import it: the module reads a
 * validated env at load, which only exists once `before` has set one up.
 */
type BatcherModule =
  typeof import("../../src/server/api/routers/governance/procedures/helpers/build-batched-transactions");

const FEE_PAYER = Keypair.generate().publicKey;
const NOOP_PROGRAM = Keypair.generate().publicKey;

/**
 * Counts the reads every transaction in a batch would otherwise repeat: the
 * recent blockhash and the Helium lookup table. Both give the same answer for
 * every transaction in one build.
 */
const makeCountingConnection = () => {
  const state = { blockhashCalls: 0, accountBatchCalls: 0 };

  const connection = {
    rpcEndpoint: "http://localhost:0",
    _rpcEndpoint: "http://localhost:0",
    getLatestBlockhash: async () => {
      state.blockhashCalls++;
      return {
        blockhash: "EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N",
        lastValidBlockHeight: 1,
      };
    },
    getMultipleAccountsInfo: async (keys: unknown[]) => {
      state.accountBatchCalls++;
      return keys.map(() => null);
    },
    getRecentPrioritizationFees: async () => [],
    _rpcRequest: async () => ({ result: { priorityFeeEstimate: 1 } }),
    _buildArgs: (args: unknown[]) => args,
  } as unknown as Connection;

  return { connection, state };
};

/** ~600 bytes of data, so two of these cannot share one 1232-byte tx. */
const makeBigGroup = (description: string) => ({
  instructions: [
    new TransactionInstruction({
      programId: NOOP_PROGRAM,
      keys: [],
      data: Buffer.alloc(600, 1),
    }),
  ],
  metadata: { type: "test", description },
});

describe("buildBatchedTransactions shared reads", () => {
  let buildBatchedTransactions: BatcherModule["buildBatchedTransactions"];

  before(async () => {
    // Every server variable the env schema requires without a default.
    process.env.PG_USER = "test";
    process.env.PG_NAME = "test";
    process.env.PG_HOST = "localhost";
    process.env.PG_PORT = "5432";
    process.env.PRIVY_APP_SECRET = "test";
    process.env.BRIDGE_API_KEY = "test";
    process.env.JUPITER_API_KEY = "test";
    process.env.NEXT_PUBLIC_PRIVY_APP_ID = "test";
    process.env.NO_PG = "true";
    // Off mainnet the builder appends no Jito tip transaction, which would
    // otherwise reach for a connection of its own.
    process.env.NEXT_PUBLIC_SOLANA_CLUSTER = "devnet";
    ({ buildBatchedTransactions } =
      await import("../../src/server/api/routers/governance/procedures/helpers/build-batched-transactions"));
  });

  it("reads the blockhash and the lookup table once for the whole batch", async () => {
    // #given three groups too large to share a transaction
    const { connection, state } = makeCountingConnection();

    // #when they are built into a batch
    const { versionedTransactions } = await buildBatchedTransactions({
      groups: [makeBigGroup("one"), makeBigGroup("two"), makeBigGroup("three")],
      connection,
      feePayer: FEE_PAYER,
      useTableComputeUnits: true,
    });

    // #then every transaction was built from the same two reads
    expect(versionedTransactions.length).to.be.greaterThan(1);
    expect(
      state.blockhashCalls,
      "each transaction fetched its own blockhash",
    ).to.equal(1);
    expect(
      state.accountBatchCalls,
      "each transaction fetched the lookup table again",
    ).to.equal(1);
  });
});
