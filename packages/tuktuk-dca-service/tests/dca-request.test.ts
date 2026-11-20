import assert from "node:assert/strict";
import { BN } from "@anchor-lang/core";
import { Keypair, PublicKey } from "@solana/web3.js";
import { CRANK_MAX_TX_BYTES } from "../src/crank";
import {
  answerDcaRequest,
  DcaOrder,
  DcaRequestDeps,
  SignedDcaTask,
} from "../src/dca-request";
import { DCA_SWAP_MAX_BYTES } from "../src/jupiter";

const key = () => Keypair.generate().publicKey;

const DCA = key();
const ORDER: DcaOrder = {
  nextTask: key(),
  taskQueue: key(),
  queuedAt: new BN(1_700_000_000),
  numOrders: 3,
  swapAmountPerOrder: new BN(1_000),
};
const BODY = {
  task: ORDER.nextTask.toBase58(),
  task_queue: ORDER.taskQueue.toBase58(),
  task_queued_at: ORDER.queuedAt.toString(),
};
const INPUT_BALANCE = new BN(2_500);
const ACCOUNT = key();

const signedTask = (maxBytes: number): SignedDcaTask => ({
  serialized: Buffer.from(`task@${maxBytes}`),
  signature: Buffer.alloc(64, 9),
  remainingAccounts: [{ pubkey: ACCOUNT, isSigner: false, isWritable: true }],
  lookupTables: [`table@${maxBytes}`],
});

/**
 * Deps over `order` whose task build answers the given crank transaction sizes in order, and
 * records the swap amounts and byte budgets it was given.
 */
const deps = (sizes: (number | undefined)[], order: DcaOrder = ORDER) => {
  const swapAmounts: string[] = [];
  const budgets: number[] = [];
  const value: DcaRequestDeps<DcaOrder> = {
    fetchOrder: async (dca: PublicKey) => {
      assert.ok(dca.equals(DCA));
      return order;
    },
    fetchInputBalance: async () => INPUT_BALANCE,
    prepareTask: async (_dca, _order, swapAmount) => {
      swapAmounts.push(swapAmount.toString());
      return async (maxBytes) => {
        budgets.push(maxBytes);
        return { task: signedTask(maxBytes), size: sizes[budgets.length - 1] };
      };
    },
  };
  return { value, swapAmounts, budgets };
};

const silenced = async <T>(run: () => Promise<T>): Promise<T> => {
  const { error, warn } = console;
  console.error = () => {};
  console.warn = () => {};
  try {
    return await run();
  } finally {
    console.error = error;
    console.warn = warn;
  }
};

describe("tuktuk-dca-service run request", () => {
  it("answers the signed remote task when the crank transaction fits", async () => {
    const { value, budgets } = deps([CRANK_MAX_TX_BYTES]);
    const reply = await answerDcaRequest(value, DCA.toBase58(), BODY);
    assert.deepEqual(reply, {
      status: 200,
      body: {
        transaction: Buffer.from(`task@${DCA_SWAP_MAX_BYTES}`).toString(
          "base64"
        ),
        signature: Buffer.alloc(64, 9).toString("base64"),
        remaining_accounts: [
          { pubkey: ACCOUNT.toBase58(), is_signer: false, is_writable: true },
        ],
        lookup_tables: [`table@${DCA_SWAP_MAX_BYTES}`],
      },
    });
    assert.deepEqual(budgets, [DCA_SWAP_MAX_BYTES]);
  });

  it("swaps the order amount, and the whole input balance on the last order", async () => {
    const middle = deps([CRANK_MAX_TX_BYTES]);
    await answerDcaRequest(middle.value, DCA.toBase58(), BODY);
    assert.deepEqual(middle.swapAmounts, ["1000"]);

    const last = deps([CRANK_MAX_TX_BYTES], { ...ORDER, numOrders: 1 });
    await answerDcaRequest(last.value, DCA.toBase58(), BODY);
    assert.deepEqual(last.swapAmounts, ["2500"]);
  });

  it("answers the retry's task when the first crank transaction does not fit", async () => {
    const { value, budgets } = deps([CRANK_MAX_TX_BYTES + 40, 1200]);
    const reply = await silenced(() =>
      answerDcaRequest(value, DCA.toBase58(), BODY)
    );
    assert.equal(reply.status, 200);
    assert.deepEqual(
      (reply.body as { lookup_tables: string[] }).lookup_tables,
      [`table@${DCA_SWAP_MAX_BYTES - 40}`]
    );
    assert.deepEqual(budgets, [DCA_SWAP_MAX_BYTES, DCA_SWAP_MAX_BYTES - 40]);
  });

  it("refuses with 422 when the retry still does not fit", async () => {
    const { value } = deps([undefined, CRANK_MAX_TX_BYTES + 1]);
    const reply = await silenced(() =>
      answerDcaRequest(value, DCA.toBase58(), BODY)
    );
    assert.deepEqual(reply, {
      status: 422,
      body: {
        error:
          "Jupiter found no route for this DCA order whose crank transaction fits (1233 bytes, limit 1232)",
      },
    });
  });

  for (const [field, value] of [
    ["task", key().toBase58()],
    ["task_queue", key().toBase58()],
    ["task_queued_at", "1"],
  ] as const) {
    it(`refuses with 400 a request whose ${field} the DCA does not name`, async () => {
      const { value: dcaDeps, swapAmounts } = deps([CRANK_MAX_TX_BYTES]);
      const reply = await answerDcaRequest(dcaDeps, DCA.toBase58(), {
        ...BODY,
        [field]: value,
      });
      assert.equal(reply.status, 400);
      assert.match((reply.body as { error: string }).error, /does not match/);
      assert.deepEqual(swapAmounts, []);
    });
  }

  it("answers 500 with the message when the build fails", async () => {
    const { value } = deps([]);
    value.prepareTask = async () => {
      throw new Error("Jupiter /build error: 500 Internal Server Error: down");
    };
    const reply = await silenced(() =>
      answerDcaRequest(value, DCA.toBase58(), BODY)
    );
    assert.deepEqual(reply, {
      status: 500,
      body: { error: "Jupiter /build error: 500 Internal Server Error: down" },
    });
  });

  it("answers 500 for a DCA key that is not a public key", async () => {
    const { value } = deps([CRANK_MAX_TX_BYTES]);
    const reply = await silenced(() =>
      answerDcaRequest(value, "not-a-key", BODY)
    );
    assert.equal(reply.status, 500);
  });
});
