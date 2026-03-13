import { publicProcedure } from "../../../procedures";
import { env } from "@/lib/env";
import { createSolanaConnection } from "@/lib/solana";
import { getAssetIdFromPubkey } from "@/lib/utils/hotspot-helpers";

import {
  init as initWelcomePack,
  userWelcomePacksKey,
  welcomePackKey,
} from "@helium/welcome-pack-sdk";
import { init as initMiniFanout } from "@helium/mini-fanout-sdk";
import { init as initLd, recipientKey } from "@helium/lazy-distributor-sdk";
import { getAsset } from "@helium/spl-utils";
import { PublicKey } from "@solana/web3.js";
import WelcomePackModel from "@/lib/models/welcome-pack";
import { MiniFanout } from "@/lib/models/mini-fanout";
import { Recipient } from "@/lib/models/recipient";
import { connectToDb } from "@/lib/utils/db";
import { toTokenAmountOutput } from "@/lib/utils/token-math";
import { toFiveColumnCron } from "@/lib/utils/misc";
import { HNT_MINT } from "@helium/spl-utils";
import { NATIVE_MINT } from "@solana/spl-token";
import BN from "bn.js";
import { HNT_LAZY_DISTRIBUTOR_ADDRESS } from "@/lib/constants/lazy-distributor";

import type { z } from "zod";
import type { FindRewardContractResponseSchema } from "@helium/blockchain-api/schemas/reward-contract";

type FindRewardContractResponse = z.infer<
  typeof FindRewardContractResponseSchema
>;

