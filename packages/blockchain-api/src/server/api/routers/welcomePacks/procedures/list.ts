import { publicProcedure } from "../../../procedures";
import { getWelcomePacksByOwner } from "@/lib/queries/welcome-packs";

/**
 * List all welcome packs for a wallet.
 */
export const list = publicProcedure.welcomePacks.list.handler(
  async ({ input, errors }) => {
    const { walletAddress } = input;

    if (!walletAddress) {
      throw errors.INVALID_WALLET_ADDRESS();
    }

    return await getWelcomePacksByOwner(walletAddress);
  },
);
