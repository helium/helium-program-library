import { getBalances } from "./procedures/getBalances";
import { transfer } from "./procedures/transfer";
import { createHntAccount } from "./procedures/createHntAccount";
import { tokensContract } from "@helium/blockchain-api/contracts";
import { implement } from "@orpc/server";

/**
 * Tokens router - handles all token-related operations.
 */
export const tokensRouter = implement(tokensContract).router({
  /** Get token balances for a wallet */
  getBalances,
  /** Create a transaction to transfer tokens */
  transfer,
  /** Create an HNT token account for a wallet */
  createHntAccount,
});
