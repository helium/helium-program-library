/** The only swap mode `/build` quotes and builds. */
export const BUILD_SWAP_MODE = "ExactIn";

/**
 * The `maxAccounts` every `/build` request starts at, for the quote and the
 * build alike, so the quoted route and the built route are drawn from the
 * same bound. Jupiter accepts 1 to 64 and defaults to 64, a route that can
 * take every account a transaction may name. getInstructions then adds
 * compute budget instructions, which name one more program account, and the
 * transaction carries a signature slot for each signer, so the route is held
 * 4 accounts below that default. Jupiter's guidance is to lower the bound
 * gradually and to expect no route or a worse price below 50, which the
 * requote sequence below stays above.
 */
export const BUILD_MAX_ACCOUNTS = 60;

/** How much each requote lowers `maxAccounts` by. */
export const MAX_ACCOUNTS_STEP = 3;

/**
 * How many times getInstructions asks `/build` again with a lower
 * `maxAccounts` when the transaction it built is over the packet limit. The
 * last requote asks for `BUILD_MAX_ACCOUNTS - SIZE_REQUOTES * MAX_ACCOUNTS_STEP`
 * = 51 accounts.
 */
export const SIZE_REQUOTES = 3;

/** The `maxAccounts` of requote number `requote`; requote 0 is the first request. */
export const maxAccountsForRequote = (requote: number): number =>
  BUILD_MAX_ACCOUNTS - requote * MAX_ACCOUNTS_STEP;

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
