import { sequelize } from "@/lib/db";
import { env } from "@/lib/env";
import PendingTransaction from "@/lib/models/pending-transaction";
import TransactionBatch from "@/lib/models/transaction-batch";
import { getChewingGlassExplorerUrl, getExplorerUrl } from "@/lib/utils/explorer";
import { getCluster } from "@/lib/solana";
import {
  BundleSimulationError,
  JitoBundleSubmissionError,
} from "@/lib/utils/jito";
import {
  JitoMissingTipError,
  SingleTransactionSubmissionError,
  submitTransactionBatch,
} from "@/lib/utils/transaction-submission";
import * as Sentry from "@sentry/nextjs";
import { Connection, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { classifySimulationLogs } from "@/lib/utils/simulation-classifier";
import { publicProcedure } from "../../../procedures";

type SubmitInputTx = {
  serializedTransaction: string;
  metadata?: Record<string, unknown>;
};

/**
 * Single Sentry capture point for all submission/simulation failures. Builds
 * a rich payload (logs, explorer links, bundle metadata) from whichever error
 * class was thrown so the Sentry issue always has the info needed to debug.
 */
function captureSubmissionError(
  error: unknown,
  context: {
    batchSize: number;
    parallel: boolean;
    tag?: string;
    payer: string;
    transactions: SubmitInputTx[];
  },
): void {
  const baseTags: Record<string, unknown> = {
    batch_size: context.batchSize,
    parallel: context.parallel,
    tag: context.tag,
  };

  const baseExtra: Record<string, unknown> = {
    error_message: error instanceof Error ? error.message : "Unknown error",
    batch_size: context.batchSize,
    parallel: context.parallel,
    tag: context.tag,
    payer: context.payer,
    transaction_metadata: context.transactions.map((tx) => tx.metadata),
  };

  if (error instanceof JitoMissingTipError) {
    if (error.skipSentry) {
      return;
    }
    Sentry.captureException(error, {
      level: "error",
      tags: {
        ...baseTags,
        error_type: "jito_bundle_missing_tip",
        submission_type: "jito_bundle",
      },
      extra: {
        ...baseExtra,
        bundle_size: error.bundleSize,
      },
    });
    return;
  }

  if (error instanceof BundleSimulationError) {
    Sentry.captureException(error, {
      level: "error",
      fingerprint: [
        "jito_bundle_simulation_failed",
        error.category,
        error.actionType,
      ],
      tags: {
        ...baseTags,
        error_type: "jito_bundle_simulation_failed",
        submission_type: "jito_bundle",
        simulation_failure_category: error.category,
        action_type: error.actionType,
      },
      extra: {
        ...baseExtra,
        failure_detail: error.detail,
        summary: error.summary,
        simulation_logs: error.logs,
        transaction_results: error.transactionResults,
        explorer_links: error.explorerLinks,
        chewing_glass_explorer_links: error.chewingGlassExplorerLinks,
        bundle_size: error.bundleSize,
      },
    });
    return;
  }

  if (error instanceof JitoBundleSubmissionError) {
    Sentry.captureException(error, {
      level: "error",
      tags: {
        ...baseTags,
        error_type: "jito_bundle_submission_failed",
        submission_type: "jito_bundle",
      },
      extra: {
        ...baseExtra,
        explorer_links: error.explorerLinks,
        chewing_glass_explorer_links: error.chewingGlassExplorerLinks,
        bundle_size: error.bundleSize,
      },
    });
    return;
  }

  if (error instanceof SingleTransactionSubmissionError) {
    Sentry.captureException(error, {
      level: "error",
      tags: {
        ...baseTags,
        error_type: "transaction_submission_failed",
        submission_type: "single",
      },
      extra: {
        ...baseExtra,
        explorer_link: error.explorerLink,
        chewing_glass_explorer_link: error.chewingGlassExplorerLink,
      },
    });
    return;
  }

  // Fallback: unknown error type — attach best-effort explorer links for the
  // first few transactions so Sentry has *something* to work with.
  const explorerLinks: (string | null)[] = [];
  const chewingGlassExplorerLinks: (string | null)[] = [];
  for (const tx of context.transactions.slice(0, 3)) {
    try {
      const deserialized = VersionedTransaction.deserialize(
        Buffer.from(tx.serializedTransaction, "base64"),
      );
      explorerLinks.push(getExplorerUrl(deserialized));
      chewingGlassExplorerLinks.push(getChewingGlassExplorerUrl(deserialized));
    } catch {
      explorerLinks.push(null);
      chewingGlassExplorerLinks.push(null);
    }
  }

  Sentry.captureException(error, {
    level: "error",
    tags: {
      ...baseTags,
      error_type: "transaction_submission_failed",
    },
    extra: {
      ...baseExtra,
      explorer_links: explorerLinks,
      chewing_glass_explorer_links: chewingGlassExplorerLinks,
    },
  });
}

/**
 * Submit a batch of transactions for processing.
 */
export const submit = publicProcedure.transactions.submit.handler(
  async ({ input, errors }) => {
    const {
      transactions,
      parallel,
      tag,
      actionMetadata,
      simulationCommitment,
      simulate,
    } = input;

    if (
      !transactions ||
      !Array.isArray(transactions) ||
      transactions.length === 0
    ) {
      throw errors.BAD_REQUEST({
        message: "Transactions array is required and cannot be empty",
      });
    }

    // Extract payer from the first transaction
    let payer: string;
    try {
      const firstTransaction = VersionedTransaction.deserialize(
        Buffer.from(transactions[0].serializedTransaction, "base64"),
      );
      payer = firstTransaction.message.staticAccountKeys[0].toBase58();
    } catch {
      throw errors.BAD_REQUEST({
        message: "Failed to decode transaction to extract payer",
      });
    }

    if (transactions.length > 5) {
      throw errors.BAD_REQUEST({
        message: "Maximum of 5 transactions allowed per batch",
      });
    }

    // Simulate transactions before submission (except for sequential batches)
    if (simulate && (parallel || transactions.length === 1)) {
      const connection = new Connection(env.SOLANA_RPC_URL);

      const simulationPromises = transactions.map(async (tx, index) => {
        try {
          const transaction = VersionedTransaction.deserialize(
            Buffer.from(tx.serializedTransaction, "base64"),
          );
          const simulation = await connection.simulateTransaction(transaction, {
            commitment: simulationCommitment,
          });

          if (simulation.value.err) {
            const errorMessage =
              typeof simulation.value.err === "string"
                ? simulation.value.err
                : JSON.stringify(simulation.value.err);

            return {
              index,
              error: `Transaction ${
                index + 1
              } simulation failed: ${errorMessage}`,
              logs: simulation.value.logs,
              link: getExplorerUrl(transaction),
              chewingGlassLink: getChewingGlassExplorerUrl(transaction),
            };
          }
          return { index, success: true };
        } catch (err) {
          return {
            index,
            error: `Transaction ${index + 1} deserialization failed: ${
              err instanceof Error ? err.message : "Unknown error"
            }`,
          };
        }
      });

      const simulationResults = await Promise.all(simulationPromises);
      const failures = simulationResults.filter((result) => "error" in result);

      const ff = failures.at(0);
      if (ff) {
        const failedTxMeta = transactions[ff.index]?.metadata;
        const firstRealMeta = transactions.find(
          (t) => t.metadata?.type && t.metadata.type !== "jito_tip",
        )?.metadata;
        const actionType =
          (failedTxMeta?.type as string | undefined) ??
          (firstRealMeta?.type as string | undefined) ??
          "unknown";
        const { category, detail } = classifySimulationLogs(
          ff.error ?? "",
          ff.logs ?? [],
        );

        Sentry.captureException(
          new Error(
            `Transaction simulation failed [${category}] (${actionType}): ${detail}`,
          ),
          {
            level: "error",
            fingerprint: [
              "transaction_simulation_failed",
              category,
              actionType,
            ],
            tags: {
              error_type: "transaction_simulation_failed",
              simulation_failure_category: category,
              action_type: actionType,
              transaction_index: ff.index,
              batch_size: transactions.length,
              parallel,
            },
            extra: {
              error_message: ff.error,
              failure_detail: detail,
              transaction_index: ff.index,
              batch_size: transactions.length,
              parallel,
              tag,
              payer,
              explorer_link: ff?.link,
              chewing_glass_explorer_link: ff?.chewingGlassLink,
              simulation_logs: ff?.logs,
            },
          },
        );

        if (category === "account_not_found") {
          const balance = await connection.getBalance(new PublicKey(payer));
          if (balance === 0) {
            throw errors.SIMULATION_FAILED({
              message: `Transaction payer ${payer} has 0 SOL`,
              data: {
                logs: ff?.logs ?? undefined,
                link: ff?.link ?? undefined,
              },
            });
          }
        }

        throw errors.SIMULATION_FAILED({
          message: ff.error ?? "Transaction simulation failed",
          data: {
            logs: ff?.logs ?? undefined,
            link: ff?.link ?? undefined,
          },
        });
      }
    }

    // Check for existing pending transaction with same tag+payer
    if (tag) {
      const existingBatch = await TransactionBatch.findOne({
        where: {
          tag,
          payer,
          status: "pending",
        },
      });

      if (existingBatch) {
        return {
          batchId: existingBatch.id,
          message: `Transaction with tag "${tag}" already exists and is pending`,
        };
      }
    }

    const serializedTransactions = transactions.map(
      (tx) => tx.serializedTransaction,
    );

    let result;
    try {
      result = await submitTransactionBatch({
        transactions: serializedTransactions,
        parallel,
        tag,
        payer,
        transactionMetadata: transactions.map((tx) => tx.metadata),
      });
    } catch (error) {
      captureSubmissionError(error, {
        batchSize: serializedTransactions.length,
        parallel,
        tag,
        payer,
        transactions,
      });

      if (error instanceof BundleSimulationError) {
        if (error.category === "account_not_found") {
          const connection = new Connection(env.SOLANA_RPC_URL);
          const balance = await connection.getBalance(new PublicKey(payer));
          if (balance === 0) {
            throw errors.SIMULATION_FAILED({
              message: `Transaction payer ${payer} has 0 SOL`,
              data: {
                logs: error.logs,
              },
            });
          }
        }
        throw errors.SIMULATION_FAILED({
          message: error.message,
          data: {
            logs: error.logs,
          },
        });
      }

      throw errors.BAD_REQUEST({
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }

    const cluster = getCluster();
    const connection = new Connection(env.SOLANA_RPC_URL);
    const { lastValidBlockHeight } = await connection.getLatestBlockhash({
      commitment: "finalized",
    });

    // Use database transaction to ensure data consistency
    const dbTransaction = await sequelize.transaction();

    try {
      // Create the batch record
      // Derive actionType from first transaction metadata or actionMetadata
      const actionType =
        (actionMetadata?.type as string) ||
        transactions[0]?.metadata?.type ||
        undefined;

      await TransactionBatch.create(
        {
          id: result.batchId,
          parallel,
          status: "pending",
          submissionType: result.submissionType,
          jitoBundleId: result.jitoBundleId,
          cluster,
          tag,
          payer,
          actionType,
          actionMetadata,
        },
        { transaction: dbTransaction },
      );

      // Create individual transaction records
      const pendingTransactionPromises = transactions.map(async (txData, i) => {
        const signature = result.signatures?.[i] || null;

        // Decode transaction to get blockhash
        const transaction = VersionedTransaction.deserialize(
          Buffer.from(txData.serializedTransaction, "base64"),
        );

        return PendingTransaction.create(
          {
            signature: signature || `${result.batchId}-${i}`,
            blockhash: transaction.message.recentBlockhash,
            lastValidBlockHeight,
            status: "pending",
            type: txData.metadata?.type || "batch",
            batchId: result.batchId,
            payer,
            metadata: txData.metadata,
            serializedTransaction: txData.serializedTransaction,
          },
          { transaction: dbTransaction },
        );
      });

      await Promise.all(pendingTransactionPromises);

      // Commit the transaction
      await dbTransaction.commit();
    } catch (error: unknown) {
      // Rollback the transaction on any error
      await dbTransaction.rollback();

      // Handle unique constraint violation for tag+payer when status is pending
      if (
        (error as { name?: string })?.name ===
          "SequelizeUniqueConstraintError" &&
        tag
      ) {
        throw errors.CONFLICT({
          message: `A pending transaction with tag "${tag}" already exists for this payer`,
        });
      }
      throw error;
    }

    return { batchId: result.batchId };
  },
);
