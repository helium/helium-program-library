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
import * as ed25519 from "@noble/ed25519";
import axios from "axios";

/**
 * Debug fetcher that wraps the oracle call with detailed logging
 * and local Ed25519 signature verification.
 */
async function debugFetcher({
  task,
  taskQueuedAt,
  url,
  taskQueue,
}: {
  task: PublicKey;
  taskQueuedAt: any;
  url: string;
  taskQueue: PublicKey;
}) {
  console.log(`[tuktuk:fetcher] POST ${url}`);
  console.log(`[tuktuk:fetcher]   task: ${task.toBase58()}`);
  console.log(`[tuktuk:fetcher]   taskQueuedAt: ${taskQueuedAt.toString()}`);
  console.log(`[tuktuk:fetcher]   taskQueue: ${taskQueue.toBase58()}`);

  const resp = await axios.post(url, {
    task: task.toBase58(),
    task_queued_at: taskQueuedAt.toString(),
    task_queue: taskQueue.toBase58(),
  });

  console.log(`[tuktuk:fetcher] Response status: ${resp.status}`);
  console.log(`[tuktuk:fetcher] Response keys: ${Object.keys(resp.data).join(", ")}`);

  const { transaction: txB64, signature, remaining_accounts } = resp.data;

  const txBytes = Buffer.from(txB64, "base64");
  const sigBytes = Buffer.from(signature, "base64");

  console.log(`[tuktuk:fetcher] Transaction bytes: ${txBytes.length}`);
  console.log(`[tuktuk:fetcher] Signature bytes: ${sigBytes.length}`);
  console.log(`[tuktuk:fetcher] Signature (hex): ${sigBytes.toString("hex").slice(0, 64)}...`);
  console.log(`[tuktuk:fetcher] Remaining accounts: ${remaining_accounts.length}`);
  for (const acc of remaining_accounts) {
    console.log(`[tuktuk:fetcher]   ${acc.pubkey} writable=${acc.is_writable} signer=${acc.is_signer}`);
  }

  const remainingAccounts = remaining_accounts.map((acc: any) => ({
    pubkey: new PublicKey(acc.pubkey),
    isWritable: acc.is_writable,
    isSigner: acc.is_signer,
  }));

  return {
    remoteTaskTransaction: txBytes,
    remainingAccounts,
    signature: sigBytes,
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
    let oracleSigner: PublicKey | null = null;
    if (txSource.compiledV0) {
      console.log(`[tuktuk] Task ${taskId} is CompiledV0 with ${txSource.compiledV0[0].accounts.length} accounts`);
    } else if (txSource.remoteV0) {
      oracleSigner = txSource.remoteV0.signer;
      console.log(`[tuktuk] Task ${taskId} is RemoteV0, url: ${txSource.remoteV0.url}, signer: ${oracleSigner.toBase58()}`);
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
      fetcher: debugFetcher,
    });

    console.log(`[tuktuk] runTask returned ${runTaskIxs.length} instructions:`);
    for (let i = 0; i < runTaskIxs.length; i++) {
      const ix = runTaskIxs[i];
      const isEd25519 = ix.programId.equals(Ed25519Program.programId);
      console.log(`[tuktuk]   ix[${i}]: programId=${ix.programId.toBase58()}${isEd25519 ? " (Ed25519SigVerify)" : ""}, keys=${ix.keys.length}, data=${ix.data.length} bytes`);

      // Parse and verify Ed25519 instruction data locally
      if (isEd25519 && oracleSigner) {
        try {
          const data = ix.data;
          // Ed25519 instruction layout:
          // [0..2]   num_signatures (u16 LE)
          // [2..4]   padding
          // [4..6]   signature_offset (u16 LE)
          // [6..8]   signature_ix_index (u16 LE)
          // [8..10]  public_key_offset (u16 LE)
          // [10..12] public_key_ix_index (u16 LE)
          // [12..14] message_data_offset (u16 LE)
          // [14..16] message_data_size (u16 LE)
          // [16..18] message_ix_index (u16 LE)
          const numSigs = data.readUInt16LE(0);
          const sigOffset = data.readUInt16LE(4);
          const sigIxIndex = data.readUInt16LE(6);
          const pubkeyOffset = data.readUInt16LE(8);
          const pubkeyIxIndex = data.readUInt16LE(10);
          const msgOffset = data.readUInt16LE(12);
          const msgSize = data.readUInt16LE(14);
          const msgIxIndex = data.readUInt16LE(16);

          console.log(`[tuktuk:ed25519] numSignatures=${numSigs}, sigOffset=${sigOffset}, sigIxIndex=${sigIxIndex}`);
          console.log(`[tuktuk:ed25519] pubkeyOffset=${pubkeyOffset}, pubkeyIxIndex=${pubkeyIxIndex}`);
          console.log(`[tuktuk:ed25519] msgOffset=${msgOffset}, msgSize=${msgSize}, msgIxIndex=${msgIxIndex}`);

          // All offsets should reference the same instruction (0xFFFF = current ix)
          const sigFromIx = sigIxIndex === 0xFFFF;
          const pkFromIx = pubkeyIxIndex === 0xFFFF;
          const msgFromIx = msgIxIndex === 0xFFFF;
          console.log(`[tuktuk:ed25519] sig from current ix: ${sigFromIx}, pk from current ix: ${pkFromIx}, msg from current ix: ${msgFromIx}`);

          if (sigFromIx && pkFromIx && msgFromIx) {
            const sig = data.slice(sigOffset, sigOffset + 64);
            const pk = data.slice(pubkeyOffset, pubkeyOffset + 32);
            const msg = data.slice(msgOffset, msgOffset + msgSize);

            const expectedPk = oracleSigner.toBytes();
            const pkMatch = Buffer.from(pk).equals(Buffer.from(expectedPk));
            console.log(`[tuktuk:ed25519] Public key in ix: ${new PublicKey(pk).toBase58()}`);
            console.log(`[tuktuk:ed25519] Expected signer:  ${oracleSigner.toBase58()}`);
            console.log(`[tuktuk:ed25519] Public key match: ${pkMatch}`);
            console.log(`[tuktuk:ed25519] Signature (hex): ${Buffer.from(sig).toString("hex")}`);
            console.log(`[tuktuk:ed25519] Message length: ${msg.length}`);
            console.log(`[tuktuk:ed25519] Message (hex, first 64): ${Buffer.from(msg).toString("hex").slice(0, 64)}...`);

            // Verify the signature locally (noble-ed25519 v1 returns Promise)
            try {
              const valid = await ed25519.verify(sig, msg, pk);
              console.log(`[tuktuk:ed25519] LOCAL signature verification: ${valid ? "VALID ✓" : "INVALID ✗"}`);
            } catch (verifyErr: any) {
              console.error(`[tuktuk:ed25519] LOCAL verification error:`, verifyErr.message);
            }
          }
        } catch (parseErr: any) {
          console.error(`[tuktuk:ed25519] Failed to parse Ed25519 instruction:`, parseErr.message);
        }
      }
    }

    console.log(`[tuktuk] Wrapping with priority fees...`);
    const draftIxs = await withPriorityFees({
      connection: provider.connection,
      instructions: runTaskIxs,
      signers: [crankTurner],
      addressLookupTableAddresses: taskQueueAcc.lookupTables,
      feePayer: crankTurner.publicKey,
    });

    console.log(`[tuktuk] After withPriorityFees: ${draftIxs.length} instructions`);

    console.log(`[tuktuk] Populating missing draft info...`);
    const draft = await populateMissingDraftInfo(provider.connection, {
      instructions: draftIxs,
      feePayer: crankTurner.publicKey,
      signers: [crankTurner],
      addressLookupTableAddresses: taskQueueAcc.lookupTables,
    }, "finalized");

    const tx = toVersionedTx(draft);

    // Log compiled message summary
    const compiledMsg = tx.message;
    if ("staticAccountKeys" in compiledMsg) {
      console.log(`[tuktuk] Compiled tx: ${compiledMsg.staticAccountKeys.length} static keys, ${compiledMsg.addressTableLookups.length} lookups, ${compiledMsg.compiledInstructions.length} instructions`);
      for (let i = 0; i < compiledMsg.compiledInstructions.length; i++) {
        const cix = compiledMsg.compiledInstructions[i];
        const progKey = compiledMsg.staticAccountKeys[cix.programIdIndex];
        console.log(`[tuktuk]   cix[${i}]: ${progKey?.toBase58() || "LOOKUP?"} (idx=${cix.programIdIndex})`);
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
      // Try to get logs via getLogs() if available
      if (typeof err.getLogs === "function") {
        try {
          const logs = await err.getLogs();
          console.error(`[tuktuk] getLogs():`, logs);
        } catch {}
      }
      throw err;
    }
  }
}
