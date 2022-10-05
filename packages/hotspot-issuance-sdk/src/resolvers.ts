import { PublicKey } from "@solana/web3.js";
import {
  ataResolver,
  combineResolvers,
  resolveIndividual,
} from "@helium-foundation/spl-utils";
import { PROGRAM_ID } from "./constants";
import { subDaoEpochInfoResolver } from "../../helium-sub-daos-sdk/src/index";

export const hotspotIssuanceResolvers = combineResolvers(
  ataResolver({
    instruction: "initializeHotspotConfigV0",
    account: "tokenAccount",
    mint: "collection",
    owner: "hotspotConfig",
  }),
  resolveIndividual(async ({ path, args }) => {
    if (path[path.length - 1] === "hotspot") {
      return (
        await PublicKey.findProgramAddress(
          [Buffer.from("hotspot", "utf-8"), args[args.length - 1].eccCompact],
          PROGRAM_ID
        )
      )[0];
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
