import { ataResolver, combineResolvers } from "@helium-foundation/spl-utils";

export const dataCreditsResolvers = combineResolvers(
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
