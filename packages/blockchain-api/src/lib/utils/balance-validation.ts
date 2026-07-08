import {
  Connection,
  VersionedTransaction,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import {
  COMPUTE_BUDGET_IX_LIMIT,
  COMPUTE_BUDGET_IX_PRICE,
} from "@helium/spl-utils";

// Base signature fee (5000 lamports per signature)
export const BASE_SIGNATURE_FEE_LAMPORTS = 5000;

// Transaction fee estimates (legacy, kept for backwards compatibility)
export const BASE_TX_FEE_LAMPORTS = 50000; // 0.00005 SOL

// Minimum rent-exempt balance (wallet must stay above this)
export const MIN_WALLET_RENT_LAMPORTS = 890880; // 0.00089088 SOL

// Account creation rent costs (lamports)
// Note: Automation-related rent (CRON_JOB, TASK_RETURN_ACCOUNT) already exists in automation-helpers.ts
// These are for non-automation endpoints
// Values derived from e2e test measurements - kept slightly conservative to ensure sufficient funds
export const RENT_COSTS = {
  ATA: 2039280, // ~0.002039 SOL - from automation-helpers.ts ATA_RENT
  RECIPIENT: 2422080, // ~0.00242208 SOL - from automation-helpers.ts RECIPIENT_RENT
  // Welcome pack rent values derived from e2e test measurements
  // InitializeWelcomePack also updates compression destination and transfers asset
  WELCOME_PACK: 15100000, // ~0.0151 SOL (measured: includes account creation + operations)
  USER_WELCOME_PACKS: 2600000, // ~0.0026 SOL (measured from actual account creation)
  // Mini-fanout rent values derived from e2e test measurements
  MINI_FANOUT: 10560000, // ~0.01056 SOL (measured from actual account creation)
  TUKTUK_TASK: 3200000, // ~0.0032 SOL per task (mini-fanout creates 2 tasks: task + preTask)
} as const;

/**
 * Calculate total SOL required for a transaction.
 * Returns the total required lamports (tx fees + rent + min wallet balance).
 */
export function calculateRequiredBalance(
  estimatedTxFeeLamports: number = BASE_TX_FEE_LAMPORTS,
  estimatedRentCostLamports: number = 0
): number {
  return (
    estimatedTxFeeLamports +
    estimatedRentCostLamports +
    MIN_WALLET_RENT_LAMPORTS
  );
}

/**
 * Fee the cluster would charge for this transaction, via getFeeForMessage —
 * the validator's own fee calculation, so it tracks base, priority, and any
 * future fee components without local modeling. Falls back to a local
 * base + priority estimate when the RPC can't answer (null value or error).
 */
export async function getTransactionFee(
  connection: Connection,
  tx: VersionedTransaction
): Promise<number> {
  try {
    const { value } = await connection.getFeeForMessage(tx.message);
    if (value != null) return value;
  } catch {
    // RPC unavailable — use the local estimate below.
  }
  return estimateTransactionFeeLocally(tx);
}

/**
 * Local fallback: (base_signature_fee * num_signatures) + priority fee parsed
 * from the transaction's compute-budget instructions.
 */
function estimateTransactionFeeLocally(tx: VersionedTransaction): number {
  const numSignatures = tx.message.header.numRequiredSignatures;
  const baseFee = BASE_SIGNATURE_FEE_LAMPORTS * numSignatures;

  let computeUnitLimit = 200000; // Default CU limit
  let computeUnitPrice = 0; // Default no priority fee

  const computeBudgetProgramId = ComputeBudgetProgram.programId.toBase58();

  // Parse instructions to find ComputeBudget instructions
  const accountKeys = tx.message.staticAccountKeys;
  for (const ix of tx.message.compiledInstructions) {
    const programId = accountKeys[ix.programIdIndex]?.toBase58();
    if (programId !== computeBudgetProgramId) continue;

    const data = ix.data;
    if (data.length === 0) continue;

    const discriminator = data[0];

    // SetComputeUnitLimit, data format: [discriminator, u32 limit]
    if (discriminator === COMPUTE_BUDGET_IX_LIMIT && data.length >= 5) {
      computeUnitLimit =
        data[1] | (data[2] << 8) | (data[3] << 16) | (data[4] << 24);
    }

    // SetComputeUnitPrice, data format: [discriminator, u64 price (microlamports)]
    if (discriminator === COMPUTE_BUDGET_IX_PRICE && data.length >= 9) {
      // Read u64 as two u32s (little endian)
      const low = data[1] | (data[2] << 8) | (data[3] << 16) | (data[4] << 24);
      const high = data[5] | (data[6] << 8) | (data[7] << 16) | (data[8] << 24);
      // Price is in microlamports per CU
      computeUnitPrice = low + high * 0x100000000;
    }
  }

  // Priority fee = (price in microlamports * CU limit) / 1_000_000
  const priorityFee = Math.ceil(
    (computeUnitPrice * computeUnitLimit) / 1_000_000
  );

  return baseFee + priorityFee;
}

/**
 * Get total transaction fees for multiple transactions.
 */
export async function getTotalTransactionFees(
  connection: Connection,
  txs: VersionedTransaction[]
): Promise<number> {
  const fees = await Promise.all(
    txs.map((tx) => getTransactionFee(connection, tx))
  );
  return fees.reduce((total, fee) => total + fee, 0);
}
