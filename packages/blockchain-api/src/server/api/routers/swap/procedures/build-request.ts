import { PACKET_DATA_SIZE } from "@solana/web3.js";

/** The only swap mode `/build` quotes and builds. */
export const BUILD_SWAP_MODE = "ExactIn";

/**
 * How many times getInstructions asks `/build` again with a smaller
 * `maxBytes` when the transaction it built is over the packet limit.
 */
export const SIZE_REQUOTES = 3;

/**
 * The `maxBytes` of the next requote after a build at `budget` serialized to
 * `size` bytes: `budget` lowered by how far `size` is over the packet limit.
 * `/build` sizes only the bare swap against `maxBytes`, so the first build
 * sends none and its budget counts as the packet limit. The bytes the server
 * adds around the swap (compute budget instructions, signature slots) are
 * left out of Jupiter's count, and lowering the budget by the overshoot
 * leaves room for them.
 */
export const nextMaxBytes = (budget: number, size: number): number =>
  budget - (size - PACKET_DATA_SIZE);

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
