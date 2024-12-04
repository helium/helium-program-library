import * as anchor from "@coral-xyz/anchor";

export const getBlockTimeWithRetry = async ({
  slot,
  maxRetries = 3,
  maxSlotIncrement = 1,
  retryInterval = 1000,
  provider,
}: {
  slot: number;
  maxRetries?: number;
  maxSlotIncrement?: number;
  retryInterval?: number;
  provider: anchor.AnchorProvider;
}): Promise<number | null> => {
  try {
    const connection = provider.connection;

    // Get the block time of the specified slot
    const blockTime = await connection.getBlockTime(slot);

    return blockTime;
  } catch (err) {
    console.error("Error fetching block time:", err);

    if (maxRetries > 0) {
      console.log(`Retrying in ${retryInterval / 1000} seconds...`);
      await new Promise((resolve) => setTimeout(resolve, retryInterval));
      return getBlockTimeWithRetry({
        slot,
        maxRetries: maxRetries - 1,
        retryInterval,
        provider,
      });
    } else {
      if (
        maxSlotIncrement > 0 &&
        (err as Error).message.toLowerCase().includes("slot") &&
        (err as Error).message.toLowerCase().includes("was skipped")
      ) {
        return getBlockTimeWithRetry({
          slot: slot + 1,
          maxRetries: 1,
          maxSlotIncrement: maxSlotIncrement - 1,
          retryInterval,
          provider,
        });
      }

      throw new Error("Max retries reached. Unable to fetch block time.");
    }
  }
};
