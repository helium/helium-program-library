import axios from "axios";
import { expect } from "chai";
import http from "http";
import { AddressInfo } from "net";
import { streamAccounts } from "../src/utils/streamAccounts";

const account = (i: number) =>
  JSON.stringify({
    pubkey: `acc${i}`,
    account: { data: ["AAAA", "base64"], lamports: 1 },
  });

const startServer = (handler: http.RequestListener) =>
  new Promise<http.Server>((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });

const streamFrom = async (
  server: http.Server,
  onAccount?: (value: any) => Promise<void>
) => {
  const { port } = server.address() as AddressInfo;
  const res = await axios.post(
    `http://127.0.0.1:${port}`,
    {},
    { responseType: "stream" }
  );
  const received: string[] = [];
  const outcome = await Promise.race([
    streamAccounts(
      res.data,
      onAccount ??
        (async (value) => {
          received.push(value.pubkey);
        })
    ).then(
      () => "resolved",
      (err: Error) => err
    ),
    new Promise((resolve) => setTimeout(() => resolve("hung"), 2000)),
  ]);
  return { received, outcome };
};

describe("streamAccounts", () => {
  let server: http.Server;

  afterEach(() => {
    server.close();
  });

  it("resolves after reading every account of a full body", async () => {
    server = await startServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        `{"jsonrpc":"2.0","id":1,"result":[${account(0)},${account(1)}]}`
      );
    });

    const { received, outcome } = await streamFrom(server);

    expect(received).to.deep.equal(["acc0", "acc1"]);
    expect(outcome).to.equal("resolved");
  });

  it("rejects when the gPA socket resets mid-body", async () => {
    // Sends part of a gPA body, then resets the socket, like a dropped RPC node.
    server = await startServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.write(
        `{"jsonrpc":"2.0","id":1,"result":[${account(0)},${account(1)},`
      );
      setTimeout(() => res.socket?.destroy(), 50);
    });

    const { received, outcome } = await streamFrom(server);

    expect(received).to.deep.equal(["acc0", "acc1"]);
    expect(outcome).to.be.instanceOf(Error);
  });

  it("rejects on a socket reset only after the parked onAccount finishes", async () => {
    server = await startServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.write(`{"jsonrpc":"2.0","id":1,"result":[${account(0)},`);
      setTimeout(() => res.socket?.destroy(), 50);
    });

    let done = false;
    let doneAtReject: boolean | undefined;
    const { outcome } = await streamFrom(server, async () => {
      await new Promise((r) => setTimeout(r, 200));
      done = true;
    }).then((result) => {
      doneAtReject = done;
      return result;
    });

    expect(outcome).to.be.instanceOf(Error);
    expect(doneAtReject).to.equal(true);
  });

  it("rejects and closes the gPA socket when onAccount throws", async () => {
    let socketClosed!: Promise<string>;
    server = await startServer((req, res) => {
      socketClosed = new Promise((resolve) =>
        req.socket.on("close", () => resolve("closed"))
      );
      res.writeHead(200, { "content-type": "application/json" });
      res.write(
        `{"jsonrpc":"2.0","id":1,"result":[${account(0)},${account(1)},`
      );
    });

    const { outcome } = await streamFrom(server, async () => {
      throw new Error("db down");
    });

    expect(outcome).to.be.instanceOf(Error);
    expect((outcome as Error).message).to.equal("db down");

    const closed = await Promise.race([
      socketClosed,
      new Promise((resolve) => setTimeout(() => resolve("open"), 1000)),
    ]);
    expect(closed).to.equal("closed");
  });

  it("rejects when the last onAccount throws after the body ends", async () => {
    server = await startServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        `{"jsonrpc":"2.0","id":1,"result":[${account(0)},${account(1)},${account(2)}]}`
      );
    });

    const received: string[] = [];
    const { outcome } = await streamFrom(server, async (value) => {
      received.push(value.pubkey);
      if (value.pubkey === "acc2") {
        await new Promise((r) => setTimeout(r, 100));
        throw new Error("db down");
      }
    });

    expect(outcome).to.be.instanceOf(Error);
    expect((outcome as Error).message).to.equal("db down");
  });

  it("rejects without an unhandled error when a one-account body's onAccount throws late", async () => {
    server = await startServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(`{"jsonrpc":"2.0","id":1,"result":[${account(0)}]}`);
    });

    const { outcome } = await streamFrom(server, async () => {
      await new Promise((r) => setTimeout(r, 100));
      throw new Error("db down");
    });

    expect(outcome).to.be.instanceOf(Error);
    expect((outcome as Error).message).to.equal("db down");
    await new Promise((r) => setTimeout(r, 50));
  });
});
