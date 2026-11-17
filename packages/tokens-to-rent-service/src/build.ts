import {
  ComputeBudgetProgram,
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
 * instructions compiled alone): a compute unit limit, the two SOL transfers, and the
 * second signature. Measured from live `/build` answers for HNT and MOBILE to SOL, the compiled
 * transaction is 182 bytes larger than the bare swap for the routes measured.
 */
const FUND_FEES_OVERHEAD_BYTES = 182;

/**
 * Room for what the overhead measurement left out: Jupiter's own byte count may differ a little
 * from the compiled size.
 */
const FUND_FEES_MARGIN_BYTES = 100;

/**
 * The byte budget `/build` gets for the bare swap when it builds the fee-funding transaction
 * (`maxBytes`), which aims to keep the whole transaction under Solana's size limit. It leaves out
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
 * Jupiter RFQ v2. Its fills need a market maker's co-signature that this service does not
 * collect. `/build` refuses RFQ v2 unless an undocumented `enableRfqV2` parameter is sent, which
 * this service never sends, so the exclusion on every request and the refusal of a built route
 * through it are defence in depth in case that default changes.
 */
export const RFQ_V2_LABEL = "JupiterRfqV2";

/** Solana's largest compute unit limit for one transaction. */
export const MAX_COMPUTE_UNIT_LIMIT = 1_400_000;

/**
 * The headroom over the simulated compute units: the route's pools can move between the
 * simulation and the landed transaction.
 */
const COMPUTE_UNIT_MARGIN = 1.2;

/**
 * The lamports the user repays for the transaction's fees. The transaction carries no compute
 * unit price, so the user pays no priority fee.
 */
export const FEE_LAMPORTS = 10000;

/** The slippage every swap is built with, in basis points (1%). */
export const SLIPPAGE_BPS = 100;

/** Wrapped SOL, the mint the fee-funding swap pays out in. */
const NATIVE_MINT = "So11111111111111111111111111111111111111112";

const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);

const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
);

export interface BuildSwapRequest {
  apiUrl: string;
  inputMint: string;
  outputMint: string;
  amount: string;
  /** Sent as `x-api-key`; without it Jupiter applies its keyless rate limit. */
  apiKey?: string;
  /** The account that signs the swap and holds the input. */
  taker: string;
  slippageBps: number;
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
  url.searchParams.set("excludeDexes", RFQ_V2_LABEL);
  if (request.fitFundFeesTransaction) {
    url.searchParams.set("maxAccounts", String(FUND_FEES_MAX_ACCOUNTS));
    url.searchParams.set("maxBytes", String(FUND_FEES_MAX_BYTES));
  }
  return url;
}

/**
 * The `/build` request that prices the swap: SOL into `mint`, built for the platform wallet,
 * whose instructions are discarded. `/build` has no quote-only form, so the request is not
 * bounded to fit the fee-funding transaction.
 */
export function estimateRequest(params: {
  apiUrl: string;
  mint: string;
  /** The SOL to swap, in lamports. */
  solAmount: string;
  platformWallet: string;
  apiKey?: string;
}): BuildSwapRequest {
  return {
    apiUrl: params.apiUrl,
    amount: params.solAmount,
    inputMint: NATIVE_MINT,
    outputMint: params.mint,
    taker: params.platformWallet,
    slippageBps: SLIPPAGE_BPS,
    apiKey: params.apiKey,
    fitFundFeesTransaction: false,
  };
}

/**
 * The `/build` request for the swap the user signs: `inputAmount` of `mint` into SOL, built for
 * the user and bounded to fit the fee-funding transaction.
 */
export function fundFeesRequest(params: {
  apiUrl: string;
  mint: string;
  inputAmount: string;
  userWallet: string;
  apiKey?: string;
}): BuildSwapRequest {
  return {
    apiUrl: params.apiUrl,
    amount: params.inputAmount,
    inputMint: params.mint,
    outputMint: NATIVE_MINT,
    taker: params.userWallet,
    slippageBps: SLIPPAGE_BPS,
    apiKey: params.apiKey,
    fitFundFeesTransaction: true,
  };
}

