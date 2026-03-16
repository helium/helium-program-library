import { publicProcedure } from "../../../procedures";
import { env } from "@/lib/env";
import { createSolanaConnection } from "@/lib/solana";
import { getAssetIdFromPubkey } from "@/lib/utils/hotspot-helpers";
import {
  init as initWelcomePack,
  userWelcomePacksKey,
  welcomePackKey,
} from "@helium/welcome-pack-sdk";
import { getAsset } from "@helium/spl-utils";
import { PublicKey } from "@solana/web3.js";

export const invite = publicProcedure.rewardContract.invite.handler(
  async ({ input, errors }) => {
    const { entityPubKey, signerWalletAddress, expirationDays } = input;

    const assetId = await getAssetIdFromPubkey(entityPubKey);
    if (!assetId) {
      throw errors.NOT_FOUND({ message: "Hotspot not found" });
    }

    const { provider, connection } =
      createSolanaConnection(signerWalletAddress);
    const assetEndpoint = env.ASSET_ENDPOINT || connection.rpcEndpoint;
    const assetPubkey = new PublicKey(assetId);

    const asset = await getAsset(assetEndpoint, assetPubkey);
    if (!asset) {
      throw errors.NOT_FOUND({ message: "Asset not found" });
    }

    const assetOwner = new PublicKey(
      typeof asset.ownership.owner === "string"
        ? asset.ownership.owner
        : asset.ownership.owner.toBase58(),
    );

    const wpProgram = await initWelcomePack(provider);

    // When asset is transferred to WelcomePack, assetOwner IS the pack address
    const directWelcomePack =
      await wpProgram.account.welcomePackV0.fetchNullable(assetOwner);
    if (directWelcomePack && directWelcomePack.asset.equals(assetPubkey)) {
      if (directWelcomePack.owner.toBase58() !== signerWalletAddress) {
        throw errors.UNAUTHORIZED({
          message:
            "Wallet does not have permission to create an invite for this entity.",
        });
      }

      const expirationTs =
        Math.floor(Date.now() / 1000) + expirationDays * 24 * 60 * 60;

      return {
        unsignedMessage: `Approve invite ${directWelcomePack.uniqueId.toString()} expiring ${expirationTs}`,
        expiration: new Date(expirationTs * 1000).toISOString(),
      };
    }

    // Iteration fallback - assetOwner is a wallet with UserWelcomePacks
    const [userWelcomePacksK] = userWelcomePacksKey(assetOwner);
    const userWelcomePacks =
      await wpProgram.account.userWelcomePacksV0.fetchNullable(
        userWelcomePacksK,
      );

    if (userWelcomePacks) {
      for (let i = 0; i < (userWelcomePacks.nextId || 0); i++) {
        const [welcomePackK] = welcomePackKey(assetOwner, i);
        const welcomePack =
          await wpProgram.account.welcomePackV0.fetchNullable(welcomePackK);

        if (welcomePack && welcomePack.asset.equals(assetPubkey)) {
          if (welcomePack.owner.toBase58() !== signerWalletAddress) {
            throw errors.UNAUTHORIZED({
              message:
                "Wallet does not have permission to create an invite for this entity.",
            });
          }

          const expirationTs =
            Math.floor(Date.now() / 1000) + expirationDays * 24 * 60 * 60;

          return {
            unsignedMessage: `Approve invite ${welcomePack.uniqueId.toString()} expiring ${expirationTs}`,
            expiration: new Date(expirationTs * 1000).toISOString(),
          };
        }
      }
    }

    throw errors.NOT_FOUND({ message: "Reward contract not found." });
  },
);
