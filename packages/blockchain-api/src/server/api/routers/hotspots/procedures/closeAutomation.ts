import { createSolanaConnection, getCluster } from "@/lib/solana";
import * as anchor from "@coral-xyz/anchor";
import {
  cronJobKey,
  cronJobNameMappingKey,
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
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { getJitoTipTransaction, shouldUseJitoBundle } from "@/lib/utils/jito";
import { publicProcedure } from "../../../procedures";
import {
  calculateRequiredBalance,
  getTotalTransactionFees,
  BASE_TX_FEE_LAMPORTS,
} from "@/lib/utils/balance-validation";
import { toTokenAmountOutput } from "@/lib/utils/token-math";
import { NATIVE_MINT } from "@solana/spl-token";
import BN from "bn.js";

/**
 * Create transactions to close and remove claim automation.
 */
export const closeAutomation = publicProcedure.hotspots.closeAutomation.handler(
  async ({ input, errors }) => {
    const { walletAddress } = input;

    const wallet = new PublicKey(walletAddress);
    const { provider } = createSolanaConnection(walletAddress);
    anchor.setProvider(provider);

    // Initialize programs
    const hplCronsProgram = await initHplCrons(provider);
    const cronProgram = await initCron(provider);

    // Derive keys
    const authority = entityCronAuthorityKey(wallet)[0];
    const cronJob = cronJobKey(authority, 0)[0];

    // Fetch cron job account using fetchNullable
    const cronJobAccount =
      await cronProgram.account.cronJobV0.fetchNullable(cronJob);

    if (!cronJobAccount) {
      throw errors.NOT_FOUND({
        message: "Automation not found",
      });
    }

    // Check wallet has sufficient balance for transaction fees
    const walletBalance = await provider.connection.getBalance(wallet);
    const required = calculateRequiredBalance(BASE_TX_FEE_LAMPORTS, 0);
    if (walletBalance < required) {
      throw errors.INSUFFICIENT_FUNDS({
        message: "Insufficient SOL balance for transaction fees",
        data: { required, available: walletBalance },
      });
    }

    // Build instructions to remove all entities and close cron job
    const maxTxId = cronJobAccount.nextTransactionId || 0;
    const txIds = Array.from({ length: maxTxId }, (_, i) => i);

    const instructions: TransactionInstruction[] = [
      ...(await Promise.all(
        txIds.map((txId) =>
          hplCronsProgram.methods
            .removeEntityFromCronV0({
              index: txId,
            })
            .accounts({
              cronJob,
              rentRefund: wallet,
              cronJobTransaction: cronJobTransactionKey(cronJob, txId)[0],
            })
            .instruction(),
        ),
      )),
      await hplCronsProgram.methods
        .closeEntityClaimCronV0()
        .accounts({
          cronJob,
          rentRefund: wallet,
          cronJobNameMapping: cronJobNameMappingKey(
            authority,
            "entity_claim",
          )[0],
        })
        .instruction(),
    ];

    // Build and serialize transactions
    const vtxs = (
      await batchInstructionsToTxsWithPriorityFee(provider, instructions, {
        addressLookupTableAddresses: [
          process.env.NEXT_PUBLIC_SOLANA_CLUSTER?.trim() === "devnet"
            ? HELIUM_COMMON_LUT_DEVNET
            : HELIUM_COMMON_LUT,
        ],
        computeUnitLimit: 500000,
      })
    ).map((tx) => toVersionedTx(tx));

    // Add Jito tip if needed for mainnet bundles
    if (shouldUseJitoBundle(vtxs.length, getCluster())) {
      vtxs.push(await getJitoTipTransaction(wallet));
    }

    const txs: Array<string> = vtxs.map((tx) =>
      Buffer.from(tx.serialize()).toString("base64"),
    );

    const txFees = getTotalTransactionFees(vtxs);

    return {
      transactionData: {
        transactions: txs.map((serialized) => ({
          serializedTransaction: serialized,
          metadata: {
            type: "close_automation",
            description: "Close hotspot claim automation",
          },
        })),
        parallel: false,
        tag: `close_automation:${walletAddress}`,
      },
      estimatedSolFee: toTokenAmountOutput(
        new BN(txFees),
        NATIVE_MINT.toBase58(),
      ),
    };
  },
);
