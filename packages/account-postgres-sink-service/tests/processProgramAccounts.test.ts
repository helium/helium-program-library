import { PublicKey } from "@solana/web3.js";
import axios from "axios";
import { expect } from "chai";
import http from "http";
import { AddressInfo } from "net";
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
});
