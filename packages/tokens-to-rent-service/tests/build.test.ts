import assert from "node:assert/strict";
import {
  ComputeBudgetInstruction,
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  buildJupiterSwap,
  BuildSwapRequest,
  buildSwapUrl,
  COMPUTE_UNIT_LIMIT,
  estimateRequest,
  FEE_LAMPORTS,
  FUND_FEES_MAX_ACCOUNTS,
  FUND_FEES_MAX_BYTES,
  fundFeesRequest,
  planComputeBudget,
  readBuildResponse,
  refuseExtraAccountCreations,
  SLIPPAGE_BPS,
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

    it("pins the byte and account budgets of the fee-funding swap", () => {
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

  describe("estimateRequest and fundFeesRequest", () => {
    const WSOL = "So11111111111111111111111111111111111111112";
    const PLATFORM = key();
    const USER = key();
    const wiring = {
      apiUrl: "https://jupiter.test",
      mint: INPUT_MINT,
      platformFeeBps: 50,
      feeAccount: FEE_ACCOUNT,
    };

    it("prices SOL into the token for the platform wallet, unbounded", () => {
      const request = estimateRequest({
        ...wiring,
        solAmount: "20015000",
        platformWallet: PLATFORM,
      });
      assert.deepEqual(request, {
        apiUrl: "https://jupiter.test",
        amount: "20015000",
        inputMint: WSOL,
        outputMint: INPUT_MINT,
        taker: PLATFORM,
        slippageBps: SLIPPAGE_BPS,
        platformFeeBps: 50,
        feeAccount: FEE_ACCOUNT,
        fitFundFeesTransaction: false,
      });
    });

    it("builds the token into SOL for the user, bounded to fit the transaction", () => {
      const request = fundFeesRequest({
        ...wiring,
        inputAmount: "123456",
        userWallet: USER,
      });
      assert.deepEqual(request, {
        apiUrl: "https://jupiter.test",
        amount: "123456",
        inputMint: INPUT_MINT,
        outputMint: WSOL,
        taker: USER,
        slippageBps: SLIPPAGE_BPS,
        platformFeeBps: 50,
        feeAccount: FEE_ACCOUNT,
        fitFundFeesTransaction: true,
      });
      const url = buildSwapUrl(request);
      assert.equal(
        url.searchParams.get("maxBytes"),
        String(FUND_FEES_MAX_BYTES)
      );
      assert.equal(url.searchParams.get("taker"), USER);
    });

    it("passes no fee account through when none is set", () => {
      const request = fundFeesRequest({
        apiUrl: "https://jupiter.test",
        mint: INPUT_MINT,
        inputAmount: "1",
        userWallet: USER,
        platformFeeBps: 0,
      });
      assert.equal(request.feeAccount, undefined);
      assert.equal(buildSwapUrl(request).searchParams.has("feeAccount"), false);
    });
  });

  describe("refuseExtraAccountCreations", () => {
    const ATA_PROGRAM = new PublicKey(
      "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
    );
    const TOKEN_PROGRAM = new PublicKey(
      "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    );
    const WSOL = new PublicKey("So11111111111111111111111111111111111111112");
    const USER = Keypair.generate().publicKey;
    const ataOf = (owner: PublicKey, mint: PublicKey) =>
      PublicKey.findProgramAddressSync(
        [owner.toBuffer(), TOKEN_PROGRAM.toBuffer(), mint.toBuffer()],
        ATA_PROGRAM
      )[0];

    /** An associated token program instruction creating `account`, with `data` as its data. */
    const create = (
      account: PublicKey,
      mint: PublicKey,
      data: number[] = [1],
      owner: PublicKey = USER
    ) =>
      new TransactionInstruction({
        programId: ATA_PROGRAM,
        keys: [
          USER,
          account,
          owner,
          mint,
          SystemProgram.programId,
          TOKEN_PROGRAM,
        ].map((pubkey) => ({ pubkey, isSigner: false, isWritable: true })),
        data: Buffer.from(data),
      });
    const wsolCreate = (data?: number[]) =>
      create(ataOf(USER, WSOL), WSOL, data);
    const other = Keypair.generate().publicKey;
    const run = (ixs: TransactionInstruction[]) =>
      refuseExtraAccountCreations(ixs, USER.toBase58());

    it("accepts a setup without a create", () => {
      run([]);
    });

    it("accepts the taker's wrapped SOL account, created idempotently or not", () => {
      run([wsolCreate([1])]);
      run([wsolCreate([0])]);
      run([wsolCreate([])]);
    });

    it("refuses an intermediate token account beside the wrapped SOL one", () => {
      assert.throws(
        () => run([wsolCreate(), create(ataOf(USER, other), other)]),
        /creates a token account besides the wrapped SOL account/
      );
    });

    it("refuses a create of another account for the wrapped SOL mint", () => {
      assert.throws(
        () => run([create(ataOf(other, WSOL), WSOL, [1], other)]),
        /creates a token account besides/
      );
    });

    it("refuses a create with too few accounts", () => {
      const ix = wsolCreate();
      ix.keys = ix.keys.slice(0, 1);
      assert.throws(() => run([ix]), /creates a token account besides/);
    });

    it("ignores RecoverNested and instructions of other programs", () => {
      run([
        create(ataOf(USER, other), other, [2]),
        new TransactionInstruction({
          programId: SystemProgram.programId,
          keys: [],
          data: Buffer.from([0]),
        }),
      ]);
    });
  });

  describe("planComputeBudget", () => {
    it("adds the default unit limit and drops the unit price /build returns", () => {
      const { instructions, fee } = planComputeBudget([PRICE_IX]);
      assert.equal(instructions.length, 1);
      assert.deepEqual(
        [...instructions[0].data],
        [
          ...ComputeBudgetProgram.setComputeUnitLimit({
            units: COMPUTE_UNIT_LIMIT,
          }).data,
        ]
      );
      assert.equal(fee, FEE_LAMPORTS);
    });

    it("charges the flat fee however high the price /build returns", () => {
      const { instructions, fee } = planComputeBudget([
        ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: 50_000_000,
        }),
      ]);
      assert.equal(fee, 10000);
      assert.equal(
        instructions.some(
          (ix) =>
            ComputeBudgetInstruction.decodeInstructionType(ix) ===
            "SetComputeUnitPrice"
        ),
        false
      );
    });

    it("keeps a limit that /build returns and drops the price beside it", () => {
      const { instructions, fee } = planComputeBudget([LIMIT_IX, PRICE_IX]);
      assert.deepEqual(instructions, [LIMIT_IX]);
      assert.equal(fee, 10000);
    });

    it("adds only the limit when /build returns nothing", () => {
      const { instructions, fee } = planComputeBudget([]);
      assert.equal(instructions.length, 1);
      assert.equal(fee, 10000);
    });
  });
});
