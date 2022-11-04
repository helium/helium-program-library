import { PublicKey } from "@solana/web3.js";
import {
  ataResolver,
  combineResolvers,
  heliumCommonResolver,
  resolveIndividual,
} from "@helium/spl-utils";
import { subDaoEpochInfoResolver } from "@helium/helium-sub-daos-sdk";
import { hotspotKey } from "./pdas";
import { getAssociatedTokenAddress } from "@solana/spl-token";

export const heliumEntityManagerResolvers = combineResolvers(
  heliumCommonResolver,
  ataResolver({
    instruction: "initializeHotspotConfigV0",
    account: "tokenAccount",
    mint: "collection",
    owner: "hotspotConfig",
  }),
  resolveIndividual(async ({ path, args, accounts }) => {
    if (path[path.length - 1] === "hotspot" && accounts.collection) {
      return (
        hotspotKey(accounts.collection as PublicKey, args[args.length - 1].eccCompact)
      )[0];
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
    instruction: "assertLocationV0",
    account: "ownerDcAta",
    mint: "dcMint",
    owner: "hotspotOwner",
  }),
  subDaoEpochInfoResolver
);
