import { createSolanaConnection, getCluster } from "@/lib/solana";
import * as anchor from "@coral-xyz/anchor";
import {
  cronJobKey,
  cronJobTransactionKey,
  init as initCron,
} from "@helium/cron-sdk";
import {
  entityCronAuthorityKey,
  init as initHplCrons,
} from "@helium/hpl-crons-sdk";
import {
  HELIUM_COMMON_LUT,
  HELIUM_COMMON_LUT_DEVNET,
  batchInstructionsToTxsWithPriorityFee,
  toVersionedTx,
} from "@helium/spl-utils";
import { PublicKey } from "@solana/web3.js";
import { getJitoTipTransaction, shouldUseJitoBundle } from "@/lib/utils/jito";
import { publicProcedure } from "../../../procedures";
import { getTotalTransactionFees } from "@/lib/utils/balance-validation";
import { toTokenAmountOutput } from "@/lib/utils/token-math";
import { NATIVE_MINT } from "@solana/spl-token";
import BN from "bn.js";

/**
 * Create a transaction to remove a single claim entry (by its cron transaction
 * index) from an existing automation. The freed rent is refunded to the wallet.
 */
export const removeEntityFromAutomation =
  publicProcedure.hotspots.removeEntityFromAutomation.handler(
    async ({ input, errors }) => {
      const { walletAddress, index } = input;

      const wallet = new PublicKey(walletAddress);
      const { provider } = createSolanaConnection(walletAddress);
      anchor.setProvider(provider);

      const hplCronsProgram = await initHplCrons(provider);
      const cronProgram = await initCron(provider);

      const authority = entityCronAuthorityKey(wallet)[0];
      const cronJob = cronJobKey(authority, 0)[0];

      const cronJobAccount = await cronProgram.account.cronJobV0.fetchNullable(
        cronJob
      );
      if (!cronJobAccount) {
        throw errors.NOT_FOUND({ message: "Automation not found" });
      }
      if (index >= (cronJobAccount.nextTransactionId || 0)) {
        throw errors.NOT_FOUND({
          message: `Automation has no claim entry at index ${index}`,
        });
      }

      const instructions = [
        await hplCronsProgram.methods
          .removeEntityFromCronV0({ index })
          .accounts({
            cronJob,
            rentRefund: wallet,
            cronJobTransaction: cronJobTransactionKey(cronJob, index)[0],
          })
          .instruction(),
      ];

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
        vtxs.push(await getJitoTipTransaction(wallet));
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
              type: "remove_entity_from_automation",
              description: "Remove claim from automation",
              index,
            },
          })),
          parallel: false,
          tag: `remove_entity_from_automation:${walletAddress}`,
          actionMetadata: {
            type: "remove_entity_from_automation",
            index,
          },
        },
        estimatedSolFee: await toTokenAmountOutput(
          new BN(txFees),
          NATIVE_MINT.toBase58()
        ),
      };
    }
  );
