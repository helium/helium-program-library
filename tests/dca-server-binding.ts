import { BN } from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import { expect } from "chai";
import { FastifyInstance } from "fastify";
import { dcaTaskBindingError } from "../packages/tuktuk-dca-service/src/binding";
import { createDcaServer } from "./utils/dca-test-server";

// The DCA account the stubbed program returns; the request has to name all three
// of these for the server to sign anything.
const NEXT_TASK = Keypair.generate().publicKey;
const TASK_QUEUE = Keypair.generate().publicKey;
const QUEUED_AT = new BN(1_700_000_000);

const DCA = Keypair.generate().publicKey;

function body(overrides: Partial<Record<string, string>> = {}) {
  return {
    task: NEXT_TASK.toBase58(),
    task_queue: TASK_QUEUE.toBase58(),
    task_queued_at: QUEUED_AT.toString(),
    ...overrides,
  };
}

describe("dca server task binding", () => {
  let server: FastifyInstance;

  before(async () => {
    const program = {
      account: {
        dcaV0: {
          fetch: async () => ({
            nextTask: NEXT_TASK,
            taskQueue: TASK_QUEUE,
            queuedAt: QUEUED_AT,
          }),
        },
      },
    } as any;

    server = await createDcaServer({
      program,
      provider: {} as any,
      outputMint: PublicKey.default,
      dcaSigner: Keypair.generate(),
      port: 8125,
    });
  });

  after(async () => {
    if (server) {
      await server.close();
    }
  });

  async function post(payload: Record<string, string>) {
    return server.inject({
      method: "POST",
      url: `/dca/${DCA.toBase58()}`,
      payload,
    });
  }

  it("accepts a request that names the dca's task and queue", () => {
    expect(
      dcaTaskBindingError(
        { task: NEXT_TASK, taskQueue: TASK_QUEUE, taskQueuedAt: QUEUED_AT },
        { nextTask: NEXT_TASK, taskQueue: TASK_QUEUE, queuedAt: QUEUED_AT },
      ),
    ).to.equal(null);
  });

  // The stub provider has no connection, so a request that clears the guards
  // fails at the balance read with a 500; only a 400 here means a guard fired.
  it("passes the binding checks when the request names the dca's task and queue", async () => {
    const res = await post(body());
    expect(res.statusCode).to.not.equal(400);
    expect(JSON.parse(res.body).error || "").to.not.match(/does not match dca/);
  });

  it("rejects a task the dca does not name", async () => {
    const res = await post(
      body({ task: Keypair.generate().publicKey.toBase58() }),
    );
    expect(res.statusCode).to.equal(400);
    expect(JSON.parse(res.body).error).to.equal(
      "task does not match dca next_task",
    );
  });

  it("rejects a task queue the dca does not name", async () => {
    const res = await post(
      body({ task_queue: Keypair.generate().publicKey.toBase58() }),
    );
    expect(res.statusCode).to.equal(400);
    expect(JSON.parse(res.body).error).to.equal(
      "task_queue does not match dca task_queue",
    );
  });

  it("rejects a queued_at the dca does not name", async () => {
    const res = await post({
      ...body(),
      task_queued_at: QUEUED_AT.addn(1).toString(),
    });
    expect(res.statusCode).to.equal(400);
    expect(JSON.parse(res.body).error).to.equal(
      "task_queued_at does not match dca queued_at",
    );
  });
});
