import { PublicKey } from "@solana/web3.js";
import {
  ataResolver,
  combineResolvers,
  resolveIndividual,
} from "@helium/spl-utils";
import { PROGRAM_ID } from "./constants";
import { circuitBreakerResolvers } from "@helium/circuit-breaker-sdk";

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
