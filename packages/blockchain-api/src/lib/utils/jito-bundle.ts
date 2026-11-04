/** Jito accepts at most this many transactions in one bundle. */
export const MAX_JITO_BUNDLE_TXS = 5;

export const isJitoCluster = (cluster: string): boolean =>
  cluster === "mainnet" || cluster === "mainnet-beta";

export function shouldUseJitoBundle(
  transactionsLength: number,
  cluster: string,
): boolean {
  return isJitoCluster(cluster) && transactionsLength > 1;
}

/**
 * How many transactions a caller can pack before it adds a dedicated tip
 * transaction. On a Jito cluster one bundle slot stays free for the tip.
 */
export const maxPackedTxs = (cluster: string): number =>
  isJitoCluster(cluster) ? MAX_JITO_BUNDLE_TXS - 1 : MAX_JITO_BUNDLE_TXS;
