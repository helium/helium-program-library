import assert from "node:assert/strict";
import {
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { IOT_MINT } from "@helium/spl-utils";
import {
  buildFundFeesSwap,
  buildJupiterSwap,
  BuildSwapRequest,
  buildSwapUrl,
  computeUnitLimit,
  ESTIMATE_LAMPORTS,
  estimateBySale,
  estimateRequest,
  FUND_FEES_MAX_ACCOUNTS,
  FUND_FEES_MAX_BYTES,
  fundFeesRequest,
  MAX_COMPUTE_UNIT_LIMIT,
  MIN_FUND_FEES_OUT_LAMPORTS,
  planComputeBudget,
  readBuildResponse,
  refuseExtraAccountCreations,
  refuseOversizedTransaction,
  refusePlatformKey,
  refusePlatformUser,
  repayLamports,
  RFQ_V2_LABEL,
  SLIPPAGE_BPS,
} from "../src/build";

const key = () => Keypair.generate().publicKey.toBase58();

const INPUT_MINT = key();
const OUTPUT_MINT = key();
const TAKER = key();
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

const REQUEST: BuildSwapRequest = {
  apiUrl: "https://jupiter.test",
  inputMint: INPUT_MINT,
  outputMint: OUTPUT_MINT,
  amount: "1000000",
  taker: TAKER,
  slippageBps: 100,
  routeBound: "fundFees",
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
        excludeDexes: RFQ_V2_LABEL,
        maxAccounts: String(FUND_FEES_MAX_ACCOUNTS),
        maxBytes: String(FUND_FEES_MAX_BYTES),
      });
    });

    it("leaves a price quote unbounded", () => {
      const url = buildSwapUrl({ ...REQUEST, routeBound: "quote" });
      assert.equal(url.searchParams.has("maxAccounts"), false);
      assert.equal(url.searchParams.has("maxBytes"), false);
    });

    it("excludes RFQ v2 from a price quote too", () => {
      const url = buildSwapUrl({ ...REQUEST, routeBound: "quote" });
      assert.equal(url.searchParams.get("excludeDexes"), RFQ_V2_LABEL);
    });

    it("bounds an IOT fee-funding swap by accounts only", () => {
      const url = buildSwapUrl({
        ...REQUEST,
        routeBound: "fundFeesAccountsOnly",
      });
      assert.equal(
        url.searchParams.get("maxAccounts"),
        String(FUND_FEES_MAX_ACCOUNTS)
      );
      assert.equal(url.searchParams.has("maxBytes"), false);
    });

    it("sends no platform fee", () => {
      const url = buildSwapUrl(REQUEST);
      assert.equal(url.searchParams.has("platformFeeBps"), false);
      assert.equal(url.searchParams.has("feeAccount"), false);
    });
  });

  describe("readBuildResponse", () => {
    it("returns the setup, swap and cleanup instructions and drops the compute budget", () => {
      const built = readBuildResponse(buildBody(), EXPECTED);
      assert.equal("computeBudgetInstructions" in built, false);
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
          otherInstructions: null,
        }),
        EXPECTED
      );
      assert.deepEqual(built.setupInstructions, []);
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

    it("refuses a route through RFQ v2", () => {
      assert.throws(
        () =>
          readBuildResponse(
            buildBody({
              routePlan: [
                { swapInfo: { label: "Whirlpool" } },
                { swapInfo: { label: RFQ_V2_LABEL } },
              ],
            }),
            EXPECTED
          ),
        /route through JupiterRfqV2/
      );
    });

    it("refuses a hop without a string label", () => {
      assert.throws(
        () =>
          readBuildResponse(
            buildBody({ routePlan: [{ swapInfo: { label: 1 } }] }),
            EXPECTED
          ),
        /Invalid Jupiter \/build response: routePlan/
      );
    });

    it("refuses an answer without a route plan", () => {
      assert.throws(
        () => readBuildResponse(buildBody({ routePlan: undefined }), EXPECTED),
        /Invalid Jupiter \/build response: routePlan/
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
      const calls: unknown[] = [];
      const fetchImpl = (async (url: string, init?: RequestInit) => {
        calls.push([url, init]);
        return new Response(JSON.stringify(buildBody()), { status: 200 });
      }) as typeof fetch;
      const built = await buildJupiterSwap(REQUEST, fetchImpl);
      assert.deepEqual(calls, [
        [buildSwapUrl(REQUEST).toString(), { headers: {} }],
      ]);
      assert.equal(built.outAmount, "20015000");
    });

    it("sends the API key as x-api-key", async () => {
      const headers: unknown[] = [];
      const fetchImpl = (async (_url: string, init?: RequestInit) => {
        headers.push(init?.headers);
        return new Response(JSON.stringify(buildBody()), { status: 200 });
      }) as typeof fetch;
      await buildJupiterSwap({ ...REQUEST, apiKey: "secret" }, fetchImpl);
      assert.deepEqual(headers, [{ "x-api-key": "secret" }]);
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
      apiKey: "secret",
      mint: INPUT_MINT,
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
        apiKey: "secret",
        slippageBps: SLIPPAGE_BPS,
        routeBound: "quote",
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
        apiKey: "secret",
        slippageBps: SLIPPAGE_BPS,
        routeBound: "fundFees",
      });
      const url = buildSwapUrl(request);
      assert.equal(
        url.searchParams.get("maxBytes"),
        String(FUND_FEES_MAX_BYTES)
      );
      assert.equal(url.searchParams.get("taker"), USER);
    });

    it("builds IOT into SOL bounded by accounts only", () => {
      const request = fundFeesRequest({
        ...wiring,
        mint: IOT_MINT.toBase58(),
        inputAmount: "123456",
        userWallet: USER,
      });
      assert.equal(request.routeBound, "fundFeesAccountsOnly");
    });
  });

  describe("refuseOversizedTransaction", () => {
    const PAYER = Keypair.generate().publicKey;
    const transactionNaming = (accounts: number) =>
      new VersionedTransaction(
        new TransactionMessage({
          payerKey: PAYER,
          recentBlockhash: PublicKey.default.toBase58(),
          instructions: [
            new TransactionInstruction({
              programId: new PublicKey(SWAP_PROGRAM),
              keys: Array.from({ length: accounts }, () => ({
                pubkey: Keypair.generate().publicKey,
                isSigner: false,
                isWritable: true,
              })),
              data: Buffer.alloc(0),
            }),
          ],
        }).compileToV0Message()
      );

    it("accepts a transaction within 1232 bytes", () => {
      // 32 unique accounts serialize to 1227 bytes.
      refuseOversizedTransaction(transactionNaming(32));
    });

    it("refuses a transaction just over 1232 bytes", () => {
      // 33 unique accounts serialize to 1260 bytes.
      assert.throws(
        () => refuseOversizedTransaction(transactionNaming(33)),
        /over Solana's 1232-byte limit/
      );
    });

    it("refuses a transaction too large to serialize", () => {
      assert.throws(
        () => refuseOversizedTransaction(transactionNaming(80)),
        /over Solana's 1232-byte limit/
      );
    });
  });

  describe("estimateBySale", () => {
    const WSOL = "So11111111111111111111111111111111111111112";
    const IOT = IOT_MINT.toBase58();
    const PLATFORM = key();
    const PARAMS = {
      apiUrl: "https://jupiter.test",
      apiKey: "secret",
      mint: IOT,
      probeAmount: "43000000000",
      platformWallet: PLATFORM,
    };
    /** Answers each sale with `outFor(amount)` lamports and records the amounts. */
    const selling = (outFor: (amount: bigint) => bigint, amounts: string[]) =>
      (async (url: string) => {
        const amount = new URL(url).searchParams.get("amount")!;
        amounts.push(amount);
        return new Response(
          JSON.stringify(
            buildBody({
              inputMint: IOT,
              outputMint: WSOL,
              inAmount: amount,
              outAmount: outFor(BigInt(amount)).toString(),
            })
          ),
          { status: 200 }
        );
      }) as typeof fetch;

    it("scales the probe to 0.020015 SOL, rounded up, and verifies it on the IOT fee-funding route", async () => {
      const amounts: string[] = [];
      const urls: string[] = [];
      const fetchImpl = selling((amount) => amount / 2150n, amounts);
      const estimate = await estimateBySale(PARAMS, (async (
        url: string,
        init?: RequestInit
      ) => {
        urls.push(url);
        return fetchImpl(url, init);
      }) as typeof fetch);
      // 43e9 / 2150 = 20,000,000 lamports; 43e9 * 20,015,000 / 20,000,000 = 43,032,250,000.
      assert.deepEqual(amounts, ["43000000000", "43032250000"]);
      assert.equal(estimate, "43032250000");
      for (const url of urls.map((u) => new URL(u))) {
        assert.equal(url.searchParams.get("inputMint"), IOT);
        assert.equal(url.searchParams.get("outputMint"), WSOL);
        assert.equal(url.searchParams.get("taker"), PLATFORM);
        assert.equal(url.searchParams.has("maxBytes"), false);
        assert.equal(
          url.searchParams.get("maxAccounts"),
          String(FUND_FEES_MAX_ACCOUNTS)
        );
      }
    });

    it("rounds the scaled amount up", async () => {
      const amounts: string[] = [];
      // The probe pays 3 lamports for 7 IOT units: 20,015,000 * 7 / 3 = 46,701,666.67.
      const estimate = await estimateBySale(
        { ...PARAMS, probeAmount: "7" },
        selling(
          (amount) => (amount === 7n ? 3n : BigInt(ESTIMATE_LAMPORTS)),
          amounts
        )
      );
      assert.equal(estimate, "46701667");
    });

    it("scales once more from a verify that pays out less than 0.020015 SOL", async () => {
      const amounts: string[] = [];
      // The probe prices 2 units per lamport; the verify pays out 20,000,000.
      const estimate = await estimateBySale(
        { ...PARAMS, probeAmount: "200" },
        selling((amount) => (amount === 200n ? 100n : 20_000_000n), amounts)
      );
      assert.deepEqual(amounts, ["200", "40030000"]);
      // 40,030,000 * 20,015,000 / 20,000,000 = 40,060,022.5, rounded up.
      assert.equal(estimate, "40060023");
    });

    it("refuses a verify that pays out more than 105% of 0.020015 SOL", async () => {
      await assert.rejects(
        estimateBySale(
          { ...PARAMS, probeAmount: "200" },
          selling((amount) => (amount === 200n ? 100n : 21_015_751n), [])
        ),
        /over 105%/
      );
    });

    it("accepts a verify at exactly 105% of 0.020015 SOL", async () => {
      const estimate = await estimateBySale(
        { ...PARAMS, probeAmount: "200" },
        selling((amount) => (amount === 200n ? 100n : 21_015_750n), [])
      );
      assert.equal(estimate, "40030000");
    });

    it("refuses a probe priced at 0 SOL", async () => {
      await assert.rejects(
        estimateBySale(
          PARAMS,
          selling(() => 0n, [])
        ),
        /priced the sale at 0 SOL/
      );
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

  describe("refusePlatformKey", () => {
    const PLATFORM = Keypair.generate().publicKey;
    const ix = (pubkey: PublicKey, isSigner: boolean) =>
      new TransactionInstruction({
        programId: SystemProgram.programId,
        keys: [{ pubkey, isSigner, isWritable: true }],
        data: Buffer.alloc(0),
      });
    const other = () => ix(Keypair.generate().publicKey, true);

    it("refuses an instruction that needs the platform key's signature, in any position", () => {
      for (const position of [0, 1, 2]) {
        const instructions = [other(), other(), other()];
        instructions[position] = ix(PLATFORM, true);
        assert.throws(
          () => refusePlatformKey(instructions, PLATFORM.toBase58()),
          /platform wallet's signature/
        );
      }
    });

    it("refuses the platform key as a non-signer", () => {
      assert.throws(
        () => refusePlatformKey([other(), ix(PLATFORM, false)], PLATFORM),
        /platform wallet's signature/
      );
    });

    it("refuses the platform key as the program", () => {
      const program = new TransactionInstruction({
        programId: PLATFORM,
        keys: [],
        data: Buffer.alloc(0),
      });
      assert.throws(
        () => refusePlatformKey([other(), program], PLATFORM),
        /platform wallet's signature/
      );
    });

    it("accepts other signers", () => {
      refusePlatformKey([other(), other()], PLATFORM);
    });
  });

  describe("refusePlatformUser", () => {
    const PLATFORM = Keypair.generate().publicKey;
    const USER = Keypair.generate().publicKey;

    it("refuses the platform wallet as the user", () => {
      assert.throws(
        () => refusePlatformUser(PLATFORM, PLATFORM.toBase58()),
        /The platform wallet cannot fund its own fees/
      );
    });

    it("accepts another user", () => {
      refusePlatformUser(USER, PLATFORM);
    });
  });

  describe("MIN_FUND_FEES_OUT_LAMPORTS", () => {
    it("is 95% of the 0.020015 SOL that /estimate prices", () => {
      assert.equal(ESTIMATE_LAMPORTS, 20_015_000);
      assert.equal(MIN_FUND_FEES_OUT_LAMPORTS, 19_014_250);
    });
  });

  describe("repayLamports", () => {
    it("repays the rent loan and 10000 lamports of fees", () => {
      assert.equal(repayLamports(2_039_280), 2_049_280);
    });
  });

  describe("buildFundFeesSwap", () => {
    const WSOL = "So11111111111111111111111111111111111111112";
    const ATA_PROGRAM = new PublicKey(
      "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
    );
    const TOKEN_PROGRAM = new PublicKey(
      "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    );
    const USER = Keypair.generate().publicKey;
    const PLATFORM_WALLET = Keypair.generate().publicKey;
    const ataOf = (mint: string) =>
      PublicKey.findProgramAddressSync(
        [
          USER.toBuffer(),
          TOKEN_PROGRAM.toBuffer(),
          new PublicKey(mint).toBuffer(),
        ],
        ATA_PROGRAM
      )[0];
    const createData = (mint: string) => ({
      programId: ATA_PROGRAM.toBase58(),
      accounts: [
        USER.toBase58(),
        ataOf(mint).toBase58(),
        USER.toBase58(),
        mint,
        key(),
        TOKEN_PROGRAM.toBase58(),
      ].map((pubkey) => ({ pubkey, isSigner: false, isWritable: true })),
      data: "AQ==",
    });
    const PARAMS = {
      apiUrl: "https://jupiter.test",
      mint: INPUT_MINT,
      inputAmount: "1000000",
      userWallet: USER.toBase58(),
      apiKey: "secret",
      minOutLamports: 19_014_250,
      platformWallet: PLATFORM_WALLET.toBase58(),
    };
    const answer = (overrides: Record<string, unknown> = {}) =>
      buildBody({
        outputMint: WSOL,
        setupInstructions: [createData(WSOL)],
        ...overrides,
      });
    const serving = (body: unknown, calls: string[] = []) =>
      (async (url: string) => {
        calls.push(url);
        return new Response(JSON.stringify(body), { status: 200 });
      }) as typeof fetch;

    it("sends the bounded request for the user and returns the swap parts without a compute budget", async () => {
      const calls: string[] = [];
      const headers: unknown[] = [];
      const built = await buildFundFeesSwap(PARAMS, (async (
        url: string,
        init?: RequestInit
      ) => {
        calls.push(url);
        headers.push(init?.headers);
        return new Response(JSON.stringify(answer()), { status: 200 });
      }) as typeof fetch);
      assert.equal(calls.length, 1);
      const url = new URL(calls[0]);
      assert.equal(url.searchParams.get("taker"), USER.toBase58());
      assert.equal(url.searchParams.get("inputMint"), INPUT_MINT);
      assert.equal(url.searchParams.get("outputMint"), WSOL);
      assert.equal(url.searchParams.get("amount"), "1000000");
      assert.equal(
        url.searchParams.get("maxBytes"),
        String(FUND_FEES_MAX_BYTES)
      );
      assert.equal(
        url.searchParams.get("maxAccounts"),
        String(FUND_FEES_MAX_ACCOUNTS)
      );
      assert.equal(url.searchParams.get("excludeDexes"), RFQ_V2_LABEL);
      assert.equal(url.searchParams.has("feeAccount"), false);
      assert.deepEqual(headers, [{ "x-api-key": "secret" }]);
      assert.equal(built.setupInstructions.length, 1);
      assert.equal(built.lookupTables.length, 2);
      assert.notEqual(built.cleanupInstruction, null);
      assert.equal("budgetInstructions" in built, false);
    });

    it("refuses an answer whose setup creates an intermediate token account", async () => {
      const intermediate = key();
      await assert.rejects(
        buildFundFeesSwap(
          PARAMS,
          serving(
            answer({
              setupInstructions: [createData(WSOL), createData(intermediate)],
            })
          )
        ),
        /creates a token account besides the wrapped SOL account/
      );
    });

    it("refuses the platform wallet as the user before it calls Jupiter", async () => {
      const calls: string[] = [];
      await assert.rejects(
        buildFundFeesSwap(
          { ...PARAMS, userWallet: PLATFORM_WALLET.toBase58() },
          serving(answer(), calls)
        ),
        /The platform wallet cannot fund its own fees/
      );
      assert.equal(calls.length, 0);
    });

    it("refuses an answer with an instruction that names the platform wallet", async () => {
      const named = {
        ...instruction(SWAP_PROGRAM, "u2T6zA=="),
        accounts: [
          {
            pubkey: PLATFORM_WALLET.toBase58(),
            isSigner: false,
            isWritable: false,
          },
        ],
      };
      for (const overrides of [
        { swapInstruction: named },
        { cleanupInstruction: named },
        { setupInstructions: [createData(WSOL), named] },
      ]) {
        await assert.rejects(
          buildFundFeesSwap(PARAMS, serving(answer(overrides))),
          /needs the platform wallet's signature/
        );
      }
    });

    it("accepts an answer that pays out the minimum SOL", async () => {
      const built = await buildFundFeesSwap(
        PARAMS,
        serving(answer({ outAmount: "19014250" }))
      );
      assert.equal(built.outAmount, "19014250");
    });

    it("refuses an answer that pays out less than the minimum SOL", async () => {
      await assert.rejects(
        buildFundFeesSwap(PARAMS, serving(answer({ outAmount: "19014249" }))),
        /Jupiter quoted less SOL than the fee estimate/
      );
    });
  });

  describe("computeUnitLimit", () => {
    it("asks for 20% over the simulated units, rounded up", () => {
      assert.equal(computeUnitLimit(100_000), 120_000);
      assert.equal(computeUnitLimit(100_001), 120_002);
    });

    it("caps the limit at 1,400,000", () => {
      assert.equal(computeUnitLimit(1_200_000), MAX_COMPUTE_UNIT_LIMIT);
    });

    it("refuses a simulation that reports no units", () => {
      for (const units of [0, -1, 1.5, Number.NaN]) {
        assert.throws(() => computeUnitLimit(units), /compute units/);
      }
    });
  });

  describe("planComputeBudget", () => {
    it("sets the limit from the simulated units and no unit price", () => {
      const { instructions } = planComputeBudget({
        err: null,
        logs: [],
        unitsConsumed: 47_870,
      });
      assert.deepEqual(instructions, [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 57_444 }),
      ]);
    });

    it("refuses a failed simulation with its error and last logs", () => {
      assert.throws(
        () =>
          planComputeBudget({
            err: { InstructionError: [3, { Custom: 1 }] },
            logs: ["a", "b", "c", "d", "e", "f"],
            unitsConsumed: 47_870,
          }),
        (e: Error) =>
          e.message ===
          'The fee-funding transaction fails in simulation: {"InstructionError":[3,{"Custom":1}]}: b | c | d | e | f'
      );
    });

    it("refuses a simulation that reports no units", () => {
      assert.throws(
        () => planComputeBudget({ err: null, logs: [] }),
        /compute units/
      );
    });
  });
});
