import { subDaoEpochInfoResolver } from "@helium/helium-sub-daos-sdk";
import {
  ataResolver,
  combineResolvers,
  heliumCommonResolver,
  resolveIndividual,
} from "@helium/spl-utils";
import { hotspotStorageKey } from "./pdas";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";

export const heliumEntityManagerResolvers = combineResolvers(
  heliumCommonResolver,
  ataResolver({
    instruction: "initializeHotspotConfigV0",
    account: "tokenAccount",
    mint: "collection",
    owner: "hotspotConfig",
  }),
  resolveIndividual(async ({ path, args, provider }) => {
    if (
      path[path.length - 1] === "storage" &&
      args[args.length - 1].hotspotKey
    ) {
      return hotspotStorageKey(args[args.length - 1].hotspotKey)[0];
    } else if (path[path.length - 1] === "recipient") {
      // @ts-ignore
      return provider.wallet?.publicKey;
    }
  }),
  resolveIndividual(async ({ path, accounts }) => {
    if (path[path.length - 1] === "ownerHotspotAta" && (accounts.owner || accounts.hotspotOwner) && accounts.hotspot) {
      return getAssociatedTokenAddress(accounts.hotspot as PublicKey, (accounts.owner || accounts.hotspotOwner) as PublicKey)
    }
  }),
  ataResolver({
    instruction: "issueHotspotV0",
    account: "recipientTokenAccount",
    mint: "hotspot",
    owner: "hotspotOwner",
  }),
  ataResolver({
    instruction: "issueHotspotV0",
    account: "dcBurner",
    mint: "dcMint",
    owner: "dcFeePayer",
  }),
  ataResolver({
    instruction: "changeMetadataV0",
    account: "ownerDcAta",
    mint: "dcMint",
    owner: "hotspotOwner",
  }),
  subDaoEpochInfoResolver
);
