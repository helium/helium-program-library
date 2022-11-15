import { subDaoEpochInfoResolver } from "@helium/helium-sub-daos-sdk";
import {
  ataResolver,
  combineResolvers,
  resolveIndividual
} from "@helium/spl-utils";
import { PublicKey } from "@solana/web3.js";
import { hotspotStorageKey } from "./pdas";

export const heliumEntityManagerResolvers = combineResolvers(
  resolveIndividual(async ({ path }) => {
    switch (path[path.length - 1]) {
      case "dataCreditsProgram":
        return new PublicKey("credacwrBVewZAgCwNgowCSMbCiepuesprUWPBeLTSg");
      case "tokenMetadataProgram":
        return new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
      case "heliumSubDaosProgram":
        return new PublicKey("hdaojPkgSD8bciDc1w2Z4kXFFibCXngJiw2GRpEL7Wf");
      case "bubblegumProgram":
        return new PublicKey("BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY");
      case "compressionProgram":
        return new PublicKey("cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK");
      case "logWrapper":
        return new PublicKey("noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV");
      default:
        return;
    }
  }),
  ataResolver({
    instruction: "initializeHotspotConfigV0",
    account: "tokenAccount",
    mint: "collection",
    owner: "hotspotConfig",
  }),
  resolveIndividual(async ({ path, args, provider }) => {
    if (path[path.length - 1] === "storage") {
      return hotspotStorageKey(
        args[args.length - 1].eccCompact
      )[0];
    } else if (path[path.length - 1] === "recipient") {
      // @ts-ignore
      return provider.wallet?.publicKey;
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
  subDaoEpochInfoResolver
);
