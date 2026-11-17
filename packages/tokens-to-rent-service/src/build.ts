import {
  ComputeBudgetInstruction,
  ComputeBudgetProgram,
  LAMPORTS_PER_SOL,
  PublicKey,
  TransactionInstruction,
} from "@solana/web3.js";

/** Jupiter's Swap V2 build endpoint, relative to the API base URL. */
const JUPITER_BUILD_PATH = "/swap/v2/build";

/**
 * Solana's limit on a serialized transaction.
 */
const TRANSACTION_SIZE_LIMIT = 1232;

/**
 * What the fee-funding transaction adds around Jupiter's bare swap (setup, swap and cleanup
 * instructions compiled alone): a compute unit limit and price, the two SOL transfers, and the
 * second signature. Measured from live `/build` answers for HNT and MOBILE to SOL, the compiled
 * transaction is 182 bytes larger than the bare swap for every route, however many hops it has.
 */
const FUND_FEES_OVERHEAD_BYTES = 182;

/**
 * Room for what the overhead measurement left out: a platform fee account that no lookup table
 * holds adds about 33 bytes, and Jupiter's own byte count may differ a little from the compiled
 * size.
 */
const FUND_FEES_MARGIN_BYTES = 100;

/**
 * The byte budget `/build` gets for the bare swap when it builds the fee-funding transaction
 * (`maxBytes`), so that the whole transaction stays under Solana's size limit. It leaves out
 * routes that would not fit: unconstrained, HNT to SOL answered with a route whose transaction
 * is 1272 bytes. The budget is an estimate from those measurements, and Jupiter marks
 * `maxBytes` as experimental. A pair with no route inside it gets `No routes found`.
 */
export const FUND_FEES_MAX_BYTES =
  TRANSACTION_SIZE_LIMIT - FUND_FEES_OVERHEAD_BYTES - FUND_FEES_MARGIN_BYTES;

/** The account limit the fee-funding swap is built with (`maxAccounts`). */
export const FUND_FEES_MAX_ACCOUNTS = 20;

/** How much of a failed `/build` answer's body goes into the error. */
const ERROR_BODY_MAX_CHARS = 300;

/**
 * The compute unit limit the fee-funding transaction asks for when `/build` returns none (it
 * returns the unit price only). The priority fee the user repays is this limit times the price.
 */
export const COMPUTE_UNIT_LIMIT = 1_400_000;

/** The lamports the user repays for the transaction's base fee, before the priority fee. */
const BASE_FEE_LAMPORTS = 10000;

/** The priority fee, in SOL, above which no transaction is built. */
const MAX_FEE_SOL = 0.01;

export interface BuildSwapRequest {
  apiUrl: string;
  inputMint: string;
  outputMint: string;
  amount: string;
  /** The account that signs the swap and holds the input. */
  taker: string;
  slippageBps: number;
  /** The platform fee in basis points; 0 or less sends no fee. */
  platformFeeBps: number;
  /** The token account the fee goes to; required when `platformFeeBps` is positive. */
  feeAccount?: string;
  /** Bound the swap so it fits the fee-funding transaction; a price quote leaves this off. */
  fitFundFeesTransaction: boolean;
}

/** The `/build` request, as a URL. */
export function buildSwapUrl(request: BuildSwapRequest): URL {
  const url = new URL(`${request.apiUrl}${JUPITER_BUILD_PATH}`);
  url.searchParams.set("inputMint", request.inputMint);
  url.searchParams.set("outputMint", request.outputMint);
  url.searchParams.set("amount", request.amount);
  url.searchParams.set("taker", request.taker);
  url.searchParams.set("slippageBps", String(request.slippageBps));
  if (request.platformFeeBps > 0) {
    if (!request.feeAccount) {
      throw new Error(
        "JUPITER_FEE_BPS is set without JUPITER_FEE_ACCOUNT: /build needs a fee account for a platform fee"
      );
    }
    url.searchParams.set("platformFeeBps", String(request.platformFeeBps));
    url.searchParams.set("feeAccount", request.feeAccount);
  }
  if (request.fitFundFeesTransaction) {
    url.searchParams.set("maxAccounts", String(FUND_FEES_MAX_ACCOUNTS));
    url.searchParams.set("maxBytes", String(FUND_FEES_MAX_BYTES));
  }
  return url;
}

export interface BuiltSwap {
  /** What `/build` returns for the compute budget: the unit price, and no limit. */
  computeBudgetInstructions: TransactionInstruction[];
  setupInstructions: TransactionInstruction[];
  swapInstruction: TransactionInstruction;
  cleanupInstruction: TransactionInstruction | null;
  /** The lookup tables the route's accounts live in, by key. */
  lookupTables: string[];
  /** What the swap pays out, net of the platform fee. */
  outAmount: string;
}

const AMOUNT = /^\d+$/;

type Json = Record<string, unknown>;

const isRecord = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const invalid = (field: string): Error =>
  new Error(`Invalid Jupiter /build response: ${field}`);

const readString = (body: Json, field: string): string => {
  const value = body[field];
  if (typeof value !== "string") {
    throw invalid(field);
  }
  return value;
};

const readAmount = (body: Json, field: string): string => {
  const value = readString(body, field);
  if (!AMOUNT.test(value)) {
    throw invalid(field);
  }
  return value;
};

