import * as anchor from '@coral-xyz/anchor';

export const getBlockTimeWithRetry = async ({
  slot,
  maxRetries = 3,
  retryInterval = 1000,
  provider,
}: {
  slot: number;
  maxRetries?: number;
  retryInterval?: number;
  provider: anchor.AnchorProvider;
}) => {
  try {
    const connection = provider.connection;

    // Get the block time of the specified slot
    const blockTime = await connection.getBlockTime(slot);

    return blockTime;
  } catch (error) {
    console.error('Error fetching block time:', error);

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
      throw new Error('Max retries reached. Unable to fetch block time.');
    }
  }
};
