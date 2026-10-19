import { PublicKey } from "@solana/web3.js";
import { expect } from "chai";
import sinon from "sinon";

// Fake timers, so reconnect delays pass without waiting real seconds.
let clock: sinon.SinonFakeTimers;

const sleep = (ms: number) => clock.tickAsync(ms);

const waitFor = async (check: () => boolean, timeoutMs = 10_000) => {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor timed out");
    await sleep(10);
  }
};

const stubbedModules = new Map<string, NodeModule | undefined>();

const stubModule = (path: string, exports: any) => {
  const resolved = require.resolve(path);
  if (!stubbedModules.has(resolved)) {
    stubbedModules.set(resolved, require.cache[resolved]);
  }
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports,
  } as any;
};

const block = (cursor: string, slot: number) => ({
  message: {
    case: "blockScopedData",
    value: { cursor, clock: { number: BigInt(slot) } },
  },
});

const fatalError = { message: { case: "fatalError", value: "fatal" } };

const RECOVERY_BLOCK = 42;

const cursorRow = (block: number) => ({
  getDataValue: (key: string) => (key === "block" ? `${block}` : undefined),
});

// Longer than the planned reconnect after a cursor reset.
const PAST_PLANNED_RECONNECT_MS = 6_000;

const PROGRAM_ID = PublicKey.default.toBase58();

// Longer than any handleReconnect delay a stale reconnect can schedule.
const PAST_RECONNECT_DELAY_MS = 2_500;

type SinkOptions = {
  // Builds the responses of the nth stream. `aborted` rejects when the
  // sink aborts that stream.
  streams: (stream: number, aborted: Promise<never>) => AsyncGenerator<any>;
  // The cursor checkStaleness returns on each connect until a reset
  // destroys it.
  cursor?: string;
  // The cursor row getLatestCursor returns.
  latestCursor?: () => Promise<any>;
  // Cursors of the blocks that carry an account change.
  accountsAt?: string[];
  // Runs inside the block body for each account change.
  onAccount?: () => Promise<void>;
  // Runs inside the block's transaction commit.
  onCommit?: () => Promise<void>;
  // Runs inside flushCursor.
  onFlushCursor?: () => Promise<void>;
  // Runs inside Cursor.destroy, after the destroy is counted.
  onCursorDestroy?: () => Promise<void>;
};

