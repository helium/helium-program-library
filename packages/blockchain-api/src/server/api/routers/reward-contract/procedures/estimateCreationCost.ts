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
  ATA_SPACE,
  BASE_TX_FEE_LAMPORTS,
  miniFanoutDistTaskSpace,
  miniFanoutPreTaskSpace,
  miniFanoutSpace,
  RECIPIENT_SPACE,
  USER_WELCOME_PACKS_SPACE,
  welcomePackSpace,
} from "@/lib/utils/balance-validation";
import { env } from "@/lib/env";
import { TASK_QUEUE_ID } from "@/lib/constants/tuktuk";
import { init as initTuktuk } from "@helium/tuktuk-sdk";
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
      const preTaskUrlLen = `${env.ORACLE_URL}/v1/tuktuk/asset/${assetId}`
        .length;
      const fanoutSpace = miniFanoutSpace({
        numShares: recipients.length,
        scheduleLen,
        preTaskUrlLen,
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
        const claimableRecipient = recipients.find(
          (r) => r.type === "CLAIMABLE"
        );
        if (claimableRecipient?.type === "CLAIMABLE") {
          recipientGift = await resolveTokenAmountInput(
            claimableRecipient.giftedCurrency,
            NATIVE_MINT.toBase58()
          );
        }
        // With more than one recipient, initialize_welcome_pack_v0 escrows the
        // future fanout's rent, its HNT ATA rent and FANOUT_FUNDING_AMOUNT
        // alongside the gift. The escrow is transferred into the pack account
        // on top of whatever its init rent already left there, so the pack
        // costs the larger of the two rather than their sum.
        const funding =
          recipients.length > 1 ? FANOUT_FUNDING_AMOUNT : new BN(0);
        const fanoutCost = new BN(fanoutRent + ataRent).add(funding);
        const packCost = BN.max(
          new BN(welcomePackRent),
          recipientGift.add(fanoutCost)
        );
        // The gift and funding are reported on their own lines; the rest of
        // the pack's cost is rent.
        transactionFees = transactionFees.add(funding);
        rentFee = rentFee.add(packCost.sub(recipientGift).sub(funding));
        if (
          !(await connection.getAccountInfo(
            userWelcomePacksKey(new PublicKey(delegateWalletAddress))[0]
          ))
        ) {
          rentFee = rentFee.add(new BN(userWelcomePacksRent));
        }
      } else {
        // Mini-fanout path: rent for the miniFanout account, its HNT ATA and
        // the 2 tuktuk tasks (task + preTask) initialize_mini_fanout_v0 queues
        const tuktukProgram = await initTuktuk(provider);
        const [fanoutRent, ataRent, distTaskRent, preTaskRent, taskQueueAcc] =
          await Promise.all([
            connection.getMinimumBalanceForRentExemption(fanoutSpace),
            connection.getMinimumBalanceForRentExemption(ATA_SPACE),
            connection.getMinimumBalanceForRentExemption(
              miniFanoutDistTaskSpace(recipients.length)
            ),
            connection.getMinimumBalanceForRentExemption(
              miniFanoutPreTaskSpace(preTaskUrlLen)
            ),
            tuktukProgram.account.taskQueueV0.fetch(TASK_QUEUE_ID),
          ]);
        rentFee = rentFee.add(
          new BN(fanoutRent + ataRent + distTaskRent + preTaskRent)
        );
        // Each queued task pays the queue's min crank reward, plus funding
        // for future scheduled transaction fees
        transactionFees = transactionFees
          .add(taskQueueAcc.minCrankReward.muln(2))
          .add(FANOUT_FUNDING_AMOUNT);
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