export const find = publicProcedure.rewardContract.find.handler(
  async ({ input, errors }) => {
    const { entityPubKey } = input;

    const assetId = await getAssetIdFromPubkey(entityPubKey);
    if (!assetId) {
      throw errors.NOT_FOUND({ message: "Hotspot not found" });
    }

    const { provider, connection } = createSolanaConnection(
      PublicKey.default.toBase58(),
    );
    const assetEndpoint = env.ASSET_ENDPOINT || connection.rpcEndpoint;
    const assetPubkey = new PublicKey(assetId);

    // Step 1: Check for PENDING welcome pack
    if (env.NO_PG === "false") {
      await connectToDb();

      const wpRecord = await WelcomePackModel.findOne({
        where: { asset: assetPubkey.toBase58() },
      });

      if (wpRecord) {
        const hntMint = HNT_MINT.toBase58();
        const solMint = NATIVE_MINT.toBase58();
        const pendingContract: FindRewardContractResponse = {
          status: "PENDING",
          contract: {
            delegateWalletAddress: wpRecord.owner,
            recipients: wpRecord.rewardsSplit.map((split) => {
              const receives =
                split.type === "fixed"
                  ? {
                      type: "FIXED" as const,
                      tokenAmount: toTokenAmountOutput(
                        new BN(split.tokenAmount.amount),
                        hntMint,
                      ),
                    }
                  : {
                      type: "SHARES" as const,
                      shares: split.amount,
                    };
              if (split.address === PublicKey.default.toBase58()) {
                return {
                  type: "CLAIMABLE" as const,
                  giftedCurrency: toTokenAmountOutput(
                    new BN(wpRecord.solAmount),
                    solMint,
                  ),
                  receives,
                };
              }
              return {
                type: "PRESET" as const,
                walletAddress: split.address,
                receives,
              };
            }),
            rewardSchedule: toFiveColumnCron(wpRecord.rewardsSchedule),
          },
        };
        return pendingContract;
      }
    } else {
      const wpProgram = await initWelcomePack(provider);
      const asset = await getAsset(assetEndpoint, assetPubkey);

      if (asset) {
        const assetOwner = new PublicKey(
          typeof asset.ownership.owner === "string"
            ? asset.ownership.owner
            : asset.ownership.owner.toBase58(),
        );

        // When asset is transferred to WelcomePack, assetOwner IS the pack address
        const directWelcomePack =
          await wpProgram.account.welcomePackV0.fetchNullable(assetOwner);
        if (directWelcomePack && directWelcomePack.asset.equals(assetPubkey)) {
          return buildPendingContractResponse(directWelcomePack);
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
              return buildPendingContractResponse(welcomePack);
            }
          }
        }
      }
    }

    // Step 2: Check for ACTIVE MiniFanout
    // First check DB (when available) via recipient's destination
    if (env.NO_PG === "false") {
      const recipientRecord = await Recipient.findOne({
        where: { asset: assetPubkey.toBase58() },
        include: [{ model: MiniFanout, as: "split" }],
      });

      if (recipientRecord?.split) {
        const mfRecord = recipientRecord.split;
        const hntMint = HNT_MINT.toBase58();
        const activeContract: FindRewardContractResponse = {
          status: "ACTIVE",
          contract: {
            delegateWalletAddress: mfRecord.owner,
            entityOwnerAddress: mfRecord.namespace,
            recipients: mfRecord.shares.map((share) => ({
              walletAddress: share.wallet,
              receives:
                share.share.fixed && share.share.fixed.amount !== "0"
                  ? {
                      type: "FIXED" as const,
                      tokenAmount: toTokenAmountOutput(
                        new BN(share.share.fixed.amount),
                        hntMint,
                      ),
                    }
                  : {
                      type: "SHARES" as const,
                      shares: share.share.share?.amount || 0,
                    },
            })),
            rewardSchedule: toFiveColumnCron(mfRecord.schedule),
          },
        };
        return activeContract;
      }
    }

    // Fallback to on-chain lookup via recipient's destination
    // The recipient account's destination field points to the mini fanout
    const mfProgram = await initMiniFanout(provider);
    const ldProgram = await initLd(provider);

    const lazyDistributor = new PublicKey(HNT_LAZY_DISTRIBUTOR_ADDRESS);
    const [recipientK] = recipientKey(lazyDistributor, assetPubkey);
    const recipientAcc =
      await ldProgram.account.recipientV0.fetchNullable(recipientK);

    if (recipientAcc && !recipientAcc.destination.equals(PublicKey.default)) {
      const miniFanout = recipientAcc.destination;
      // Wrap in try/catch because destination may point to a non-MiniFanout account
      // which would cause a deserialization error rather than returning null
      let miniFanoutAccount = null;
      try {
        miniFanoutAccount =
          await mfProgram.account.miniFanoutV0.fetchNullable(miniFanout);
      } catch {
        // Destination exists but is not a MiniFanout account - treat as no contract
      }

      if (miniFanoutAccount) {
        const hntMint = HNT_MINT.toBase58();
        const activeContract: FindRewardContractResponse = {
          status: "ACTIVE",
          contract: {
            delegateWalletAddress: miniFanoutAccount.owner.toBase58(),
            entityOwnerAddress: miniFanoutAccount.namespace.toBase58(),
            recipients: miniFanoutAccount.shares.map(
              (share: {
                wallet: PublicKey;
                share: { fixed?: { amount: BN }; share?: { amount: number } };
              }) => ({
                walletAddress: share.wallet.toBase58(),
                receives:
                  share.share.fixed && !share.share.fixed.amount.isZero()
                    ? {
                        type: "FIXED" as const,
                        tokenAmount: toTokenAmountOutput(
                          share.share.fixed.amount,
                          hntMint,
                        ),
                      }
                    : {
                        type: "SHARES" as const,
                        shares: share.share.share?.amount || 0,
                      },
              }),
            ),
            rewardSchedule: toFiveColumnCron(miniFanoutAccount.schedule),
          },
        };
        return activeContract;
      }
    }

    // Step 3: NONE
    const noneResponse: FindRewardContractResponse = {
      status: "NONE",
    };
    return noneResponse;
  },
);

function buildPendingContractResponse(
  welcomePack: any,
): FindRewardContractResponse {
  const hntMint = HNT_MINT.toBase58();
  const solMint = NATIVE_MINT.toBase58();
  return {
    status: "PENDING",
    contract: {
      delegateWalletAddress: welcomePack.owner.toBase58(),
      recipients: welcomePack.rewardsSplit.map((split: any) => {
        const receives =
          split.share.fixed && !split.share.fixed.amount.isZero()
            ? {
                type: "FIXED" as const,
                tokenAmount: toTokenAmountOutput(
                  split.share.fixed.amount,
                  hntMint,
                ),
              }
            : {
                type: "SHARES" as const,
                shares: split.share.share?.amount || 0,
              };
        if (split.wallet.equals(PublicKey.default)) {
          return {
            type: "CLAIMABLE" as const,
            giftedCurrency: toTokenAmountOutput(welcomePack.solAmount, solMint),
            receives,
          };
        }
        return {
          type: "PRESET" as const,
          walletAddress: split.wallet.toBase58(),
          receives,
        };
      }),
      rewardSchedule: toFiveColumnCron(welcomePack.rewardsSchedule),
    },
  };
}
