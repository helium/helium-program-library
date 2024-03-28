import {
  ataResolver,
  combineResolvers,
  heliumCommonResolver
} from "@helium/anchor-resolvers";

export const conversionEscrowResolvers = combineResolvers(
  heliumCommonResolver,
  ataResolver({
    instruction: "initializeEscrowV0",
    mint: "mint",
    account: "escrow",
    owner: "conversionEscrow",
  })
);
