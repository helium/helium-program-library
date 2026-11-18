import { HNT_MINT, IOT_MINT, MOBILE_MINT } from "@helium/spl-utils";
import { ACCOUNT_SIZE } from "@solana/spl-token";
import {
  AddressLookupTableAccount,
  ComputeBudgetProgram,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { RequestError, UpstreamError } from "./errors";

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

/**
 * How `/build` bounds the route.
 * - `quote`: unbounded, for a price whose instructions are discarded.
 * - `fundFees`: `maxAccounts` and `maxBytes`, to fit the fee-funding transaction.
 * - `fundFeesAccountsOnly`: `maxAccounts` only. IOT to SOL gets no route with both bounds, so IOT
 *   uses `maxAccounts` only. `refuseOversizedTransaction` guards the byte limit before the
 *   simulation.
 */
export type RouteBound = "quote" | "fundFees" | "fundFeesAccountsOnly";

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
  routeBound: RouteBound;
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
  switch (request.routeBound) {
    case "quote":
      break;
    case "fundFees":
      url.searchParams.set("maxAccounts", String(FUND_FEES_MAX_ACCOUNTS));
      url.searchParams.set("maxBytes", String(FUND_FEES_MAX_BYTES));
      break;
    case "fundFeesAccountsOnly":
      url.searchParams.set("maxAccounts", String(FUND_FEES_MAX_ACCOUNTS));
      break;
    default: {
      const unknownBound: never = request.routeBound;
      throw new Error(`Unknown route bound: ${unknownBound}`);
    }
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
    routeBound: "quote",
  };
}

/**
 * The `/build` request for the swap the user signs: `inputAmount` of `mint` into SOL, built for
 * the user and bounded to fit the fee-funding transaction. IOT drops the byte bound, see
 * `RouteBound`.
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
    routeBound:
      params.mint === IOT_MINT.toBase58() ? "fundFeesAccountsOnly" : "fundFees",
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

const invalid = (field: string): UpstreamError =>
  new UpstreamError(`Invalid Jupiter /build response: ${field}`);

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

/** The labels of the route's hops; a hop without a string label is refused. */
const routeLabels = (routePlan: unknown): string[] => {
  if (!Array.isArray(routePlan)) {
    throw invalid("routePlan");
  }
  return routePlan.map((hop) => {
    if (
      !isRecord(hop) ||
      !isRecord(hop.swapInfo) ||
      typeof hop.swapInfo.label !== "string"
    ) {
      throw invalid("routePlan");
    }
    return hop.swapInfo.label;
  });
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
    throw new UpstreamError(`Jupiter /build returned error: ${raw.error}`);
  }

  const inputMint = readString(raw, "inputMint");
  const outputMint = readString(raw, "outputMint");
  const inAmount = readAmount(raw, "inAmount");
  if (
    inputMint !== expected.inputMint ||
    outputMint !== expected.outputMint ||
    inAmount !== expected.amount
  ) {
    throw new UpstreamError(
      `Jupiter built a swap of ${inAmount} ${inputMint} for ${outputMint}, not the requested ${expected.amount} ${expected.inputMint} for ${expected.outputMint}`
    );
  }

  if (routeLabels(raw.routePlan).includes(RFQ_V2_LABEL)) {
    throw new UpstreamError(
      `Jupiter built a route through ${RFQ_V2_LABEL}, which needs a market maker's signature`
    );
  }

  const other = readInstructions(raw, "otherInstructions");
  if (other.length > 0) {
    throw new UpstreamError(
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
    throw new UpstreamError(
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
 * Refuses instructions that name the platform key, as program or as an account of any flags.
 * The platform wallet is the fee payer, so the compiled message makes it a signer of every
 * instruction that names it.
 */
export const refusePlatformKey = (
  instructions: TransactionInstruction[],
  platformKey: PublicKey | string
): void => {
  const platform = new PublicKey(platformKey);
  if (
    instructions.some(
      (ix) =>
        ix.programId.equals(platform) ||
        ix.keys.some((meta) => meta.pubkey.equals(platform))
    )
  ) {
    throw new UpstreamError(
      "Jupiter built an instruction that needs the platform wallet's signature"
    );
  }
};

/** Refuses a fee-funding request where the user is the platform wallet. */
export const refusePlatformUser = (
  user: PublicKey | string,
  platformKey: PublicKey | string
): void => {
  if (new PublicKey(user).equals(new PublicKey(platformKey))) {
    throw new RequestError("The platform wallet cannot fund its own fees");
  }
};

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
      throw new UpstreamError(
        `Jupiter built a swap that creates a token account besides the wrapped SOL account${
          account ? ` (${account.toBase58()})` : ""
        }, which the rent loan does not cover`
      );
    }
  }
}

