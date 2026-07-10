import { createSolanaConnection } from "@/lib/solana";
import * as anchor from "@coral-xyz/anchor";
import { cronJobKey } from "@helium/cron-sdk";
import { entityCronAuthorityKey } from "@helium/hpl-crons-sdk";
import { customSignerKey } from "@helium/tuktuk-sdk";
import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import { publicProcedure } from "../../../procedures";
import { TASK_QUEUE_ID } from "@/lib/constants/tuktuk";
import { buildAutomationTransactionResponse } from "./automation-transaction";

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

    // Check every target's pools in parallel; flatten back in target order so
    // the produced instructions stay deterministic.
    const perTargetInstructions = await Promise.all(
      targets.map(async (targetWallet) => {
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

        return [
          [cronJob, cronJobBalance] as const,
          [pdaWallet, pdaWalletBalance] as const,
        ]
          .filter(([, balance]) => balance <= floorLamports)
          .map(([pool]) =>
            SystemProgram.transfer({
              fromPubkey: operator,
              toPubkey: pool,
              lamports: fundLamports,
            })
          );
      })
    );

    const instructions: TransactionInstruction[] = perTargetInstructions.flat();

    if (instructions.length === 0) {
      throw errors.NOT_FOUND({
        message: "No target pools are at or below the funding floor",
      });
    }

    const poolsFunded = instructions.length;
    const totalFundingNeeded = poolsFunded * fundLamports;
    const operatorBalance = await provider.connection.getBalance(operator);
    if (operatorBalance < totalFundingNeeded) {
      throw errors.INSUFFICIENT_FUNDS({
        message: "Operator has insufficient SOL to fund the requested top-ups",
        data: { required: totalFundingNeeded, available: operatorBalance },
      });
    }

    return buildAutomationTransactionResponse({
      provider,
      instructions,
      feePayer: operator,
      tag: `top_up_automation:${operatorAddress}`,
      transactionMetadata: {
        type: "top_up_automation",
        description: "Operator floor top-up of automation funding",
        poolsFunded,
      },
      actionMetadata: { type: "top_up_automation", poolsFunded },
      extraFeeLamports: totalFundingNeeded,
    });
  }
);
