import {
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  RecentPrioritizationFees,
  SimulatedTransactionResponse,
  TransactionInstruction,
  VersionedTransaction,
} from "@solana/web3.js";
import { populateMissingDraftInfo, TransactionDraft } from "./draft";
import { toVersionedTx } from "./transaction";
import { MAX_COMPUTE_UNITS, tableComputeUnits } from "./computeUnitTable";

const MAX_RECENT_PRIORITY_FEE_ACCOUNTS = 128;
export const MAX_PRIO_FEE = 2500000;

// Fallback loaded-accounts data size when simulation can't measure it —
// same role the CU table plays for compute units. SIMD-0553 charges the
// REQUESTED size (8 cost units per 32 KiB), so the primary path derives the
// limit from the sim's measured loadedAccountsDataSize; this constant only
// applies when the caller skips simulation or the RPC doesn't return the
// field. 16 MiB covers the worst identified load: a ~10 MB compressed-hotspot
// merkle tree (merkleSizes caps trees below 10 MB) plus a few MiB of program
// binaries. Exceeding the limit FAILS the tx, so this errs high; 16 MiB still
// saves 75% vs the 64 MiB runtime default.
export const DEFAULT_LOADED_ACCOUNTS_DATA_SIZE_LIMIT = 16 * 1024 * 1024;

// SIMD-0553 prices loaded-accounts data in 32 KiB steps, so requesting
// anything finer buys nothing.
const LOADED_ACCOUNTS_DATA_SIZE_QUANTUM = 32 * 1024;

// Runtime maximum (and default) for the loaded-accounts data size limit;
// never request beyond it.
const MAX_LOADED_ACCOUNTS_DATA_SIZE_LIMIT = 64 * 1024 * 1024;

// ComputeBudget instruction discriminators (first data byte).
export const COMPUTE_BUDGET_IX_LIMIT = 2;
export const COMPUTE_BUDGET_IX_PRICE = 3;
export const COMPUTE_BUDGET_IX_DATA_SIZE = 4;

// ComputeBudget ix types (first data byte) the caller already set.
const callerComputeBudgetTypes = (
  instructions: TransactionInstruction[]
): Set<number> =>
  new Set(
    instructions
      .filter((ix) => ix.programId.equals(ComputeBudgetProgram.programId))
      .map((ix) => ix.data[0])
  );

const isDataSizeExceededErr = (err: unknown): boolean =>
  JSON.stringify(err ?? "").includes("MaxLoadedAccountsDataSizeExceeded");

// web3.js 1.x never shipped ComputeBudgetProgram.setLoadedAccountsDataSizeLimit,
// so build the instruction manually: discriminator 4, then u32le byte limit.
export function setLoadedAccountsDataSizeLimit(
  bytes: number
): TransactionInstruction {
  const data = Buffer.alloc(5);
  data.writeUInt8(COMPUTE_BUDGET_IX_DATA_SIZE, 0);
  data.writeUInt32LE(bytes, 1);
  return new TransactionInstruction({
    programId: ComputeBudgetProgram.programId,
    keys: [],
    data,
  });
}

// Borrowed with love from https://github.com/blockworks-foundation/mango-v4/blob/57a9835aa8f636b6d231ba2c4008bfe89cbf08ba/ts/client/src/client.ts#L4552
/**
 * Returns an estimate of a prioritization fee for a set of instructions.
 *
 * The estimate is based on the median fees of writable accounts that will be involved in the transaction.
 *
 * @param ixs - the instructions that make up the transaction
 * @returns prioritizationFeeEstimate -- in microLamports
 */
