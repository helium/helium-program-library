import {
  ataResolver,
  combineResolvers,
  resolveIndividual,
} from "@helium/anchor-resolvers";
import { circuitBreakerResolvers } from "@helium/circuit-breaker-sdk";
import { PROGRAM_ID } from "./constants";

export const treasuryManagementResolvers = combineResolvers(
  circuitBreakerResolvers,
  resolveIndividual(async ({ path }) => {
    switch (path[path.length - 1]) {
      case "treasuryManagementProgram":
        return PROGRAM_ID;
      default:
        return;
    }
  }),
  ataResolver({
    instruction: "redeemV0",
    account: "to",
    mint: "treasuryMint",
    owner: "owner",
  }),
  ataResolver({
    instruction: "initializeTreasuryManagementV0",
    account: "treasury",
    mint: "treasuryMint",
    owner: "treasuryManagement",
  }),
  ataResolver({
    instruction: "redeemV0",
    account: "from",
    mint: "supplyMint",
    owner: "owner",
  }),
);
