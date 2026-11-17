import assert from "node:assert/strict";
import {
  ComputeBudgetProgram,
  Keypair,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  buildJupiterSwap,
  BuildSwapRequest,
  buildSwapUrl,
  COMPUTE_UNIT_LIMIT,
  FUND_FEES_MAX_ACCOUNTS,
  FUND_FEES_MAX_BYTES,
  planComputeBudget,
  readBuildResponse,
} from "../src/build";

const key = () => Keypair.generate().publicKey.toBase58();

const INPUT_MINT = key();
const OUTPUT_MINT = key();
const TAKER = key();
const FEE_ACCOUNT = key();
const SWAP_PROGRAM = key();
const SETUP_PROGRAM = key();
const CLEANUP_PROGRAM = key();
const TABLE_A = key();
const TABLE_B = key();

const budgetData = (ix: TransactionInstruction) => ({
  programId: ix.programId.toBase58(),
  accounts: [],
  data: Buffer.from(ix.data).toString("base64"),
});
const PRICE_IX = ComputeBudgetProgram.setComputeUnitPrice({
  microLamports: 2000,
});
const LIMIT_IX = ComputeBudgetProgram.setComputeUnitLimit({ units: 300000 });

const REQUEST: BuildSwapRequest = {
  apiUrl: "https://jupiter.test",
  inputMint: INPUT_MINT,
  outputMint: OUTPUT_MINT,
  amount: "1000000",
  taker: TAKER,
  slippageBps: 100,
  platformFeeBps: 0,
  fitFundFeesTransaction: true,
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
  outAmount: "20015000",
  otherAmountThreshold: "19814850",
  routePlan: [{ swapInfo: { label: "Whirlpool" } }],
  computeBudgetInstructions: [budgetData(PRICE_IX)],
  setupInstructions: [instruction(SETUP_PROGRAM)],
  swapInstruction: instruction(SWAP_PROGRAM, "u2T6zA=="),
  cleanupInstruction: instruction(CLEANUP_PROGRAM),
  otherInstructions: [],
  tipInstruction: null,
  addressesByLookupTableAddress: { [TABLE_A]: [key()], [TABLE_B]: [key()] },
  ...overrides,
});

