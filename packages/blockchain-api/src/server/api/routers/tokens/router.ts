import { getBalances } from "./procedures/getBalances";
import { transfer } from "./procedures/transfer";
import { multiTransfer } from "./procedures/multiTransfer";
import { burn } from "./procedures/burn";
import { memo } from "./procedures/memo";
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
  /** Create transactions to transfer the same mint to multiple recipients */
  multiTransfer,
  /** Create a transaction to burn tokens */
  burn,
  /** Create a memo transaction */
  memo,
  /** Create an HNT token account for a wallet */
  createHntAccount,
});