/**
 * Refuses a transaction over Solana's 1232-byte limit. web3.js throws a RangeError for a
 * message that alone is over the limit, which is refused the same way.
 */
export const refuseOversizedTransaction = (
  transaction: VersionedTransaction
): void => {
  let size = Infinity;
  try {
    size = transaction.serialize().length;
  } catch (error) {
    if (!(error instanceof RangeError)) {
      throw error;
    }
  }
  if (size > TRANSACTION_SIZE_LIMIT) {
    throw new Error(
      `The fee-funding transaction is over Solana's ${TRANSACTION_SIZE_LIMIT}-byte limit`
    );
  }
};

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
 * The compute budget instructions the transaction carries, from a simulation of it at the
 * largest limit. A failed simulation is refused.
 *
 * `/build`'s unit price is dropped, so the transaction pays the base fee only, which
 * `repayLamports` covers.
 */
export function planComputeBudget(simulation: {
  err: unknown;
  logs?: string[] | null;
  unitsConsumed?: number;
}): {
  instructions: TransactionInstruction[];
} {
  if (simulation.err) {
    throw new Error(
      `The fee-funding transaction fails in simulation: ${JSON.stringify(
        simulation.err
      )}: ${(simulation.logs ?? []).slice(-5).join(" | ")}`
    );
  }
  return {
    instructions: [
      ComputeBudgetProgram.setComputeUnitLimit({
        units: computeUnitLimit(simulation.unitsConsumed ?? 0),
      }),
    ],
  };
}

/** The lamports the user repays: the rent loan and the transaction's fees. */
export const repayLamports = (ataRent: number): number =>
  ataRent + FEE_LAMPORTS;

/** The SOL that `/estimate` prices, in lamports: 0.020015 SOL. */
export const ESTIMATE_LAMPORTS = 20_015_000;

/** The least SOL the fee-funding swap may pay out, in lamports: 95% of `ESTIMATE_LAMPORTS`. */
export const MIN_FUND_FEES_OUT_LAMPORTS = (ESTIMATE_LAMPORTS * 95) / 100;

/**
 * The most SOL the verifying build of `estimateBySale` may pay out, in lamports: 105% of
 * `ESTIMATE_LAMPORTS`.
 */
export const MAX_ESTIMATE_BY_SALE_OUT_LAMPORTS =
  (ESTIMATE_LAMPORTS * 105) / 100;

/**
 * The IOT that `estimateBySale` probes with: 43,000 IOT × 10^6 base units = 43e9. Any amount worth
 * roughly 0.02 SOL works as a probe, because the verify checks the scaled amount.
 */
export const IOT_PRICE_PROBE_AMOUNT = "43000000000";

const mulDivCeil = (
  amount: bigint,
  numerator: bigint,
  denominator: bigint
): bigint => (amount * numerator + denominator - 1n) / denominator;

/**
 * The `mint` that sells for `ESTIMATE_LAMPORTS` of SOL, priced from `mint` to SOL builds. It is
 * for a mint that Jupiter cannot buy with SOL (IOT), and uses the fee-funding route bound, so the
 * price comes from the route `/fees` builds.
 *
 * It builds the sale of `probeAmount`, scales that amount to `ESTIMATE_LAMPORTS` (rounded up), and
 * builds the sale of the scaled amount to verify it. A verify that pays out more than 105% or less
 * than 95% of `ESTIMATE_LAMPORTS` is refused, because the probe's price is then not the verify's.
 * A verify in [95%, 100%) is scaled once more from the verify, so the second scale adds at most
 * about 5.3% to the amount.
 */
