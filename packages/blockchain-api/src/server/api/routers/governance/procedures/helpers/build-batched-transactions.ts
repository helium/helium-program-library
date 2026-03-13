import {
  buildVersionedTransaction,
  getHeliumLookupTable,
  serializeTransaction,
} from "@/lib/utils/build-transaction";
import { getCluster } from "@/lib/solana";
import { getJitoTipTransaction, shouldUseJitoBundle } from "@/lib/utils/jito";
import {
  getAddressLookupTableAccounts,
  toVersionedTx,
} from "@helium/spl-utils";
import {
  AddressLookupTableAccount,
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  TransactionInstruction,
  VersionedTransaction,
} from "@solana/web3.js";
import { MAX_TXS_PER_CALL } from "./constants";

export interface InstructionGroup {
  instructions: TransactionInstruction[];
  metadata: { type: string; description: string; [key: string]: unknown };
  signers?: Keypair[];
}

interface SerializedTransaction {
  serializedTransaction: string;
  metadata: { type: string; description: string; [key: string]: unknown };
}

export interface BuildBatchedTransactionsParams {
  groups: InstructionGroup[];
  connection: Connection;
  feePayer: PublicKey;
  maxTxs?: number;
}

export interface BuildBatchedTransactionsResult {
  transactions: SerializedTransaction[];
  versionedTransactions: VersionedTransaction[];
  hasMore: boolean;
}

const MAX_TX_SIZE = 1232;
const SIZE_MARGIN = 100;

const COMPUTE_BUDGET_PLACEHOLDERS = [
  ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
  ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 }),
];

const DUMMY_BLOCKHASH = "1".repeat(32);

function measureSize(
  instructions: TransactionInstruction[],
  feePayer: PublicKey,
  addressLookupTables: AddressLookupTableAccount[],
): number {
  const tx = toVersionedTx({
    feePayer,
    recentBlockhash: DUMMY_BLOCKHASH,
    instructions: [...COMPUTE_BUDGET_PLACEHOLDERS, ...instructions],
    addressLookupTables,
  });
  return tx.serialize().length;
}

function mergeMetadata(
  a: { type: string; description: string; [key: string]: unknown },
  b: { type: string; description: string; [key: string]: unknown },
): { type: string; description: string; [key: string]: unknown } {
  return { ...a, description: `${a.description}; ${b.description}` };
}

interface BuiltTransaction {
  serializedTransaction: string;
  metadata: { type: string; description: string; [key: string]: unknown };
  tx: VersionedTransaction;
}

async function buildOrSplit(
  instructions: TransactionInstruction[],
  metadata: { type: string; description: string; [key: string]: unknown },
  signers: Keypair[],
  connection: Connection,
  feePayer: PublicKey,
): Promise<BuiltTransaction[]> {
  try {
    const tx = await buildVersionedTransaction({
      connection,
      draft: { instructions, feePayer },
      signers: signers.length > 0 ? signers : undefined,
    });
    return [{ serializedTransaction: serializeTransaction(tx), metadata, tx }];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isOversized =
      message.includes("encoding overruns") ||
      message.includes("too large to serialize");
    if (isOversized && instructions.length > 1) {
      const mid = Math.ceil(instructions.length / 2);
      const [first, second] = await Promise.all([
        buildOrSplit(
          instructions.slice(0, mid),
          metadata,
          signers,
          connection,
          feePayer,
        ),
        buildOrSplit(
          instructions.slice(mid),
          metadata,
          signers,
          connection,
          feePayer,
        ),
      ]);
      return [...first, ...second];
    }
    throw error;
  }
}

/**
 * Builds versioned transactions from instruction groups, packing multiple
 * groups into a single transaction when they fit within size limits.
 *
 * Uses compile-and-check: each candidate batch is compiled into a real V0
 * message to measure its exact serialized size, accounting for account
 * deduplication and LUT compression.
 *
 * Groups are processed in order. When a group doesn't fit in the current
 * transaction, the current tx is finalized and a new one starts. Processing
 * stops after maxTxs transactions are built; remaining groups are indicated
 * by hasMore=true.
 *
 * Callers should re-invoke with the same arguments after submitting the
 * returned transactions — already-processed positions will auto-skip via
 * on-chain state checks.
 */
