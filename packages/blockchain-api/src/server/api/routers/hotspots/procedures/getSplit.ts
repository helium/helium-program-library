import { publicProcedure } from "../../../procedures";
import { connectToDb } from "@/lib/utils/db";
import { AssetOwner } from "@/lib/models/hotspot";
import { MiniFanout } from "@/lib/models/mini-fanout";
import { Recipient } from "@/lib/models/recipient";
import { getAssetIdFromPubkey } from "@/lib/utils/hotspot-helpers";
import { toTokenAmountOutput } from "@/lib/utils/token-math";
import { HNT_MINT } from "@helium/spl-utils";
import BN from "bn.js";

interface MiniFanoutShare {
  wallet: string;
  delegate: string;
  share?: {
    fixed?: { amount?: string | number };
    share?: { amount?: number };
  };
}

/**
 * Get the split configuration for a hotspot.
 */
export const getSplit = publicProcedure.hotspots.getSplit.handler(
  async ({ input, errors }) => {
    const { walletAddress, hotspotPubkey } = input;

    await connectToDb();

    // Resolve hotspot pubkey to asset ID
    const assetId = await getAssetIdFromPubkey(hotspotPubkey);
    if (!assetId) {
      throw errors.NOT_FOUND({ message: "Hotspot not found" });
    }

    // Look up the asset and ensure it has a mini fanout configured
    const assetOwner = await AssetOwner.findOne({
      where: { asset: assetId },
      include: [
        {
          model: Recipient,
          as: "recipient",
          required: true,
          include: [
            {
              model: MiniFanout,
              as: "split",
              required: true,
            },
          ],
        },
      ],
    });

    if (!assetOwner?.recipient?.split) {
      throw errors.NOT_FOUND({ message: "Hotspot does not have a split" });
    }

    const shares = assetOwner.recipient.split.shares as MiniFanoutShare[];

    const totalShares = shares.reduce(
      (acc: number, share: MiniFanoutShare) =>
        acc + (share.share?.share?.amount || 0),
      0,
    );

    return {
      walletAddress,
      hotspotPubkey,
      splitAddress: assetOwner.recipient.split.address,
      shares: shares.map((share: MiniFanoutShare) => ({
        wallet: share.wallet,
        delegate: share.delegate,
        fixed: toTokenAmountOutput(
          new BN(String(share.share?.fixed?.amount ?? 0)),
          HNT_MINT.toBase58(),
        ),
        shares: share.share?.share?.amount
          ? share.share.share.amount / totalShares
          : 0,
      })),
    };
  },
);