export async function estimatePrioritizationFee(
  connection: Connection,
  ixs: TransactionInstruction[],
  basePriorityFee?: number,
  maxPriorityFee: number = MAX_PRIO_FEE,
  priorityFeeOptions: any = {}
): Promise<number> {
  const accounts = ixs
    .map((x) => x.keys.filter((k) => k.isWritable).map((k) => k.pubkey))
    .flat();
  const uniqueAccounts = [...new Set(accounts.map((x) => x.toBase58()))]
    .map((a) => new PublicKey(a))
    .slice(0, MAX_RECENT_PRIORITY_FEE_ACCOUNTS);

  try {
    const {
      result: { priorityFeeEstimate },
      // @ts-ignore
    } = await connection._rpcRequest(
      "getPriorityFeeEstimate",
      connection._buildArgs([
        {
          accountKeys: uniqueAccounts.map((a) => a.toBase58()),
          options: {
            recommended: true,
            evaluateEmptySlotAsZero: true,
            ...priorityFeeOptions,
          },
        },
      ])
    );
    return Math.min(
      maxPriorityFee,
      Math.max(basePriorityFee || 1, Math.ceil(priorityFeeEstimate))
    );
  } catch (e: any) {
    console.error(
      "Failed to use getPriorityFeeEstimate, falling back to getRecentPrioritizationFees",
      e
    );
    const priorityFees = await connection.getRecentPrioritizationFees({
      lockedWritableAccounts: uniqueAccounts,
    });

    if (priorityFees.length < 1) {
      return Math.max(basePriorityFee || 0, 1);
    }

    // get max priority fee per slot (and sort by slot from old to new)
    const groupedBySlot = priorityFees.reduce((acc, fee) => {
      const key = fee.slot;
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(fee);
      return acc;
    }, {} as Record<string, RecentPrioritizationFees[]>);

    const maxFeeBySlot = Object.keys(groupedBySlot).reduce((acc, slot) => {
      acc[slot] = groupedBySlot[slot].reduce((max, fee) => {
        return fee.prioritizationFee > max.prioritizationFee ? fee : max;
      });
      return acc;
    }, {} as Record<string, RecentPrioritizationFees>);
    const maximumFees = Object.values(maxFeeBySlot).sort(
      (a: RecentPrioritizationFees, b: RecentPrioritizationFees) =>
        a.slot - b.slot
    ) as RecentPrioritizationFees[];

    // get median of last 20 fees
    const recentFees = maximumFees.slice(Math.max(maximumFees.length - 20, 0));
    const mid = Math.floor(recentFees.length / 2);
    const medianFee =
      recentFees.length % 2 !== 0
        ? recentFees[mid].prioritizationFee
        : (recentFees[mid - 1].prioritizationFee +
            recentFees[mid].prioritizationFee) /
          2;

    return Math.max(basePriorityFee || 1, Math.ceil(medianFee));
  }
}

