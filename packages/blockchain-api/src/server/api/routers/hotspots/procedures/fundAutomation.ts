import { createSolanaConnection, getCluster } from "@/lib/solana";
import { calculateFundingForAdditionalDuration } from "@/lib/utils/automation-helpers";
import * as anchor from "@coral-xyz/anchor";
import {
  HELIUM_COMMON_LUT,
  HELIUM_COMMON_LUT_DEVNET,
  batchInstructionsToTxsWithPriorityFee,
  toVersionedTx,
} from "@helium/spl-utils";
import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  getJitoTipAmountLamports,
  getJitoTipTransaction,
  shouldUseJitoBundle,
} from "@/lib/utils/jito";
import { publicProcedure } from "../../../procedures";
import { fetchAutomationData } from "./automation-data-helpers";
import {
  getTotalTransactionFees,
  BASE_TX_FEE_LAMPORTS,
} from "@/lib/utils/balance-validation";
import { toTokenAmountOutput } from "@/lib/utils/token-math";
import { NATIVE_MINT } from "@solana/spl-token";
import BN from "bn.js";

/**
 * Create transactions to fund existing automation with additional SOL.
 */
export const fundAutomation = publicProcedure.hotspots.fundAutomation.handler(
  async ({ input, errors }) => {
    const { walletAddress, additionalDuration } = input;

    const { provider } = createSolanaConnection(walletAddress);
    anchor.setProvider(provider);

    const automationData = await fetchAutomationData(walletAddress, provider);

    if (!automationData.cronJobAccount) {
      throw errors.NOT_FOUND({
        message: "Automation not found. Please set up automation first.",
      });
    }

    const {
      cronJobBalanceLamports,
      cronJobRentLamports,
      pdaWalletBalanceLamports,
      cronJobCostPerClaimLamports,
      pdaWalletCostPerClaimLamports,
      recipientRentLamports,
      ataRentLamports,
      taskReturnAccountRentLamports,
      minCrankReward,
      cronJob,
      pdaWallet,
    } = automationData;

    const wallet = new PublicKey(walletAddress);

    const { cronJobFundingLamports, pdaWalletFundingLamports } =
      calculateFundingForAdditionalDuration({
        cronJobBalanceLamports,
        cronJobCostPerClaimLamports,
        pdaWalletBalanceLamports,
        pdaWalletCostPerClaimLamports,
        recipientRentLamports,
        cronJobRentLamports,
        additionalDuration,
        ataRentLamports,
        taskReturnAccountRentLamports,
      });

    // Note: recipient rent is already included in pdaWalletFundingLamports via the shortfall calculation
    const totalFundingNeeded =
      cronJobFundingLamports + pdaWalletFundingLamports;

    const walletBalance = await provider.connection.getBalance(wallet);
    // Add estimated transaction fees + Jito tip for mainnet bundles
    const estimatedTxFees = BASE_TX_FEE_LAMPORTS * 2; // Estimate for 2 potential transfers
    const cluster = getCluster();
    const estimatedJitoTipCost =
      cluster === "mainnet" || cluster === "mainnet-beta"
        ? getJitoTipAmountLamports()
        : 0;
    const totalNeededWithFees =
      totalFundingNeeded + estimatedTxFees + estimatedJitoTipCost;

    if (walletBalance < totalNeededWithFees) {
      throw errors.INSUFFICIENT_FUNDS({
        message: "Insufficient SOL balance to fund automation",
        data: {
          required: totalNeededWithFees,
          available: walletBalance,
        },
      });
    }

    const instructions: TransactionInstruction[] = [];

    if (cronJobFundingLamports > 0) {
      instructions.push(
        SystemProgram.transfer({
          fromPubkey: wallet,
          toPubkey: cronJob,
          lamports: cronJobFundingLamports,
        }),
      );
    }

    // Note: recipient rent is already included in pdaWalletFundingLamports if there's a shortfall
    if (pdaWalletFundingLamports > 0) {
      instructions.push(
        SystemProgram.transfer({
          fromPubkey: wallet,
          toPubkey: pdaWallet,
          lamports: pdaWalletFundingLamports,
        }),
      );
    }

    // If somehow no instructions were created (shouldn't happen with required duration),
    // add minimal funding to ensure we always fund something
    if (instructions.length === 0) {
      // Add at least 1 claim worth of funding to cron job
      const minFunding = minCrankReward;
      instructions.push(
        SystemProgram.transfer({
          fromPubkey: wallet,
          toPubkey: cronJob,
          lamports: minFunding,
        }),
      );
    }

    // Build and serialize transactions
    const vtxs = (
      await batchInstructionsToTxsWithPriorityFee(provider, instructions, {
        addressLookupTableAddresses: [
          process.env.NEXT_PUBLIC_SOLANA_CLUSTER?.trim() === "devnet"
            ? HELIUM_COMMON_LUT_DEVNET
            : HELIUM_COMMON_LUT,
        ],
        computeUnitLimit: 500000,
        commitment: "finalized",
      })
    ).map((tx) => toVersionedTx(tx));

    // Add Jito tip if needed for mainnet bundles
    if (shouldUseJitoBundle(vtxs.length, getCluster())) {
      vtxs.push(await getJitoTipTransaction(wallet));
    }

    const txs: Array<string> = vtxs.map((tx) =>
      Buffer.from(tx.serialize()).toString("base64"),
    );

    // Estimated fee includes tx fees + funding amounts
    const txFees = getTotalTransactionFees(vtxs);
    const estimatedSolFeeLamports = txFees + totalFundingNeeded;

    return {
      transactionData: {
        transactions: txs.map((serialized) => ({
          serializedTransaction: serialized,
          metadata: {
            type: "fund_automation",
            description: "Fund hotspot claim automation",
            additionalDuration,
          },
        })),
        parallel: false,
        tag: `fund_automation:${walletAddress}`,
        actionMetadata: { type: "fund_automation", additionalDuration },
      },
      estimatedSolFee: toTokenAmountOutput(
        new BN(estimatedSolFeeLamports),
        NATIVE_MINT.toBase58(),
      ),
    };
  },
);
