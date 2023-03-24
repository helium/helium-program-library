import {
  ataResolver,
  combineResolvers, heliumCommonResolver
} from "@helium/spl-utils";

export const hydraResolvers = combineResolvers(
  heliumCommonResolver,
  ataResolver({
    instruction: "initializeSubDaoV0",
    account: "treasury",
    mint: "hntMint",
    owner: "treasuryManagement",
  }),
);
