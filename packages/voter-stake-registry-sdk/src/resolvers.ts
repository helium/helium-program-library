import {
  ataResolver,
  combineResolvers,
  heliumCommonResolver
} from "@helium/spl-utils";
export * from "./constants";
export * from "./pdas";
export * from "./resolvers";

export const vsrResolvers = combineResolvers(
  heliumCommonResolver,
  ataResolver({
    instruction: "initializePositionV0",
    account: "vault",
    mint: "depositMint",
    owner: "position",
  }),
  ataResolver({
    instruction: "depositV0",
    account: "vault",
    mint: "mint",
    owner: "position",
  }),
  ataResolver({
    instruction: "depositV0",
    account: "depositToken",
    mint: "mint",
    owner: "depositAuthority",
  }),
  ataResolver({
    instruction: "withdrawV0",
    account: "vault",
    mint: "depositMint",
    owner: "position",
  }),
  ataResolver({
    account: "positionTokenAccount",
    mint: "mint",
    owner: "positionAuthority",
  })
);
