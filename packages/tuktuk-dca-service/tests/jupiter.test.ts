import assert from "node:assert/strict";
import { Keypair } from "@solana/web3.js";
import {
  buildJupiterSwap,
  buildSwapUrl,
  BuildSwapRequest,
  DCA_SWAP_MAX_BYTES,
  readBuildResponse,
} from "../src/jupiter";

const key = () => Keypair.generate().publicKey.toBase58();

const INPUT_MINT = key();
const OUTPUT_MINT = key();
const TAKER = key();
const DESTINATION = key();
const SWAP_PROGRAM = key();
const SETUP_PROGRAM = key();
const CLEANUP_PROGRAM = key();
const COMPUTE_BUDGET = "ComputeBudget111111111111111111111111111111";
const TABLE_A = key();
const TABLE_B = key();

const REQUEST: BuildSwapRequest = {
  apiUrl: "https://jupiter.test",
  inputMint: INPUT_MINT,
  outputMint: OUTPUT_MINT,
  amount: "1000000",
  taker: TAKER,
  destinationTokenAccount: DESTINATION,
  slippageBps: 50,
};

const EXPECTED = {
  inputMint: INPUT_MINT,
  outputMint: OUTPUT_MINT,
  amount: "1000000",
};

const instruction = (programId: string, data = "AQI=") => ({
  programId,
  accounts: [{ pubkey: TAKER, isSigner: true, isWritable: false }],
  data,
});

const buildBody = (overrides: Record<string, unknown> = {}) => ({
  inputMint: INPUT_MINT,
  outputMint: OUTPUT_MINT,
  inAmount: "1000000",
  outAmount: "421658023",
  otherAmountThreshold: "419549733",
  routePlan: [{ swapInfo: { label: "Raydium CP" } }],
  computeBudgetInstructions: [instruction(COMPUTE_BUDGET, "A4w2AAAAAAAA")],
  setupInstructions: [instruction(SETUP_PROGRAM)],
  swapInstruction: instruction(SWAP_PROGRAM, "u2T6zA=="),
  cleanupInstruction: null,
  otherInstructions: [],
  tipInstruction: null,
  addressesByLookupTableAddress: { [TABLE_A]: [key()], [TABLE_B]: [key()] },
  ...overrides,
});

