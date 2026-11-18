export type EstimateFailure = { mint: string; reason: unknown };

export type SettledEstimates = {
  estimates: Record<string, string>;
  failures: EstimateFailure[];
  allFailed: boolean;
};

/**
 * Splits the settled estimate of each mint into the estimates that resolved
 * and the failures, keyed by mint. `results[i]` is the estimate for `mints[i]`.
 */
export const settleEstimates = (
  mints: string[],
  results: PromiseSettledResult<string>[]
): SettledEstimates => {
  const estimates: Record<string, string> = {};
  const failures: EstimateFailure[] = [];
  results.forEach((result, index) => {
    const mint = mints[index];
    if (result.status === "fulfilled") {
      estimates[mint] = result.value;
    } else {
      failures.push({ mint, reason: result.reason });
    }
  });
  return {
    estimates,
    failures,
    allFailed: failures.length === mints.length,
  };
};
