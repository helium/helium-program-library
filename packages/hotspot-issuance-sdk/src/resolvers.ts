import { PublicKey } from "@solana/web3.js";
import {
  ataResolver,
  combineResolvers,
  resolveIndividual,
} from "@helium/spl-utils";
import { PROGRAM_ID } from "./constants";
import { subDaoEpochInfoResolver } from "@helium/helium-sub-daos-sdk";

export const hotspotIssuanceResolvers = combineResolvers(
  resolveIndividual(async ({ path }) => {
    switch (path[path.length - 1]) {
      case "dataCreditsProgram":
        return new PublicKey("credacwrBVewZAgCwNgowCSMbCiepuesprUWPBeLTSg");
      case "tokenMetadataProgram":
        return new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
      case "heliumSubDaosProgram":
        return new PublicKey("hdaojPkgSD8bciDc1w2Z4kXFFibCXngJiw2GRpEL7Wf");
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