export interface BuiltSwap {
  setupInstructions: TransactionInstruction[];
  swapInstruction: TransactionInstruction;
  cleanupInstruction: TransactionInstruction | null;
  /** The lookup tables the route's accounts live in, by key. */
  lookupTables: string[];
  /** What the swap pays out. */
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

/** The labels of the route's hops; a hop without a string label reads as "". */
const routeLabels = (routePlan: unknown): string[] => {
  if (!Array.isArray(routePlan)) {
    throw invalid("routePlan");
  }
  return routePlan.map((hop) =>
    isRecord(hop) &&
    isRecord(hop.swapInfo) &&
    typeof hop.swapInfo.label === "string"
      ? hop.swapInfo.label
      : ""
  );
};

/**
 * Reads a `/build` answer into the instructions of the fee-funding transaction.
 *
 * Refuses an answer that is not a swap of the requested mints and amount, a route through RFQ
 * v2, and an answer that carries `otherInstructions`, which nothing here has characterised for
 * a transaction the user signs. `computeBudgetInstructions` are dropped: the transaction sets
 * its own limit and no price. `tipInstruction` is present only when `tipAmount` is sent, which
 * this service never does.
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

  if (routeLabels(raw.routePlan).includes(RFQ_V2_LABEL)) {
    throw new Error(
      `Jupiter built a route through ${RFQ_V2_LABEL}, which needs a market maker's signature`
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
  const response = await fetchImpl(buildSwapUrl(request).toString(), {
    headers: request.apiKey ? { "x-api-key": request.apiKey } : {},
  });
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
 * Refuses a fee-funding build whose setup creates a token account other than the taker's
 * wrapped SOL account.
 *
 * The transaction borrows the rent of that one account and nothing more, so a route that creates
 * an intermediate account for the taker would fail on chain for a user low on SOL, or leave the
 * user a dust account that locks its rent. Create and CreateIdempotent are checked;
 * RecoverNested creates nothing.
 */
export function refuseExtraAccountCreations(
  setupInstructions: TransactionInstruction[],
  taker: string
): void {
  const takerKey = new PublicKey(taker);
  const wsolAccount = PublicKey.findProgramAddressSync(
    [
      takerKey.toBuffer(),
      TOKEN_PROGRAM_ID.toBuffer(),
      new PublicKey(NATIVE_MINT).toBuffer(),
    ],
    ASSOCIATED_TOKEN_PROGRAM_ID
  )[0];
  for (const ix of setupInstructions) {
    if (!ix.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID)) {
      continue;
    }
    if (ix.data.length > 0 && ix.data[0] !== 0 && ix.data[0] !== 1) {
      continue;
    }
    const account = ix.keys[1]?.pubkey;
    if (!account || !account.equals(wsolAccount)) {
      throw new Error(
        `Jupiter built a swap that creates a token account besides the wrapped SOL account${
          account ? ` (${account.toBase58()})` : ""
        }, which the rent loan does not cover`
      );
    }
  }
}

/**
 * The compute unit limit for a transaction that used `unitsConsumed` in simulation: 20% over
 * it, capped at Solana's largest limit.
 */
export function computeUnitLimit(unitsConsumed: number): number {
  if (!Number.isSafeInteger(unitsConsumed) || unitsConsumed <= 0) {
    throw new Error(
      `The fee-funding transaction's simulation reported ${unitsConsumed} compute units`
    );
  }
  return Math.min(
    Math.ceil(unitsConsumed * COMPUTE_UNIT_MARGIN),
    MAX_COMPUTE_UNIT_LIMIT
  );
}

/**
 * The compute budget instructions the transaction carries, and the lamports the user repays for
 * its fees.
 *
 * The limit comes from the caller. `/build`'s unit price is dropped, so the transaction pays
 * the base fee only and the user repays `FEE_LAMPORTS`.
 */
export function planComputeBudget(units: number): {
  instructions: TransactionInstruction[];
  fee: number;
} {
  return {
    instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units })],
    fee: FEE_LAMPORTS,
  };
}

/** What the fee-funding transaction is assembled from. */
export interface FundFeesSwap {
  setupInstructions: TransactionInstruction[];
  swapInstruction: TransactionInstruction;
  cleanupInstruction: TransactionInstruction | null;
  lookupTables: string[];
}

/**
 * Builds the swap the user signs for the fee-funding transaction: the bounded `/build` request
 * for the user, refused when its setup creates a token account besides the user's wrapped SOL
 * account (the rent loan covers that one). The compute budget is planned after a simulation of
 * the assembled transaction, so it is not part of this result.
 */
export async function buildFundFeesSwap(
  params: Parameters<typeof fundFeesRequest>[0],
  fetchImpl: typeof fetch = fetch
): Promise<FundFeesSwap> {
  const built = await buildJupiterSwap(fundFeesRequest(params), fetchImpl);
  refuseExtraAccountCreations(built.setupInstructions, params.userWallet);
  return {
    setupInstructions: built.setupInstructions,
    swapInstruction: built.swapInstruction,
    cleanupInstruction: built.cleanupInstruction,
    lookupTables: built.lookupTables,
  };
}
