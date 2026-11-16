import { PublicKey } from "@solana/web3.js";
import { expect } from "chai";
import http from "http";
import { AddressInfo } from "net";
import {
  getAsset,
  getAssetBatch,
  getAssetProof,
  getAssetProofBatch,
  getAssets,
  getAssetsByCreator,
  getAssetsByGroup,
  getAssetsByOwnerWithPageInfo,
  searchAssets,
  searchAssetsWithPageInfo,
} from "../src/mplAssetAPI";
import { fetchRetryingTransientErrors } from "../src/transientRetry";

type Reply = "drop" | number;

/**
 * A local JSON-RPC server that answers each request with the next reply in
 * `replies`: "drop" resets the socket, a number sends that HTTP status. Once
 * the list runs out it answers 200 with `okBody`. It keeps the headers and
 * body of the last request.
 */
const startServer = async (
  replies: Reply[],
  okBody: unknown = {
    jsonrpc: "2.0",
    id: 1,
    result: { items: [], total: 0 },
  }
) => {
  let requests = 0;
  let lastRequest: { headers: http.IncomingHttpHeaders; body: string } = {
    headers: {},
    body: "",
  };
  const server = http.createServer((req, res) => {
    const reply = replies[requests++] ?? 200;
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      lastRequest = { headers: req.headers, body };
      if (reply === "drop") {
        req.socket.destroy();
        return;
      }
      res.writeHead(reply, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify(reply === 200 ? okBody : { error: "unavailable" })
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    requests: () => requests,
    lastRequest: () => lastRequest,
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

  it("fetch retries a connection reset while the body streams", async () => {
    server = await startServer([]);
    const realFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => {
      if (calls++ === 0) {
        return {
          status: 200,
          statusText: "OK",
          headers: new Headers(),
          arrayBuffer: () =>
            Promise.reject(
              Object.assign(new Error("socket hang up"), {
                code: "ECONNRESET",
              })
            ),
        } as unknown as Response;
      }
      return new Response("second body", { status: 200 });
    }) as typeof fetch;
    try {
      const res = await fetchRetryingTransientErrors(server.url, {
        method: "POST",
        body: rpcBody,
      });
      expect(await res.text()).to.equal("second body");
      expect(calls).to.equal(2);
    } finally {
      globalThis.fetch = realFetch;
    }
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

  it("fetch hands back a 204 response", async () => {
    server = await startServer([204]);
    const res = await fetchRetryingTransientErrors(server.url, {
      method: "POST",
      body: rpcBody,
    });
    expect(res.status).to.equal(204);
  });

  it("DAS search recovers from a dropped connection and a 503", async () => {
    server = await startServer(["drop", 503]);
    const items = await searchAssets(server.url, {
      ownerAddress: PublicKey.default.toBase58(),
    });
    expect(items).to.deep.equal([]);
    expect(server.requests()).to.equal(3);
  });

  const key = PublicKey.default.toBase58();
  const asset = {
    id: key,
    creators: [],
    compression: { leaf_id: 0 },
    ownership: { owner: key, delegate: key },
  };
  const proof = {
    root: key,
    proof: [],
    node_index: 0,
    leaf: key,
    tree_id: key,
  };
  const page = { items: [asset], total: 1 };
  const envelope = (result: unknown) => ({ jsonrpc: "2.0", id: 1, result });
  const dasCalls: [string, unknown, (url: string) => Promise<unknown>][] = [
    ["getAsset", envelope(asset), (url) => getAsset(url, PublicKey.default)],
    [
      "getAssetBatch",
      envelope([asset]),
      (url) => getAssetBatch(url, [PublicKey.default]),
    ],
    [
      "getAssets",
      [envelope(asset)],
      (url) => getAssets(url, [PublicKey.default]),
    ],
    [
      "getAssetProof",
      envelope(proof),
      (url) => getAssetProof(url, PublicKey.default),
    ],
    [
      "getAssetProofBatch",
      envelope({ [key]: proof }),
      (url) => getAssetProofBatch(url, [PublicKey.default]),
    ],
    [
      "getAssetsByOwnerWithPageInfo",
      envelope(page),
      (url) => getAssetsByOwnerWithPageInfo(url, key),
    ],
    [
      "getAssetsByGroup",
      envelope(page),
      (url) => getAssetsByGroup(url, { groupValue: key }),
    ],
    [
      "getAssetsByCreator",
      envelope(page),
      (url) => getAssetsByCreator(url, { creatorAddress: key }),
    ],
    [
      "searchAssetsWithPageInfo",
      envelope(page),
      (url) => searchAssetsWithPageInfo(url, { ownerAddress: key }),
    ],
  ];
  dasCalls.forEach(([name, okBody, call]) =>
    it(`${name} recovers from a dropped connection and sends no-cache headers`, async () => {
      server = await startServer(["drop"], okBody);
      expect(await call(server.url)).to.not.equal(undefined);
      expect(server.requests()).to.equal(2);
      const { headers, body } = server.lastRequest();
      expect(headers["cache-control"]).to.equal("no-cache");
      expect(headers.pragma).to.equal("no-cache");
      expect(body).to.not.include("Cache-Control");
    })
  );

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