const startSink = (opts: SinkOptions) => {
  const sink = {
    writtenCursors: [] as string[],
    // The force flag of each cursor write.
    cursorForces: [] as boolean[],
    stopStalenessChecks: 0,
    streamCount: 0,
    commits: 0,
    rollbacks: 0,
    cursorDestroys: 0,
    // The start block of each stream's request.
    startBlocks: [] as (number | undefined)[],
    triggerStale: () => {},
  };

  process.exit = ((code: number) => {
    throw new Error(`process.exit(${code})`);
  }) as any;

  stubModule("../src/env", {
    ...require("../src/env"),
    SUBSTREAM_API_KEY: "test",
    SUBSTREAM_URL: "http://127.0.0.1:1",
    SUBSTREAM: "test.spkg",
  });
  stubModule("../src/utils/cursor", {
    CursorManager: (_: string, __: number, onStale: () => void) => {
      sink.triggerStale = onStale;
      return {
        checkStaleness: async () =>
          sink.cursorDestroys ? undefined : opts.cursor,
        startStalenessCheck: () => {},
        stopStalenessCheck: () => {
          sink.stopStalenessChecks++;
        },
        flushCursor: async () => opts.onFlushCursor?.(),
        getLatestCursor: async () => opts.latestCursor?.() ?? null,
        updateCursor: async ({
          cursor,
          force = false,
        }: {
          cursor: string;
          force?: boolean;
        }) => {
          sink.writtenCursors.push(cursor);
          sink.cursorForces.push(force);
        },
      };
    },
  });

  const streamBlocks = (
    _: any,
    __: any,
    options?: { signal?: AbortSignal },
  ) => {
    sink.streamCount++;
    const aborted = new Promise<never>((_, reject) =>
      options?.signal?.addEventListener("abort", () =>
        reject(new Error("[canceled] This operation was aborted")),
      ),
    );
    // A stream that returns before awaiting the abort must not leave an
    // unhandled rejection.
    aborted.catch(() => {});
    return opts.streams(sink.streamCount, aborted);
  };
  const owner = PublicKey.default.toBuffer();
  stubModule("@substreams/core", {
    applyParams: () => {},
    authIssue: async () => ({ token: "token" }),
    createAuthInterceptor: () => (next: any) => next,
    createRegistry: () => ({}),
    createRequest: ({ startBlockNum }: { startBlockNum?: number }) => {
      sink.startBlocks.push(startBlockNum);
      return {};
    },
    fetchSubstream: async () => ({ modules: { modules: [] } }),
    isEmptyMessage: () => false,
    streamBlocks,
    unpackMapOutput: (response: any) =>
      opts.accountsAt?.includes(response.message.value.cursor)
        ? {
            accounts: [
              { owner, address: owner, data: Buffer.alloc(0), deleted: false },
            ],
          }
        : undefined,
  });
  stubModule("../src/utils/solana", {
    provider: { connection: { getSlot: async () => 1 } },
  });
  stubModule("../src/plugins", {
    getPluginsByAccountTypeByProgram: async () => ({}),
  });
  stubModule("../src/utils/handleAccountWebhook", {
    handleAccountWebhook: async () => opts.onAccount?.(),
  });

  const db = require("../src/utils/database");
  db.Cursor.sync = async () => {};
  db.Cursor.destroy = async () => {
    sink.cursorDestroys++;
    await opts.onCursorDestroy?.();
    return 0;
  };
  db.default.transaction = async () => ({
    commit: async () => {
      sink.commits++;
      await opts.onCommit?.();
    },
    rollback: async () => {
      sink.rollbacks++;
    },
  });

  // Load the module fresh so it binds to this test's stubs.
  delete require.cache[require.resolve("../src/services/substream")];
  const { setupSubstream } = require("../src/services/substream");

  const metric = { inc: () => {}, set: () => {} };
  const server: any = {
    customMetrics: {
      staleCursorCounter: metric,
      blocksReceivedCounter: metric,
      lastBlockHeightGauge: metric,
    },
  };

  setupSubstream(server, [{ programId: PROGRAM_ID, accounts: [] }]);
  return sink;
};

