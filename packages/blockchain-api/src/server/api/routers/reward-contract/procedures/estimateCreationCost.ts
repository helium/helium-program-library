import { publicProcedure } from "../../../procedures";
import { createSolanaConnection } from "@/lib/solana";
import { getAssetIdFromPubkey } from "@/lib/utils/hotspot-helpers";
import { init as initLd, recipientKey } from "@helium/lazy-distributor-sdk";
import { PublicKey } from "@solana/web3.js";
import { HNT_LAZY_DISTRIBUTOR_ADDRESS } from "@/lib/constants/lazy-distributor";
import { NATIVE_MINT } from "@solana/spl-token";
import {
  resolveTokenAmountInput,
  toTokenAmountOutput,
} from "@/lib/utils/token-math";
import {
  ATA_SPACE,
  BASE_TX_FEE_LAMPORTS,
  MINI_FANOUT_DIST_TASK_SPACE,
  MINI_FANOUT_PRE_TASK_SPACE,
  miniFanoutSpace,
  RECIPIENT_SPACE,
  USER_WELCOME_PACKS_SPACE,
  welcomePackSpace,
} from "@/lib/utils/balance-validation";
import { env } from "@/lib/env";
import { toSixColumnCron } from "@/lib/utils/misc";
import { solToLamportsBN } from "@/lib/utils/token-math";
import BN from "bn.js";

const FANOUT_FUNDING_AMOUNT = solToLamportsBN(0.01);

export const estimateCreationCost =
  publicProcedure.rewardContract.estimateCreationCost.handler(
    async ({ input, errors }) => {
      const { entityPubKey, delegateWalletAddress, recipients, rewardSchedule } =
        input;

      const assetId = await getAssetIdFromPubkey(entityPubKey);
      if (!assetId) {
        throw errors.NOT_FOUND({ message: "Hotspot not found" });
      }

      const { connection, provider } = createSolanaConnection(
        delegateWalletAddress
      );
      const assetPubkey = new PublicKey(assetId);

      const ldProgram = await initLd(provider);
      const recipientK = recipientKey(
        new PublicKey(HNT_LAZY_DISTRIBUTOR_ADDRESS),
        assetPubkey
      )[0];
      const recipientAcc = await ldProgram.account.recipientV0.fetchNullable(
        recipientK
      );

      let rentFee = new BN(0);
      if (!recipientAcc) {
        rentFee = rentFee.add(
          new BN(
            await connection.getMinimumBalanceForRentExemption(RECIPIENT_SPACE)
          )
        );
      }

      const hasClaimable = recipients.some((r) => r.type === "CLAIMABLE");
      let recipientGift = new BN(0);
      let transactionFees = new BN(BASE_TX_FEE_LAMPORTS);
      const scheduleLen = toSixColumnCron(rewardSchedule).length;
      const fanoutSpace = miniFanoutSpace({
        numShares: recipients.length,
        scheduleLen,
        preTaskUrlLen: `${env.ORACLE_URL}/v1/tuktuk/asset/${assetId}`.length,
      });

      if (hasClaimable) {
        const numFixedShares = recipients.filter(
          (r) => r.receives.type === "FIXED"
        ).length;
        const [welcomePackRent, userWelcomePacksRent, fanoutRent, ataRent] =
          await Promise.all([
            connection.getMinimumBalanceForRentExemption(
              welcomePackSpace({
                numFixedShares,
                numPercentageShares: recipients.length - numFixedShares,
                scheduleLen,
              })
            ),
            connection.getMinimumBalanceForRentExemption(
              USER_WELCOME_PACKS_SPACE
            ),
            recipients.length > 1
              ? connection.getMinimumBalanceForRentExemption(fanoutSpace)
              : 0,
            recipients.length > 1
              ? connection.getMinimumBalanceForRentExemption(ATA_SPACE)
              : 0,
          ]);
        rentFee = rentFee.add(new BN(welcomePackRent + userWelcomePacksRent));
        if (recipients.length > 1) {
          // initialize_welcome_pack_v0 escrows the future fanout's rent, its
          // HNT ATA rent and FANOUT_FUNDING_AMOUNT alongside the pack.
          rentFee = rentFee.add(new BN(fanoutRent + ataRent));
          transactionFees = transactionFees.add(FANOUT_FUNDING_AMOUNT);
        }
        const claimableRecipient = recipients.find(
          (r) => r.type === "CLAIMABLE"
        );
        if (claimableRecipient?.type === "CLAIMABLE") {
          recipientGift = await resolveTokenAmountInput(
            claimableRecipient.giftedCurrency,
            NATIVE_MINT.toBase58()
          );
        }
      } else {
        // Mini-fanout path: rent for miniFanout account + 2 tuktuk tasks (task + preTask)
        const [fanoutRent, distTaskRent, preTaskRent] = await Promise.all([
          connection.getMinimumBalanceForRentExemption(fanoutSpace),
          connection.getMinimumBalanceForRentExemption(
            MINI_FANOUT_DIST_TASK_SPACE
          ),
          connection.getMinimumBalanceForRentExemption(
            MINI_FANOUT_PRE_TASK_SPACE
          ),
        ]);
        rentFee = rentFee.add(new BN(fanoutRent + distTaskRent + preTaskRent));
        // Funding for future scheduled transaction fees
        transactionFees = transactionFees.add(FANOUT_FUNDING_AMOUNT);
      }

      const total = transactionFees.add(rentFee).add(recipientGift);
      const solMint = NATIVE_MINT.toBase58();

      return {
        total: await toTokenAmountOutput(total, solMint),
        lineItems: {
          transactionFees: await toTokenAmountOutput(transactionFees, solMint),
          rentFee: await toTokenAmountOutput(rentFee, solMint),
          recipientGift: await toTokenAmountOutput(recipientGift, solMint),
        },
      };
    }
  );
