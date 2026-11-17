import { createServer, Server } from "http";
import { AddressInfo } from "net";
import { call } from "@orpc/server";
import { expect } from "chai";
import { after, afterEach, before, describe, it } from "mocha";

/**
 * Type-only, so naming the handlers here does not import them: they read a
 * validated env at load, which only exists once `before` has set one up.
 */
type QuoteModule =
  typeof import("../../src/server/api/routers/swap/procedures/getQuote");
type InstructionsModule =
  typeof import("../../src/server/api/routers/swap/procedures/getInstructions");

const WALLET = "GZairnxHiWXk73YhsEtkGU2XnfGw3QcUsjJr8VW2R172";
const HNT_MINT = "hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SYSTEM_PROGRAM = "11111111111111111111111111111111";

/** One request the handlers sent to the stubbed Jupiter API. */
interface JupiterCall {
  url: URL;
  body?: Record<string, unknown>;
}

let jupiterCalls: JupiterCall[] = [];
const realFetch = globalThis.fetch;
let rpc: Server;

const withContext = (value: unknown) => ({
  context: { apiVersion: "2.0.0", slot: 1 },
  value,
});

/** The RPC answers building and pricing the swap transaction needs. */
function rpcResult(method: string): unknown {
  switch (method) {
    case "getLatestBlockhash":
      return withContext({
        blockhash: "11111111111111111111111111111111",
        lastValidBlockHeight: 1000,
      });
    case "getAccountInfo":
      return withContext(null);
    case "getBalance":
      return withContext(5_000_000_000);
    case "getFeeForMessage":
      return withContext(10000);
    case "getMinimumBalanceForRentExemption":
      return 810624;
    case "getRecentPrioritizationFees":
      return [];
    default:
      return undefined;
  }
}

function startStubRpc(): Promise<string> {
  return new Promise((resolve) => {
    rpc = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        const answer = ({ id, method }: { id: unknown; method: string }) => {
          const result = rpcResult(method);
          return result === undefined
            ? {
                jsonrpc: "2.0",
                id,
                error: { code: -32601, message: `unstubbed: ${method}` },
              }
            : { jsonrpc: "2.0", id, result };
        };
        const parsed = JSON.parse(body);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify(
            Array.isArray(parsed) ? parsed.map(answer) : answer(parsed)
          )
        );
      });
    });
    rpc.listen(0, "127.0.0.1", () => {
      const { port } = rpc.address() as AddressInfo;
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

/** Answers Jupiter's swap API and records each call; everything else passes through. */
const stubFetch: typeof fetch = async (input, init) => {
  const url = new URL(
    typeof input === "string" || input instanceof URL
      ? input.toString()
      : input.url
  );
  if (!url.pathname.startsWith("/swap/v1/")) {
    return realFetch(input, init);
  }
  const body = init?.body ? JSON.parse(init.body as string) : undefined;
  jupiterCalls.push({ url, body });

  if (url.pathname === "/swap/v1/quote") {
    return jsonResponse({
      inputMint: url.searchParams.get("inputMint"),
      inAmount: url.searchParams.get("amount"),
      outputMint: url.searchParams.get("outputMint"),
      outAmount: "1",
      otherAmountThreshold: "1",
      swapMode: "ExactIn",
      slippageBps: 50,
      priceImpactPct: "0",
      routePlan: [],
    });
  }
  return jsonResponse({
    swapInstruction: { programId: SYSTEM_PROGRAM, accounts: [], data: "" },
    addressLookupTableAddresses: [],
  });
};

describe("swap endpoints' optional Jupiter parameters", () => {
  let getQuote: QuoteModule["getQuote"];
  let getInstructions: InstructionsModule["getInstructions"];

  /** Each case quotes its own amount so the quote cache never carries one over. */
  let nextAmount = 1_000_000;
  const freshAmount = () => String(nextAmount++);

  const quote = (extra: Record<string, unknown> = {}, amount = freshAmount()) =>
    call(getQuote, {
      inputMint: HNT_MINT,
      outputMint: USDC_MINT,
      amount,
      swapMode: "ExactIn" as const,
      slippageBps: 50,
      ...extra,
    });

  const swapInstructions = async (extra: Record<string, unknown> = {}) => {
    const quoteResponse = await quote();
    jupiterCalls = [];
    await call(getInstructions, {
      quoteResponse,
      userPublicKey: WALLET,
      dynamicComputeUnitLimit: true,
      ...extra,
    });
    return jupiterCalls.filter(
      (c) => c.url.pathname === "/swap/v1/swap-instructions"
    );
  };

  before(async () => {
    // Every server variable the env schema requires without a default, set
    // here rather than read from a file so the run does not depend on a
    // developer's local environment.
    process.env.PG_USER = "test";
    process.env.PG_NAME = "test";
    process.env.PG_HOST = "localhost";
    process.env.PG_PORT = "5432";
    process.env.JUPITER_API_KEY = "test";
    process.env.NO_PG = "true";
    process.env.SOLANA_RPC_URL = await startStubRpc();
    ({ getQuote } = await import(
      "../../src/server/api/routers/swap/procedures/getQuote"
    ));
    ({ getInstructions } = await import(
      "../../src/server/api/routers/swap/procedures/getInstructions"
    ));
    globalThis.fetch = stubFetch;
  });

  after(() => {
    globalThis.fetch = realFetch;
    rpc?.closeAllConnections?.();
    rpc?.close();
  });

  afterEach(() => {
    jupiterCalls = [];
  });

  describe("swap instructions useSharedAccounts", () => {
    it("forwards useSharedAccounts: true to Jupiter", async () => {
      const calls = await swapInstructions({ useSharedAccounts: true });

      expect(calls).to.have.length(1);
      expect(calls[0].body).to.have.property("useSharedAccounts", true);
    });

    it("forwards useSharedAccounts: false to Jupiter", async () => {
      const calls = await swapInstructions({ useSharedAccounts: false });

      expect(calls).to.have.length(1);
      expect(calls[0].body).to.have.property("useSharedAccounts", false);
    });

    it("leaves the useSharedAccounts key out when the caller sets none", async () => {
      const calls = await swapInstructions();

      expect(calls).to.have.length(1);
      expect(calls[0].body).to.not.have.property("useSharedAccounts");
      expect(calls[0].body).to.have.property("userPublicKey", WALLET);
    });
  });

  describe("swap instructions quoteResponse", () => {
    it("hands Jupiter the quote as received, instructionVersion and unknown keys included", async () => {
      const quoteResponse = {
        inputMint: HNT_MINT,
        inAmount: freshAmount(),
        outputMint: USDC_MINT,
        outAmount: "1",
        otherAmountThreshold: "1",
        swapMode: "ExactIn",
        slippageBps: 50,
        priceImpactPct: "0",
        routePlan: [],
        instructionVersion: "V2",
        someUnknownKey: { nested: true },
      };
      await call(getInstructions, {
        quoteResponse,
        userPublicKey: WALLET,
        dynamicComputeUnitLimit: true,
      });

      const calls = jupiterCalls.filter(
        (c) => c.url.pathname === "/swap/v1/swap-instructions"
      );
      expect(calls).to.have.length(1);
      expect(calls[0].body).to.have.property("quoteResponse");
      expect(calls[0].body!.quoteResponse).to.deep.eq(quoteResponse);
    });
  });
});
