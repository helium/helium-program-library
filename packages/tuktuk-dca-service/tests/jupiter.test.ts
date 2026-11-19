import assert from "node:assert/strict";
import { ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  AccountInfo,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  buildJupiterSwap,
  buildSwapUrl,
  BuildSwapRequest,
  dcaSwapRequest,
  readBuildResponse,
  refuseSetupCreations,
  refuseSetupCreationsOnChain,
  RFQ_V2_LABEL,
  setupCreateTargets,
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
        maxAccounts: "20",
        maxBytes: "520",
        excludeDexes: RFQ_V2_LABEL,
      });
    });

    it("sends the byte budget it is given", () => {
      const url = buildSwapUrl(REQUEST, 480);
      assert.equal(url.searchParams.get("maxBytes"), "480");
      assert.equal(url.searchParams.get("maxAccounts"), "20");
    });

    it("excludes Jupiter RFQ v2", () => {
      const url = buildSwapUrl(REQUEST);
      assert.equal(url.searchParams.get("excludeDexes"), "JupiterRfqV2");
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
      ["otherAmountThreshold", "1.5"],
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

    it("refuses a body that is not an object", () => {
      assert.throws(
        () => readBuildResponse(null, EXPECTED),
        /Invalid Jupiter \/build response: body/
      );
    });

    it("refuses a route hop without swapInfo", () => {
      assert.throws(
        () => readBuildResponse(buildBody({ routePlan: [null] }), EXPECTED),
        /Invalid Jupiter \/build response: routePlan/
      );
    });

    it("refuses a route hop without a string label", () => {
      assert.throws(
        () =>
          readBuildResponse(
            buildBody({ routePlan: [{ swapInfo: { label: 1 } }] }),
            EXPECTED
          ),
        /Invalid Jupiter \/build response: label/
      );
    });

    it("keeps the setup instructions apart", () => {
      const built = readBuildResponse(buildBody(), EXPECTED);
      assert.deepEqual(
        built.setupInstructions.map((ix) => ix.programId.toBase58()),
        [SETUP_PROGRAM]
      );
    });

    it("refuses a route through Jupiter RFQ v2", () => {
      assert.throws(
        () =>
          readBuildResponse(
            buildBody({
              routePlan: [
                { swapInfo: { label: "Raydium CP" } },
                { swapInfo: { label: RFQ_V2_LABEL } },
              ],
            }),
            EXPECTED
          ),
        /route through JupiterRfqV2/
      );
    });
  });

  describe("dcaSwapRequest", () => {
    it("maps a DCA order to a /build request with the swap payer as taker", () => {
      const swapPayer = new PublicKey(TAKER);
      assert.deepEqual(
        dcaSwapRequest({
          apiUrl: "https://jupiter.test",
          apiKey: "test-key",
          dcaAccount: {
            inputMint: new PublicKey(INPUT_MINT),
            outputMint: new PublicKey(OUTPUT_MINT),
            destinationTokenAccount: new PublicKey(DESTINATION),
          },
          swapAmount: "1000000",
          swapPayer,
          slippageBps: 50,
        }),
        {
          apiUrl: "https://jupiter.test",
          apiKey: "test-key",
          inputMint: INPUT_MINT,
          outputMint: OUTPUT_MINT,
          amount: "1000000",
          taker: TAKER,
          destinationTokenAccount: DESTINATION,
          slippageBps: 50,
        }
      );
    });
  });

  describe("refuseSetupCreations", () => {
    const ATA = Keypair.generate().publicKey;
    const ataCreate = (data: number[]) =>
      new TransactionInstruction({
        programId: ASSOCIATED_TOKEN_PROGRAM_ID,
        keys: [
          { pubkey: new PublicKey(TAKER), isSigner: true, isWritable: true },
          { pubkey: ATA, isSigner: false, isWritable: true },
        ],
        data: Buffer.from(data),
      });
    const existing: AccountInfo<Buffer> = {
      executable: false,
      owner: Keypair.generate().publicKey,
      lamports: 2039280,
      data: Buffer.alloc(165),
    };

    it("refuses a System Program instruction", () => {
      const setup = [
        SystemProgram.transfer({
          fromPubkey: new PublicKey(TAKER),
          toPubkey: ATA,
          lamports: 1,
        }),
      ];
      assert.throws(
        () => refuseSetupCreations(setup, []),
        /System Program instruction/
      );
    });

    it("refuses a Create of a missing ATA", () => {
      const setup = [ataCreate([0])];
      assert.deepEqual(setupCreateTargets(setup), [ATA]);
      assert.throws(
        () => refuseSetupCreations(setup, [null]),
        new RegExp(`creates the account ${ATA.toBase58()}`)
      );
    });

    it("accepts a CreateIdempotent of an existing ATA", () => {
      const setup = [ataCreate([1])];
      assert.deepEqual(setupCreateTargets(setup), [ATA]);
      assert.doesNotThrow(() => refuseSetupCreations(setup, [existing]));
    });

    it("refuses a Create of a prefunded System-owned empty address", () => {
      const prefunded: AccountInfo<Buffer> = {
        executable: false,
        owner: SystemProgram.programId,
        lamports: 5000000,
        data: Buffer.alloc(0),
      };
      assert.throws(
        () => refuseSetupCreations([ataCreate([1])], [prefunded]),
        new RegExp(`creates the account ${ATA.toBase58()}`)
      );
    });

    it("refuses an empty-data (legacy) Create of a missing ATA", () => {
      const setup = [ataCreate([])];
      assert.deepEqual(setupCreateTargets(setup), [ATA]);
      assert.throws(
        () => refuseSetupCreations(setup, [null]),
        new RegExp(`creates the account ${ATA.toBase58()}`)
      );
    });

    it("refuses an ATA create without the account to create", () => {
      const setup = [
        new TransactionInstruction({
          programId: ASSOCIATED_TOKEN_PROGRAM_ID,
          keys: [{ pubkey: new PublicKey(TAKER), isSigner: true, isWritable: true }],
          data: Buffer.from([1]),
        }),
      ];
      assert.throws(() => setupCreateTargets(setup), /ATA create without the account/);
    });
  });

  describe("refuseSetupCreationsOnChain", () => {
    const ATA = Keypair.generate().publicKey;
    const stubConnection = (infos: (AccountInfo<Buffer> | null)[]) => {
      const calls: PublicKey[][] = [];
      return {
        calls,
        connection: {
          getMultipleAccountsInfo: async (keys: PublicKey[]) => {
            calls.push(keys);
            return infos;
          },
        },
      };
    };

    it("refuses a setup that creates a missing account", async () => {
      const { calls, connection } = stubConnection([null]);
      const setup = [
        new TransactionInstruction({
          programId: ASSOCIATED_TOKEN_PROGRAM_ID,
          keys: [
            { pubkey: new PublicKey(TAKER), isSigner: true, isWritable: true },
            { pubkey: ATA, isSigner: false, isWritable: true },
          ],
          data: Buffer.from([1]),
        }),
      ];
      await assert.rejects(
        refuseSetupCreationsOnChain(connection, setup),
        new RegExp(`creates the account ${ATA.toBase58()}`)
      );
      assert.deepEqual(calls, [[ATA]]);
    });

    it("makes no fetch when the setup creates no account", async () => {
      const { calls, connection } = stubConnection([]);
      await refuseSetupCreationsOnChain(connection, [
        new TransactionInstruction({
          programId: new PublicKey(SETUP_PROGRAM),
          keys: [],
          data: Buffer.from([1]),
        }),
      ]);
      assert.equal(calls.length, 0);
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
        /Jupiter \/build error: 400 Bad Request: No routes found$/
      );
    });

    it("keeps the first 300 characters of a failed request's body", async () => {
      const body = "x".repeat(300) + "TRUNCATED";
      const fetchImpl = (async () =>
        new Response(body, { status: 500, statusText: "Server Error" })) as typeof fetch;
      await assert.rejects(buildJupiterSwap(REQUEST, fetchImpl), (error: Error) => {
        assert.equal(
          error.message,
          `Jupiter /build error: 500 Server Error: ${"x".repeat(300)}`
        );
        return true;
      });
    });
  });
});
