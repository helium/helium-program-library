import { ataResolver, combineResolvers } from "@helium-foundation/spl-utils";
import { heliumSubDaosResolvers } from "@helium-foundation/helium-sub-daos-sdk";

export const dataCreditsResolvers = combineResolvers(
  heliumSubDaosResolvers,
  ataResolver({
    instruction: "mintDataCreditsV0",
    account: "recipientTokenAccount",
    mint: "dcMint",
    owner: "recipient",
  }),
  ataResolver({
    instruction: "mintDataCreditsV0",
    account: "burner",
    mint: "hntMint",
    owner: "owner",
  })
);
