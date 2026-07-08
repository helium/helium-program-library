import { createSolanaConnection, getCluster } from "@/lib/solana";
import * as anchor from "@coral-xyz/anchor";
import { cronJobKey } from "@helium/cron-sdk";
import { entityCronAuthorityKey } from "@helium/hpl-crons-sdk";
import {
  HELIUM_COMMON_LUT,
  HELIUM_COMMON_LUT_DEVNET,
  batchInstructionsToTxsWithPriorityFee,
  toVersionedTx,
} from "@helium/spl-utils";
import { customSignerKey } from "@helium/tuktuk-sdk";
import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import { getJitoTipTransaction, shouldUseJitoBundle } from "@/lib/utils/jito";
import { publicProcedure } from "../../../procedures";
import { getTotalTransactionFees } from "@/lib/utils/balance-validation";
import { toTokenAmountOutput } from "@/lib/utils/token-math";
import { NATIVE_MINT } from "@solana/spl-token";
import BN from "bn.js";
import { TASK_QUEUE_ID } from "@/lib/constants/tuktuk";

/**
 * Operator floor top-up. For each target the operator funds the two pools that
 * keep claim automation running — the cron-job pool (crank rewards) and the
 * claim-payer pool (claim costs) — with `fundLamports` whenever that pool's
 * balance is at or below `floorLamports`. The operator is the fee payer and
 * funding source; nothing is deducted from the target wallets.
 */
export const topUpAutomation = publicProcedure.hotspots.topUpAutomation.handler(
  async ({ input, errors }) => {
    const { operatorAddress, targets, floorLamports, fundLamports } = input;

    const operator = new PublicKey(operatorAddress);
    const { provider } = createSolanaConnection(operatorAddress);
    anchor.setProvider(provider);

    const instructions: TransactionInstruction[] = [];
    let funded = 0;

    for (const targetWallet of targets) {
      const wallet = new PublicKey(targetWallet);
      const authority = entityCronAuthorityKey(wallet)[0];
      const cronJob = cronJobKey(authority, 0)[0];
      const pdaWallet = customSignerKey(TASK_QUEUE_ID, [
        Buffer.from("claim_payer"),
        wallet.toBuffer(),
      ])[0];

      const [cronJobBalance, pdaWalletBalance] = await Promise.all([
        provider.connection.getBalance(cronJob),
        provider.connection.getBalance(pdaWallet),
      ]);

      for (const [pool, balance] of [
        [cronJob, cronJobBalance] as const,
        [pdaWallet, pdaWalletBalance] as const,
      ]) {
        if (balance <= floorLamports) {
          instructions.push(
            SystemProgram.transfer({
              fromPubkey: operator,
              toPubkey: pool,
              lamports: fundLamports,
            })
          );
          funded++;
        }
      }
    }

    if (instructions.length === 0) {
      throw errors.NOT_FOUND({
        message: "No target pools are at or below the funding floor",
      });
    }

    const totalFundingNeeded = funded * fundLamports;
    const operatorBalance = await provider.connection.getBalance(operator);
    if (operatorBalance < totalFundingNeeded) {
      throw errors.INSUFFICIENT_FUNDS({
        message: "Operator has insufficient SOL to fund the requested top-ups",
        data: { required: totalFundingNeeded, available: operatorBalance },
      });
    }

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

    if (shouldUseJitoBundle(vtxs.length, getCluster())) {
      vtxs.push(await getJitoTipTransaction(operator));
    }

    const txs = vtxs.map((tx) =>
      Buffer.from(tx.serialize()).toString("base64")
    );
    const txFees = getTotalTransactionFees(vtxs);

    return {
      transactionData: {
        transactions: txs.map((serialized) => ({
          serializedTransaction: serialized,
          metadata: {
            type: "top_up_automation",
            description: "Operator floor top-up of automation funding",
            poolsFunded: funded,
          },
        })),
        parallel: false,
        tag: `top_up_automation:${operatorAddress}`,
        actionMetadata: { type: "top_up_automation", poolsFunded: funded },
      },
      estimatedSolFee: await toTokenAmountOutput(
        new BN(txFees + totalFundingNeeded),
        NATIVE_MINT.toBase58()
      ),
    };
  }
);
