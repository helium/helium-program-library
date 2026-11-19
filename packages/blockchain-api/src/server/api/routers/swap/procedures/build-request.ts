import { WALLET_GUARD_RESERVE_BYTES } from "@/lib/utils/wallet-guard";
import { PACKET_DATA_SIZE } from "@solana/web3.js";

/** The only swap mode `/build` quotes and builds. */
export const BUILD_SWAP_MODE = "ExactIn";

/** The DEX labels in a comma-separated `excludeDexes`, without blanks. */
export const excludedLabels = (excludeDexes: string | undefined): Set<string> =>
  new Set(
    (excludeDexes ?? "")
      .split(",")
      .map((label) => label.trim())
      .filter((label) => label.length > 0),
  );

/**
 * Jupiter RFQ v2. Its fills need a market maker's co-signature this procedure
 * does not collect. `/build` refuses RFQ v2 unless an undocumented
 * `enableRfqV2` parameter is sent, which this procedure never sends, so the
 * exclusion on every request and the refusal of a built route through it are
 * defence in depth in case that default changes.
 */
export const RFQ_V2_LABEL = "JupiterRfqV2";

/** The labels every `/build` request excludes, on top of the caller's. */
export const ALWAYS_EXCLUDED_LABELS = [RFQ_V2_LABEL];

/** The caller's excluded labels first, then those every `/build` request excludes. */
export const excludedWithDefaults = (
  excludeDexes: string | undefined,
): Set<string> =>
  new Set([...excludedLabels(excludeDexes), ...ALWAYS_EXCLUDED_LABELS]);

/**
 * What buildVersionedTransaction adds to Jupiter's bare swap (setup, swap and
 * cleanup instructions compiled alone): the compute unit limit and price
 * instructions and the compute budget program's key. Measured from live
 * `/build` answers: 52 bytes.
 */
const COMPUTE_BUDGET_OVERHEAD_BYTES = 52;

/** The largest signed swap transaction getInstructions returns. */
export const SWAP_MAX_TX_BYTES = PACKET_DATA_SIZE - WALLET_GUARD_RESERVE_BYTES;

/**
 * The byte budget `/build` gets for the bare swap (`maxBytes`), so the swap
 * transaction fits SWAP_MAX_TX_BYTES. Unbounded, `/build` answered routes whose
 * transaction ran past the packet limit. Jupiter marks `maxBytes` as
 * experimental, so `maxAccounts` bounds the route too, and getInstructions
 * refuses a transaction that still does not fit.
 */
const ROUTE_MAX_BYTES = SWAP_MAX_TX_BYTES - COMPUTE_BUDGET_OVERHEAD_BYTES;

/** The account limit every `/build` route is built with (`maxAccounts`). */
const ROUTE_MAX_ACCOUNTS = 40;

/**
 * Bound the route a `/build` request may answer with. getQuote and
 * getInstructions both ask for routes inside these bounds. getInstructions asks
 * `/build` again for the real taker, so its route can differ from the quote's,
 * and it still checks the compiled size. `maxBytes` is lower only when
 * getInstructions retries a swap that did not fit.
 */
export const boundRoute = (url: URL, maxBytes = ROUTE_MAX_BYTES): void => {
  url.searchParams.set("maxAccounts", String(ROUTE_MAX_ACCOUNTS));
  url.searchParams.set("maxBytes", String(maxBytes));
};

/**
 * The smallest signed transaction whose message overruns the packet limit: one
 * signature, its length byte and a message one byte too long. web3.js throws
 * only when the message alone is over PACKET_DATA_SIZE.
 */
const OVERRUN_MIN_TX_BYTES = PACKET_DATA_SIZE + 1 + 1 + 64;

/**
 * The `maxBytes` for the one retry of a swap that compiled to `size` bytes, or
 * whose message overran the packet limit when `size` is undefined: the default
 * budget less the overshoot, so a route the size of the first misses it. An
 * unknown size counts as OVERRUN_MIN_TX_BYTES.
 */
export const retryRouteMaxBytes = (size: number | undefined): number =>
  ROUTE_MAX_BYTES - ((size ?? OVERRUN_MIN_TX_BYTES) - SWAP_MAX_TX_BYTES);

/** A base-10 token amount in base units, as Jupiter writes amounts. */
const AMOUNT = /^\d+$/;

/** The amounts a `/build` answer must write as base-10 digits. */
const AMOUNT_FIELDS = ["inAmount", "outAmount", "otherAmountThreshold"];

/**
 * Why a 200 `/build` answer is refused, or undefined when it passes: an
 * `error` it carries, an amount that is not base-10 digits, a `routePlan` that
 * is not an array of hops with a string `swapInfo.label`, or a route through
 * one of the `excluded` labels.
 */
export const checkBuildAnswer = (
  body: unknown,
  excluded: Set<string>,
): string | undefined => {
  if (typeof body !== "object" || body === null) {
    return "Invalid response from Jupiter API";
  }
  const answer = body as Record<string, unknown>;
  if (typeof answer.error === "string" && answer.error.length > 0) {
    return `Jupiter API returned error: ${answer.error}`;
  }
  for (const field of AMOUNT_FIELDS) {
    const value = answer[field];
    if (typeof value !== "string" || !AMOUNT.test(value)) {
      return "Invalid response from Jupiter API";
    }
  }
  if (!Array.isArray(answer.routePlan)) {
    return "Invalid response from Jupiter API";
  }
  for (const hop of answer.routePlan) {
    const label = (hop as { swapInfo?: { label?: unknown } } | null)?.swapInfo
      ?.label;
    if (typeof label !== "string") {
      return "Invalid response from Jupiter API";
    }
    if (excluded.has(label)) {
      return `Jupiter built a route through excluded DEX ${label}`;
    }
  }
  return undefined;
};
