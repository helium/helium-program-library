import { PublicKey } from "@solana/web3.js";
import { expect } from "chai";
import http from "http";
import { AddressInfo } from "net";
import { searchAssets } from "../src/mplAssetAPI";
import { fetchRetryingTransientErrors } from "../src/transientRetry";

type Reply = "drop" | number;

/**
 * A local JSON-RPC server that answers each request with the next reply in
 * `replies`: "drop" resets the socket, a number sends that HTTP status. Once
 * the list runs out it answers 200 with an empty result.
 */
const startServer = async (replies: Reply[]) => {
  let requests = 0;
  const server = http.createServer((req, res) => {
    const reply = replies[requests++] ?? 200;
    req.resume();
    req.on("end", () => {
      if (reply === "drop") {
        req.socket.destroy();
        return;
      }
      res.writeHead(reply, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify(
          reply === 200
            ? { jsonrpc: "2.0", id: 1, result: { items: [], total: 0 } }
            : { error: "unavailable" }
        )
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    requests: () => requests,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
};

const rpcBody = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth" });

describe("transient retry", () => {
  let server: Awaited<ReturnType<typeof startServer>>;
  afterEach(() => server.close());

  it("fetch recovers after two dropped connections", async () => {
    server = await startServer(["drop", "drop"]);
    const res = await fetchRetryingTransientErrors(server.url, {
      method: "POST",
      body: rpcBody,
    });
    expect(res.status).to.equal(200);
    expect(server.requests()).to.equal(3);
  });

  it("fetch gives up after two retries", async () => {
    server = await startServer(["drop", "drop", "drop"]);
    let error: unknown;
    try {
      await fetchRetryingTransientErrors(server.url, {
        method: "POST",
        body: rpcBody,
      });
    } catch (e) {
      error = e;
    }
    expect(error).to.be.instanceOf(TypeError);
    expect(server.requests()).to.equal(3);
  });

  it("fetch hands back an HTTP error status without retrying", async () => {
    server = await startServer([503]);
    const res = await fetchRetryingTransientErrors(server.url, {
      method: "POST",
      body: rpcBody,
    });
    expect(res.status).to.equal(503);
    expect(server.requests()).to.equal(1);
  });

  it("DAS search recovers from a dropped connection and a 503", async () => {
    server = await startServer(["drop", 503]);
    const items = await searchAssets(server.url, {
      ownerAddress: PublicKey.default.toBase58(),
    });
    expect(items).to.deep.equal([]);
    expect(server.requests()).to.equal(3);
  });

  it("DAS search does not retry a client error", async () => {
    server = await startServer([400]);
    let error: unknown;
    try {
      await searchAssets(server.url, {
        ownerAddress: PublicKey.default.toBase58(),
      });
    } catch (e) {
      error = e;
    }
    expect(error).to.be.instanceOf(Error);
    expect(server.requests()).to.equal(1);
  });
});