describe("tuktuk-dca-service Jupiter /build", () => {
  describe("buildSwapUrl", () => {
    it("asks /swap/v2/build for the order with the swap payer as taker and a byte budget", () => {
      const url = buildSwapUrl(REQUEST);
      assert.equal(
        url.origin + url.pathname,
        "https://jupiter.test/swap/v2/build"
      );
      assert.deepEqual(Object.fromEntries(url.searchParams), {
        inputMint: INPUT_MINT,
        outputMint: OUTPUT_MINT,
        amount: "1000000",
        taker: TAKER,
        slippageBps: "50",
        destinationTokenAccount: DESTINATION,
        maxBytes: String(DCA_SWAP_MAX_BYTES),
      });
    });

    it("budgets the bare swap at 540 bytes", () => {
      assert.equal(DCA_SWAP_MAX_BYTES, 540);
    });
  });

  describe("readBuildResponse", () => {
    it("returns setup, swap and cleanup in order, without compute budget instructions", () => {
      const built = readBuildResponse(
        buildBody({ cleanupInstruction: instruction(CLEANUP_PROGRAM) }),
        EXPECTED
      );
      assert.deepEqual(
        built.instructions.map((ix) => ix.programId.toBase58()),
        [SETUP_PROGRAM, SWAP_PROGRAM, CLEANUP_PROGRAM]
      );
      assert.deepEqual(
        [...built.instructions[1].data],
        [...Buffer.from("u2T6zA==", "base64")]
      );
      assert.deepEqual(
        built.instructions[1].keys.map((k) => ({
          pubkey: k.pubkey.toBase58(),
          isSigner: k.isSigner,
          isWritable: k.isWritable,
        })),
        [{ pubkey: TAKER, isSigner: true, isWritable: false }]
      );
    });

    it("runs no cleanup when /build returns none", () => {
      const built = readBuildResponse(buildBody(), EXPECTED);
      assert.deepEqual(
        built.instructions.map((ix) => ix.programId.toBase58()),
        [SETUP_PROGRAM, SWAP_PROGRAM]
      );
    });

    it("reads absent or null instruction lists as empty", () => {
      const built = readBuildResponse(
        buildBody({ setupInstructions: undefined, otherInstructions: null }),
        EXPECTED
      );
      assert.deepEqual(
        built.instructions.map((ix) => ix.programId.toBase58()),
        [SWAP_PROGRAM]
      );
    });

    it("names the lookup tables by key", () => {
      const built = readBuildResponse(buildBody(), EXPECTED);
      assert.deepEqual(built.lookupTables, [TABLE_A, TABLE_B]);
      assert.deepEqual(
        readBuildResponse(
          buildBody({ addressesByLookupTableAddress: null }),
          EXPECTED
        ).lookupTables,
        []
      );
    });

    it("carries the amounts and route for the log", () => {
      const built = readBuildResponse(buildBody(), EXPECTED);
      assert.equal(built.outAmount, "421658023");
      assert.equal(built.otherAmountThreshold, "419549733");
      assert.deepEqual(built.routeLabels, ["Raydium CP"]);
    });

    it("refuses otherInstructions", () => {
      assert.throws(
        () =>
          readBuildResponse(
            buildBody({ otherInstructions: [instruction(SWAP_PROGRAM)] }),
            EXPECTED
          ),
        /1 otherInstructions/
      );
    });

    it("refuses an error body", () => {
      assert.throws(
        () => readBuildResponse({ error: "No routes found" }, EXPECTED),
        /returned error: No routes found/
      );
    });

    for (const [field, value] of [
      ["inputMint", key()],
      ["outputMint", key()],
      ["inAmount", "999999"],
    ] as const) {
      it(`refuses a swap whose ${field} differs from the request`, () => {
        assert.throws(
          () => readBuildResponse(buildBody({ [field]: value }), EXPECTED),
          /not the requested/
        );
      });
    }

    for (const [field, value] of [
      ["swapInstruction", undefined],
      ["swapInstruction", { programId: SWAP_PROGRAM, data: "AA==" }],
      ["outAmount", "1.5"],
      ["inAmount", 1000000],
      ["routePlan", undefined],
      ["setupInstructions", {}],
      ["addressesByLookupTableAddress", []],
    ] as const) {
      it(`refuses a response whose ${field} is ${JSON.stringify(value)}`, () => {
        assert.throws(
          () => readBuildResponse(buildBody({ [field]: value }), EXPECTED),
          new RegExp(`Invalid Jupiter /build response: ${field}`)
        );
      });
    }

    it("refuses an instruction account without its flags", () => {
      assert.throws(
        () =>
          readBuildResponse(
            buildBody({
              swapInstruction: {
                programId: SWAP_PROGRAM,
                accounts: [{ pubkey: TAKER }],
                data: "AA==",
              },
            }),
            EXPECTED
          ),
        /Invalid Jupiter \/build response: swapInstruction.accounts/
      );
    });
  });

  describe("buildJupiterSwap", () => {
    it("sends the API key when one is set and reads the answer", async () => {
      const calls: { url: string; headers: unknown }[] = [];
      const fetchImpl = (async (url: string, init?: RequestInit) => {
        calls.push({ url, headers: init?.headers });
        return new Response(JSON.stringify(buildBody()), { status: 200 });
      }) as typeof fetch;
      const built = await buildJupiterSwap(
        { ...REQUEST, apiKey: "test-key" },
        fetchImpl
      );
      assert.equal(calls.length, 1);
      assert.equal(calls[0].url, buildSwapUrl(REQUEST).toString());
      assert.deepEqual(calls[0].headers, { "x-api-key": "test-key" });
      assert.equal(built.instructions.length, 2);
    });

    it("sends no API key header when none is set", async () => {
      let headers: unknown;
      const fetchImpl = (async (_url: string, init?: RequestInit) => {
        headers = init?.headers;
        return new Response(JSON.stringify(buildBody()), { status: 200 });
      }) as typeof fetch;
      await buildJupiterSwap(REQUEST, fetchImpl);
      assert.deepEqual(headers, {});
    });

    it("refuses a failed request", async () => {
      const fetchImpl = (async () =>
        new Response("No routes found", {
          status: 400,
          statusText: "Bad Request",
        })) as typeof fetch;
      await assert.rejects(
        buildJupiterSwap(REQUEST, fetchImpl),
        /Jupiter \/build error: 400 Bad Request/
      );
    });
  });
});
