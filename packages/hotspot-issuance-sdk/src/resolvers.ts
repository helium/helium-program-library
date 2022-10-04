import { ataResolver, combineResolvers } from "@helium-foundation/spl-utils";

export const hotspotIssuanceResolvers = combineResolvers(
  ataResolver({
    instruction: "initializeHotspotConfigV0",
    account: "tokenAccount",
    mint: "collection",
    owner: "hotspotConfig",
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
  })
);
