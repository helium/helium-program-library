import { createServer, Server } from "http";
import { AddressInfo } from "net";
import { call, ORPCError } from "@orpc/server";
import { Keypair, PublicKey, VersionedTransaction } from "@solana/web3.js";
import {
  ACCOUNT_SIZE,
  ExtensionType,
  getAccountLen,
  MintLayout,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { expect } from "chai";
import { SIZE_REQUOTES } from "../../src/server/api/routers/swap/procedures/build-request";
import { after, afterEach, before, beforeEach, describe, it } from "mocha";

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
const COMPUTE_BUDGET_PROGRAM = "ComputeBudget111111111111111111111111111111";
const LOOKUP_TABLE_PROGRAM = "AddressLookupTab1e1111111111111111111111111";
const MEMO_PROGRAM = "MemoSq4gqABAXKb96qnH8TuhgWdtsRHB4ShcXcV3Ftu";
const LOOKUP_TABLE = "CuEETU2svDekhZ2mAdASYARmmyQkeQBN23MP9QzWZUvV";
/** An account only reachable through LOOKUP_TABLE in the built transaction. */
const ROUTE_ACCOUNT = "8BKagzPLX7WSJMhExppgvp9yQSfa2m1BTxrEAMpBDrk7";

/**
 * LOOKUP_TABLE's account data as the chain stores it: a 56-byte header for an
 * active table without an authority, then ROUTE_ACCOUNT as its only address.
 */
const lookupTableData = (): string => {
  const header = Buffer.alloc(56);
  header.writeUInt32LE(1, 0);
  header.writeBigUInt64LE(BigInt("18446744073709551615"), 4);
  return Buffer.concat([
    header,
    new PublicKey(ROUTE_ACCOUNT).toBuffer(),
  ]).toString("base64");
};

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
/** A status and body one `/build` call answers with in place of the stubbed answer. */
class BuildReply {
  constructor(
    readonly status: number,
    readonly body: unknown
  ) {}
}
/**
 * Per `/build` call, in call order: fields laid over the stubbed answer after
 * buildOverrides, or a BuildReply that replaces it.
 */
let buildAnswers: (Record<string, unknown> | BuildReply)[] = [];
/**
 * When a case sets it, the fields laid over the stubbed `/build` answer for
 * the call's `maxBytes` (null when the call sends none), in place of
 * buildAnswers.
 */
let buildForMaxBytes:
  | ((maxBytes: number | null) => Record<string, unknown>)
  | undefined;
/** A status and body that replace the stubbed `/build` answer, when a case sets one. */
let buildReply: { status: number; body: unknown } | undefined;
/** A status and body that replace the stubbed quote answer, when a case sets one. */
let quoteReply: { status: number; body: unknown } | undefined;
/** Every RPC method the handlers called, in order. */
let rpcMethods: string[] = [];
/** Accounts the stubbed chain holds besides LOOKUP_TABLE, by address. */
let chainAccounts: Map<
  string,
  { data: Buffer; owner: string; lamports?: number }
> = new Map();
/** The taker's SOL balance on the stubbed chain. */
let walletLamports = 5_000_000_000;
/** Whether the stubbed chain answers getMultipleAccounts with an RPC error. */
let failMultipleAccounts = false;
const realFetch = globalThis.fetch;
let rpc: Server;

/** The fee the stubbed chain charges for any transaction. */
const TX_FEE = 10000;

/** The stubbed chain's rent-exempt minimum for `space` bytes, as mainnet prices it. */
const rentFor = (space: number) => (128 + space) * 6960;

const withContext = (value: unknown) => ({
  context: { apiVersion: "2.0.0", slot: 1 },
  value,
});

/** The RPC answers building and pricing the swap transaction needs. */
function rpcResult(method: string, params: unknown): unknown {
  switch (method) {
    case "getLatestBlockhash":
      return withContext({
        blockhash: "11111111111111111111111111111111",
        lastValidBlockHeight: 1000,
      });
    case "getAccountInfo":
      return withContext(null);
    case "getMultipleAccounts":
      return withContext(
        (params as [string[]])[0].map((key) => {
          if (key === LOOKUP_TABLE) {
            return {
              data: [lookupTableData(), "base64"],
              executable: false,
              lamports: 1_000_000,
              owner: LOOKUP_TABLE_PROGRAM,
              rentEpoch: 0,
              space: 88,
            };
          }
          const account = chainAccounts.get(key);
          return account
            ? {
                data: [account.data.toString("base64"), "base64"],
                executable: false,
                lamports: account.lamports ?? 1_000_000,
                owner: account.owner,
                rentEpoch: 0,
                space: account.data.length,
              }
            : null;
        })
      );
    case "getBalance":
      return withContext(walletLamports);
    case "getFeeForMessage":
      return withContext(TX_FEE);
    case "getMinimumBalanceForRentExemption":
      return rentFor((params as [number])[0]);
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
        const answer = ({
          id,
          method,
          params,
        }: {
          id: unknown;
          method: string;
          params: unknown;
        }) => {
          rpcMethods.push(method);
          if (method === "getMultipleAccounts" && failMultipleAccounts) {
            return {
              jsonrpc: "2.0",
              id,
              error: { code: -32005, message: "node is unhealthy" },
            };
          }
          const result = rpcResult(method, params);
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

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
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

  // getQuote calls /build for the system program as a placeholder taker. Its
  // answer ignores the getInstructions overrides, so they shape builds only.
  if (
    url.pathname === "/swap/v2/build" &&
    url.searchParams.get("taker") === SYSTEM_PROGRAM
  ) {
    if (quoteReply) {
      return jsonResponse(quoteReply.body, quoteReply.status);
    }
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
      computeBudgetInstructions: [],
      setupInstructions: [],
      swapInstruction: { programId: SYSTEM_PROGRAM, accounts: [], data: "" },
      cleanupInstruction: null,
      otherInstructions: [],
      tipInstruction: null,
      addressesByLookupTableAddress: {},
      blockhashWithMetadata: { blockhash: "x", lastValidBlockHeight: 1 },
    });
  }
  if (url.pathname === "/swap/v2/build") {
    if (buildReply) {
      return jsonResponse(buildReply.body, buildReply.status);
    }
    const maxBytes = url.searchParams.get("maxBytes");
    const answer = buildForMaxBytes
      ? buildForMaxBytes(maxBytes === null ? null : Number(maxBytes))
      : (buildAnswers.shift() ?? {});
    if (answer instanceof BuildReply) {
      return jsonResponse(answer.body, answer.status);
    }
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
      ...answer,
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

  type InstructionsInput = {
    quoteResponse: Awaited<ReturnType<typeof quote>>;
    userPublicKey: string;
    excludeDexes?: string;
    destinationTokenAccount?: string;
  };

  /** The error a getInstructions call rejects with. */
  const rejection = async (input: InstructionsInput) => {
    try {
      await call(getInstructions, input);
    } catch (error) {
      expect(error).to.be.instanceOf(ORPCError);
      return error as ORPCError<string, unknown>;
    }
    expect.fail("getInstructions resolved");
  };

  /** The error code a getInstructions call rejects with. */
  const rejectionCode = async (input: InstructionsInput) =>
    (await rejection(input)).code;

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
    ({ getQuote } =
      await import("../../src/server/api/routers/swap/procedures/getQuote"));
    ({ getInstructions } =
      await import("../../src/server/api/routers/swap/procedures/getInstructions"));
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
    buildAnswers = [];
    buildForMaxBytes = undefined;
    buildReply = undefined;
    quoteReply = undefined;
    rpcMethods = [];
    chainAccounts = new Map();
    walletLamports = 5_000_000_000;
    failMultipleAccounts = false;
  });

  describe("quote through /build", () => {
    const quoteCalls = () =>
      jupiterCalls.filter(
        (c) =>
          c.url.pathname === "/swap/v2/build" &&
          c.url.searchParams.get("taker") === SYSTEM_PROGRAM
      );

    /** The error a getQuote call rejects with. */
    const quoteRejection = async (
      extra: Record<string, unknown> = {},
      amount = freshAmount()
    ) => {
      try {
        await quote(extra, amount);
      } catch (error) {
        expect(error).to.be.instanceOf(ORPCError);
        return error as ORPCError<string, unknown>;
      }
      expect.fail("getQuote resolved");
    };

    it("GETs /swap/v2/build for a placeholder taker, excluding RFQ v2", async () => {
      const amount = freshAmount();
      await quote({}, amount);

      expect(jupiterCalls).to.have.length(1);
      expect(quoteCalls()).to.have.length(1);
      expect(quoteCalls()[0].method).to.eq("GET");
      expect(quoteCalls()[0].apiKey).to.eq("test");
      expect(Object.fromEntries(quoteCalls()[0].url.searchParams)).to.deep.eq({
        inputMint: HNT_MINT,
        outputMint: USDC_MINT,
        amount,
        taker: SYSTEM_PROGRAM,
        slippageBps: "50",
        excludeDexes: "JupiterRfqV2",
      });
    });

    it("returns the quote fields only", async () => {
      const amount = freshAmount();
      const result = await quote({}, amount);

      expect(result).to.deep.eq({
        inputMint: HNT_MINT,
        inAmount: amount,
        outputMint: USDC_MINT,
        outAmount: "1",
        otherAmountThreshold: "1",
        swapMode: "ExactIn",
        slippageBps: 50,
        priceImpactPct: "0",
        routePlan: [],
      });
    });

    it("returns the caller's excludeDexes on the quote", async () => {
      const result = await quote({ excludeDexes: "Kipseli, Foo" });

      expect(result.excludeDexes).to.deep.eq(["Kipseli", "Foo"]);
    });

    it("forwards excludeDexes to Jupiter with RFQ v2 added", async () => {
      await quote({ excludeDexes: "Kipseli, Foo" });

      expect(quoteCalls()).to.have.length(1);
      expect(quoteCalls()[0].url.searchParams.get("excludeDexes")).to.eq(
        "Kipseli,Foo,JupiterRfqV2"
      );
    });

    it("sends RFQ v2 once when the caller excludes it too", async () => {
      await quote({ excludeDexes: "JupiterRfqV2" });

      expect(quoteCalls()[0].url.searchParams.get("excludeDexes")).to.eq(
        "JupiterRfqV2"
      );
    });

    it("keys a quote without excludeDexes apart from one with it", async () => {
      const amount = freshAmount();
      await quote({}, amount);
      await quote({ excludeDexes: "Kipseli" }, amount);

      expect(quoteCalls()).to.have.length(2);
      expect(quoteCalls()[0].url.searchParams.get("excludeDexes")).to.eq(
        "JupiterRfqV2"
      );
      expect(quoteCalls()[1].url.searchParams.get("excludeDexes")).to.eq(
        "Kipseli,JupiterRfqV2"
      );
    });

    it("treats an empty excludeDexes as absent and shares its cache entry", async () => {
      const amount = freshAmount();
      await quote({ excludeDexes: "" }, amount);
      await quote({}, amount);

      expect(quoteCalls()).to.have.length(1);
      expect(quoteCalls()[0].url.searchParams.get("excludeDexes")).to.eq(
        "JupiterRfqV2"
      );
    });

    it("serves an identical repeat from the cache", async () => {
      const amount = freshAmount();
      await quote({ excludeDexes: "Kipseli" }, amount);
      await quote({ excludeDexes: "Kipseli" }, amount);

      expect(quoteCalls()).to.have.length(1);
    });

    it("refuses an ExactOut quote without calling Jupiter", async () => {
      const error = await quoteRejection({ swapMode: "ExactOut" });

      expect(error.code).to.eq("BAD_REQUEST");
      expect(error.message).to.eq(
        "Only ExactIn quotes are supported, got ExactOut"
      );
      expect(jupiterCalls).to.have.length(0);
    });

    it("answers a pair Jupiter cannot route with a bad request", async () => {
      quoteReply = { status: 400, body: { error: "No routes found" } };

      const error = await quoteRejection();

      expect(error.code).to.eq("BAD_REQUEST");
      expect(error.message).to.eq("No route found for this swap");
    });

    it("reports a malformed answer as a Jupiter error", async () => {
      quoteReply = { status: 200, body: { inputMint: HNT_MINT } };

      expect((await quoteRejection()).code).to.eq("JUPITER_ERROR");
    });

    /** A well-formed quote answer for `amount`, with `overrides` laid over it. */
    const quoteBody = (amount: string, overrides: Record<string, unknown>) => ({
      inputMint: HNT_MINT,
      inAmount: amount,
      outputMint: USDC_MINT,
      outAmount: "1",
      otherAmountThreshold: "1",
      swapMode: "ExactIn",
      slippageBps: 50,
      priceImpactPct: "0",
      routePlan: [],
      ...overrides,
    });

    it("refuses a 200 answer that carries an error with JUPITER_ERROR", async () => {
      quoteReply = { status: 200, body: { error: "No routes found" } };

      const error = await quoteRejection();

      expect(error.code).to.eq("JUPITER_ERROR");
      expect(error.message).to.eq("Jupiter API returned error: No routes found");
    });

    it("refuses an answer whose outAmount is not base-10 digits with JUPITER_ERROR", async () => {
      const amount = freshAmount();
      quoteReply = { status: 200, body: quoteBody(amount, { outAmount: "1e3" }) };

      const error = await quoteRejection({}, amount);

      expect(error.code).to.eq("JUPITER_ERROR");
      expect(error.message).to.eq("Invalid response from Jupiter API");
    });

    it("refuses a route through an excluded DEX with JUPITER_ERROR", async () => {
      const amount = freshAmount();
      quoteReply = {
        status: 200,
        body: quoteBody(amount, {
          routePlan: [
            { swapInfo: { label: "Whirlpool" } },
            { swapInfo: { label: "Kipseli" } },
          ],
        }),
      };

      const error = await quoteRejection({ excludeDexes: "Kipseli" }, amount);

      expect(error.code).to.eq("JUPITER_ERROR");
      expect(error.message).to.eq(
        "Jupiter built a route through excluded DEX Kipseli"
      );
    });

    for (const [name, routePlan] of [
      ["is not an array", { swapInfo: { label: "Whirlpool" } }],
      ["has a hop without swapInfo", [{}]],
      ["has a hop without a string label", [{ swapInfo: { label: 1 } }]],
    ] as const) {
      it(`refuses an answer whose routePlan ${name} with JUPITER_ERROR`, async () => {
        const amount = freshAmount();
        quoteReply = { status: 200, body: quoteBody(amount, { routePlan }) };

        const error = await quoteRejection({}, amount);

        expect(error.code).to.eq("JUPITER_ERROR");
        expect(error.message).to.eq("Invalid response from Jupiter API");
      });
    }

    it("refuses a quote for a different output mint than requested", async () => {
      const amount = freshAmount();
      quoteReply = {
        status: 200,
        body: {
          inputMint: HNT_MINT,
          inAmount: amount,
          outputMint: SYSTEM_PROGRAM,
          outAmount: "1",
          otherAmountThreshold: "1",
          swapMode: "ExactIn",
          slippageBps: 50,
          priceImpactPct: "0",
          routePlan: [],
        },
      };

      const error = await quoteRejection({}, amount);

      expect(error.code).to.eq("JUPITER_ERROR");
      expect(error.message).to.eq(
        "Jupiter quoted a swap that differs from the request"
      );
    });

    it("refuses a quote for a different input mint than requested", async () => {
      const amount = freshAmount();
      quoteReply = {
        status: 200,
        body: {
          inputMint: SYSTEM_PROGRAM,
          inAmount: amount,
          outputMint: USDC_MINT,
          outAmount: "1",
          otherAmountThreshold: "1",
          swapMode: "ExactIn",
          slippageBps: 50,
          priceImpactPct: "0",
          routePlan: [],
        },
      };

      const error = await quoteRejection({}, amount);

      expect(error.code).to.eq("JUPITER_ERROR");
      expect(error.message).to.eq(
        "Jupiter quoted a swap that differs from the request"
      );
    });

    it("refuses a quote for a different input amount than requested", async () => {
      const amount = freshAmount();
      quoteReply = {
        status: 200,
        body: {
          inputMint: HNT_MINT,
          inAmount: `${amount}0`,
          outputMint: USDC_MINT,
          outAmount: "1",
          otherAmountThreshold: "1",
          swapMode: "ExactIn",
          slippageBps: 50,
          priceImpactPct: "0",
          routePlan: [],
        },
      };

      const error = await quoteRejection({}, amount);

      expect(error.code).to.eq("JUPITER_ERROR");
      expect(error.message).to.eq(
        "Jupiter quoted a swap that differs from the request"
      );
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
        excludeDexes: "JupiterRfqV2",
      });
    });

    it("takes slippageBps from the quote", async () => {
      const quoteResponse = await quote({ slippageBps: 125 });
      jupiterCalls = [];
      await call(getInstructions, { quoteResponse, userPublicKey: WALLET });

      expect(jupiterCalls).to.have.length(1);
      expect(jupiterCalls[0].url.searchParams.get("slippageBps")).to.eq("125");
    });

    it("forwards excludeDexes to /build with RFQ v2 added", async () => {
      const { calls } = await swapInstructions({ excludeDexes: "Raydium CP" });

      expect(calls).to.have.length(1);
      expect(calls[0].url.searchParams.get("excludeDexes")).to.eq(
        "Raydium CP,JupiterRfqV2"
      );
    });

    it("excludes only RFQ v2 when excludeDexes is empty", async () => {
      const { calls } = await swapInstructions({ excludeDexes: "" });

      expect(calls).to.have.length(1);
      expect(calls[0].url.searchParams.get("excludeDexes")).to.eq(
        "JupiterRfqV2"
      );
    });

    it("sends RFQ v2 once when the caller excludes it too", async () => {
      const { calls } = await swapInstructions({
        excludeDexes: "JupiterRfqV2, Raydium CP",
      });

      expect(calls).to.have.length(1);
      expect(calls[0].url.searchParams.get("excludeDexes")).to.eq(
        "JupiterRfqV2,Raydium CP"
      );
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

      const code = await rejectionCode({
        quoteResponse,
        userPublicKey: WALLET,
      });

      expect(code).to.eq("BAD_REQUEST");
      expect(jupiterCalls).to.have.length(0);
    });

    for (const [field, value] of [
      ["inAmount", "1"],
      ["inputMint", MEMO_PROGRAM],
      ["outputMint", MEMO_PROGRAM],
    ]) {
      it(`refuses a /build answer whose ${field} differs from the quote`, async () => {
        const quoteResponse = await quote();
        buildOverrides = { [field]: value };

        const code = await rejectionCode({
          quoteResponse,
          userPublicKey: WALLET,
        });

        expect(code).to.eq("JUPITER_ERROR");
      });
    }

    describe("minimum output", () => {
      // The stubbed /build answer has an outAmount of 777 and enforces a
      // minimum output of 773.
      const QUOTE_EXPIRED = /^Quote expired: .*refresh the quote$/;
      const realWarn = console.warn;
      let warnings: unknown[][] = [];

      beforeEach(() => {
        warnings = [];
        // Only the minimum-output log: building the transaction warns too.
        console.warn = (...args: unknown[]) => {
          if (String(args[0]).startsWith("Jupiter /build minimum output")) {
            warnings.push(args);
          }
        };
      });

      afterEach(() => {
        console.warn = realWarn;
      });

      /** A quote whose minimum output is `threshold`, and no Jupiter calls since. */
      const quoteWithMinimum = async (threshold: string) => {
        const quoteResponse = {
          ...(await quote()),
          otherAmountThreshold: threshold,
        };
        jupiterCalls = [];
        return quoteResponse;
      };

      const buildCalls = () =>
        jupiterCalls.filter((c) => c.url.pathname === "/swap/v2/build");

      it("asks /build again at the slippage that keeps the quote's minimum and builds that answer", async () => {
        const quoteResponse = await quoteWithMinimum("951");
        // floor((1003 - 951) * 10000 / 1003) = 518
        buildAnswers = [
          { outAmount: "1003", otherAmountThreshold: "900" },
          { outAmount: "1002", otherAmountThreshold: "951" },
        ];

        const result = await call(getInstructions, {
          quoteResponse,
          userPublicKey: WALLET,
        });

        expect(
          buildCalls().map((c) => c.url.searchParams.get("slippageBps"))
        ).to.deep.eq(["50", "518"]);
        expect(result.transactions[0].metadata?.outputAmount).to.eq("1002");
        expect(warnings).to.have.length(1);
        expect(warnings[0][1]).to.deep.include({
          quoteMinimum: "951",
          retried: true,
          passed: true,
        });
        expect((warnings[0][1] as { attempts: unknown }).attempts).to.deep.eq([
          { otherAmountThreshold: "900", outAmount: "1003" },
        ]);
      });

      it("refuses as an expired quote when the second answer is still below, after one retry", async () => {
        const quoteResponse = await quoteWithMinimum("774");
        // Both answers are 777 out, 773 minimum: the second could be retried
        // again, but is not.
        const error = await rejection({ quoteResponse, userPublicKey: WALLET });

        expect(error.code).to.eq("BAD_REQUEST");
        expect(error.message).to.match(QUOTE_EXPIRED);
        expect(buildCalls()).to.have.length(2);
        expect(warnings).to.have.length(1);
        expect(warnings[0][1]).to.deep.include({
          retried: true,
          passed: false,
        });
      });

      it("refuses as an expired quote without a retry when the output is below the quote's minimum", async () => {
        const quoteResponse = await quoteWithMinimum("778");

        const error = await rejection({ quoteResponse, userPublicKey: WALLET });

        expect(error.code).to.eq("BAD_REQUEST");
        expect(error.message).to.match(QUOTE_EXPIRED);
        expect(buildCalls()).to.have.length(1);
        expect(warnings).to.have.length(1);
        expect(warnings[0][1]).to.deep.include({
          quoteMinimum: "778",
          retried: false,
          passed: false,
        });
      });

      it("refuses as an expired quote without a retry when the output equals the quote's minimum", async () => {
        // No slippage above 0 keeps 777 out at a minimum of 777.
        const quoteResponse = await quoteWithMinimum("777");

        const error = await rejection({ quoteResponse, userPublicKey: WALLET });

        expect(error.code).to.eq("BAD_REQUEST");
        expect(error.message).to.match(QUOTE_EXPIRED);
        expect(buildCalls()).to.have.length(1);
      });

      for (const threshold of ["773", "772"]) {
        it(`accepts a /build minimum of 773 against a quote minimum of ${threshold} without a retry`, async () => {
          const quoteResponse = await quoteWithMinimum(threshold);

          const result = await call(getInstructions, {
            quoteResponse,
            userPublicKey: WALLET,
          });

          expect(result.transactions).to.have.length(1);
          expect(buildCalls()).to.have.length(1);
          expect(warnings).to.have.length(0);
        });
      }

      it("refuses as an expired quote when the output clears the quote's minimum by less than 1 bp", async () => {
        const quoteResponse = await quoteWithMinimum("999950");
        // floor((1000000 - 999950) * 10000 / 1000000) = 0
        buildAnswers = [
          { outAmount: "1000000", otherAmountThreshold: "990000" },
        ];

        const error = await rejection({ quoteResponse, userPublicKey: WALLET });

        expect(error.code).to.eq("BAD_REQUEST");
        expect(error.message).to.match(QUOTE_EXPIRED);
        expect(buildCalls()).to.have.length(1);
      });

      it("refuses a quote whose minimum is not an amount without calling Jupiter", async () => {
        const quoteResponse = {
          ...(await quote()),
          otherAmountThreshold: "7e2",
        };
        jupiterCalls = [];

        const code = await rejectionCode({
          quoteResponse,
          userPublicKey: WALLET,
        });

        expect(code).to.eq("BAD_REQUEST");
        expect(jupiterCalls).to.have.length(0);
      });
    });

    describe("excluded DEXes in the built route", () => {
      const routeThrough = (label: string) => [
        { swapInfo: { label: "Whirlpool" } },
        { swapInfo: { label } },
      ];

      it("refuses a route through a DEX listed in excludeDexes", async () => {
        const quoteResponse = await quote();
        buildOverrides = { routePlan: routeThrough("Kipseli") };

        const code = await rejectionCode({
          quoteResponse,
          userPublicKey: WALLET,
          excludeDexes: "Foo, Kipseli",
        });

        expect(code).to.eq("JUPITER_ERROR");
      });

      it("refuses a route through RFQ v2 when the caller excludes nothing", async () => {
        const quoteResponse = await quote();
        buildOverrides = { routePlan: routeThrough("JupiterRfqV2") };

        const error = await rejection({ quoteResponse, userPublicKey: WALLET });

        expect(error.code).to.eq("JUPITER_ERROR");
        expect(error.message).to.contain("JupiterRfqV2");
      });

      it("sends and refuses the quote's excludeDexes when the request names none", async () => {
        const quoteResponse = await quote({ excludeDexes: "X" });
        jupiterCalls = [];
        buildOverrides = { routePlan: routeThrough("X") };

        const code = await rejectionCode({ quoteResponse, userPublicKey: WALLET });

        const calls = jupiterCalls.filter(
          (c) => c.url.pathname === "/swap/v2/build"
        );
        expect(calls).to.have.length(1);
        expect(calls[0].url.searchParams.get("excludeDexes")).to.eq(
          "X,JupiterRfqV2"
        );
        expect(code).to.eq("JUPITER_ERROR");
      });

      it("matches labels exactly and case-sensitively", async () => {
        buildOverrides = { routePlan: routeThrough("Kipseli") };

        const { result } = await swapInstructions({
          excludeDexes: "kipseli,Kipsel",
        });

        expect(result.transactions).to.have.length(1);
      });
    });

    describe("rent for the accounts /build creates", () => {
      const ATA_PROGRAM = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
      const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
      const TOKEN_2022_PROGRAM = TOKEN_2022_PROGRAM_ID.toBase58();
      const WSOL_MINT = "So11111111111111111111111111111111111111112";
      const SPL_ACCOUNT = 165;
      /** A Token-2022 associated account for a mint without extensions. */
      const TOKEN_2022_BASE_ACCOUNT = 165 + 1 + 4;
      /** For a TransferFeeConfig mint: TransferFeeAmount (8) and ImmutableOwner. */
      const TOKEN_2022_FEE_ACCOUNT = 165 + 1 + (4 + 8) + 4;

      /** An extension type this spl-token version has no account-side mapping for. */
      const UNKNOWN_MINT_EXTENSION = 200 as ExtensionType;

      const address = () => Keypair.generate().publicKey.toBase58();

      /** A CreateIdempotent of `account` for `mint` under `tokenProgram`, paid by `payer`. */
      const createAta = ({
        account,
        mint,
        tokenProgram = TOKEN_PROGRAM,
        payer = WALLET,
        data = "AQ==",
      }: {
        account: string;
        mint: string;
        tokenProgram?: string;
        payer?: string;
        data?: string;
      }) => ({
        programId: ATA_PROGRAM,
        accounts: [
          { pubkey: payer, isSigner: true, isWritable: true },
          { pubkey: account, isSigner: false, isWritable: true },
          { pubkey: WALLET, isSigner: false, isWritable: false },
          { pubkey: mint, isSigner: false, isWritable: false },
          { pubkey: SYSTEM_PROGRAM, isSigner: false, isWritable: false },
          { pubkey: tokenProgram, isSigner: false, isWritable: false },
        ],
        data,
      });

      /** Byte lengths of the mint extensions these cases lay out. */
      const MINT_EXTENSION_LENGTHS = new Map([
        [ExtensionType.TransferFeeConfig, 108],
        [ExtensionType.MintCloseAuthority, 32],
        [ExtensionType.ConfidentialTransferMint, 65],
        [ExtensionType.NonTransferable, 0],
        [ExtensionType.TransferHook, 64],
        [ExtensionType.PausableConfig, 33],
        [UNKNOWN_MINT_EXTENSION, 4],
      ]);

      /** A Token-2022 mint carrying `extensions` (TransferFeeConfig by default). */
      const transferFeeMintData = (
        extensions: ExtensionType[] = [ExtensionType.TransferFeeConfig]
      ) => {
        // getMintLen throws for the unknown extension, so the length is summed here.
        const data = Buffer.alloc(
          ACCOUNT_SIZE +
            1 +
            extensions.reduce(
              (total, extension) =>
                total + 4 + MINT_EXTENSION_LENGTHS.get(extension)!,
              0
            )
        );
        MintLayout.encode(
          {
            mintAuthorityOption: 0,
            mintAuthority: PublicKey.default,
            supply: BigInt(0),
            decimals: 6,
            isInitialized: true,
            freezeAuthorityOption: 0,
            freezeAuthority: PublicKey.default,
          },
          data
        );
        data[ACCOUNT_SIZE] = 1; // AccountType.Mint
        let offset = ACCOUNT_SIZE + 1;
        for (const extension of extensions) {
          const length = MINT_EXTENSION_LENGTHS.get(extension)!;
          data.writeUInt16LE(extension, offset);
          data.writeUInt16LE(length, offset + 2);
          offset += 4 + length;
        }
        return data;
      };

      const existing = (key: string) =>
        chainAccounts.set(key, {
          data: Buffer.alloc(SPL_ACCOUNT),
          owner: TOKEN_PROGRAM,
        });

      /** The lamports a build of `quoteResponse` requires, read from its refusal at a zero balance. */
      const requiredLamports = async (
        quoteResponse: Awaited<ReturnType<typeof quote>>,
        extra: Record<string, unknown> = {}
      ) => {
        walletLamports = 0;
        const error = await rejection({
          quoteResponse,
          userPublicKey: WALLET,
          ...extra,
        });
        expect(error.code).to.eq("INSUFFICIENT_FUNDS");
        return (error.data as { required: number }).required;
      };

      /** Fee and the wallet's own rent-exempt floor, which every swap requires. */
      const BASE = TX_FEE + rentFor(0);

      it("counts rent only for the absent accounts of a multi-hop answer, by size", async () => {
        const output = address();
        const intermediate = address();
        const wsol = address();
        const feeAccount = address();
        const feeMint = address();
        existing(intermediate);
        existing(wsol);
        chainAccounts.set(feeMint, {
          data: transferFeeMintData(),
          owner: TOKEN_2022_PROGRAM,
        });
        buildOverrides = {
          setupInstructions: [
            createAta({ account: wsol, mint: WSOL_MINT }),
            createAta({ account: intermediate, mint: HNT_MINT }),
            createAta({ account: output, mint: USDC_MINT }),
            createAta({
              account: feeAccount,
              mint: feeMint,
              tokenProgram: TOKEN_2022_PROGRAM,
            }),
            // The same account again counts once.
            createAta({ account: output, mint: USDC_MINT }),
          ],
        };

        const required = await requiredLamports(await quote());

        expect(required).to.eq(
          BASE + rentFor(SPL_ACCOUNT) + rentFor(TOKEN_2022_FEE_ACCOUNT)
        );
      });

      it("sizes a Token-2022 account of a mint without extensions at the base size", async () => {
        const mint = address();
        chainAccounts.set(mint, {
          data: Buffer.alloc(82),
          owner: TOKEN_2022_PROGRAM,
        });
        buildOverrides = {
          setupInstructions: [
            createAta({
              account: address(),
              mint,
              tokenProgram: TOKEN_2022_PROGRAM,
            }),
          ],
        };

        const required = await requiredLamports(await quote());

        expect(required).to.eq(BASE + rentFor(TOKEN_2022_BASE_ACCOUNT));
      });

      for (const [extension, space] of [
        [ExtensionType.ConfidentialTransferMint, TOKEN_2022_BASE_ACCOUNT],
        [ExtensionType.TransferFeeConfig, TOKEN_2022_FEE_ACCOUNT],
      ] as const) {
        it(`sizes the account of a mint with ${ExtensionType[extension]} only at ${space} bytes`, async () => {
          const mint = address();
          chainAccounts.set(mint, {
            data: transferFeeMintData([extension]),
            owner: TOKEN_2022_PROGRAM,
          });
          buildOverrides = {
            setupInstructions: [
              createAta({
                account: address(),
                mint,
                tokenProgram: TOKEN_2022_PROGRAM,
              }),
            ],
          };

          const required = await requiredLamports(await quote());

          expect(required).to.eq(BASE + rentFor(space));
        });
      }

      for (const [extension, accountExtension] of [
        [ExtensionType.NonTransferable, ExtensionType.NonTransferableAccount],
        [ExtensionType.TransferHook, ExtensionType.TransferHookAccount],
        [ExtensionType.PausableConfig, ExtensionType.PausableAccount],
      ] as const) {
        it(`sizes the account of a mint with ${ExtensionType[extension]} with ${ExtensionType[accountExtension]} and ImmutableOwner`, async () => {
          const mint = address();
          chainAccounts.set(mint, {
            data: transferFeeMintData([extension]),
            owner: TOKEN_2022_PROGRAM,
          });
          buildOverrides = {
            setupInstructions: [
              createAta({
                account: address(),
                mint,
                tokenProgram: TOKEN_2022_PROGRAM,
              }),
            ],
          };

          const required = await requiredLamports(await quote());

          expect(required).to.eq(
            BASE +
              rentFor(
                getAccountLen([accountExtension, ExtensionType.ImmutableOwner])
              )
          );
        });
      }

      it("adds no account extension for a mint-only extension", async () => {
        const mint = address();
        chainAccounts.set(mint, {
          // MintCloseAuthority has no account-side counterpart.
          data: transferFeeMintData([
            ExtensionType.TransferFeeConfig,
            ExtensionType.MintCloseAuthority,
          ]),
          owner: TOKEN_2022_PROGRAM,
        });
        buildOverrides = {
          setupInstructions: [
            createAta({
              account: address(),
              mint,
              tokenProgram: TOKEN_2022_PROGRAM,
            }),
          ],
        };

        const required = await requiredLamports(await quote());

        expect(required).to.eq(BASE + rentFor(TOKEN_2022_FEE_ACCOUNT));
      });

      it("skips a mint extension it does not know and still sizes the ones it does", async () => {
        const mint = address();
        chainAccounts.set(mint, {
          data: transferFeeMintData([
            UNKNOWN_MINT_EXTENSION,
            ExtensionType.TransferFeeConfig,
          ]),
          owner: TOKEN_2022_PROGRAM,
        });
        buildOverrides = {
          setupInstructions: [
            createAta({
              account: address(),
              mint,
              tokenProgram: TOKEN_2022_PROGRAM,
            }),
          ],
        };

        const required = await requiredLamports(await quote());

        expect(required).to.eq(BASE + rentFor(TOKEN_2022_FEE_ACCOUNT));
      });

      it("sizes a Token-2022 account of an absent mint at the base size", async () => {
        buildOverrides = {
          setupInstructions: [
            createAta({
              account: address(),
              mint: address(),
              tokenProgram: TOKEN_2022_PROGRAM,
            }),
          ],
        };

        const required = await requiredLamports(await quote());

        expect(required).to.eq(BASE + rentFor(TOKEN_2022_BASE_ACCOUNT));
      });

      it("counts the rent of a create without data and ignores RecoverNested", async () => {
        buildOverrides = {
          setupInstructions: [
            createAta({ account: address(), mint: USDC_MINT, data: "" }),
            createAta({ account: address(), mint: USDC_MINT, data: "Ag==" }),
          ],
        };

        const required = await requiredLamports(await quote());

        expect(required).to.eq(BASE + rentFor(SPL_ACCOUNT));
      });

      it("counts the rent of a Create with an explicit data byte 0", async () => {
        buildOverrides = {
          setupInstructions: [
            createAta({ account: address(), mint: USDC_MINT, data: "AA==" }),
          ],
        };

        const required = await requiredLamports(await quote());

        expect(required).to.eq(BASE + rentFor(SPL_ACCOUNT));
      });

      it("charges a prefunded empty System-owned address the rest of its rent", async () => {
        const account = address();
        // The stubbed chain gives every account it holds 1,000,000 lamports.
        chainAccounts.set(account, {
          data: Buffer.alloc(0),
          owner: SYSTEM_PROGRAM,
        });
        buildOverrides = {
          setupInstructions: [createAta({ account, mint: USDC_MINT })],
        };

        const required = await requiredLamports(await quote());

        expect(required).to.eq(BASE + rentFor(SPL_ACCOUNT) - 1_000_000);
      });

      it("counts an empty account owned by another program as existing", async () => {
        const account = address();
        chainAccounts.set(account, {
          data: Buffer.alloc(0),
          owner: TOKEN_PROGRAM,
        });
        buildOverrides = {
          setupInstructions: [createAta({ account, mint: USDC_MINT })],
        };

        const required = await requiredLamports(await quote());

        expect(required).to.eq(BASE);
      });

      it("counts a System-owned account with data as existing", async () => {
        const account = address();
        chainAccounts.set(account, {
          data: Buffer.alloc(8),
          owner: SYSTEM_PROGRAM,
        });
        buildOverrides = {
          setupInstructions: [createAta({ account, mint: USDC_MINT })],
        };

        const required = await requiredLamports(await quote());

        expect(required).to.eq(BASE);
      });

      it("charges nothing for an empty System-owned address prefunded above its rent", async () => {
        const account = address();
        chainAccounts.set(account, {
          data: Buffer.alloc(0),
          owner: SYSTEM_PROGRAM,
          lamports: rentFor(SPL_ACCOUNT) + 1,
        });
        buildOverrides = {
          setupInstructions: [createAta({ account, mint: USDC_MINT })],
        };

        const required = await requiredLamports(await quote());

        expect(required).to.eq(BASE);
      });

      it("leaves out accounts another payer creates", async () => {
        buildOverrides = {
          setupInstructions: [
            createAta({
              account: address(),
              mint: USDC_MINT,
              payer: address(),
            }),
          ],
        };

        const required = await requiredLamports(await quote());

        expect(required).to.eq(BASE);
      });

      it("counts the wrapped SOL account's rent on top of a SOL input", async () => {
        const quoteResponse = await quote({ inputMint: WSOL_MINT });
        buildOverrides = {
          setupInstructions: [
            createAta({ account: address(), mint: WSOL_MINT }),
            createAta({ account: address(), mint: USDC_MINT }),
          ],
        };

        const required = await requiredLamports(quoteResponse);

        expect(required).to.eq(
          BASE + 2 * rentFor(SPL_ACCOUNT) + Number(quoteResponse.inAmount)
        );
      });

      it("counts the taker's absent output account when destinationTokenAccount is set", async () => {
        buildOverrides = {
          setupInstructions: [
            createAta({ account: address(), mint: USDC_MINT }),
          ],
        };

        const required = await requiredLamports(await quote(), {
          destinationTokenAccount: ROUTE_ACCOUNT,
        });

        expect(required).to.eq(BASE + rentFor(SPL_ACCOUNT));
      });

      it("builds when the balance covers fee, floor and rent exactly", async () => {
        buildOverrides = {
          setupInstructions: [
            createAta({ account: address(), mint: USDC_MINT }),
          ],
        };
        walletLamports = BASE + rentFor(SPL_ACCOUNT);

        const { result } = await swapInstructions();

        expect(result.transactions).to.have.length(1);
      });

      it("fails the request when the rent lookup's RPC call fails, returning no build", async () => {
        const quoteResponse = await quote();
        buildOverrides = {
          setupInstructions: [
            createAta({ account: address(), mint: USDC_MINT }),
          ],
        };
        failMultipleAccounts = true;

        let result: unknown;
        let failure: unknown;
        try {
          result = await call(getInstructions, {
            quoteResponse,
            userPublicKey: WALLET,
          });
        } catch (error) {
          failure = error;
        }

        expect(failure).to.be.instanceOf(Error);
        // The stub's RPC error, raised by the rent lookup: the build has no
        // lookup tables, so no other getMultipleAccounts call is made.
        expect((failure as Error).message).to.contain("node is unhealthy");
        expect(rpcMethods).to.include("getMultipleAccounts");
        expect(result).to.eq(undefined);
      });

      it("refuses one lamport short with INSUFFICIENT_FUNDS", async () => {
        const quoteResponse = await quote();
        buildOverrides = {
          setupInstructions: [
            createAta({ account: address(), mint: USDC_MINT }),
          ],
        };
        walletLamports = BASE + rentFor(SPL_ACCOUNT) - 1;

        const error = await rejection({ quoteResponse, userPublicKey: WALLET });

        expect(error.code).to.eq("INSUFFICIENT_FUNDS");
        expect(error.data).to.deep.eq({
          required: BASE + rentFor(SPL_ACCOUNT),
          available: walletLamports,
        });
      });
    });

    it("refuses a malformed /build answer with JUPITER_ERROR", async () => {
      const quoteResponse = await quote();
      buildOverrides = { swapInstruction: undefined };

      const code = await rejectionCode({
        quoteResponse,
        userPublicKey: WALLET,
      });

      expect(code).to.eq("JUPITER_ERROR");
    });

    it("answers a rate-limited /build with RATE_LIMITED", async () => {
      const quoteResponse = await quote();
      buildReply = { status: 429, body: { error: "Too many requests" } };

      const code = await rejectionCode({
        quoteResponse,
        userPublicKey: WALLET,
      });

      expect(code).to.eq("RATE_LIMITED");
    });

    it("answers a /build that finds the token not tradable with BAD_REQUEST", async () => {
      const quoteResponse = await quote();
      buildReply = { status: 400, body: { errorCode: "TOKEN_NOT_TRADABLE" } };

      const code = await rejectionCode({
        quoteResponse,
        userPublicKey: WALLET,
      });

      expect(code).to.eq("BAD_REQUEST");
    });

    it("answers a failed /build with JUPITER_ERROR", async () => {
      const quoteResponse = await quote();
      buildReply = { status: 500, body: { error: "Internal error" } };

      const code = await rejectionCode({
        quoteResponse,
        userPublicKey: WALLET,
      });

      expect(code).to.eq("JUPITER_ERROR");
    });

    it("refuses a 200 /build answer that carries an error with JUPITER_ERROR", async () => {
      const quoteResponse = await quote();
      buildReply = { status: 200, body: { error: "No routes found" } };

      const error = await rejection({ quoteResponse, userPublicKey: WALLET });

      expect(error.code).to.eq("JUPITER_ERROR");
      expect(error.message).to.contain("No routes found");
    });

    it("treats null setupInstructions and otherInstructions as empty", async () => {
      buildOverrides = { setupInstructions: null, otherInstructions: null };

      const { result } = await swapInstructions();

      expect(result.transactions).to.have.length(1);
    });

    it("refuses a /build answer with otherInstructions", async () => {
      const quoteResponse = await quote();
      buildOverrides = {
        otherInstructions: [
          { programId: MEMO_PROGRAM, accounts: [], data: "" },
        ],
      };

      const code = await rejectionCode({
        quoteResponse,
        userPublicKey: WALLET,
      });

      expect(code).to.eq("JUPITER_ERROR");
    });

    it("compiles against the lookup tables /build names, read from chain", async () => {
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
      // Read once, for both the transaction and the bare swap's estimate.
      expect(
        rpcMethods.filter((method) => method === "getMultipleAccounts")
      ).to.have.length(1);
    });

    it("compiles against the on-chain table, not the addresses /build lists", async () => {
      buildOverrides = {
        swapInstruction: {
          programId: MEMO_PROGRAM,
          accounts: [
            { pubkey: WALLET, isSigner: true, isWritable: true },
            { pubkey: ROUTE_ACCOUNT, isSigner: false, isWritable: true },
          ],
          data: "",
        },
        // The chain holds only ROUTE_ACCOUNT, at index 0.
        addressesByLookupTableAddress: {
          [LOOKUP_TABLE]: [SYSTEM_PROGRAM, ROUTE_ACCOUNT],
        },
      };
      const { result } = await swapInstructions();

      const tx = VersionedTransaction.deserialize(
        Buffer.from(result.transactions[0].serializedTransaction, "base64")
      );
      expect(tx.message.addressTableLookups[0].writableIndexes).to.deep.eq([0]);
    });

    it("orders setup, swap and cleanup and leaves Jupiter's compute budget out", async () => {
      const memo = (text: string) => ({
        programId: MEMO_PROGRAM,
        accounts: [],
        data: Buffer.from(text).toString("base64"),
      });
      buildOverrides = {
        // RequestHeapFrame, an instruction the server never adds itself.
        computeBudgetInstructions: [
          { programId: COMPUTE_BUDGET_PROGRAM, accounts: [], data: "AQAAAQA=" },
        ],
        setupInstructions: [memo("setup-1"), memo("setup-2")],
        swapInstruction: memo("swap"),
        cleanupInstruction: memo("cleanup"),
      };
      const { result } = await swapInstructions();

      const tx = VersionedTransaction.deserialize(
        Buffer.from(result.transactions[0].serializedTransaction, "base64")
      );
      const compiled = tx.message.compiledInstructions.map((ix) => ({
        program: tx.message.staticAccountKeys[ix.programIdIndex].toBase58(),
        data: Buffer.from(ix.data),
      }));
      expect(
        compiled
          .filter((ix) => ix.program === MEMO_PROGRAM)
          .map((ix) => ix.data.toString())
      ).to.deep.eq(["setup-1", "setup-2", "swap", "cleanup"]);
      const budget = compiled.filter(
        (ix) => ix.program === COMPUTE_BUDGET_PROGRAM
      );
      expect(budget).to.not.have.length(0);
      expect(budget.map((ix) => ix.data[0])).to.not.include(1);
      // The server's compute budget comes before every Jupiter instruction.
      expect(compiled.findIndex((ix) => ix.program === MEMO_PROGRAM)).to.eq(
        budget.length
      );
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

    describe("packet size", () => {
      const PACKET_LIMIT = 1232;
      const TOO_LARGE_MESSAGE =
        "The swap route does not fit in one transaction; try a smaller amount or a different pair";
      const realWarn = console.warn;
      let overLimitWarnings: Record<string, unknown>[] = [];
      let refusalWarnings: Record<string, unknown>[] = [];

      beforeEach(() => {
        overLimitWarnings = [];
        refusalWarnings = [];
        console.warn = (...args: unknown[]) => {
          const message = String(args[0]);
          if (
            message.startsWith("Jupiter /build transaction over the packet limit")
          ) {
            overLimitWarnings.push(args[1] as Record<string, unknown>);
          }
          if (
            message.startsWith(
              "Jupiter /build transaction refused over the packet limit"
            )
          ) {
            refusalWarnings.push(args[1] as Record<string, unknown>);
          }
        };
      });

      afterEach(() => {
        console.warn = realWarn;
      });

      /** A setup instruction that carries `bytes` bytes of data. */
      const padding = (bytes: number) => ({
        setupInstructions: [
          {
            programId: MEMO_PROGRAM,
            accounts: [],
            data: Buffer.alloc(bytes, 1).toString("base64"),
          },
        ],
      });

      // 973 bytes of padding make the transaction exactly 1232 bytes: the
      // padding plus 259 bytes of signature slot, header, accounts and the
      // server's compute budget instructions. Each further byte of padding
      // adds one byte to the transaction.
      /** The padding of a transaction of exactly the packet limit. */
      const AT_LIMIT = 973;
      /** A transaction `over` bytes past the packet limit. */
      const over = (bytes: number) => padding(AT_LIMIT + bytes);

      // Of those 259 bytes, the server adds 52 around Jupiter's instructions:
      // the compute budget program's key (32) and its two instructions (8 and
      // 12). The bare swap of a padded route, a v0 transaction of Jupiter's
      // instructions alone, is 207 bytes plus the padding: the signature slot
      // (65), version and header (4), three account keys (97), the blockhash
      // (32), and the framing of the instruction list (1), the padding
      // instruction (4), the swap instruction (3) and the lookups (1). A
      // transaction 1 byte over the limit has a bare swap of 1181 bytes, and
      // a requote's maxBytes of 1180 fits it whatever the overshoot.
      /** The bare swap of a route padded with `bytes` of 128 or more. */
      const BARE_FRAME = 207;

      /**
       * A Jupiter that answers its best route, whose bare swap it counts as
       * `best` bytes, whenever `maxBytes` allows it, and otherwise the largest
       * route that fits `maxBytes`. It counts a padded route's bare swap as
       * the padding plus `frame` bytes.
       */
      const jupiterWithin =
        (best: number, frame = BARE_FRAME) =>
        (maxBytes: number | null) =>
          padding(Math.min(best, maxBytes ?? Infinity) - frame);

      /**
       * A route whose message fits the packet but whose transaction does not
       * once the signature slot is counted: 27 bytes over.
       */
      const OVER_WITH_SIGNATURE = over(27);
      /** A route whose message alone does not fit a packet: 527 bytes over. */
      const OVER_AS_MESSAGE = over(527);

      const buildCalls = () =>
        jupiterCalls.filter((c) => c.url.pathname === "/swap/v2/build");
      const maxBytesSent = () =>
        buildCalls().map((c) => c.url.searchParams.get("maxBytes"));

      const sizeOf = (result: {
        transactions: { serializedTransaction: string }[];
      }) =>
        Buffer.from(result.transactions[0].serializedTransaction, "base64")
          .length;

      it("quotes without maxBytes or maxAccounts", async () => {
        await quote();
        const params = jupiterCalls[0].url.searchParams;

        expect(params.has("maxBytes")).to.eq(false);
        expect(params.has("maxAccounts")).to.eq(false);
      });

      it("returns a fitting build after one request that sends neither maxBytes nor maxAccounts", async () => {
        const { calls, result } = await swapInstructions();

        expect(calls).to.have.length(1);
        expect(calls[0].url.searchParams.has("maxBytes")).to.eq(false);
        expect(calls[0].url.searchParams.has("maxAccounts")).to.eq(false);
        expect(sizeOf(result)).to.be.at.most(PACKET_LIMIT);
        expect(overLimitWarnings).to.have.length(0);
      });

      it("returns a build that serializes to exactly the packet limit without a requote", async () => {
        buildOverrides = padding(AT_LIMIT);
        const { calls, result } = await swapInstructions();

        expect(sizeOf(result)).to.eq(PACKET_LIMIT);
        expect(calls).to.have.length(1);
        expect(maxBytesSent()).to.deep.eq([null]);
      });

      it("requotes a build one byte over the packet limit with its bare swap less the overshoot", async () => {
        buildAnswers = [over(1)];
        const { result } = await swapInstructions();

        // A bare swap of 1181 bytes, 1 byte over.
        expect(maxBytesSent()).to.deep.eq([null, "1180"]);
        expect(overLimitWarnings[0].size).to.eq(PACKET_LIMIT + 1);
        expect(sizeOf(result)).to.be.at.most(PACKET_LIMIT);
      });

      it("lowers the bare swap's size by the overshoot when the transaction is over the packet limit", async () => {
        buildAnswers = [{ ...OVER_WITH_SIGNATURE, outAmount: "778" }];
        const { result } = await swapInstructions();

        // A bare swap of 1207 bytes, 27 bytes over.
        expect(maxBytesSent()).to.deep.eq([null, "1180"]);
        expect(sizeOf(result)).to.be.at.most(PACKET_LIMIT);
        // The requote's answer is the one built.
        expect(result.transactions[0].metadata?.outputAmount).to.eq("777");
        expect(overLimitWarnings).to.deep.eq([
          { maxBytes: null, size: PACKET_LIMIT + 27, limit: PACKET_LIMIT },
        ]);
      });

      it("estimates the bare swap of a route through a lookup table against that table", async () => {
        buildAnswers = [
          {
            ...padding(AT_LIMIT + 10),
            swapInstruction: {
              programId: MEMO_PROGRAM,
              accounts: [
                { pubkey: ROUTE_ACCOUNT, isSigner: false, isWritable: true },
              ],
              data: "",
            },
            addressesByLookupTableAddress: { [LOOKUP_TABLE]: [ROUTE_ACCOUNT] },
          },
        ];
        await swapInstructions();

        // The bare swap holds ROUTE_ACCOUNT as a 1-byte index into the table
        // (a 36-byte lookup) and is 1194 bytes, 1246 with the compute budget
        // instructions. Counted without the table, ROUTE_ACCOUNT would be a
        // 32-byte static key and the bare swap 1191 bytes.
        expect(overLimitWarnings.map((w) => w.size)).to.deep.eq([1246]);
        expect(maxBytesSent()).to.deep.eq([null, "1180"]);
      });

      it("keeps the other parameters on a requote", async () => {
        buildAnswers = [OVER_WITH_SIGNATURE];
        const { calls } = await swapInstructions({
          excludeDexes: "Foo",
          destinationTokenAccount: ROUTE_ACCOUNT,
        });

        expect(calls).to.have.length(2);
        const [first, second] = calls.map((c) =>
          Object.fromEntries(c.url.searchParams)
        );
        const { maxBytes, ...rest } = second;
        expect(maxBytes).to.eq("1180");
        expect(rest).to.deep.eq(first);
      });

      it("requotes a route whose message alone does not fit a packet by its counted size", async () => {
        buildAnswers = [OVER_AS_MESSAGE];
        const { result } = await swapInstructions();

        // A bare swap of 1707 bytes is over the first budget of 1232, so the
        // budget is lowered by the 527-byte overshoot.
        expect(maxBytesSent()).to.deep.eq([null, "705"]);
        expect(overLimitWarnings[0].size).to.eq(PACKET_LIMIT + 527);
        expect(sizeOf(result)).to.be.at.most(PACKET_LIMIT);
      });

      it("caps each requote's maxBytes at the previous one and stops at the first build that fits", async () => {
        // The requote at 1180 answers a route with a bare swap of 1200 bytes,
        // so the next budget is 1180 less the 20-byte overshoot.
        buildAnswers = [over(10), over(20)];
        await swapInstructions();

        expect(maxBytesSent()).to.deep.eq([null, "1180", "1160"]);
        expect(overLimitWarnings.map((w) => w.maxBytes)).to.deep.eq([
          null,
          1180,
        ]);
      });

      for (const [name, B0, sizes] of [
        // Transactions 7 and 17 bytes over the limit.
        ["bare 1187", 1187, [1239]],
        ["bare 1197", 1197, [1249]],
      ] as const) {
        it(`fits in one requote a route Jupiter keeps while it fits the budget (${name})`, async () => {
          buildForMaxBytes = jupiterWithin(B0);
          const { result } = await swapInstructions();

          expect(maxBytesSent()).to.deep.eq([null, "1180"]);
          expect(overLimitWarnings.map((w) => w.size)).to.deep.eq(sizes);
          expect(sizeOf(result)).to.eq(PACKET_LIMIT);
        });
      }

      for (const [B0, sent, sizes] of [
        [1180, [null, "1180", "1173"], [1239, 1239]],
        [1190, [null, "1180", "1173"], [1249, 1239]],
      ] as const) {
        it(`fits in two requotes a route whose bare swap Jupiter counts 7 bytes under the estimate (Jupiter's bare ${B0})`, async () => {
          // Jupiter counts a padded route's bare swap as the padding plus 200
          // bytes, so the server adds 59 bytes to Jupiter's count and a bare
          // swap fits at a maxBytes of 1173.
          buildForMaxBytes = jupiterWithin(B0, 200);
          const { result } = await swapInstructions();

          expect(maxBytesSent()).to.deep.eq(sent);
          expect(overLimitWarnings.map((w) => w.size)).to.deep.eq(sizes);
          expect(sizeOf(result)).to.eq(PACKET_LIMIT);
        });
      }

      for (const [name, overrides, sent, size] of [
        // 300 bytes over is a message alone past the limit (the signature
        // slot and its count are 65 bytes) that still leaves three requotes
        // a budget of 1 or more. Its bare swap of 1480 bytes is over every
        // budget, so each budget is the previous one less 300.
        ["its message alone", over(300), [null, "932", "632", "332"], 1532],
        // Its bare swap of 1207 bytes caps the first budget, then each budget
        // is the previous one less 27.
        [
          "its signature slot",
          OVER_WITH_SIGNATURE,
          [null, "1180", "1153", "1126"],
          1259,
        ],
      ] as const) {
        it(`refuses with TRANSACTION_TOO_LARGE after ${SIZE_REQUOTES} requotes when the build stays over the limit through ${name}`, async () => {
          buildOverrides = overrides;
          const quoteResponse = await quote();
          jupiterCalls = [];
          rpcMethods = [];
          const error = await rejection({
            quoteResponse,
            userPublicKey: WALLET,
          });

          expect(error.code).to.eq("TRANSACTION_TOO_LARGE");
          expect(error.message).to.eq(TOO_LARGE_MESSAGE);
          expect(maxBytesSent()).to.deep.eq(sent);
          expect(overLimitWarnings).to.have.length(SIZE_REQUOTES);
          // The last build, refused, is logged with its size.
          expect(refusalWarnings).to.deep.eq([
            { maxBytes: Number(sent[3]), size, limit: PACKET_LIMIT },
          ]);
          // Nothing past the build is spent on a refused route.
          expect(rpcMethods).to.not.include("getBalance");
        });
      }

      it("refuses without asking /build when the next maxBytes would be below 1", async () => {
        // 1232 bytes over leaves a budget of 0.
        buildOverrides = over(PACKET_LIMIT);
        const quoteResponse = await quote();
        jupiterCalls = [];
        const error = await rejection({ quoteResponse, userPublicKey: WALLET });

        expect(error.code).to.eq("TRANSACTION_TOO_LARGE");
        expect(maxBytesSent()).to.deep.eq([null]);
      });

      it("requotes when the next maxBytes is exactly 1", async () => {
        buildAnswers = [over(PACKET_LIMIT - 1)];
        await swapInstructions();

        expect(maxBytesSent()).to.deep.eq([null, "1"]);
      });

      it("refuses with TRANSACTION_TOO_LARGE when a requote finds no route within its maxBytes", async () => {
        const quoteResponse = await quote();
        jupiterCalls = [];
        buildAnswers = [
          OVER_WITH_SIGNATURE,
          new BuildReply(400, { error: "No routes found" }),
        ];
        const error = await rejection({ quoteResponse, userPublicKey: WALLET });

        expect(error.code).to.eq("TRANSACTION_TOO_LARGE");
        expect(error.message).to.eq(TOO_LARGE_MESSAGE);
        expect(maxBytesSent()).to.deep.eq([null, "1180"]);
      });

      it("answers no route on the first build as BAD_REQUEST", async () => {
        const quoteResponse = await quote();
        jupiterCalls = [];
        buildAnswers = [new BuildReply(400, { error: "No routes found" })];
        const error = await rejection({ quoteResponse, userPublicKey: WALLET });

        expect(error.code).to.eq("BAD_REQUEST");
        expect(error.message).to.eq("No route found for this swap");
      });

      it("keeps a requote's other refusals as they are", async () => {
        const quoteResponse = await quote();
        jupiterCalls = [];
        buildAnswers = [
          OVER_WITH_SIGNATURE,
          new BuildReply(400, { errorCode: "TOKEN_NOT_TRADABLE" }),
        ];
        const error = await rejection({ quoteResponse, userPublicKey: WALLET });

        expect(error.code).to.eq("BAD_REQUEST");
        expect(error.message).to.eq("Token is not tradable");
      });

      it("holds the minimum-output check on every requote and bounds the calls at 8", async () => {
        const quoteResponse = {
          ...(await quote()),
          otherAmountThreshold: "951",
        };
        jupiterCalls = [];
        // Each build gets a below-minimum answer, then one at the narrower
        // slippage that clears it, both over the limit.
        buildAnswers = Array.from({ length: SIZE_REQUOTES + 1 }, () => [
          {
            ...OVER_WITH_SIGNATURE,
            outAmount: "1003",
            otherAmountThreshold: "900",
          },
          {
            ...OVER_WITH_SIGNATURE,
            outAmount: "1002",
            otherAmountThreshold: "951",
          },
        ]).flat();
        const error = await rejection({ quoteResponse, userPublicKey: WALLET });

        expect(error.code).to.eq("TRANSACTION_TOO_LARGE");
        expect(buildCalls()).to.have.length(8);
        expect(
          buildCalls().map((c) => [
            c.url.searchParams.get("maxBytes"),
            c.url.searchParams.get("slippageBps"),
          ])
        ).to.deep.eq([
          [null, "50"],
          [null, "518"],
          ["1180", "50"],
          ["1180", "518"],
          ["1153", "50"],
          ["1153", "518"],
          ["1126", "50"],
          ["1126", "518"],
        ]);
      });

      it("refuses a requote whose output falls below the quote's minimum as too large", async () => {
        const quoteResponse = {
          ...(await quote()),
          otherAmountThreshold: "773",
        };
        jupiterCalls = [];
        buildAnswers = [
          OVER_WITH_SIGNATURE,
          { otherAmountThreshold: "700", outAmount: "700" },
        ];
        const error = await rejection({ quoteResponse, userPublicKey: WALLET });

        // The quote is current: only the routes that fit pay out less, and a
        // fresh quote would find the same oversized route.
        expect(error.code).to.eq("TRANSACTION_TOO_LARGE");
        expect(error.message).to.eq(TOO_LARGE_MESSAGE);
        expect(maxBytesSent()).to.deep.eq([null, "1180"]);
      });

      it("refuses a first build whose output falls below the quote's minimum as an expired quote", async () => {
        const quoteResponse = {
          ...(await quote()),
          otherAmountThreshold: "773",
        };
        jupiterCalls = [];
        buildAnswers = [{ otherAmountThreshold: "700", outAmount: "700" }];
        const error = await rejection({ quoteResponse, userPublicKey: WALLET });

        expect(error.code).to.eq("BAD_REQUEST");
        expect(error.message).to.match(/^Quote expired: /);
        expect(maxBytesSent()).to.deep.eq([null]);
      });
    });
  });
});
