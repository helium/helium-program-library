import { getTokens } from "./procedures/getTokens";
import { getQuote } from "./procedures/getQuote";
import { getInstructions } from "./procedures/getInstructions";
import { swapContract } from "@helium/blockchain-api/contracts";
import { implement } from "@orpc/server";

/**
 * Swap router - handles token swap operations via Jupiter.
 */
export const swapRouter = implement(swapContract).router({
  /** Get list of verified tokens available for swapping */
  getTokens,
  /** Get a quote for swapping tokens */
  getQuote,
  /** Get swap transaction instructions */
  getInstructions,
});
