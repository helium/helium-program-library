import { publicProcedure } from "../../../procedures";
import { createSolanaConnection } from "@/lib/solana";
import { getAssetIdFromPubkey } from "@/lib/utils/hotspot-helpers";
import { init as initLd, recipientKey } from "@helium/lazy-distributor-sdk";
import { userWelcomePacksKey } from "@helium/welcome-pack-sdk";
import { PublicKey } from "@solana/web3.js";
import { HNT_LAZY_DISTRIBUTOR_ADDRESS } from "@/lib/constants/lazy-distributor";
import { NATIVE_MINT } from "@solana/spl-token";
import {
  resolveTokenAmountInput,
  toTokenAmountOutput,
} from "@/lib/utils/token-math";
import {
  BASE_TX_FEE_LAMPORTS,
  FANOUT_FUNDING_AMOUNT,
  getMiniFanoutRentParts,
  getWelcomePackRentParts,
  getWelcomePackCost,
  RECIPIENT_SPACE,
  getRentLamports,
} from "@/lib/utils/balance-validation";
import { preTaskUrl, TASK_QUEUE_ID } from "@/lib/constants/tuktuk";
import { init as initTuktuk } from "@helium/tuktuk-sdk";
import { toSixColumnCron } from "@/lib/utils/misc";
import BN from "bn.js";

export const estimateCreationCost =
  publicProcedure.rewardContract.estimateCreationCost.handler(
    async ({ input, errors }) => {
      const {
        entityPubKey,
        delegateWalletAddress,
        recipients,
        rewardSchedule,
      } = input;

      const assetId = await getAssetIdFromPubkey(entityPubKey);
      if (!assetId) {
        throw errors.NOT_FOUND({ message: "Hotspot not found" });
      }

      const { connection, provider } = createSolanaConnection(
        delegateWalletAddress,
      );
      const assetPubkey = new PublicKey(assetId);

      const ldProgram = await initLd(provider);
      const recipientK = recipientKey(
        new PublicKey(HNT_LAZY_DISTRIBUTOR_ADDRESS),
        assetPubkey,
      )[0];
      const recipientAcc =
        await ldProgram.account.recipientV0.fetchNullable(recipientK);

      let rentFee = new BN(0);
      if (!recipientAcc) {
        rentFee = rentFee.add(
          new BN(await getRentLamports(connection, RECIPIENT_SPACE)),
        );
      }

      const hasClaimable = recipients.some((r) => r.type === "CLAIMABLE");
      let recipientGift = new BN(0);
      let transactionFees = new BN(BASE_TX_FEE_LAMPORTS);
      const scheduleLen = toSixColumnCron(rewardSchedule).length;
      const preTaskUrlLen = preTaskUrl(assetId).length;

      if (hasClaimable) {
        const numFixedShares = recipients.filter(
          (r) => r.receives.type === "FIXED",
        ).length;
        const userWelcomePacksAcc = await connection.getAccountInfo(
          userWelcomePacksKey(new PublicKey(delegateWalletAddress))[0],
        );
        const { welcomePackRent, userWelcomePacksRent, fanoutRent, ataRent } =
          await getWelcomePackRentParts(connection, {
            numFixedShares,
            numPercentageShares: recipients.length - numFixedShares,
            scheduleLen,
            preTaskUrlLen,
            userWelcomePacksExists: !!userWelcomePacksAcc,
          });
        const claimableRecipient = recipients.find(
          (r) => r.type === "CLAIMABLE",
        );
        if (claimableRecipient?.type === "CLAIMABLE") {
          recipientGift = await resolveTokenAmountInput(
            claimableRecipient.giftedCurrency,
            NATIVE_MINT.toBase58(),
          );
        }
        // With more than one recipient, initialize_welcome_pack_v0 escrows the
        // future fanout's rent, its HNT ATA rent and FANOUT_FUNDING_AMOUNT
        // alongside the gift.
        const hasFanout = recipients.length > 1;
        const { packCost } = getWelcomePackCost({
          welcomePackRent,
          fanoutRent,
          ataRent,
          giftLamports: recipientGift.toNumber(),
          hasFanout,
        });
        const funding = new BN(hasFanout ? FANOUT_FUNDING_AMOUNT : 0);
        // The gift and funding are reported on their own lines; the rest of
        // the pack's cost is rent.
        transactionFees = transactionFees.add(funding);
        rentFee = rentFee.add(new BN(packCost).sub(recipientGift).sub(funding));
        rentFee = rentFee.add(new BN(userWelcomePacksRent));
      } else {
        // Mini-fanout path: rent for the miniFanout account, its HNT ATA and
        // the 2 tuktuk tasks (task + preTask) initialize_mini_fanout_v0 queues
        const tuktukProgram = await initTuktuk(provider);
        const [
          { fanoutRent, ataRent, distTaskRent, preTaskRent },
          taskQueueAcc,
        ] = await Promise.all([
          getMiniFanoutRentParts(connection, {
            numShares: recipients.length,
            scheduleLen,
            preTaskUrlLen,
          }),
          tuktukProgram.account.taskQueueV0.fetch(TASK_QUEUE_ID),
        ]);
        rentFee = rentFee.add(
          new BN(fanoutRent + ataRent + distTaskRent + preTaskRent),
        );
        // Each queued task pays the queue's min crank reward, plus funding
        // for future scheduled transaction fees
        transactionFees = transactionFees
          .add(taskQueueAcc.minCrankReward.muln(2))
          .add(new BN(FANOUT_FUNDING_AMOUNT));
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
    },
  );
