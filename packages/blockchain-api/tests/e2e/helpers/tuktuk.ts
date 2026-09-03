import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  bulkSendRawTransactions,
  populateMissingDraftInfo,
  toVersionedTx,
  withPriorityFees,
} from "@helium/spl-utils";
// @ts-ignore
import { Tuktuk } from "@helium/tuktuk-idls/lib/types/tuktuk";
import { runTask, taskKey } from "@helium/tuktuk-sdk";
import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmRawTransaction,
} from "@solana/web3.js";
import { getSurfpoolRpcUrl } from "./surfpool";

/** Raw surfpool account write. Throws on RPC error, like `setTokenAccount`. */
async function setAccountData(
  address: PublicKey,
  accountInfo: { data: Buffer; owner: PublicKey; lamports: number }
): Promise<void> {
  const res = await fetch(getSurfpoolRpcUrl(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "surfnet_setAccount",
      params: [
        address.toBase58(),
        {
          data: accountInfo.data.toString("hex"),
          owner: accountInfo.owner.toBase58(),
          lamports: accountInfo.lamports,
        },
      ],
    }),
  });
  const json = await res.json();
  if (json.error) {
    throw new Error(`setAccount failed: ${JSON.stringify(json.error)}`);
  }
}

function freeBitsInByte(byte: number): number[] {
  const bits: number[] = [];
  for (let bit = 0; bit < 8; bit++) {
    if ((byte & (1 << bit)) === 0) bits.push(bit);
  }
  return bits;
}

/**
 * Leave a task queue with `count` free ids, all inside one bitmap byte, and
 * return them. `nextAvailableTaskIds` starts its scan at a random byte, so a
 * caller that re-reads the bitmap once per task normally gets different ids by
 * luck; with the free ids packed into a single byte every read yields the same
 * first free id, which is the collision a caller avoids by reserving all its
 * ids from one read. Returns a `restore` that puts the original bitmap back
 * with the reserved ids marked used.
 */
export async function confineTaskQueueFreeIds(
  connection: Connection,
  tuktukProgram: Program<Tuktuk>,
  taskQueue: PublicKey,
  count: number
): Promise<{ freeIds: number[]; restore: () => Promise<void> }> {
  const accountInfo = await connection.getAccountInfo(taskQueue);
  if (!accountInfo) {
    throw new Error(`Task queue ${taskQueue.toBase58()} not found`);
  }
  const { taskBitmap } = await tuktukProgram.account.taskQueueV0.fetch(
    taskQueue
  );
  const bitmapOffset = accountInfo.data.indexOf(taskBitmap);
  if (bitmapOffset < 0) {
    throw new Error("Task bitmap not found in task queue account data");
  }

  const byteIdx = taskBitmap.findIndex(
    (byte: number) => freeBitsInByte(byte).length >= count
  );
  if (byteIdx < 0) {
    throw new Error(`No bitmap byte holds ${count} free task ids`);
  }
  const freeIds = freeBitsInByte(taskBitmap[byteIdx])
    .slice(0, count)
    .map((bit) => byteIdx * 8 + bit);

  const confined = Buffer.alloc(taskBitmap.length, 0xff);
  confined[byteIdx] = freeIds.reduce(
    (byte, id) => byte & ~(1 << (id % 8)),
    0xff
  );
  const confinedData = Buffer.from(accountInfo.data);
  confined.copy(confinedData, bitmapOffset);
  await setAccountData(taskQueue, { ...accountInfo, data: confinedData });

  return {
    freeIds,
    restore: async () => {
      const restoredData = Buffer.from(accountInfo.data);
      for (const id of freeIds) {
        restoredData[bitmapOffset + Math.floor(id / 8)] |= 1 << (id % 8);
      }
      await setAccountData(taskQueue, { ...accountInfo, data: restoredData });
    },
  };
}

export async function runAllTasks(
  provider: anchor.AnchorProvider,
  tuktukProgram: Program<Tuktuk>,
  taskQueue: PublicKey,
  crankTurner: Keypair,
  taskIds?: number[],
  nextAvailableTaskIds?: number[]
) {
  const taskQueueAcc = await tuktukProgram.account.taskQueueV0.fetch(taskQueue);

  // Find all task IDs that need to be executed (have a 1 in the bitmap)
  taskIds = taskIds || [];
  if (taskIds.length == 0) {
    for (let i = 0; i < taskQueueAcc.taskBitmap.length; i++) {
      const byte = taskQueueAcc.taskBitmap[i];
      for (let bit = 0; bit < 8; bit++) {
        if ((byte & (1 << bit)) !== 0) {
          taskIds.push(i * 8 + bit);
        }
      }
    }
  }

  // Execute all tasks
  for (const taskId of taskIds) {
    const task = taskKey(taskQueue, taskId)[0];
    const taskAcc = await tuktukProgram.account.taskV0.fetchNullable(task);
    if (!taskAcc) {
      continue;
    }
    if (
      (taskAcc.trigger.timestamp?.[0]?.toNumber() || 0) <
        new Date().getTime() / 1000 &&
      typeof taskAcc.trigger.now === "undefined"
    ) {
      continue;
    }

    const runTaskIxs = await runTask({
      program: tuktukProgram,
      task,
      crankTurner: crankTurner.publicKey,
      nextAvailableTaskIds,
    });
    const draftIxs = await withPriorityFees({
      connection: provider.connection,
      instructions: runTaskIxs,
      signers: [crankTurner],
      addressLookupTableAddresses: taskQueueAcc.lookupTables,
      feePayer: crankTurner.publicKey,
    });
    const tx = toVersionedTx(
      await populateMissingDraftInfo(
        provider.connection,
        {
          instructions: draftIxs,
          feePayer: crankTurner.publicKey,
          signers: [crankTurner],
          addressLookupTableAddresses: taskQueueAcc.lookupTables,
        },
        "finalized"
      )
    );
    await tx.sign([crankTurner]);
    console.log(
      await sendAndConfirmRawTransaction(
        provider.connection,
        Buffer.from(tx.serialize()),
        { skipPreflight: false }
      )
    );
  }
}
