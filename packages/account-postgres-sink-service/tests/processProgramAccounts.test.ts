import { PublicKey } from "@solana/web3.js";
import axios from "axios";
import { expect } from "chai";
import http from "http";
import { AddressInfo } from "net";
import { Op } from "sequelize";
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

    await processProgramAccounts(
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
});
