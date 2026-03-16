import { publicProcedure } from "../../../procedures";
import { getTokenBalances } from "@/lib/queries/tokens";
import { ORPCError } from "@orpc/server";

/**
 * Get token balances for a wallet address.
 */
export const getBalances = publicProcedure.tokens.getBalances.handler(
  async ({ input, errors }) => {
    const { walletAddress } = input;

    if (!walletAddress) {
      throw errors.INVALID_WALLET_ADDRESS();
    }

    const tokenBalances = await getTokenBalances({ walletAddress });
    return tokenBalances;
  },
);