export const estimateBySale = async (
  params: {
    apiUrl: string;
    apiKey?: string;
    mint: string;
    probeAmount: string;
    platformWallet: string;
  },
  fetchImpl: typeof fetch = fetch
): Promise<string> => {
  const sell = (inputAmount: bigint) =>
    buildJupiterSwap(
      fundFeesRequest({
        apiUrl: params.apiUrl,
        apiKey: params.apiKey,
        mint: params.mint,
        inputAmount: inputAmount.toString(),
        userWallet: params.platformWallet,
      }),
      fetchImpl
    );
  const target = BigInt(ESTIMATE_LAMPORTS);
  const scaleToTarget = (inputAmount: bigint, outAmount: string): bigint => {
    const out = BigInt(outAmount);
    if (out === 0n) {
      throw new UpstreamError("Jupiter priced the sale at 0 SOL");
    }
    return mulDivCeil(inputAmount, target, out);
  };

  const probeAmount = BigInt(params.probeAmount);
  const probe = await sell(probeAmount);
  const amount = scaleToTarget(probeAmount, probe.outAmount);
  const verify = await sell(amount);
  const verifyOut = BigInt(verify.outAmount);
  if (verifyOut > BigInt(MAX_ESTIMATE_BY_SALE_OUT_LAMPORTS)) {
    throw new UpstreamError(
      `Jupiter priced ${amount} at ${verifyOut} lamports, over 105% of the ${target} its probe priced it at`
    );
  }
  if (verifyOut < BigInt(MIN_FUND_FEES_OUT_LAMPORTS)) {
    throw new UpstreamError(
      `Jupiter priced ${amount} at ${verifyOut} lamports, under 95% of the ${target} its probe priced it at`
    );
  }
  return (
    verifyOut < target ? scaleToTarget(amount, verify.outAmount) : amount
  ).toString();
};

/** The mints the service swaps to SOL. */
const SUPPORTED_MINTS = [HNT_MINT, IOT_MINT, MOBILE_MINT].map((mint) =>
  mint.toBase58()
);

/** Refuses a mint the service does not swap. */
export const refuseUnsupportedMint = (mint: string): void => {
  if (!SUPPORTED_MINTS.includes(mint)) {
    throw new RequestError(`Provided mint not supported by service: ${mint}`);
  }
};

/**
 * The amount of `mint` the fee-funding swap sells: what `ESTIMATE_LAMPORTS` of SOL buys.
 * `/build` has no quote-only form, so the price comes from a build for the platform wallet, whose
 * instructions are discarded. Jupiter has no SOL to IOT route, so IOT is priced from its sale.
 */
export const estimateSwapInput = async (
  params: {
    apiUrl: string;
    apiKey?: string;
    mint: string;
    platformWallet: string;
  },
  fetchImpl: typeof fetch = fetch
): Promise<string> => {
  refuseUnsupportedMint(params.mint);
  if (params.mint === IOT_MINT.toBase58()) {
    return estimateBySale(
      { ...params, probeAmount: IOT_PRICE_PROBE_AMOUNT },
      fetchImpl
    );
  }
  const quote = await buildJupiterSwap(
    estimateRequest({ ...params, solAmount: ESTIMATE_LAMPORTS.toString() }),
    fetchImpl
  );
  return quote.outAmount;
};

/** What the fee-funding transaction is assembled from. */
export type FundFeesSwap = BuiltSwap;

/**
 * Builds the swap the user signs for the fee-funding transaction: the bounded `/build` request
 * for the user, refused when its setup creates a token account besides the user's wrapped SOL
 * account (the rent loan covers that one), or when it quotes less SOL than `minOutLamports` or
 * more than `maxOutLamports`.
 * The platform wallet is refused as the user before the request, and an answer with an
 * instruction that names the platform wallet is refused.
 * The compute budget is planned after a simulation of
 * the assembled transaction, so it is not part of this result.
 */
export async function buildFundFeesSwap(
  params: Parameters<typeof fundFeesRequest>[0] & {
    /** The least SOL the swap may pay out, in lamports. */
    minOutLamports: number;
    /** The most SOL the swap may pay out, in lamports. */
    maxOutLamports: number;
    /** The fee payer that lends the rent. */
    platformWallet: string;
  },
  fetchImpl: typeof fetch = fetch
): Promise<FundFeesSwap> {
  refusePlatformUser(params.userWallet, params.platformWallet);
  const built = await buildJupiterSwap(fundFeesRequest(params), fetchImpl);
  refusePlatformKey(
    [
      ...built.setupInstructions,
      built.swapInstruction,
      ...(built.cleanupInstruction ? [built.cleanupInstruction] : []),
    ],
    params.platformWallet
  );
  refuseExtraAccountCreations(built.setupInstructions, params.userWallet);
  if (Number(built.outAmount) < params.minOutLamports) {
    throw new UpstreamError("Jupiter quoted less SOL than the fee estimate");
  }
  if (Number(built.outAmount) > params.maxOutLamports) {
    throw new UpstreamError(
      "Jupiter quoted more SOL than the fee estimate allows"
    );
  }
  return built;
}

