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
  Keypair,
  PublicKey,
  sendAndConfirmRawTransaction,
  Ed25519Program,
} from "@solana/web3.js";

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

  console.log(`[tuktuk] Task IDs to execute: [${taskIds.join(", ")}]`);
  console.log(`[tuktuk] Lookup tables: [${taskQueueAcc.lookupTables.map((lt: PublicKey) => lt.toBase58()).join(", ")}]`);

  // Execute all tasks
  for (const taskId of taskIds) {
    const task = taskKey(taskQueue, taskId)[0];
    console.log(`[tuktuk] Processing task ${taskId} at ${task.toBase58()}`);
    const taskAcc = await tuktukProgram.account.taskV0.fetchNullable(task);
    if (!taskAcc) {
      console.log(`[tuktuk] Task ${taskId} not found, skipping`);
      continue;
    }

    const trigger = taskAcc.trigger;
    console.log(`[tuktuk] Task ${taskId} trigger:`, JSON.stringify(trigger, (_, v) => typeof v === 'bigint' ? v.toString() : v));

    const txSource = taskAcc.transaction;
    if (txSource.compiledV0) {
      console.log(`[tuktuk] Task ${taskId} is CompiledV0 with ${txSource.compiledV0[0].accounts.length} accounts`);
    } else if (txSource.remoteV0) {
      console.log(`[tuktuk] Task ${taskId} is RemoteV0, url: ${txSource.remoteV0.url}, signer: ${txSource.remoteV0.signer.toBase58()}`);
    } else {
      console.log(`[tuktuk] Task ${taskId} unknown transaction type:`, Object.keys(txSource));
    }

    if (
      (taskAcc.trigger.timestamp?.[0]?.toNumber() || 0) <
        new Date().getTime() / 1000 &&
      typeof taskAcc.trigger.now === "undefined"
    ) {
      console.log(`[tuktuk] Task ${taskId} trigger not ready, skipping`);
      continue;
    }

    console.log(`[tuktuk] Building runTask instructions for task ${taskId}...`);
    const runTaskIxs = await runTask({
      program: tuktukProgram,
      task,
      crankTurner: crankTurner.publicKey,
      nextAvailableTaskIds,
    });

    console.log(`[tuktuk] runTask returned ${runTaskIxs.length} instructions:`);
    for (let i = 0; i < runTaskIxs.length; i++) {
      const ix = runTaskIxs[i];
      const isEd25519 = ix.programId.equals(Ed25519Program.programId);
      console.log(`[tuktuk]   ix[${i}]: programId=${ix.programId.toBase58()}${isEd25519 ? " (Ed25519SigVerify)" : ""}, keys=${ix.keys.length}, data=${ix.data.length} bytes`);
    }

    console.log(`[tuktuk] Wrapping with priority fees...`);
    const draftIxs = await withPriorityFees({
      connection: provider.connection,
      instructions: runTaskIxs,
      signers: [crankTurner],
      addressLookupTableAddresses: taskQueueAcc.lookupTables,
      feePayer: crankTurner.publicKey,
    });

    console.log(`[tuktuk] After withPriorityFees: ${draftIxs.length} instructions:`);
    for (let i = 0; i < draftIxs.length; i++) {
      console.log(`[tuktuk]   ix[${i}]: programId=${draftIxs[i].programId.toBase58()}, keys=${draftIxs[i].keys.length}`);
    }

    console.log(`[tuktuk] Populating missing draft info...`);
    const draft = await populateMissingDraftInfo(provider.connection, {
      instructions: draftIxs,
      feePayer: crankTurner.publicKey,
      signers: [crankTurner],
      addressLookupTableAddresses: taskQueueAcc.lookupTables,
    }, "finalized");

    const tx = toVersionedTx(draft);

    // Log the compiled message details
    const msg = tx.message;
    console.log(`[tuktuk] VersionedTransaction message version: ${msg.version || "legacy"}`);
    if ("staticAccountKeys" in msg) {
      console.log(`[tuktuk] Static account keys (${msg.staticAccountKeys.length}):`);
      msg.staticAccountKeys.forEach((key: PublicKey, i: number) => {
        console.log(`[tuktuk]   [${i}] ${key.toBase58()}`);
      });
      console.log(`[tuktuk] Address table lookups: ${msg.addressTableLookups.length}`);
      for (const lookup of msg.addressTableLookups) {
        console.log(`[tuktuk]   table=${lookup.accountKey.toBase58()}, writable=[${lookup.writableIndexes.join(",")}], readonly=[${lookup.readonlyIndexes.join(",")}]`);
      }
      console.log(`[tuktuk] Compiled instructions (${msg.compiledInstructions.length}):`);
      for (let i = 0; i < msg.compiledInstructions.length; i++) {
        const cix = msg.compiledInstructions[i];
        const progKey = msg.staticAccountKeys[cix.programIdIndex];
        console.log(`[tuktuk]   cix[${i}]: programIdIndex=${cix.programIdIndex} (${progKey?.toBase58() || "LOOKUP TABLE?"}), accountKeyIndexes=[${cix.accountKeyIndexes.join(",")}], data=${cix.data.length} bytes`);
      }
    }

    await tx.sign([crankTurner]);
    console.log(`[tuktuk] Sending transaction for task ${taskId}...`);
    try {
      const sig = await sendAndConfirmRawTransaction(
        provider.connection,
        Buffer.from(tx.serialize()),
        { skipPreflight: true }
      );
      console.log(`[tuktuk] Task ${taskId} succeeded: ${sig}`);
    } catch (err: any) {
      console.error(`[tuktuk] Task ${taskId} FAILED:`, err.message);
      if (err.logs) {
        console.error(`[tuktuk] Logs:`, err.logs);
      }
      throw err;
    }
  }
}
