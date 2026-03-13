import { publicProcedure } from "../../../procedures";
import { createSolanaConnection } from "@/lib/solana";
import { init as initWelcomePack } from "@helium/welcome-pack-sdk";
import { PublicKey } from "@solana/web3.js";

/**
 * Generate an invite message to be signed for a welcome pack.
 */
export const invite = publicProcedure.welcomePacks.invite.handler(
  async ({ input, errors }) => {
    const { packAddress, walletAddress, expirationDays } = input;

    if (!packAddress || !walletAddress) {
      throw errors.BAD_REQUEST({
        message: "Pack address and wallet address are required",
      });
    }

    // Load uniqueId from on-chain welcome pack account
    const { provider } = createSolanaConnection(walletAddress);
    const program = await initWelcomePack(provider);
    const welcomePack = await program.account.welcomePackV0.fetch(
      new PublicKey(packAddress),
    );
    const uniqueId = welcomePack.uniqueId.toString();
    const expirationTs =
      Math.floor(Date.now() / 1000) + expirationDays * 24 * 60 * 60;

    // Keep the canonical message format aligned with client expectations
    const message = `Approve invite ${uniqueId} expiring ${expirationTs}`;

    return { message, expirationTs };
  },
);
