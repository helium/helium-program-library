import { publicProcedure } from "../../../procedures";
import { getHotspotsByOwner } from "@/lib/queries/hotspots";

/**
 * Get hotspots by wallet address with optional filtering and pagination.
 */
export const getHotspots = publicProcedure.hotspots.getHotspots.handler(
  async ({ input, errors }) => {
    const { walletAddress, type, page, limit } = input;

    if (!walletAddress || walletAddress.length < 32) {
      throw errors.INVALID_WALLET_ADDRESS();
    }

    const hotspots = await getHotspotsByOwner({
      owner: walletAddress,
      type,
      page,
      limit,
    });

    return hotspots;
  },
);