describe("tokens-to-rent-service Jupiter /build", () => {
  describe("buildSwapUrl", () => {
    it("asks /swap/v2/build for the swap, bounded to fit the fee-funding transaction", () => {
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
        slippageBps: "100",
        maxAccounts: String(FUND_FEES_MAX_ACCOUNTS),
        maxBytes: String(FUND_FEES_MAX_BYTES),
      });
    });

    it("leaves a price quote unbounded", () => {
      const url = buildSwapUrl({ ...REQUEST, fitFundFeesTransaction: false });
      assert.equal(url.searchParams.has("maxAccounts"), false);
      assert.equal(url.searchParams.has("maxBytes"), false);
    });

    it("sends the platform fee and its account together", () => {
      const url = buildSwapUrl({
        ...REQUEST,
        platformFeeBps: 50,
        feeAccount: FEE_ACCOUNT,
      });
      assert.equal(url.searchParams.get("platformFeeBps"), "50");
      assert.equal(url.searchParams.get("feeAccount"), FEE_ACCOUNT);
    });

    it("sends no fee when the fee is 0, even with a fee account", () => {
      const url = buildSwapUrl({ ...REQUEST, feeAccount: FEE_ACCOUNT });
      assert.equal(url.searchParams.has("platformFeeBps"), false);
      assert.equal(url.searchParams.has("feeAccount"), false);
    });

    it("refuses a platform fee without a fee account", () => {
      assert.throws(
        () => buildSwapUrl({ ...REQUEST, platformFeeBps: 50 }),
        /JUPITER_FEE_BPS is set without JUPITER_FEE_ACCOUNT/
      );
    });

    it("budgets the bare swap so the fee-funding transaction fits 1232 bytes", () => {
      assert.equal(FUND_FEES_MAX_BYTES, 950);
      assert.equal(FUND_FEES_MAX_ACCOUNTS, 20);
    });
  });

  describe("readBuildResponse", () => {
    it("returns the compute budget, setup, swap and cleanup instructions", () => {
      const built = readBuildResponse(buildBody(), EXPECTED);
      assert.deepEqual(
        built.computeBudgetInstructions.map((ix) => ix.programId.toBase58()),
        [PRICE_IX.programId.toBase58()]
      );
      assert.deepEqual(
        built.setupInstructions.map((ix) => ix.programId.toBase58()),
        [SETUP_PROGRAM]
      );
      assert.equal(built.swapInstruction.programId.toBase58(), SWAP_PROGRAM);
      assert.deepEqual(
        [...built.swapInstruction.data],
        [...Buffer.from("u2T6zA==", "base64")]
      );
      assert.deepEqual(
        built.swapInstruction.keys.map((k) => ({
          pubkey: k.pubkey.toBase58(),
          isSigner: k.isSigner,
          isWritable: k.isWritable,
        })),
        [{ pubkey: TAKER, isSigner: true, isWritable: false }]
      );
      assert.equal(
        built.cleanupInstruction?.programId.toBase58(),
        CLEANUP_PROGRAM
      );
    });

    it("has no cleanup when /build returns none", () => {
      const built = readBuildResponse(
        buildBody({ cleanupInstruction: null }),
        EXPECTED
      );
      assert.equal(built.cleanupInstruction, null);
      assert.equal(
        readBuildResponse(
          buildBody({ cleanupInstruction: undefined }),
          EXPECTED
        ).cleanupInstruction,
        null
      );
    });

    it("reads absent or null instruction lists as empty", () => {
      const built = readBuildResponse(
        buildBody({
          setupInstructions: undefined,
          computeBudgetInstructions: null,
          otherInstructions: null,
        }),
        EXPECTED
      );
      assert.deepEqual(built.setupInstructions, []);
      assert.deepEqual(built.computeBudgetInstructions, []);
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

    it("carries the out amount", () => {
      assert.equal(
        readBuildResponse(buildBody(), EXPECTED).outAmount,
        "20015000"
      );
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
      ["setupInstructions", {}],
      ["computeBudgetInstructions", {}],
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

    it("refuses a body that is not an object", () => {
      assert.throws(
        () => readBuildResponse(null, EXPECTED),
        /Invalid Jupiter \/build response: body/
      );
    });
  });

  describe("buildJupiterSwap", () => {
    it("requests the built URL and reads the answer", async () => {
      const calls: string[] = [];
      const fetchImpl = (async (url: string) => {
        calls.push(url);
        return new Response(JSON.stringify(buildBody()), { status: 200 });
      }) as typeof fetch;
      const built = await buildJupiterSwap(REQUEST, fetchImpl);
      assert.deepEqual(calls, [buildSwapUrl(REQUEST).toString()]);
      assert.equal(built.outAmount, "20015000");
    });

    it("refuses an answer for other mints than the request", async () => {
      const fetchImpl = (async () =>
        new Response(JSON.stringify(buildBody({ outputMint: key() })), {
          status: 200,
        })) as typeof fetch;
      await assert.rejects(
        buildJupiterSwap(REQUEST, fetchImpl),
        /not the requested/
      );
    });

    it("refuses a failed request", async () => {
      const fetchImpl = (async () =>
        new Response("No routes found", {
          status: 400,
          statusText: "Bad Request",
        })) as typeof fetch;
      await assert.rejects(
        buildJupiterSwap(REQUEST, fetchImpl),
        /Jupiter \/build error: 400 Bad Request: No routes found$/
      );
    });

    it("keeps the first 300 characters of a failed request's body", async () => {
      const body = "x".repeat(300) + "TRUNCATED";
      const fetchImpl = (async () =>
        new Response(body, {
          status: 500,
          statusText: "Server Error",
        })) as typeof fetch;
      await assert.rejects(
        buildJupiterSwap(REQUEST, fetchImpl),
        (error: Error) => {
          assert.equal(
            error.message,
            `Jupiter /build error: 500 Server Error: ${"x".repeat(300)}`
          );
          return true;
        }
      );
    });
  });

  describe("planComputeBudget", () => {
    it("adds the default unit limit when /build returns only a price", () => {
      const { instructions, fee } = planComputeBudget([PRICE_IX]);
      assert.equal(instructions.length, 2);
      assert.deepEqual(
        [...instructions[0].data],
        [
          ...ComputeBudgetProgram.setComputeUnitLimit({
            units: COMPUTE_UNIT_LIMIT,
          }).data,
        ]
      );
      assert.equal(instructions[1], PRICE_IX);
      // 10000 base + 1_400_000 units * 2000 micro-lamports
      assert.equal(fee, 10000 + 2800);
    });

    it("keeps a limit that /build returns and charges for it", () => {
      const { instructions, fee } = planComputeBudget([LIMIT_IX, PRICE_IX]);
      assert.deepEqual(instructions, [LIMIT_IX, PRICE_IX]);
      assert.equal(fee, 10000 + 600);
    });

    it("charges only the base fee when /build returns no price", () => {
      const { instructions, fee } = planComputeBudget([]);
      assert.equal(instructions.length, 1);
      assert.equal(fee, 10000);
    });

    it("rounds the priority fee up to a lamport", () => {
      const { fee } = planComputeBudget([
        ComputeBudgetProgram.setComputeUnitLimit({ units: 1 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 }),
      ]);
      assert.equal(fee, 10001);
    });

    it("refuses a fee above 0.01 SOL and accepts one of exactly 0.01 SOL", () => {
      const limit = ComputeBudgetProgram.setComputeUnitLimit({
        units: 1_000_000,
      });
      // 10000 base + 1_000_000 units * 9_990_000 micro-lamports = 10_000_000 lamports
      const { fee } = planComputeBudget([
        limit,
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 9_990_000 }),
      ]);
      assert.equal(fee, 10_000_000);
      assert.throws(
        () =>
          planComputeBudget([
            limit,
            ComputeBudgetProgram.setComputeUnitPrice({
              microLamports: 9_990_001,
            }),
          ]),
        /Priority fees are too high/
      );
    });
  });
});
