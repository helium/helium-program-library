import { publicProcedure } from "../../../procedures";
import { getWelcomePackByAddress } from "@/lib/queries/welcome-packs";
import { welcomePackKey } from "@helium/welcome-pack-sdk";
import { PublicKey } from "@solana/web3.js";

/**
 * Get a welcome pack by wallet address and pack ID.
 */
export const get = publicProcedure.welcomePacks.get.handler(
  async ({ input, errors }) => {
    const { walletAddress, packId } = input;

    // Derive the welcome pack address from wallet and packId
    const welcomePackAddress = welcomePackKey(
      new PublicKey(walletAddress),
      Number(packId),
    )[0].toBase58();

    const pack = await getWelcomePackByAddress(welcomePackAddress);

    if (!pack) {
      throw errors.NOT_FOUND({ message: "Welcome pack not found" });
    }

    return pack;
  },
);
