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

const streamFrom = async (server: http.Server) => {
  const { port } = server.address() as AddressInfo;
  const res = await axios.post(
    `http://127.0.0.1:${port}`,
    {},
    { responseType: "stream" }
  );
  const received: string[] = [];
  const outcome = await Promise.race([
    streamAccounts(res.data, async (value) => {
      received.push(value.pubkey);
    }).then(
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

    const { port } = server.address() as AddressInfo;
    const res = await axios.post(
      `http://127.0.0.1:${port}`,
      {},
      { responseType: "stream" }
    );
    const outcome = await Promise.race([
      streamAccounts(res.data, async () => {
        throw new Error("db down");
      }).then(
        () => "resolved",
        (err: Error) => err
      ),
      new Promise((resolve) => setTimeout(() => resolve("hung"), 2000)),
    ]);

    expect(outcome).to.be.instanceOf(Error);
    expect((outcome as Error).message).to.equal("db down");

    const closed = await Promise.race([
      socketClosed,
      new Promise((resolve) => setTimeout(() => resolve("open"), 1000)),
    ]);
    expect(closed).to.equal("closed");
  });
});