// Returns a CU limit with headroom already applied: simulated consumption
// × computeScaleUp, or the static table fallback (which carries its own
// p95 × FALLBACK_CU_MARGIN worst-case headroom — no extra scaling). When simulation succeeds it
// also returns the measured loadedAccountsDataSize (undefined on the table
// fallback path or when the RPC predates the field). `simulated`
// distinguishes those two: false means nothing was measured, so callers
// must not trust any data-size assumption baked into the sim tx.
//
// Precondition: `tx` should already carry a MAX SetComputeUnitLimit ix.
// Simulation otherwise runs under the 200k/instruction runtime default, so a
// heavy tx exceeds it, fails sim, and silently degrades to the table fallback.
// Both callers (withPriorityFees, migration-service) prepend that ix.
export const estimateComputeBudget = async (
  connection: Connection,
  tx: VersionedTransaction,
  // Options object — a bare positional number here is too easy to pass by
  // mistake (e.g. a retry count) and would silently multiply the CU request.
  // computeScaleUp scales the simulated CU consumption AND, in withPriorityFees,
  // the derived loaded-accounts-data-size headroom — one knob, both requests.
  { computeScaleUp = 1.1 }: { computeScaleUp?: number } = {}
): Promise<{
  computeUnits: number;
  simulated: boolean;
  loadedAccountsDataSize?: number;
  // The deterministic sim error when that's why we fell back to the table
  // (absent on transport failures) — lets callers react to specific errors,
  // e.g. an exceeded data-size ceiling.
  simErr?: SimulatedTransactionResponse["err"];
}> => {
  let simErr: SimulatedTransactionResponse["err"] = null;
  // replaceRecentBlockhash avoids BlockhashNotFound sim failures entirely
  // (per Helius tx-optimization guidance); implies sigVerify: false.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const sim = (
        await connection.simulateTransaction(tx, {
          replaceRecentBlockhash: true,
        })
      ).value as SimulatedTransactionResponse & {
        // Agave returns this since 2.x, but web3.js 1.x never typed it.
        loadedAccountsDataSize?: number;
      };
      if (!sim.err && sim.unitsConsumed) {
        return {
          computeUnits: Math.min(
            MAX_COMPUTE_UNITS,
            Math.ceil(sim.unitsConsumed * computeScaleUp)
          ),
          simulated: true,
          loadedAccountsDataSize: sim.loadedAccountsDataSize,
        };
      }
      // A sim that returns an error is deterministic — retrying won't help.
      // Log it before falling back: the table keeps the tx alive, but a tx
      // that fails sim for a real reason (e.g. exceeding the data-size
      // ceiling) would otherwise die on-chain with no breadcrumb. A sim that
      // succeeds (err: null) but reports no unitsConsumed is a distinct case —
      // don't mislabel it as a failure with a null error.
      console.warn(
        sim.err
          ? "Transaction simulation failed, falling back to static CU table"
          : "Transaction simulation returned no unitsConsumed, falling back to static CU table",
        sim.err,
        sim.logs?.slice(-5)
      );
      simErr = sim.err;
      break;
    } catch (e) {
      // Transport/RPC error — retry once, then fall back to the table. Log at
      // least on the final attempt: a persistently broken RPC otherwise leaves
      // no trace, silently degrading every tx to (possibly 1.4M CU) table
      // pricing.
      if (attempt === 1) {
        console.warn(
          "Transaction simulation failed (transport/RPC error), falling back to static CU table",
          e
        );
      }
    }
    if (attempt === 0) await sleep(200);
  }

  return { computeUnits: tableComputeUnits(tx), simulated: false, simErr };
};

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withPriorityFees({
  connection,
  computeUnits,
  instructions = [],
  basePriorityFee,
  maxPriorityFee = MAX_PRIO_FEE,
  priorityFeeOptions,
  computeScaleUp = 1.1,
  // Explicit value pins the limit; when omitted it's derived from the
  // simulation's measured size, or left unset (runtime 64 MiB default) when
  // no simulation validated a ceiling.
  loadedAccountsDataSizeLimit,
  ...rest
}: {
  connection: Connection;
  computeUnits?: number;
  basePriorityFee?: number;
  // Headroom multiplier applied to the simulated CU consumption AND to the
  // sim-derived loaded-accounts-data-size request — one knob scales both.
  computeScaleUp?: number;
  priorityFeeOptions?: any;
  maxPriorityFee?: number;
  loadedAccountsDataSizeLimit?: number;
} & Partial<TransactionDraft>): Promise<TransactionInstruction[]> {
  // A caller's `computeUnits: 0` or `loadedAccountsDataSizeLimit: 0` is never
  // valid — 0 CU can't run, and a 0-byte data-size ix is rejected on-chain as
  // InvalidLoadedAccountsDataSizeLimit (burning the fee on skip-preflight
  // sends). Treat 0 as unset so the `== null` gates below fill it in.
  if (!computeUnits) computeUnits = undefined;
  if (!loadedAccountsDataSizeLimit) loadedAccountsDataSizeLimit = undefined;

  if (computeUnits == null && !rest.feePayer) {
    throw new Error("Must provide feePayer if estimating compute units");
  }

  // Independent RPC calls — run the fee estimate while the CU estimate
  // (simulation) is in flight.
  const feePromise = estimatePrioritizationFee(
    connection,
    instructions,
    basePriorityFee,
    maxPriorityFee,
    priorityFeeOptions
  );
  // Observe now so an early throw below (LUT fetch, sim) doesn't leave this
  // as an unhandled rejection; the real error still surfaces at the await.
  feePromise.catch(() => {});
  // The data-size limit actually requested. Starts as the caller's explicit
  // value (or undefined); the sim branch below may derive one from the
  // measured size. When computeUnits is explicit there is no simulation to
  // validate any default, so no ix is added and the runtime's 64 MiB default
  // applies — degrade to overpaying, never to an on-chain size failure.
  let resolvedDataSizeLimit: number | undefined = loadedAccountsDataSizeLimit;
  if (computeUnits == null) {
    // The ceiling the sim tx validates against when we insert our own
    // ComputeBudget ixs below.
    const simCeiling =
      loadedAccountsDataSizeLimit ?? DEFAULT_LOADED_ACCOUNTS_DATA_SIZE_LIMIT;
    // LUTs are needed to compile the sim tx; the blockhash is not —
    // simulation replaces it (replaceRecentBlockhash), so a placeholder
    // satisfies toVersionedTx without a getLatestBlockhash RPC.
    const tx = await populateMissingDraftInfo(connection, {
      instructions,
      feePayer: rest.feePayer!,
      ...rest,
      recentBlockhash: rest.recentBlockhash ?? PublicKey.default.toBase58(),
    });
    // Inject only the ComputeBudget ix types the caller left unset — a
    // duplicate type fails sanitization (DuplicateInstruction), and a
    // caller who set e.g. only a price ix should still get the sim-derived
    // limit and data-size ceiling. Mirrors prependComputeBudgetIxs.
    const callerCbTypes = callerComputeBudgetTypes(tx.instructions);
    // Only true when our data-size ix actually enters the sim tx below.
    // When the caller brought their own data-size ix the sim runs under
    // their ceiling instead, and nothing has validated ours.
    let simValidatesDataSizeCeiling = false;
    const simCbIxs: TransactionInstruction[] = [];
    if (!callerCbTypes.has(COMPUTE_BUDGET_IX_LIMIT)) {
      simCbIxs.push(
        ComputeBudgetProgram.setComputeUnitLimit({ units: MAX_COMPUTE_UNITS })
      );
    }
    if (!callerCbTypes.has(COMPUTE_BUDGET_IX_PRICE)) {
      simCbIxs.push(
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 })
      );
    }
    if (!callerCbTypes.has(COMPUTE_BUDGET_IX_DATA_SIZE)) {
      // Include the data-size limit in the sim tx so simulation validates
      // the ceiling — a tx that would exceed it fails here, not on-chain.
      simValidatesDataSizeCeiling = true;
      simCbIxs.push(setLoadedAccountsDataSizeLimit(simCeiling));
    }
    const ixWithComputeUnits = [...simCbIxs, ...tx.instructions];
    const budget = await estimateComputeBudget(
      connection,
      toVersionedTx({ ...tx, instructions: ixWithComputeUnits }),
      { computeScaleUp }
    );
    computeUnits = budget.computeUnits;
    // A sim that failed specifically by exceeding the ceiling we injected
    // proves the caller's explicit limit is fatal on-chain — and downstream
    // sends skip preflight, so nothing else would catch it. Drop the ceiling
    // and let the runtime 64 MiB default carry the tx: degrade to
    // overpaying, never to a burned fee. Unrelated sim failures keep the
    // explicit value (trusted, same as the explicit-computeUnits path).
    if (
      resolvedDataSizeLimit != null &&
      simValidatesDataSizeCeiling &&
      !budget.simulated &&
      isDataSizeExceededErr(budget.simErr)
    ) {
      console.warn(
        `Dropping explicit loadedAccountsDataSizeLimit ${resolvedDataSizeLimit}: simulation exceeded it`
      );
      resolvedDataSizeLimit = undefined;
    }
    if (loadedAccountsDataSizeLimit == null) {
      if (budget.simulated && budget.loadedAccountsDataSize) {
        // Request measured size × headroom, rounded up to the 32 KiB fee
        // quantum — mirrors the CU model. Clamp to the default ceiling only
        // when the sim enforced it; a measurement taken under a larger
        // ceiling can legitimately exceed the default, and clamping below
        // measured usage would fail on-chain.
        const derived = Math.min(
          MAX_LOADED_ACCOUNTS_DATA_SIZE_LIMIT,
          Math.ceil(
            (budget.loadedAccountsDataSize * computeScaleUp) /
              LOADED_ACCOUNTS_DATA_SIZE_QUANTUM
          ) * LOADED_ACCOUNTS_DATA_SIZE_QUANTUM
        );
        resolvedDataSizeLimit = simValidatesDataSizeCeiling
          ? Math.min(simCeiling, derived)
          : derived;
      } else if (budget.simulated && simValidatesDataSizeCeiling) {
        // Sim succeeded under our default ceiling but the RPC predates the
        // loadedAccountsDataSize field — the sim itself validated the
        // ceiling, so requesting it is safe.
        resolvedDataSizeLimit = simCeiling;
      }
      // Otherwise nothing validated any ceiling (sim failed, or it ran under
      // the caller's/runtime ceiling without a measured size) — leave
      // undefined: no data-size ix, runtime 64 MiB default applies.
    }
  }
  const estimate = await feePromise;

  return prependComputeBudgetIxs(instructions, {
    computeUnits,
    microLamports: estimate,
    loadedAccountsDataSizeLimit: resolvedDataSizeLimit,
  });
}

