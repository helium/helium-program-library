import { BN } from "@anchor-lang/core";
import {
  Keypair,
  PublicKey,
  TransactionInstruction,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { expect } from "chai";
import { FastifyInstance } from "fastify";
import { dcaTaskBindingError } from "../packages/tuktuk-dca-service/src/binding";
import {
  pinnedSwapProgram,
  planSwapWrapping,
} from "../packages/tuktuk-dca-service/src/wrap";
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

describe("dca server swap wrapping", () => {
  const SWAP_PROGRAM = new PublicKey(
    "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
  );

  function ix(programId: PublicKey) {
    return new TransactionInstruction({ programId, keys: [], data: Buffer.from([]) });
  }

  // Anchor's `Program` constructor camelCases the IDL while the file on disk carries the Rust
  // snake_case, and the service reads the former. Both spellings are exercised here because a
  // lookup that matches only one returns undefined on the other and takes the whole service
  // down on the first request.
  for (const [spelling, instruction, account] of [
    ["camelCase (what Program.idl carries)", "swapV0", "swapProgram"],
    ["snake_case (what the IDL file carries)", "swap_v0", "swap_program"],
  ] as const) {
    it(`reads the pinned swap program from a ${spelling} IDL`, () => {
      const idl = {
        instructions: [
          {
            name: instruction,
            accounts: [{ name: account, address: SWAP_PROGRAM.toBase58() }],
          },
        ],
      } as any;
      expect(pinnedSwapProgram(idl).toBase58()).to.equal(
        SWAP_PROGRAM.toBase58(),
      );
    });
  }

  it("refuses an IDL whose swap_v0 carries no pinned address", () => {
    const idl = {
      instructions: [{ name: "swapV0", accounts: [{ name: "swapProgram" }] }],
    } as any;
    expect(() => pinnedSwapProgram(idl)).to.throw("no pinned address");
  });

  it("wraps the route instruction and leaves setup alone", () => {
    const { toWrap } = planSwapWrapping(
      [ix(TOKEN_PROGRAM_ID), ix(SWAP_PROGRAM), ix(TOKEN_PROGRAM_ID)],
      SWAP_PROGRAM,
    );
    expect(toWrap).to.deep.equal([false, true, false]);
  });

  it("refuses a route that wraps nothing", () => {
    expect(() =>
      planSwapWrapping([ix(TOKEN_PROGRAM_ID)], SWAP_PROGRAM),
    ).to.throw("wraps no instruction");
  });

  it("refuses an instruction against an unrecognized program", () => {
    expect(() =>
      planSwapWrapping(
        [ix(SWAP_PROGRAM), ix(Keypair.generate().publicKey)],
        SWAP_PROGRAM,
      ),
    ).to.throw("unrecognized program");
  });
});
