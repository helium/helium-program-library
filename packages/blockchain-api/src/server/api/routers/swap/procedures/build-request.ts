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