// Prepend ComputeBudget instructions to `instructions`. The runtime rejects
// duplicate ComputeBudget instruction types (DuplicateInstruction), so any
// type the caller already set is skipped — an explicit caller value wins.
// A null/undefined budget value omits that instruction entirely.
export function prependComputeBudgetIxs(
  instructions: TransactionInstruction[],
  {
    computeUnits,
    microLamports,
    loadedAccountsDataSizeLimit,
  }: {
    computeUnits?: number;
    microLamports?: number;
    loadedAccountsDataSizeLimit?: number;
  }
): TransactionInstruction[] {
  const callerCbTypes = callerComputeBudgetTypes(instructions);

  return [
    ...(computeUnits == null || callerCbTypes.has(COMPUTE_BUDGET_IX_LIMIT)
      ? []
      : [ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnits })]),
    ...(microLamports == null || callerCbTypes.has(COMPUTE_BUDGET_IX_PRICE)
      ? []
      : [ComputeBudgetProgram.setComputeUnitPrice({ microLamports })]),
    ...(loadedAccountsDataSizeLimit == null ||
    callerCbTypes.has(COMPUTE_BUDGET_IX_DATA_SIZE)
      ? []
      : [setLoadedAccountsDataSizeLimit(loadedAccountsDataSizeLimit)]),
    ...instructions,
  ];
}