/** The RPC calls the fee-funding transaction is built with. */
export interface FundFeesConnection {
  getMinimumBalanceForRentExemption(dataLength: number): Promise<number>;
  simulateTransaction(
    transaction: VersionedTransaction,
    config: { sigVerify: false; replaceRecentBlockhash: true }
  ): Promise<{ value: Parameters<typeof planComputeBudget>[0] }>;
  getLatestBlockhash(): Promise<{ blockhash: string }>;
}

/** The platform wallet: the fee payer, which lends the rent and signs the transaction. */
export interface FundFeesSigner {
  publicKey: PublicKey;
  signTransaction(
    transaction: VersionedTransaction
  ): Promise<VersionedTransaction>;
}

/**
 * Builds and signs the fee-funding transaction: the platform wallet lends the user the rent of
 * the wrapped SOL account, the user swaps `inputAmount` of `mint` to SOL, and the user repays the
 * loan and the fees.
 *
 * A transaction over Solana's size limit is refused before its simulation, and one that fails in
 * simulation is refused before it is signed.
 */
export const buildFundFeesTransaction = async (
  params: {
    apiUrl: string;
    apiKey?: string;
    mint: string;
    inputAmount: string;
    userWallet: string;
  },
  deps: {
    connection: FundFeesConnection;
    signer: FundFeesSigner;
    /** Loads the route's lookup tables by key. */
    lookupTableAccounts: (
      keys: string[]
    ) => Promise<AddressLookupTableAccount[]>;
  },
  fetchImpl: typeof fetch = fetch
): Promise<VersionedTransaction> => {
  const { connection, signer } = deps;
  const userWallet = new PublicKey(params.userWallet);

  // Tx contains instructions to create/close WSOL token account
  // The loan below covers the rent of one account, the wrapped SOL one.
  const {
    setupInstructions,
    swapInstruction,
    cleanupInstruction,
    lookupTables,
  } = await buildFundFeesSwap(
    {
      ...params,
      minOutLamports: MIN_FUND_FEES_OUT_LAMPORTS,
      maxOutLamports: MAX_ESTIMATE_BY_SALE_OUT_LAMPORTS,
      platformWallet: signer.publicKey.toBase58(),
    },
    fetchImpl
  );

  // create rent flash loan instructions
  const ataRent =
    await connection.getMinimumBalanceForRentExemption(ACCOUNT_SIZE);

  const borrowIx = SystemProgram.transfer({
    fromPubkey: signer.publicKey,
    toPubkey: userWallet,
    lamports: ataRent,
  });

  const addressLookupTableAccounts =
    await deps.lookupTableAccounts(lookupTables);
  const compile = (
    budgetInstructions: TransactionInstruction[],
    repayLamports: number,
    recentBlockhash: string
  ): VersionedTransaction =>
    new VersionedTransaction(
      new TransactionMessage({
        payerKey: signer.publicKey,
        recentBlockhash,
        instructions: [
          ...budgetInstructions,
          borrowIx,
          ...setupInstructions,
          swapInstruction,
          ...(cleanupInstruction ? [cleanupInstruction] : []),
          SystemProgram.transfer({
            fromPubkey: userWallet,
            toPubkey: signer.publicKey,
            lamports: repayLamports,
          }),
        ],
      }).compileToV0Message(addressLookupTableAccounts)
    );

  // /build returns no compute unit limit, so the limit comes from a simulation of the
  // transaction at the largest limit. The repay amount does not change the units it uses.
  // Neither the limit nor the repay amount changes the size, so the size is checked here.
  const simulated = compile(
    [
      ComputeBudgetProgram.setComputeUnitLimit({
        units: MAX_COMPUTE_UNIT_LIMIT,
      }),
    ],
    ataRent,
    PublicKey.default.toBase58()
  );
  refuseOversizedTransaction(simulated);
  const simulation = await connection.simulateTransaction(simulated, {
    sigVerify: false,
    replaceRecentBlockhash: true,
  });
  const { instructions: budgetInstructions } = planComputeBudget(
    simulation.value
  );

  const blockhash = (await connection.getLatestBlockhash()).blockhash;
  return signer.signTransaction(
    compile(budgetInstructions, repayLamports(ataRent), blockhash)
  );
};
