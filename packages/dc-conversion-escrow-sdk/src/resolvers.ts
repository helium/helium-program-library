import {
  ataResolver,
  combineResolvers,
  heliumCommonResolver
} from "@helium/anchor-resolvers";

export const dcConversionEscrowResolvers = combineResolvers(
  heliumCommonResolver,
  ataResolver({
    instruction: "initializeEscrowV0",
    mint: "mint",
    account: "escrow",
    owner: "conversionEscrow",
  })
);
