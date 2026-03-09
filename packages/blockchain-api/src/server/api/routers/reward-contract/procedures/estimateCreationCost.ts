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
  BASE_TX_FEE_LAMPORTS,
  RENT_COSTS,
} from "@/lib/utils/balance-validation";
import { solToLamportsBN } from "@/lib/utils/token-math";
import BN from "bn.js";

const FANOUT_FUNDING_AMOUNT = solToLamportsBN(0.01);

export const estimateCreationCost =
  publicProcedure.rewardContract.estimateCreationCost.handler(
    async ({ input, errors }) => {
      const { entityPubKey, delegateWalletAddress, recipients } = input;

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
        rentFee = rentFee.add(new BN(RENT_COSTS.RECIPIENT));
      }

      const hasClaimable = recipients.some((r) => r.type === "CLAIMABLE");
      let recipientGift = new BN(0);
      let transactionFees = new BN(BASE_TX_FEE_LAMPORTS);

      if (hasClaimable) {
        rentFee = rentFee.add(
          new BN(RENT_COSTS.WELCOME_PACK + RENT_COSTS.USER_WELCOME_PACKS),
        );
        const claimableRecipient = recipients.find(
          (r) => r.type === "CLAIMABLE",
        );
        if (claimableRecipient?.type === "CLAIMABLE") {
          recipientGift = resolveTokenAmountInput(
            claimableRecipient.giftedCurrency,
            NATIVE_MINT.toBase58(),
          );
        }
      } else {
        // Mini-fanout path: rent for miniFanout account + 2 tuktuk tasks (task + preTask)
        rentFee = rentFee.add(
          new BN(RENT_COSTS.MINI_FANOUT + RENT_COSTS.TUKTUK_TASK * 2),
        );
        // Funding for future scheduled transaction fees
        transactionFees = transactionFees.add(FANOUT_FUNDING_AMOUNT);
      }

      const total = transactionFees.add(rentFee).add(recipientGift);
      const solMint = NATIVE_MINT.toBase58();

      return {
        total: toTokenAmountOutput(total, solMint),
        lineItems: {
          transactionFees: toTokenAmountOutput(transactionFees, solMint),
          rentFee: toTokenAmountOutput(rentFee, solMint),
          recipientGift: toTokenAmountOutput(recipientGift, solMint),
        },
      };
    },
  );
