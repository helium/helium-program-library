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
import { keyToAssetKey } from "@helium/helium-entity-manager-sdk";
import { daoKey } from "@helium/helium-sub-daos-sdk";
import {
  HELIUM_COMMON_LUT,
  HELIUM_COMMON_LUT_DEVNET,
  HNT_MINT,
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

const HNT_DAO = daoKey(HNT_MINT)[0];

/**
 * Create a transaction to add a single hotspot's claim to an existing
 * automation. The cron claims that one entity each time it fires.
 */
export const addEntityToAutomation =
  publicProcedure.hotspots.addEntityToAutomation.handler(
    async ({ input, errors }) => {
      const { walletAddress, entityKey } = input;

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
        throw errors.NOT_FOUND({
          message: "Automation not found. Please set up automation first.",
        });
      }

      const [keyToAsset] = keyToAssetKey(HNT_DAO, entityKey);

      const index = cronJobAccount.nextTransactionId || 0;
      const { instruction } = await hplCronsProgram.methods
        .addEntityToCronV0({ index })
        .accounts({
          keyToAsset,
          cronJob,
          cronJobTransaction: cronJobTransactionKey(cronJob, index)[0],
        })
        .prepare();

      const vtxs = (
        await batchInstructionsToTxsWithPriorityFee(provider, [instruction], {
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
              type: "add_entity_to_automation",
              description: "Add hotspot claim to automation",
              entityKey,
              index,
            },
          })),
          parallel: false,
          tag: `add_entity_to_automation:${walletAddress}`,
          actionMetadata: {
            type: "add_entity_to_automation",
            entityKey,
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
