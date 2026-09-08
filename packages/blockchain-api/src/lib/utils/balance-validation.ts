import {
  Connection,
  VersionedTransaction,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import { ACCOUNT_SIZE } from "@solana/spl-token";
import {
  COMPUTE_BUDGET_IX_LIMIT,
  COMPUTE_BUDGET_IX_PRICE,
  MAX_COMPUTE_UNITS,
} from "@helium/spl-utils";

// Base signature fee (5000 lamports per signature)
export const BASE_SIGNATURE_FEE_LAMPORTS = 5000;

// Transaction fee estimates (legacy, kept for backwards compatibility).
// Used only for pre-build balance gates where no tx exists yet to price via
// getFeeForMessage. Once a SIMD-0553 burn gate activates, large-CU txs (e.g.
// Jupiter swaps) can cost more than this in resource fees alone — revisit
// these call sites then.
export const BASE_TX_FEE_LAMPORTS = 50000; // 0.00005 SOL

/**
 * Minimum balance a wallet must keep: the rent-exempt minimum for a 0-byte
 * account, priced from the cluster so it follows the Rent sysvar.
 */
export const getMinWalletRentLamports = (connection: Connection) =>
  connection.getMinimumBalanceForRentExemption(0);

// Byte sizes of the accounts non-automation endpoints create. Price them at
// call time with connection.getMinimumBalanceForRentExemption (batch with
// Promise.all) rather than hardcoding lamports, so gates track the cluster's
// Rent sysvar. Automation account sizes live in automation-helpers.ts.

/** SPL token account (ATA). */
export const ATA_SPACE = ACCOUNT_SIZE;

/**
 * RecipientV0, as allocated by initialize_recipient_v0 /
 * initialize_compression_recipient_v0 (programs/lazy-distributor):
 *   space = 8 + 60 + size_of::<RecipientV0>() + 8 * oracles.len()
 * size_of::<RecipientV0>() = 144. set_current_rewards later shrinks it via
 * resize_to_fit without refunding, so the init size is what the payer funds.
 * Mainnet recipients read back at 220 bytes (one oracle).
 */
export const recipientSpace = (numOracles: number) =>
  8 + 60 + 144 + 8 * numOracles;
/** RecipientV0 for the HNT lazy distributor, which has one oracle. */
export const RECIPIENT_SPACE = recipientSpace(1);

/**
 * UserWelcomePacksV0 (programs/welcome-pack initialize_welcome_pack_v0):
 *   space = 8 + 60 + size_of::<UserWelcomePacksV0>(), size_of = 44.
 * Mainnet accounts read back at 112 bytes.
 */
export const USER_WELCOME_PACKS_SPACE = 8 + 60 + 44;

/**
 * WelcomePackV0 (programs/welcome-pack initialize_welcome_pack_v0). Allocated
 * at 8 + 60 + size_of::<WelcomePackV0>() (size_of = 264), then resize_to_fit
 * grows it to the borsh size + 64 when that is larger:
 *   8 disc + 4 id + 5 * 32 pubkeys + 8 sol_amount
 *   + 4 + shares (32 wallet + 1 tag + 4 u32 | 8 u64)
 *   + 4 + schedule.len + 32 asset_return_address + 1 bump + 4 unique_id
 * Mainnet packs read back at 375/377 (2 shares) and 413 (3 shares) bytes.
 */
export const welcomePackSpace = ({
  numFixedShares,
  numPercentageShares,
  scheduleLen,
}: {
  numFixedShares: number;
  numPercentageShares: number;
  scheduleLen: number;
}) =>
  Math.max(
    8 + 60 + 264,
    225 + 41 * numFixedShares + 37 * numPercentageShares + scheduleLen + 64
  );

/**
 * MiniFanoutV0::size (programs/mini-fanout initialize_mini_fanout_v0.rs) for
 * the RemoteV0 pre-task every caller here queues, seeded by the 32-byte asset
 * key. Mainnet fanouts read back at 568–778 bytes (1–5 shares).
 */
export const miniFanoutSpace = ({
  numShares,
  scheduleLen,
  preTaskUrlLen,
}: {
  numShares: number;
  scheduleLen: number;
  preTaskUrlLen: number;
}) =>
  8 + // discriminator
  8 * 32 + // owner, namespace, mint, token_account, task_queue, next_task, rent_refund, next_pre_task
  1 + // bump
  (4 + scheduleLen) +
  1 + // queue_authority_bump
  (4 + numShares * 89) + // MiniFanoutShareV0::size() = 89
  (4 + 32) + // seed
  1 + // pre_task Option tag
  (1 + 4 + preTaskUrlLen + 32) + // RemoteV0 { url, signer }
  60; // RESERVE

/**
 * Tuktuk TaskV0 accounts schedule_task_v0 queues (rent is refunded when the
 * task runs). Sizes depend on the compiled distribute tx; measured on mainnet:
 * distribute tasks read back at 498–597 bytes (larger with more shares),
 * pre tasks at 335 bytes.
 */
export const MINI_FANOUT_DIST_TASK_SPACE = 597;
export const MINI_FANOUT_PRE_TASK_SPACE = 335;

/**
 * Calculate total SOL required for a transaction.
 * Returns the total required lamports (tx fees + rent + min wallet balance).
 */
export async function calculateRequiredBalance(
  connection: Connection,
  estimatedTxFeeLamports: number = BASE_TX_FEE_LAMPORTS,
  estimatedRentCostLamports: number = 0
): Promise<number> {
  return (
    estimatedTxFeeLamports +
    estimatedRentCostLamports +
    (await getMinWalletRentLamports(connection))
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
 *
 * Models only today's fee components — it does NOT model the SIMD-0553
 * resource fee (burned, priced on requested CU + loaded-data size), whose
 * rates are feature-gated and unknowable client-side. The primary
 * getFeeForMessage path picks that up automatically at activation; this
 * fallback will under-estimate once a burn gate is live.
 */
function estimateTransactionFeeLocally(tx: VersionedTransaction): number {
  const numSignatures = tx.message.header.numRequiredSignatures;
  const baseFee = BASE_SIGNATURE_FEE_LAMPORTS * numSignatures;

  let computeUnitLimit: number | undefined;
  let computeUnitPrice = 0; // Default no priority fee

  const computeBudgetProgramId = ComputeBudgetProgram.programId.toBase58();

  // Parse instructions to find ComputeBudget instructions
  const accountKeys = tx.message.staticAccountKeys;
  let numOtherInstructions = 0;
  for (const ix of tx.message.compiledInstructions) {
    const programId = accountKeys[ix.programIdIndex]?.toBase58();
    if (programId !== computeBudgetProgramId) {
      numOtherInstructions++;
      continue;
    }

    const data = ix.data;
    if (data.length === 0) continue;

    const discriminator = data[0];

    // SetComputeUnitLimit, data format: [discriminator, u32 limit]
    if (discriminator === COMPUTE_BUDGET_IX_LIMIT && data.length >= 5) {
      computeUnitLimit = Buffer.from(data).readUInt32LE(1);
    }

    // SetComputeUnitPrice, data format: [discriminator, u64 price (microlamports)]
    if (discriminator === COMPUTE_BUDGET_IX_PRICE && data.length >= 9) {
      // readBigUInt64LE parses the full u64 without the signed-shift overflow a
      // manual `<< 24` hits once a byte's high bit is set (price >= 2^31).
      computeUnitPrice = Number(Buffer.from(data).readBigUInt64LE(1));
    }
  }

  // No explicit limit ix: the runtime grants 200k CU per non-ComputeBudget
  // top-level instruction, capped at 1.4M — not a flat 200k per tx.
  if (computeUnitLimit == null) {
    computeUnitLimit = Math.min(
      MAX_COMPUTE_UNITS,
      200_000 * numOtherInstructions
    );
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
