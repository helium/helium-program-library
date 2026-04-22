import { HNT_MINT, IOT_MINT, MOBILE_MINT } from "@helium/spl-utils";
import { lazyDistributorKey } from "@helium/lazy-distributor-sdk";
import { PublicKey } from "@solana/web3.js";

export type RewardNetwork = "hnt" | "iot" | "mobile";

const NETWORK_TO_MINT: Record<RewardNetwork, PublicKey> = {
  hnt: HNT_MINT,
  iot: IOT_MINT,
  mobile: MOBILE_MINT,
};

export function getMintForNetwork(network: RewardNetwork): PublicKey {
  return NETWORK_TO_MINT[network];
}

export function getLazyDistributorForNetwork(
  network: RewardNetwork,
): PublicKey {
  return lazyDistributorKey(NETWORK_TO_MINT[network])[0];
}
