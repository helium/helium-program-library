import { publicProcedure } from "../../../procedures";
import { getWelcomePackByAddress } from "@/lib/queries/welcome-packs";

/**
 * Get a welcome pack by its address.
 */
export const getByAddress = publicProcedure.welcomePacks.getByAddress.handler(
  async ({ input, errors }) => {
    const { packAddress } = input;

    const pack = await getWelcomePackByAddress(packAddress);

    if (!pack) {
      throw errors.NOT_FOUND({ message: "Welcome pack not found" });
    }

    return pack;
  },
);