const readInstruction = (
  value: unknown,
  field: string
): TransactionInstruction => {
  if (
    !isRecord(value) ||
    typeof value.programId !== "string" ||
    typeof value.data !== "string" ||
    !Array.isArray(value.accounts)
  ) {
    throw invalid(field);
  }
  const keys = value.accounts.map((account: unknown) => {
    if (
      !isRecord(account) ||
      typeof account.pubkey !== "string" ||
      typeof account.isSigner !== "boolean" ||
      typeof account.isWritable !== "boolean"
    ) {
      throw invalid(`${field}.accounts`);
    }
    return {
      pubkey: new PublicKey(account.pubkey),
      isSigner: account.isSigner,
      isWritable: account.isWritable,
    };
  });
  return new TransactionInstruction({
    programId: new PublicKey(value.programId),
    keys,
    data: Buffer.from(value.data, "base64"),
  });
};

const readInstructions = (
  body: Json,
  field: string
): TransactionInstruction[] => {
  const value = body[field];
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw invalid(field);
  }
  return value.map((ix, i) => readInstruction(ix, `${field}[${i}]`));
};

/**
 * Reads a `/build` answer into the instructions of the fee-funding transaction.
 *
 * Refuses an answer that is not a swap of the requested mints and amount, and one that carries
 * `otherInstructions`, which nothing here has characterised for a transaction the user signs.
 * `tipInstruction` is present only when `tipAmount` is sent, which this service never does.
 */
export function readBuildResponse(
  raw: unknown,
  expected: { inputMint: string; outputMint: string; amount: string }
): BuiltSwap {
  if (!isRecord(raw)) {
    throw invalid("body");
  }
  if (typeof raw.error === "string" && raw.error.length > 0) {
    throw new Error(`Jupiter /build returned error: ${raw.error}`);
  }

  const inputMint = readString(raw, "inputMint");
  const outputMint = readString(raw, "outputMint");
  const inAmount = readAmount(raw, "inAmount");
  if (
    inputMint !== expected.inputMint ||
    outputMint !== expected.outputMint ||
    inAmount !== expected.amount
  ) {
    throw new Error(
      `Jupiter built a swap of ${inAmount} ${inputMint} for ${outputMint}, not the requested ${expected.amount} ${expected.inputMint} for ${expected.outputMint}`
    );
  }

  const other = readInstructions(raw, "otherInstructions");
  if (other.length > 0) {
    throw new Error(
      `Jupiter built a swap with ${other.length} otherInstructions, which this service does not run`
    );
  }

  const tables = raw.addressesByLookupTableAddress;
  if (tables !== undefined && tables !== null && !isRecord(tables)) {
    throw invalid("addressesByLookupTableAddress");
  }

  return {
    computeBudgetInstructions: readInstructions(
      raw,
      "computeBudgetInstructions"
    ),
    setupInstructions: readInstructions(raw, "setupInstructions"),
    swapInstruction: readInstruction(raw.swapInstruction, "swapInstruction"),
    cleanupInstruction:
      raw.cleanupInstruction === undefined || raw.cleanupInstruction === null
        ? null
        : readInstruction(raw.cleanupInstruction, "cleanupInstruction"),
    lookupTables: Object.keys(tables ?? {}).map((key) =>
      new PublicKey(key).toBase58()
    ),
    outAmount: readAmount(raw, "outAmount"),
  };
}

/** Builds a swap through `/build` and reads the answer. */
export async function buildJupiterSwap(
  request: BuildSwapRequest,
  fetchImpl: typeof fetch = fetch
): Promise<BuiltSwap> {
  const response = await fetchImpl(buildSwapUrl(request).toString());
  if (!response.ok) {
    const body = (await response.text()).slice(0, ERROR_BODY_MAX_CHARS);
    throw new Error(
      `Jupiter /build error: ${response.status} ${response.statusText}: ${body}`
    );
  }
  return readBuildResponse(await response.json(), {
    inputMint: request.inputMint,
    outputMint: request.outputMint,
    amount: request.amount,
  });
}

/**
 * The compute budget instructions the transaction carries, and the lamports the user repays for
 * its fees.
 *
 * `/build` returns the unit price without a limit, so a limit of `COMPUTE_UNIT_LIMIT` is added
 * unless the answer carries one. The fee is the base fee plus limit times price; a fee above
 * 0.01 SOL is refused.
 */
export function planComputeBudget(budget: TransactionInstruction[]): {
  instructions: TransactionInstruction[];
  fee: number;
} {
  let units: number | undefined;
  let price = 0;
  for (const instr of budget) {
    switch (ComputeBudgetInstruction.decodeInstructionType(instr)) {
      case "SetComputeUnitLimit":
        units = ComputeBudgetInstruction.decodeSetComputeUnitLimit(instr).units;
        break;
      case "RequestUnits":
        units = ComputeBudgetInstruction.decodeRequestUnits(instr).units;
        break;
      case "SetComputeUnitPrice":
        price = Number(
          ComputeBudgetInstruction.decodeSetComputeUnitPrice(instr)
            .microLamports
        );
        break;
    }
  }

  const instructions =
    units === undefined
      ? [
          ComputeBudgetProgram.setComputeUnitLimit({
            units: COMPUTE_UNIT_LIMIT,
          }),
          ...budget,
        ]
      : budget;
  const fee =
    BASE_FEE_LAMPORTS +
    Math.ceil(((units ?? COMPUTE_UNIT_LIMIT) * price) / 1000000);
  if (fee / LAMPORTS_PER_SOL > MAX_FEE_SOL) {
    throw new Error("Priority fees are too high right now, try again later");
  }
  return { instructions, fee };
}
