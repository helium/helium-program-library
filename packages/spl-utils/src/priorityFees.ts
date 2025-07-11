import {
  AddressLookupTableAccount,
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  RecentPrioritizationFees,
  TransactionInstruction,
  VersionedTransaction,
} from "@solana/web3.js";
import { TransactionDraft, populateMissingDraftInfo } from "./draft";
import { toVersionedTx } from "./transaction";

const MAX_RECENT_PRIORITY_FEE_ACCOUNTS = 128;
export const MAX_PRIO_FEE = 2500000;

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

export const estimateComputeUnits = async (
  connection: Connection,
  tx: VersionedTransaction,
  retries: number = 5
): Promise<number | undefined> => {
  const sim = (await connection.simulateTransaction(tx)).value;
  if (
    sim.err &&
    sim.err.toString().includes("BlockhashNotFound") &&
    retries > 0
  ) {
    await sleep(500);
    return estimateComputeUnits(connection, tx, retries - 1);
  }

  // Default to 1m compute if it failed
  if (sim.err) {
    return Math.max(sim.unitsConsumed || 0, 1400000);
  }

  return sim.unitsConsumed;
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
  computeScaleUp,
  ...rest
}: {
  connection: Connection;
  computeUnits?: number;
  basePriorityFee?: number;
  computeScaleUp?: number;
  priorityFeeOptions?: any;
  maxPriorityFee?: number;
} & Partial<TransactionDraft>): Promise<TransactionInstruction[]> {
  if (!computeUnits && !rest.feePayer) {
    throw new Error("Must provide feePayer if estimating compute units");
  }

  const estimate = await estimatePrioritizationFee(
    connection,
    instructions,
    basePriorityFee,
    maxPriorityFee,
    priorityFeeOptions
  );
  if (!computeUnits) {
    const temp = {
      instructions,
      feePayer: rest.feePayer!,
      ...rest,
    };
    const tx = await populateMissingDraftInfo(connection, temp);
    let ixWithComputeUnits = tx.instructions;
    if (
      !tx.instructions.some((ix) =>
        ix.programId.equals(ComputeBudgetProgram.programId)
      )
    ) {
      ixWithComputeUnits = [
        ComputeBudgetProgram.setComputeUnitLimit({
          units: 1400000,
        }),
        ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: 1,
        }),
        ...tx.instructions,
      ];
    }
    const estimatedFee = await estimateComputeUnits(
      connection,
      toVersionedTx({ ...tx, instructions: ixWithComputeUnits })
    );
    if (estimatedFee) {
      computeUnits = Math.min(
        1400000,
        Math.ceil(estimatedFee * (computeScaleUp || 1.1))
      );
    } else {
      computeUnits = 200000;
    }
  }

  return [
    ComputeBudgetProgram.setComputeUnitLimit({
      units: computeUnits,
    }),
    ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: estimate,
    }),
    ...instructions,
  ];
}
