import { createServer, Server } from "http";
import { AddressInfo } from "net";
import { call, ORPCError } from "@orpc/server";
import { VersionedTransaction } from "@solana/web3.js";
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
const MEMO_PROGRAM = "MemoSq4gqABAXKb96qnH8TuhgWdtsRHB4ShcXcV3Ftu";
const LOOKUP_TABLE = "CuEETU2svDekhZ2mAdASYARmmyQkeQBN23MP9QzWZUvV";
/** An account only reachable through LOOKUP_TABLE in the built transaction. */
const ROUTE_ACCOUNT = "8BKagzPLX7WSJMhExppgvp9yQSfa2m1BTxrEAMpBDrk7";

/** One request the handlers sent to the stubbed Jupiter API. */
interface JupiterCall {
  url: URL;
  method: string;
  apiKey: string | null;
  body?: Record<string, unknown>;
}

let jupiterCalls: JupiterCall[] = [];
/** Fields each case lays over the stubbed `/build` answer. */
let buildOverrides: Record<string, unknown> = {};
/** Every RPC method the handlers called, in order. */
let rpcMethods: string[] = [];
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
          rpcMethods.push(method);
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
  if (!/^\/swap\/v[12]\//.test(url.pathname)) {
    return realFetch(input, init);
  }
  const body = init?.body ? JSON.parse(init.body as string) : undefined;
  jupiterCalls.push({
    url,
    method: init?.method ?? "GET",
    apiKey: new Headers(init?.headers).get("x-api-key"),
    body,
  });

  if (url.pathname === "/swap/v1/quote") {
    return jsonResponse({
      inputMint: url.searchParams.get("inputMint"),
      inAmount: url.searchParams.get("amount"),
      outputMint: url.searchParams.get("outputMint"),
      outAmount: "1",
      otherAmountThreshold: "1",
      swapMode: "ExactIn",
      slippageBps: Number(url.searchParams.get("slippageBps")),
      priceImpactPct: "0",
      routePlan: [],
    });
  }
  if (url.pathname === "/swap/v2/build") {
    return jsonResponse({
      inputMint: url.searchParams.get("inputMint"),
      inAmount: url.searchParams.get("amount"),
      outputMint: url.searchParams.get("outputMint"),
      outAmount: "777",
      otherAmountThreshold: "773",
      swapMode: "ExactIn",
      slippageBps: Number(url.searchParams.get("slippageBps")),
      priceImpactPct: "0",
      routePlan: [],
      computeBudgetInstructions: [],
      setupInstructions: [],
      swapInstruction: { programId: SYSTEM_PROGRAM, accounts: [], data: "" },
      cleanupInstruction: null,
      otherInstructions: [],
      tipInstruction: null,
      addressesByLookupTableAddress: {},
      ...buildOverrides,
    });
  }
  return new Response("unstubbed Jupiter path", { status: 404 });
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

  /** Build a swap from a fresh ExactIn quote; returns the `/build` calls and the result. */
  const swapInstructions = async (extra: Record<string, unknown> = {}) => {
    const quoteResponse = await quote();
    jupiterCalls = [];
    rpcMethods = [];
    const result = await call(getInstructions, {
      quoteResponse,
      userPublicKey: WALLET,
      dynamicComputeUnitLimit: true,
      ...extra,
    });
    const calls = jupiterCalls.filter(
      (c) => c.url.pathname === "/swap/v2/build"
    );
    return { quoteResponse, calls, result };
  };

  /** The error code a getInstructions call rejects with. */
  const rejectionCode = async (
    input: {
      quoteResponse: Awaited<ReturnType<typeof quote>>;
      userPublicKey: string;
    }
  ) => {
    try {
      await call(getInstructions, input);
    } catch (error) {
      expect(error).to.be.instanceOf(ORPCError);
      return (error as ORPCError<string, unknown>).code;
    }
    expect.fail("getInstructions resolved");
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
    buildOverrides = {};
    rpcMethods = [];
  });

  describe("quote excludeDexes", () => {
    const quoteCalls = () =>
      jupiterCalls.filter((c) => c.url.pathname === "/swap/v1/quote");

    it("forwards excludeDexes to Jupiter", async () => {
      await quote({ excludeDexes: "Kipseli,Foo" });

      expect(quoteCalls()).to.have.length(1);
      expect(quoteCalls()[0].url.searchParams.get("excludeDexes")).to.eq(
        "Kipseli,Foo"
      );
      expect(quoteCalls()[0].url.searchParams.get("excludeRouters")).to.eq(
        "jupiterz"
      );
    });

    it("leaves excludeDexes out when the caller sets none", async () => {
      await quote();

      expect(quoteCalls()).to.have.length(1);
      expect(quoteCalls()[0].url.searchParams.has("excludeDexes")).to.eq(false);
    });

    it("keys a quote without excludeDexes apart from one with it", async () => {
      const amount = freshAmount();
      await quote({}, amount);
      await quote({ excludeDexes: "Kipseli" }, amount);

      expect(quoteCalls()).to.have.length(2);
      expect(quoteCalls()[0].url.searchParams.has("excludeDexes")).to.eq(false);
      expect(quoteCalls()[1].url.searchParams.get("excludeDexes")).to.eq(
        "Kipseli"
      );
    });

    it("treats an empty excludeDexes as absent and shares its cache entry", async () => {
      const amount = freshAmount();
      await quote({ excludeDexes: "" }, amount);
      await quote({}, amount);

      expect(quoteCalls()).to.have.length(1);
      expect(quoteCalls()[0].url.searchParams.has("excludeDexes")).to.eq(false);
    });

    it("serves an identical repeat from the cache", async () => {
      const amount = freshAmount();
      await quote({ excludeDexes: "Kipseli" }, amount);
      await quote({ excludeDexes: "Kipseli" }, amount);

      expect(quoteCalls()).to.have.length(1);
    });
  });

  describe("swap instructions through /build", () => {
    it("GETs /swap/v2/build with the quote's mints, amount and slippage and the user as taker", async () => {
      const { quoteResponse, calls } = await swapInstructions();

      expect(jupiterCalls).to.have.length(1);
      expect(calls).to.have.length(1);
      expect(calls[0].method).to.eq("GET");
      expect(calls[0].apiKey).to.eq("test");
      expect(calls[0].body).to.eq(undefined);
      const params = Object.fromEntries(calls[0].url.searchParams);
      expect(params).to.deep.eq({
        inputMint: HNT_MINT,
        outputMint: USDC_MINT,
        amount: quoteResponse.inAmount,
        taker: WALLET,
        slippageBps: "50",
      });
    });

    it("takes slippageBps from the quote", async () => {
      const quoteResponse = await quote({ slippageBps: 125 });
      jupiterCalls = [];
      await call(getInstructions, { quoteResponse, userPublicKey: WALLET });

      expect(jupiterCalls).to.have.length(1);
      expect(jupiterCalls[0].url.searchParams.get("slippageBps")).to.eq("125");
    });

    it("forwards excludeDexes to /build", async () => {
      const { calls } = await swapInstructions({ excludeDexes: "Raydium CP" });

      expect(calls).to.have.length(1);
      expect(calls[0].url.searchParams.get("excludeDexes")).to.eq("Raydium CP");
    });

    it("leaves an empty excludeDexes out", async () => {
      const { calls } = await swapInstructions({ excludeDexes: "" });

      expect(calls).to.have.length(1);
      expect(calls[0].url.searchParams.has("excludeDexes")).to.eq(false);
    });

    for (const useSharedAccounts of [true, false]) {
      it(`does not forward useSharedAccounts: ${useSharedAccounts}`, async () => {
        const { calls } = await swapInstructions({ useSharedAccounts });

        expect(calls).to.have.length(1);
        expect(calls[0].url.searchParams.has("useSharedAccounts")).to.eq(false);
      });
    }

    it("forwards destinationTokenAccount and names it in the metadata", async () => {
      const destination = ROUTE_ACCOUNT;
      const { calls, result } = await swapInstructions({
        destinationTokenAccount: destination,
      });

      expect(calls).to.have.length(1);
      expect(calls[0].url.searchParams.get("destinationTokenAccount")).to.eq(
        destination
      );
      expect(result.transactions[0].metadata?.description).to.match(
        new RegExp(` to ${destination}$`)
      );
    });

    it("refuses an ExactOut quote without calling Jupiter", async () => {
      const quoteResponse = { ...(await quote()), swapMode: "ExactOut" };
      jupiterCalls = [];

      const code = await rejectionCode({ quoteResponse, userPublicKey: WALLET });

      expect(code).to.eq("BAD_REQUEST");
      expect(jupiterCalls).to.have.length(0);
    });

    it("refuses a /build answer for a different amount than the quote", async () => {
      const quoteResponse = await quote();
      buildOverrides = { inAmount: "1" };

      const code = await rejectionCode({ quoteResponse, userPublicKey: WALLET });

      expect(code).to.eq("JUPITER_ERROR");
    });

    it("compiles against the lookup tables /build resolved, reading none from the RPC", async () => {
      buildOverrides = {
        swapInstruction: {
          programId: MEMO_PROGRAM,
          accounts: [
            { pubkey: WALLET, isSigner: true, isWritable: true },
            { pubkey: ROUTE_ACCOUNT, isSigner: false, isWritable: true },
          ],
          data: "",
        },
        addressesByLookupTableAddress: { [LOOKUP_TABLE]: [ROUTE_ACCOUNT] },
      };
      const { result } = await swapInstructions();

      const tx = VersionedTransaction.deserialize(
        Buffer.from(result.transactions[0].serializedTransaction, "base64")
      );
      const lookups = tx.message.addressTableLookups;
      expect(lookups).to.have.length(1);
      expect(lookups[0].accountKey.toBase58()).to.eq(LOOKUP_TABLE);
      expect(lookups[0].writableIndexes).to.deep.eq([0]);
      expect(
        tx.message.staticAccountKeys.map((k) => k.toBase58())
      ).to.not.include(ROUTE_ACCOUNT);
      expect(rpcMethods).to.not.include("getMultipleAccounts");
      expect(rpcMethods).to.not.include("getAccountInfo");
    });

    it("puts otherInstructions in the transaction and leaves Jupiter's compute budget out", async () => {
      buildOverrides = {
        computeBudgetInstructions: [
          { programId: SYSTEM_PROGRAM, accounts: [], data: "AQ==" },
        ],
        otherInstructions: [
          { programId: MEMO_PROGRAM, accounts: [], data: "" },
        ],
      };
      const { result } = await swapInstructions();

      const tx = VersionedTransaction.deserialize(
        Buffer.from(result.transactions[0].serializedTransaction, "base64")
      );
      const programs = tx.message.compiledInstructions.map((ix) =>
        tx.message.staticAccountKeys[ix.programIdIndex].toBase58()
      );
      expect(programs.filter((p) => p === MEMO_PROGRAM)).to.have.length(1);
      expect(programs.filter((p) => p === SYSTEM_PROGRAM)).to.have.length(1);
    });

    it("describes the output /build returned, not the earlier quote's", async () => {
      const { quoteResponse, result } = await swapInstructions();

      expect(quoteResponse.outAmount).to.eq("1");
      const metadata = result.transactions[0].metadata!;
      expect(metadata.outputAmount).to.eq("777");
      expect(metadata.inputAmount).to.eq(quoteResponse.inAmount);
      expect(metadata.description).to.eq(
        `Swap ${quoteResponse.inAmount} ${HNT_MINT} for 777 ${USDC_MINT}`
      );
      const action = result.actionMetadata as {
        outputTokenAmount: { amount: string };
      };
      expect(action.outputTokenAmount.amount).to.eq("777");
    });
  });
});
