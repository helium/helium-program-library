import { expect } from "chai";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

describe("setupSubstream", () => {
  const originalExit = process.exit;
  let originalCursorSync: any;

  after(() => {
    process.exit = originalExit;
    const { Cursor } = require("../src/utils/database");
    Cursor.sync = originalCursorSync;
    for (const [resolved, original] of stubbedModules) {
      if (original) require.cache[resolved] = original;
      else delete require.cache[resolved];
    }
    delete require.cache[require.resolve("../src/services/substream")];
  });

  it("stops the stalled stream when the staleness callback reconnects", async () => {
    process.exit = ((code: number) => {
      throw new Error(`process.exit(${code})`);
    }) as any;

    stubModule("../src/env", {
      ...require("../src/env"),
      SUBSTREAM_API_KEY: "test",
      SUBSTREAM_URL: "http://127.0.0.1:1",
      SUBSTREAM: "test.spkg",
    });

    let triggerStale: () => void = () => {};
    const writtenCursors: string[] = [];
    stubModule("../src/utils/cursor", {
      CursorManager: (_: string, __: number, onStale: () => void) => {
        triggerStale = onStale;
        return {
          checkStaleness: async () => undefined,
          startStalenessCheck: () => {},
          stopStalenessCheck: () => {},
          flushCursor: async () => {},
          getLatestCursor: async () => null,
          updateCursor: async ({ cursor }: { cursor: string }) => {
            writtenCursors.push(cursor);
          },
        };
      },
    });

    // The first stream yields one block, stalls, then resumes with a block
    // the server sent before the reconnect. The second stream yields newer
    // blocks and then stays open.
    let releaseFirstStream: () => void = () => {};
    const firstStreamStall = new Promise<void>((r) => (releaseFirstStream = r));
    let streamCount = 0;
    const streamBlocks = (
      _: any,
      __: any,
      options?: { signal?: AbortSignal },
    ) => {
      streamCount++;
      const stream = streamCount;
      const aborted = new Promise<never>((_, reject) =>
        options?.signal?.addEventListener("abort", () =>
          reject(new Error("[canceled] This operation was aborted")),
        ),
      );
      return (async function* () {
        if (stream === 1) {
          yield block("first-1", 1);
          await Promise.race([firstStreamStall, aborted]);
          yield block("first-2", 2);
          await Promise.race([new Promise(() => {}), aborted]);
        } else {
          yield block("second-1", 3);
          yield block("second-2", 4);
          await Promise.race([new Promise(() => {}), aborted]);
        }
      })();
    };
    stubModule("@substreams/core", {
      applyParams: () => {},
      authIssue: async () => ({ token: "token" }),
      createAuthInterceptor: () => (next: any) => next,
      createRegistry: () => ({}),
      createRequest: () => ({}),
      fetchSubstream: async () => ({ modules: { modules: [] } }),
      isEmptyMessage: () => true,
      streamBlocks,
      unpackMapOutput: () => undefined,
    });
    stubModule("../src/utils/solana", {
      provider: { connection: { getSlot: async () => 1 } },
    });

    const { Cursor } = require("../src/utils/database");
    originalCursorSync = Cursor.sync;
    Cursor.sync = async () => {};
    const { setupSubstream } = require("../src/services/substream");

    const metric = { inc: () => {}, set: () => {} };
    const server: any = {
      customMetrics: {
        staleCursorCounter: metric,
        blocksReceivedCounter: metric,
        lastBlockHeightGauge: metric,
      },
    };

    setupSubstream(server, []);
    await waitFor(() => writtenCursors.includes("first-1"));

    triggerStale();
    await waitFor(() => writtenCursors.includes("second-2"));

    releaseFirstStream();
    await sleep(100);

    expect(writtenCursors).to.deep.equal(["first-1", "second-1", "second-2"]);
  });
});
