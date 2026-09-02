import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  TransactionInstruction,
  VersionedTransaction,
} from "@solana/web3.js";
import { expect } from "chai";
import { before, describe, it } from "mocha";

/**
 * Type-only, so naming the builder here does not import it: the module reads a
 * validated env at load, which only exists once `before` has set one up.
 */
type BatcherModule =
  typeof import("../../src/server/api/routers/governance/procedures/helpers/build-batched-transactions");

const FEE_PAYER = Keypair.generate().publicKey;
/** Tabled per program, so the table prices it without an entry per ix. */
const MEMO_PROGRAM = new PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
);
const UNTABLED_PROGRAM = Keypair.generate().publicKey;

/**
 * Counts the reads every transaction in a batch would otherwise repeat: the
 * recent blockhash and the Helium lookup table. Both give the same answer for
 * every transaction in one build.
 */
const makeCountingConnection = () => {
  const state = { blockhashCalls: 0, accountBatchCalls: 0, simulateCalls: 0 };

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
    simulateTransaction: async () => {
      state.simulateCalls++;
      return { value: { err: null, unitsConsumed: 1234, logs: [] } };
    },
    _rpcRequest: async () => ({ result: { priorityFeeEstimate: 1 } }),
    _buildArgs: (args: unknown[]) => args,
  } as unknown as Connection;

  return { connection, state };
};

/** The memo program's table ceiling (15k) under FALLBACK_CU_MARGIN (2.0). */
const MEMO_TABLE_COMPUTE_UNITS = 30_000;

/** The compute unit limit a built transaction carries, or undefined. */
const computeUnitLimit = (tx: VersionedTransaction): number | undefined => {
  const programId = ComputeBudgetProgram.programId.toBase58();
  for (const ix of tx.message.compiledInstructions) {
    const key = tx.message.staticAccountKeys[ix.programIdIndex];
    if (key?.toBase58() === programId && ix.data[0] === 2) {
      return Buffer.from(ix.data).readUInt32LE(1);
    }
  }
  return undefined;
};

/** ~600 bytes of data, so two of these cannot share one 1232-byte tx. */
const makeBigGroup = (description: string, programId = MEMO_PROGRAM) => ({
  instructions: [
    new TransactionInstruction({
      programId,
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

  it("sizes CU limits from the static table unless told otherwise", async () => {
    // #given a connection that would happily answer a simulation
    const { connection, state } = makeCountingConnection();

    // #when a batch is built without naming the option
    const { versionedTransactions } = await buildBatchedTransactions({
      groups: [makeBigGroup("one")],
      connection,
      feePayer: FEE_PAYER,
    });

    // #then the table priced it and nothing was simulated
    expect(state.simulateCalls, "the builder simulated the batch").to.equal(0);
    expect(computeUnitLimit(versionedTransactions[0])).to.equal(
      MEMO_TABLE_COMPUTE_UNITS,
    );
  });

  it("refuses to build a bundle transaction the table cannot price", async () => {
    // #given an instruction with no table entry
    const { connection } = makeCountingConnection();

    // #when it is built for a bundle, which sizes from the table by choice
    let failure: unknown;
    try {
      await buildBatchedTransactions({
        groups: [makeBigGroup("one", UNTABLED_PROGRAM)],
        connection,
        feePayer: FEE_PAYER,
      });
    } catch (error) {
      failure = error;
    }

    // #then the miss is a build failure naming the key, not a 1.4M CU request
    expect(failure).to.be.instanceOf(Error);
    expect((failure as Error).message).to.include(UNTABLED_PROGRAM.toBase58());
  });
});
