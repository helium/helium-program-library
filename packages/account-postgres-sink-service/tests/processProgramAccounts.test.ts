import { PublicKey } from "@solana/web3.js";
import axios from "axios";
import { expect } from "chai";
import crypto from "crypto";
import http from "http";
import net, { AddressInfo } from "net";
import { Op } from "sequelize";
import zlib from "zlib";
import { processProgramAccounts } from "../src/utils/processProgramAccounts";

const account = (pubkey: string) =>
  JSON.stringify({
    pubkey,
    account: { data: ["AAAA", "base64"], lamports: 1 },
  });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("processProgramAccounts", () => {
  let server: http.Server;
  let handler: http.RequestListener;
  let interceptor: number;

  before(async () => {
    server = http.createServer((req, res) => handler(req, res));
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", () => resolve()),
    );
    // SOLANA_URL is fixed when src/env.ts loads, so send the gPA call to the fake RPC here.
    const { port } = server.address() as AddressInfo;
    interceptor = axios.interceptors.request.use((config) => ({
      ...config,
      url: `http://127.0.0.1:${port}`,
    }));
  });

  after(() => {
    axios.interceptors.request.eject(interceptor);
    server.close();
  });

  it("lets a failed attempt's batches finish before the retry commits", async () => {
    let attempt = 0;
    handler = (_req, res) => {
      attempt++;
      res.writeHead(200, { "content-type": "application/json" });
      if (attempt === 1) {
        // Part of a body, then a reset, like a dropped RPC node.
        res.write(
          `{"jsonrpc":"2.0","id":1,"result":[${account("a1-0")},${account("a1-1")},`,
        );
        setTimeout(() => res.socket?.destroy(), 50);
      } else {
        res.end(
          `{"jsonrpc":"2.0","id":1,"result":[${account("a2-0")},${account("a2-1")}]}`,
        );
      }
    };

    const events: string[] = [];
    let oldCommits = 0;
    let oldAttemptCommitted!: () => void;
    const oldAttemptDone = new Promise<void>((r) => (oldAttemptCommitted = r));
    const sequelize: any = {
      models: {},
      transaction: async () => {
        const t: any = {
          commit: async () => {
            events.push(`commit ${t.pubkey}`);
            if (t.pubkey.startsWith("a1-") && ++oldCommits === 2) {
              oldAttemptCommitted();
            }
          },
          rollback: async () => events.push(`rollback ${t.pubkey}`),
        };
        return t;
      },
    };
    const connection: any = { getSlot: async () => 1 };

    const processed = await processProgramAccounts(
      sequelize,
      connection,
      PublicKey.default,
      "TestAccountV0",
      [],
      1,
      async (chunk, t: any) => {
        const { pubkey } = chunk[0] as any;
        t.pubkey = pubkey;
        if (pubkey.startsWith("a1-")) {
          // Outlasts the 1-2 s first retry delay plus attempt 2's stream.
          await sleep(3000);
        }
        events.push(`write ${pubkey}`);
        return [];
      },
    );

    // Without the wait, the old attempt's commits land a few seconds after this returns.
    await oldAttemptDone;

    expect(processed).to.equal(2);
    expect(attempt).to.equal(2);
    const firstRetryCommit = events.findIndex((e) =>
      e.startsWith("commit a2-"),
    );
    const lastOldAttemptEvent = Math.max(
      ...events.map((e, i) => (e.includes(" a1-") ? i : -1)),
    );
    expect(firstRetryCommit).to.be.greaterThan(-1);
    expect(lastOldAttemptEvent, events.join(", ")).to.be.lessThan(
      firstRetryCommit,
    );
  });

  it("retries when a batch fails and settles before the stream ends", async () => {
    let attempt = 0;
    handler = (_req, res) => {
      attempt++;
      res.writeHead(200, { "content-type": "application/json" });
      res.write(`{"jsonrpc":"2.0","id":1,"result":[${account("a0")},`);
      // The rest arrives after the first batch has already failed.
      setTimeout(() => res.end(`${account("a1")},${account("a2")}]}`), 100);
    };

    const sequelize: any = {
      models: {},
      transaction: async () => ({
        commit: async () => {},
        rollback: async () => {},
      }),
    };
    const connection: any = { getSlot: async () => 1 };
    let thrown = false;

    const processed = await processProgramAccounts(
      sequelize,
      connection,
      PublicKey.default,
      "TestAccountV0",
      [],
      1,
      async (chunk) => {
        if (!thrown) {
          thrown = true;
          throw new Error("db down");
        }
        return [];
      },
    );

    expect(attempt).to.equal(2);
    expect(processed).to.equal(3);
  });

  it("restamps changed rows with a slot read just before the batch commits, in its transaction", async () => {
    handler = (_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        `{"jsonrpc":"2.0","id":1,"result":[${account("a")},${account("b")},${account("c")}]}`,
      );
    };

    const events: string[] = [];
    let slot = 100;
    const connection: any = {
      getSlot: async () => {
        const s = slot++;
        events.push(`slot ${s}`);
        return s;
      },
    };
    const updates: { values: any; where: any; transaction: any }[] = [];
    const model = {
      update: async (values: any, { where, transaction }: any) => {
        events.push(`update ${where.address}`);
        updates.push({ values, where, transaction });
      },
    };
    const sequelize: any = {
      models: { TestAccountV0: model },
      transaction: async () => {
        const t: any = {
          commit: async () => events.push(`commit ${t.pubkeys}`),
          rollback: async () => events.push(`rollback ${t.pubkeys}`),
        };
        return t;
      },
    };
    const stamped: Record<string, number> = {};
    const transactions: Record<string, any> = {};

    // Batch size 2 covers a full batch (a, b) and the final partial batch (c).
    await processProgramAccounts(
      sequelize,
      connection,
      PublicKey.default,
      "TestAccountV0",
      [],
      2,
      async (chunk, t: any, lastBlock) => {
        t.pubkeys = chunk.map((c: any) => c.pubkey).join(",");
        chunk.forEach((c: any) => {
          stamped[c.pubkey] = lastBlock;
          transactions[c.pubkey] = t;
        });
        events.push(`write ${t.pubkeys}`);
        // "b" is unchanged, so only "a" and "c" were written with lastBlock.
        return chunk.map((c: any) => c.pubkey).filter((p) => p !== "b");
      },
    );

    const byAddress = (address: string) =>
      updates.find(({ where }) => where.address.includes(address))!;
    expect(updates.map(({ where }) => where.address)).to.have.deep.members([
      ["a"],
      ["c"],
    ]);
    for (const [address, batch] of [
      ["a", "a,b"],
      ["c", "c"],
    ]) {
      const { values, where, transaction } = byAddress(address);
      const restamp = values.lastBlock;
      // greaterThan, not an exact slot: concurrent batches interleave their slot reads.
      expect(restamp).to.be.greaterThan(stamped[address]);
      expect(where.lastBlock[Op.lt]).to.equal(restamp);
      expect(transaction).to.equal(transactions[address]);
      const log = events.join(", ");
      expect(events.indexOf(`slot ${restamp}`), log).to.be.greaterThan(
        events.indexOf(`write ${batch}`),
      );
      expect(events.indexOf(`update ${address}`), log).to.be.lessThan(
        events.indexOf(`commit ${batch}`),
      );
    }
    expect(events.filter((e) => e.startsWith("rollback"))).to.deep.equal([]);
  });

  it("rolls the batch back and retries when the restamp fails", async () => {
    handler = (_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(`{"jsonrpc":"2.0","id":1,"result":[${account("a")}]}`);
    };

    const events: string[] = [];
    let updates = 0;
    const sequelize: any = {
      models: {
        TestAccountV0: {
          update: async () => {
            if (++updates === 1) throw new Error("connection lost");
          },
        },
      },
      transaction: async () => ({
        commit: async () => events.push("commit"),
        rollback: async () => events.push("rollback"),
      }),
    };

    const processed = await processProgramAccounts(
      sequelize,
      { getSlot: async () => 1 } as any,
      PublicKey.default,
      "TestAccountV0",
      [],
      1,
      async () => ["a"],
    );

    expect(events).to.deep.equal(["rollback", "commit"]);
    expect(updates).to.equal(2);
    // The rolled-back attempt does not count, so the batch counts once.
    expect(processed).to.equal(1);
  });

  it("rolls the batch back instead of writing lastBlock 0 when the slot read fails", async () => {
    handler = (_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(`{"jsonrpc":"2.0","id":1,"result":[${account("a")}]}`);
    };

    const events: string[] = [];
    let slotReads = 0;
    const connection: any = {
      getSlot: async () => {
        // The first read and its 3 retries fail.
        if (++slotReads <= 4) throw new Error("rpc down");
        return 100;
      },
    };
    const sequelize: any = {
      models: { TestAccountV0: { update: async () => {} } },
      transaction: async () => ({
        commit: async () => events.push("commit"),
        rollback: async () => events.push("rollback"),
      }),
    };
    const stamps: number[] = [];

    await processProgramAccounts(
      sequelize,
      connection,
      PublicKey.default,
      "TestAccountV0",
      [],
      1,
      async (_chunk, _t, lastBlock) => {
        stamps.push(lastBlock);
        return ["a"];
      },
    );

    expect(events).to.deep.equal(["rollback", "commit"]);
    expect(stamps).to.deep.equal([100]);
  });

  it("rejects with the batch error and leaves no unhandled rejection when a batch keeps failing", async function () {
    // Six attempts. The retry delays are cut to 0 below.
    this.timeout(10_000);
    handler = (_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        `{"jsonrpc":"2.0","id":1,"result":[${account("a")},${account("b")},${account("c")}]}`,
      );
    };

    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    const sequelize: any = {
      models: {},
      transaction: async () => ({
        commit: async () => {},
        rollback: async () => {},
      }),
    };
    const batchError = new Error("batch b failed");
    // Retry delays are 1 to 16 s, doubled at most by jitter. The axios
    // request timeout (60 s) keeps its value.
    const isRetryDelay = (ms?: number) =>
      ms !== undefined && ms >= 1000 && ms <= 32_000;
    const realSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = ((
      fn: (...a: any[]) => void,
      ms?: number,
      ...a: any[]
    ) => realSetTimeout(fn, isRetryDelay(ms) ? 0 : ms, ...a)) as any;

    try {
      let rejected: unknown;
      try {
        await processProgramAccounts(
          sequelize,
          { getSlot: async () => 1 } as any,
          PublicKey.default,
          "TestAccountV0",
          [],
          1,
          async (chunk) => {
            if ((chunk[0] as any).pubkey === "b") throw batchError;
            return [];
          },
        );
      } catch (err) {
        rejected = err;
      }
      // Give a stray rejection one macrotask to surface.
      await sleep(10);

      expect(rejected).to.equal(batchError);
      expect(unhandled).to.deep.equal([]);
    } finally {
      globalThis.setTimeout = realSetTimeout;
      process.off("unhandledRejection", onUnhandled);
    }
  });

  it("keeps the gPA stream open while batches hold it past the request timeout", async () => {
    // About 3 MB, more than the stream buffers hold, so the socket stops reading.
    const data = "A".repeat(10_000);
    const accounts = Array.from({ length: 300 }, (_, i) =>
      JSON.stringify({
        pubkey: `a${i}`,
        account: { data: [data, "base64"], lamports: 1 },
      }),
    );
    let attempt = 0;
    handler = (_req, res) => {
      attempt++;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(`{"jsonrpc":"2.0","id":1,"result":[${accounts.join(",")}]}`);
    };
    const lowTimeout = axios.interceptors.request.use((config) => ({
      ...config,
      timeout: 200,
    }));
    const sequelize: any = {
      models: {},
      transaction: async () => ({
        commit: async () => {},
        rollback: async () => {},
      }),
    };
    let held = 0;

    try {
      const processed = await processProgramAccounts(
        sequelize,
        { getSlot: async () => 1 } as any,
        PublicKey.default,
        "TestAccountV0",
        [],
        1,
        async () => {
          // The first five batches fill the concurrency limit and hold the
          // stream paused for longer than the 200 ms timeout.
          if (held++ < 5) await sleep(600);
          return [];
        },
      );

      expect(attempt).to.equal(1);
      expect(processed).to.equal(300);
    } finally {
      axios.interceptors.request.eject(lowTimeout);
    }
  });

  it("restores the gPA request timeout after the batches release", async function () {
    // Without the restore, attempt 1 stalls forever and this times out.
    this.timeout(5_000);
    const accounts = Array.from({ length: 10 }, (_, i) => account(`a${i}`));
    let attempt = 0;
    handler = (_req, res) => {
      attempt++;
      res.writeHead(200, { "content-type": "application/json" });
      if (attempt === 1) {
        // Enough accounts to fill the batch slots, then no more bytes and no end.
        res.write(
          `{"jsonrpc":"2.0","id":1,"result":[${accounts.slice(0, 8).join(",")},`,
        );
      } else {
        res.end(`{"jsonrpc":"2.0","id":1,"result":[${accounts.join(",")}]}`);
      }
    };
    const lowTimeout = axios.interceptors.request.use((config) => ({
      ...config,
      timeout: 200,
    }));
    // The restore sets the 60 s GPA_TIMEOUT_MS; cut it to 200 ms here.
    const realSetSocketTimeout = net.Socket.prototype.setTimeout;
    net.Socket.prototype.setTimeout = function (
      this: net.Socket,
      ms: number,
      ...rest: any[]
    ) {
      return realSetSocketTimeout.call(this, ms === 60_000 ? 200 : ms, ...rest);
    } as any;
    const sequelize: any = {
      models: {},
      transaction: async () => ({
        commit: async () => {},
        rollback: async () => {},
      }),
    };
    let held = 0;

    try {
      const processed = await processProgramAccounts(
        sequelize,
        { getSlot: async () => 1 } as any,
        PublicKey.default,
        "TestAccountV0",
        [],
        1,
        async () => {
          // The first five batches fill the concurrency limit, then release.
          if (held++ < 5) await sleep(300);
          return [];
        },
      );

      expect(attempt).to.equal(2);
      expect(processed).to.equal(10);
    } finally {
      net.Socket.prototype.setTimeout = realSetSocketTimeout;
      axios.interceptors.request.eject(lowTimeout);
    }
  });

  it("keeps a gzip gPA stream open while batches hold it past the request timeout", async () => {
    // Random data so the gzip body stays about 3 MB, more than the stream buffers hold.
    const accounts = Array.from({ length: 300 }, (_, i) =>
      JSON.stringify({
        pubkey: `a${i}`,
        account: {
          data: [crypto.randomBytes(7_500).toString("base64"), "base64"],
          lamports: 1,
        },
      }),
    );
    const body = zlib.gzipSync(
      `{"jsonrpc":"2.0","id":1,"result":[${accounts.join(",")}]}`,
    );
    let attempt = 0;
    handler = (_req, res) => {
      attempt++;
      res.writeHead(200, {
        "content-type": "application/json",
        "content-encoding": "gzip",
      });
      res.end(body);
    };
    const lowTimeout = axios.interceptors.request.use((config) => ({
      ...config,
      timeout: 200,
    }));
    const sequelize: any = {
      models: {},
      transaction: async () => ({
        commit: async () => {},
        rollback: async () => {},
      }),
    };
    let held = 0;

    try {
      const processed = await processProgramAccounts(
        sequelize,
        { getSlot: async () => 1 } as any,
        PublicKey.default,
        "TestAccountV0",
        [],
        1,
        async () => {
          // axios hands back a zlib stream with no socket, so the hold
          // reaches the request's socket only through result.request.
          if (held++ < 5) await sleep(600);
          return [];
        },
      );

      expect(attempt).to.equal(1);
      expect(processed).to.equal(300);
    } finally {
      axios.interceptors.request.eject(lowTimeout);
    }
  });
});