describe("setupSubstream", () => {
  const originalExit = process.exit;
  const db = require("../src/utils/database");
  const originalCursorSync = db.Cursor.sync;
  const originalCursorDestroy = db.Cursor.destroy;
  const originalTransaction = db.default.transaction;

  beforeEach(() => {
    clock = sinon.useFakeTimers();
  });

  afterEach(() => {
    clock.restore();
  });

  after(() => {
    process.exit = originalExit;
    db.Cursor.sync = originalCursorSync;
    db.Cursor.destroy = originalCursorDestroy;
    db.default.transaction = originalTransaction;
    for (const [resolved, original] of stubbedModules) {
      if (original) require.cache[resolved] = original;
      else delete require.cache[resolved];
    }
    delete require.cache[require.resolve("../src/services/substream")];
  });

  it("stops the stalled stream when the staleness callback reconnects", async () => {
    // The first stream yields one block, stalls, then resumes with a block
    // the server sent before the reconnect. The second stream yields newer
    // blocks and then stays open.
    let releaseFirstStream: () => void = () => {};
    const firstStreamStall = new Promise<void>((r) => (releaseFirstStream = r));
    const sink = startSink({
      streams: async function* (stream, aborted) {
        if (stream === 1) {
          yield block("first-1", 1);
          await Promise.race([firstStreamStall, aborted]);
          yield block("first-2", 2);
          await aborted;
        } else {
          yield block("second-1", 3);
          yield block("second-2", 4);
          await aborted;
        }
      },
    });

    await waitFor(() => sink.writtenCursors.includes("first-1"));

    sink.triggerStale();
    await waitFor(() => sink.writtenCursors.includes("second-2"));

    releaseFirstStream();
    await sleep(100);

    expect(sink.writtenCursors).to.deep.equal([
      "first-1",
      "second-1",
      "second-2",
    ]);
  });

  it("rolls back the in-flight block of a stream the staleness callback aborts", async () => {
    let releaseBody: () => void = () => {};
    const bodyGate = new Promise<void>((r) => (releaseBody = r));
    const sink = startSink({
      accountsAt: ["first-1"],
      onAccount: () => bodyGate,
      streams: async function* (stream, aborted) {
        yield block(stream === 1 ? "first-1" : "second-1", stream);
        await aborted;
      },
    });

    await waitFor(() => sink.streamCount === 1);
    await sleep(50); // the first-1 body is now stalled in handleAccountWebhook

    sink.triggerStale();
    await waitFor(() => sink.writtenCursors.includes("second-1"));

    releaseBody();
    await sleep(100);

    expect({ commits: sink.commits, rollbacks: sink.rollbacks }).to.deep.equal({
      commits: 0,
      rollbacks: 1,
    });
    expect(sink.writtenCursors).to.deep.equal(["second-1"]);
  });

  it("does not write the cursor of a block whose commit resolves after the abort", async () => {
    let releaseCommit: () => void = () => {};
    const commitGate = new Promise<void>((r) => (releaseCommit = r));
    const sink = startSink({
      accountsAt: ["first-1"],
      onCommit: () => commitGate,
      streams: async function* (stream, aborted) {
        yield block(stream === 1 ? "first-1" : "second-1", stream);
        await aborted;
      },
    });

    // The first-1 commit is in flight when the staleness callback reconnects.
    await waitFor(() => sink.commits === 1);

    sink.triggerStale();
    await waitFor(() => sink.writtenCursors.includes("second-1"));

    releaseCommit();
    await sleep(100);

    expect(sink.writtenCursors).to.deep.equal(["second-1"]);
  });

  for (const onAbort of ["throws", "ends"] as const) {
    it(`does not reconnect again when the aborted stream ${onAbort}`, async () => {
      const sink = startSink({
        streams: async function* (stream, aborted) {
          yield block(`stream-${stream}`, stream);
          if (stream === 1 && onAbort === "ends") {
            await aborted.catch(() => {});
            return;
          }
          await aborted;
        },
      });

      await waitFor(() => sink.writtenCursors.includes("stream-1"));

      sink.triggerStale();
      await waitFor(() => sink.writtenCursors.includes("stream-2"));
      await sleep(PAST_RECONNECT_DELAY_MS);

      expect(sink.streamCount).to.equal(2);
      expect(sink.stopStalenessChecks).to.equal(0);
    });
  }

  it("reconnects when a stream ends without an abort", async () => {
    const sink = startSink({
      streams: async function* (stream, aborted) {
        yield block(`stream-${stream}`, stream);
        if (stream === 1) return;
        await aborted;
      },
    });

    await waitFor(() => sink.writtenCursors.includes("stream-2"));

    expect(sink.streamCount).to.equal(2);
    expect(sink.writtenCursors).to.deep.equal(["stream-1", "stream-2"]);
  });

  it("reconnects after a fatal error resets the cursor on a later stream", async () => {
    const sink = startSink({
      cursor: "saved-cursor",
      streams: async function* (stream, aborted) {
        if (stream === 1) {
          yield block("stream-1", 1);
          return;
        }
        if (stream === 2) yield fatalError;
        yield block(`stream-${stream}`, stream);
        await aborted;
      },
    });

    // stream 1 ends, handleReconnect opens stream 2, its fatal error resets
    // the cursor, and the planned reconnect opens stream 3.
    await waitFor(() => sink.writtenCursors.includes("stream-3"), 15_000);

    expect(sink.cursorDestroys).to.equal(1);
    expect(sink.writtenCursors).to.deep.equal(["stream-1", "stream-3"]);
  });

  it("does not schedule a planned reconnect from a stream aborted during the fatal reset", async () => {
    let releaseLatestCursor: () => void = () => {};
    const latestCursorGate = new Promise<void>(
      (r) => (releaseLatestCursor = r),
    );
    let latestCursorCalls = 0;
    const sink = startSink({
      cursor: "saved-cursor",
      latestCursor: async () => {
        latestCursorCalls++;
        await latestCursorGate;
        return cursorRow(RECOVERY_BLOCK);
      },
      streams: async function* (stream, aborted) {
        if (stream === 1) yield fatalError;
        yield block(`stream-${stream}`, stream);
        await aborted;
      },
    });

    // The fatal branch now waits on getLatestCursor.
    await waitFor(() => latestCursorCalls === 1);

    sink.triggerStale();
    await waitFor(() => sink.writtenCursors.includes("stream-2"));

    releaseLatestCursor();
    await sleep(PAST_PLANNED_RECONNECT_MS);

    expect(sink.streamCount).to.equal(2);
  });

  it("resets the cursor and reconnects from the recovery block on invalid_argument", async () => {
    const sink = startSink({
      cursor: "saved-cursor",
      latestCursor: async () => cursorRow(RECOVERY_BLOCK),
      streams: async function* (stream, aborted) {
        if (stream === 1) throw new Error("[invalid_argument] bad cursor");
        yield block(`stream-${stream}`, stream);
        await aborted;
      },
    });

    await waitFor(() => sink.writtenCursors.includes("stream-2"), 15_000);

    expect(sink.cursorDestroys).to.equal(1);
    expect(sink.startBlocks).to.deep.equal([undefined, RECOVERY_BLOCK]);
  });

  it("replaces a pending staleness reconnect with the planned reconnect of a fatal reset", async () => {
    let releaseFatal: () => void = () => {};
    const fatalGate = new Promise<void>((r) => (releaseFatal = r));
    const sink = startSink({
      cursor: "saved-cursor",
      latestCursor: async () => cursorRow(RECOVERY_BLOCK),
      streams: async function* (stream, aborted) {
        if (stream === 1) {
          yield block("stream-1", 1);
          await Promise.race([fatalGate, aborted]);
          yield fatalError;
        }
        yield block(`stream-${stream}`, stream);
        await aborted;
      },
    });

    await waitFor(() => sink.writtenCursors.includes("stream-1"));

    // Arms the staleness reconnect, then the fatal reset lands before it fires.
    sink.triggerStale();
    releaseFatal();
    await waitFor(() => sink.cursorDestroys === 1);
    await sleep(PAST_PLANNED_RECONNECT_MS);

    expect(sink.streamCount).to.equal(2);
    expect(sink.startBlocks).to.deep.equal([undefined, RECOVERY_BLOCK]);
  });

  it("does not schedule a planned reconnect from a stream aborted while the fatal reset destroys the cursor", async () => {
    let releaseDestroy: () => void = () => {};
    const destroyGate = new Promise<void>((r) => (releaseDestroy = r));
    const sink = startSink({
      cursor: "saved-cursor",
      latestCursor: async () => cursorRow(RECOVERY_BLOCK),
      onCursorDestroy: () => destroyGate,
      streams: async function* (stream, aborted) {
        if (stream === 1) yield fatalError;
        yield block(`stream-${stream}`, stream);
        await aborted;
      },
    });

    // The fatal branch now waits on Cursor.destroy.
    await waitFor(() => sink.cursorDestroys === 1);

    sink.triggerStale();
    await waitFor(() => sink.writtenCursors.includes("stream-2"));

    releaseDestroy();
    await sleep(PAST_PLANNED_RECONNECT_MS);

    expect(sink.streamCount).to.equal(2);
    expect(sink.stopStalenessChecks).to.equal(0);
  });

  it("leaves the cursor reset to the newer stream when invalid_argument is aborted during flushCursor", async () => {
    let releaseFlush: () => void = () => {};
    const flushGate = new Promise<void>((r) => (releaseFlush = r));
    let flushCalls = 0;
    let failSecondStream: () => void = () => {};
    const secondStreamFailure = new Promise<void>(
      (r) => (failSecondStream = r),
    );
    const sink = startSink({
      cursor: "saved-cursor",
      latestCursor: async () => cursorRow(RECOVERY_BLOCK),
      onFlushCursor: async () => {
        flushCalls++;
        if (flushCalls === 1) await flushGate;
      },
      streams: async function* (stream, aborted) {
        if (stream === 1) throw new Error("[invalid_argument] bad cursor");
        yield block(`stream-${stream}`, stream);
        if (stream === 2) {
          await Promise.race([secondStreamFailure, aborted]);
          throw new Error("[invalid_argument] bad cursor");
        }
        await aborted;
      },
    });

    // The catch path of stream 1 now waits on flushCursor.
    await waitFor(() => flushCalls === 1);

    sink.triggerStale();
    await waitFor(() => sink.writtenCursors.includes("stream-2"));

    releaseFlush();
    await sleep(PAST_PLANNED_RECONNECT_MS);
    expect(sink.streamCount).to.equal(2);

    // The aborted stream did not use up the one cursor reset.
    failSecondStream();
    await waitFor(() => sink.writtenCursors.includes("stream-3"), 15_000);

    expect(sink.cursorDestroys).to.equal(1);
    expect(sink.startBlocks).to.deep.equal([undefined, undefined, RECOVERY_BLOCK]);
  });

  it("does not reset the cursor from a stream aborted while invalid_argument reads the latest cursor", async () => {
    let releaseLatestCursor: () => void = () => {};
    const latestCursorGate = new Promise<void>(
      (r) => (releaseLatestCursor = r),
    );
    let latestCursorCalls = 0;
    const sink = startSink({
      cursor: "saved-cursor",
      latestCursor: async () => {
        latestCursorCalls++;
        await latestCursorGate;
        return cursorRow(RECOVERY_BLOCK);
      },
      streams: async function* (stream, aborted) {
        if (stream === 1) throw new Error("[invalid_argument] bad cursor");
        yield block(`stream-${stream}`, stream);
        await aborted;
      },
    });

    // The catch path of stream 1 now waits on getLatestCursor.
    await waitFor(() => latestCursorCalls === 1);

    sink.triggerStale();
    await waitFor(() => sink.writtenCursors.includes("stream-2"));

    releaseLatestCursor();
    await sleep(PAST_PLANNED_RECONNECT_MS);

    expect(sink.cursorDestroys).to.equal(0);
    expect(sink.streamCount).to.equal(2);
  });

  it("does not schedule a planned reconnect from a stream aborted while invalid_argument destroys the cursor", async () => {
    let releaseDestroy: () => void = () => {};
    const destroyGate = new Promise<void>((r) => (releaseDestroy = r));
    const sink = startSink({
      cursor: "saved-cursor",
      latestCursor: async () => cursorRow(RECOVERY_BLOCK),
      onCursorDestroy: () => destroyGate,
      streams: async function* (stream, aborted) {
        if (stream === 1) throw new Error("[invalid_argument] bad cursor");
        yield block(`stream-${stream}`, stream);
        await aborted;
      },
    });

    // The catch path of stream 1 now waits on Cursor.destroy.
    await waitFor(() => sink.cursorDestroys === 1);

    sink.triggerStale();
    await waitFor(() => sink.writtenCursors.includes("stream-2"));

    releaseDestroy();
    await sleep(PAST_PLANNED_RECONNECT_MS);

    expect(sink.streamCount).to.equal(2);
  });

  for (const reset of ["fatal error", "invalid_argument"] as const) {
    it(`keeps the recovery block after a ${reset} reset until a cursor is written`, async () => {
      const sink = startSink({
        cursor: "saved-cursor",
        latestCursor: async () => cursorRow(RECOVERY_BLOCK),
        streams: async function* (stream, aborted) {
          if (stream === 1) {
            if (reset === "fatal error") yield fatalError;
            else throw new Error("[invalid_argument] bad cursor");
          }
          // The planned connect fails before it writes a cursor.
          if (stream === 2) throw new Error("connection lost");
          yield block(`stream-${stream}`, stream);
          await aborted;
        },
      });

      await waitFor(() => sink.writtenCursors.includes("stream-3"), 15_000);

      expect(sink.startBlocks).to.deep.equal([
        undefined,
        RECOVERY_BLOCK,
        RECOVERY_BLOCK,
      ]);
    });
  }

  it("forces the first cursor write after a reset and then clears the recovery block", async () => {
    const sink = startSink({
      cursor: "saved-cursor",
      latestCursor: async () => cursorRow(RECOVERY_BLOCK),
      streams: async function* (stream, aborted) {
        if (stream === 1) throw new Error("[invalid_argument] bad cursor");
        // A block with no account changes, then the server closes the stream.
        yield block(`stream-${stream}`, stream);
        if (stream === 2) return;
        await aborted;
      },
    });

    await waitFor(() => sink.writtenCursors.includes("stream-3"), 15_000);

    expect(sink.cursorForces).to.deep.equal([true, false]);
    // The finalized slot the provider stub returns.
    expect(sink.startBlocks).to.deep.equal([undefined, RECOVERY_BLOCK, 1]);
  });

  it("reconnects on staleness after an earlier reconnect timer has fired", async () => {
    const sink = startSink({
      streams: async function* (stream, aborted) {
        yield block(`stream-${stream}`, stream);
        if (stream === 1) return;
        await aborted;
      },
    });

    // stream 1 ends and the reconnect timer opens stream 2.
    await waitFor(() => sink.writtenCursors.includes("stream-2"));

    sink.triggerStale();
    await waitFor(() => sink.writtenCursors.includes("stream-3"));

    expect(sink.streamCount).to.equal(3);
  });
});