export async function buildBatchedTransactions({
  groups,
  connection,
  feePayer,
  maxTxs = MAX_TXS_PER_CALL,
}: BuildBatchedTransactionsParams): Promise<BuildBatchedTransactionsResult> {
  if (groups.length === 0) {
    return { transactions: [], versionedTransactions: [], hasMore: false };
  }

  const cluster = getCluster();
  const isMainnet = cluster === "mainnet" || cluster === "mainnet-beta";
  const effectiveMaxTxs = isMainnet ? maxTxs - 1 : maxTxs;

  const addressLookupTables = await getAddressLookupTableAccounts(connection, [
    getHeliumLookupTable(),
  ]);

  const packedBatches: {
    instructions: TransactionInstruction[];
    metadata: { type: string; description: string; [key: string]: unknown };
    signers: Keypair[];
  }[] = [];

  let currentInstructions: TransactionInstruction[] = [];
  let currentMetadata: {
    type: string;
    description: string;
    [key: string]: unknown;
  } | null = null;
  let currentSigners: Keypair[] = [];
  let stoppedEarly = false;

  const expandedGroups: typeof groups = [];
  for (const group of groups) {
    let isOversized = false;
    try {
      const size = measureSize(
        group.instructions,
        feePayer,
        addressLookupTables,
      );
      isOversized = size > MAX_TX_SIZE - SIZE_MARGIN;
    } catch {
      isOversized = true;
    }

    if (isOversized) {
      for (const ix of group.instructions) {
        expandedGroups.push({
          instructions: [ix],
          metadata: group.metadata,
          signers: group.signers,
        });
      }
    } else {
      expandedGroups.push(group);
    }
  }

  for (const group of expandedGroups) {
    const candidateInstructions = [
      ...currentInstructions,
      ...group.instructions,
    ];

    let size: number;
    try {
      size = measureSize(candidateInstructions, feePayer, addressLookupTables);
    } catch {
      size = MAX_TX_SIZE;
    }

    if (size <= MAX_TX_SIZE - SIZE_MARGIN) {
      currentInstructions = candidateInstructions;
      currentMetadata =
        currentMetadata === null
          ? group.metadata
          : mergeMetadata(currentMetadata, group.metadata);
      if (group.signers?.length) {
        currentSigners = [...currentSigners, ...group.signers];
      }
    } else if (currentInstructions.length === 0) {
      throw new Error(
        `Single instruction exceeds max transaction size (${size} > ${MAX_TX_SIZE - SIZE_MARGIN})`,
      );
    } else {
      packedBatches.push({
        instructions: currentInstructions,
        metadata: currentMetadata!,
        signers: currentSigners,
      });

      if (packedBatches.length >= effectiveMaxTxs) {
        stoppedEarly = true;
        break;
      }

      currentInstructions = [...group.instructions];
      currentMetadata = group.metadata;
      currentSigners = group.signers ? [...group.signers] : [];
    }
  }

  if (!stoppedEarly && currentInstructions.length > 0) {
    packedBatches.push({
      instructions: currentInstructions,
      metadata: currentMetadata!,
      signers: currentSigners,
    });

    if (packedBatches.length > effectiveMaxTxs) {
      packedBatches.length = effectiveMaxTxs;
      stoppedEarly = true;
    }
  }

  const built = (
    await Promise.all(
      packedBatches.map(({ instructions, metadata, signers }) =>
        buildOrSplit(instructions, metadata, signers, connection, feePayer),
      ),
    )
  ).flat();

  const transactions = built.map(({ serializedTransaction, metadata }) => ({
    serializedTransaction,
    metadata,
  }));
  const versionedTransactions = built.map(({ tx }) => tx);

  if (shouldUseJitoBundle(transactions.length, cluster)) {
    const tipTx = await getJitoTipTransaction(feePayer);
    transactions.push({
      serializedTransaction: serializeTransaction(tipTx),
      metadata: { type: "jito_tip", description: "Jito bundle tip" },
    });
    versionedTransactions.push(tipTx);
  }

  return { transactions, versionedTransactions, hasMore: stoppedEarly };
}
