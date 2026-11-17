import { PublicKey, TransactionInstruction } from "@solana/web3.js";

/** Jupiter's Swap V2 build endpoint, relative to the API base URL. */
const JUPITER_BUILD_PATH = "/swap/v2/build";

/**
 * The byte budget `/build` gets for the bare swap it returns (`maxBytes`).
 *
 * The crank turner does not submit that swap as Jupiter sized it. It submits an ed25519 check
 * over the signed remote task, which carries the swap's instruction data again with `lend_v0`,
 * the `swap_v0` wrapper and `check_repay_v0`, and a `run_task_v0` that lists every account the
 * task touches, plus the DCA's own accounts, which no lookup table holds. That adds about 660
 * bytes to the bare swap: the observed routes had bare swaps of 500 bytes and task transactions
 * of 1155 bytes. The margin at 520 bytes is an estimate from those routes, and Jupiter marks
 * `maxBytes` as experimental. A larger budget lets `/build` choose multi-hop routes whose task
 * transaction exceeds Solana's 1232-byte limit and cannot be submitted.
 */
export const DCA_SWAP_MAX_BYTES = 520;

export const RFQ_V2_LABEL = "JupiterRfqV2";

/** How much of a failed `/build` answer's body goes into the error. */
const ERROR_BODY_MAX_CHARS = 300;

export interface BuildSwapRequest {
  apiUrl: string;
  inputMint: string;
  outputMint: string;
  amount: string;
  /** The account that signs the swap and holds the input: the DCA's swap payer PDA. */
  taker: string;
  destinationTokenAccount: string;
  slippageBps: number;
}

/** The `/build` request for a DCA order, as a URL. */
export function buildSwapUrl(request: BuildSwapRequest): URL {
  const url = new URL(`${request.apiUrl}${JUPITER_BUILD_PATH}`);
  url.searchParams.set("inputMint", request.inputMint);
  url.searchParams.set("outputMint", request.outputMint);
  url.searchParams.set("amount", request.amount);
  url.searchParams.set("taker", request.taker);
  url.searchParams.set("slippageBps", String(request.slippageBps));
  url.searchParams.set(
    "destinationTokenAccount",
    request.destinationTokenAccount
  );
  url.searchParams.set("maxBytes", String(DCA_SWAP_MAX_BYTES));
  url.searchParams.set("excludeDexes", RFQ_V2_LABEL);
  return url;
}

export interface BuiltSwap {
  /** Setup, swap and cleanup instructions, in the order they run. */
  instructions: TransactionInstruction[];
  /** The lookup tables the route's accounts live in, by key. */
  lookupTables: string[];
  outAmount: string;
  otherAmountThreshold: string;
  routeLabels: string[];
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
 * Reads a `/build` answer into the instructions the DCA task runs.
 *
 * Refuses an answer that is not a swap of the requested mints and amount, and one that carries
 * `otherInstructions`, which nothing here has characterised for a swap run inside a task.
 * `computeBudgetInstructions` are left out: a compute budget instruction takes effect only at
 * the top level of a transaction, and the crank turner sets the limit and price of the
 * transaction that runs the task. `tipInstruction` is present only when `tipAmount` is sent,
 * which this service never does.
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

  if (!Array.isArray(raw.routePlan)) {
    throw invalid("routePlan");
  }
  const routeLabels = raw.routePlan.map((hop: unknown) => {
    if (!isRecord(hop) || !isRecord(hop.swapInfo)) {
      throw invalid("routePlan");
    }
    return readString(hop.swapInfo, "label");
  });
  if (routeLabels.includes(RFQ_V2_LABEL)) {
    throw new Error(
      `Jupiter built a route through ${RFQ_V2_LABEL}, which needs a market maker's signature`
    );
  }

  const tables = raw.addressesByLookupTableAddress;
  if (tables !== undefined && tables !== null && !isRecord(tables)) {
    throw invalid("addressesByLookupTableAddress");
  }

  return {
    instructions: [
      ...readInstructions(raw, "setupInstructions"),
      readInstruction(raw.swapInstruction, "swapInstruction"),
      ...(raw.cleanupInstruction === undefined ||
      raw.cleanupInstruction === null
        ? []
        : [readInstruction(raw.cleanupInstruction, "cleanupInstruction")]),
    ],
    lookupTables: Object.keys(tables ?? {}).map((key) =>
      new PublicKey(key).toBase58()
    ),
    outAmount: readAmount(raw, "outAmount"),
    otherAmountThreshold: readAmount(raw, "otherAmountThreshold"),
    routeLabels,
  };
}

/** Builds a DCA order's swap through `/build` and reads the answer. */
export async function buildJupiterSwap(
  request: BuildSwapRequest & { apiKey?: string },
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
