import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";

export function entityCronAuthorityKey(wallet: PublicKey, programId = PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("entity_cron_authority"), wallet.toBuffer()],
    programId
  );
}

export function queueAuthorityKey(
  programId = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("queue_authority")],
    programId
  );
}

export function delegationClaimBotKey(
  taskQueue: PublicKey,
  delegatedPosition: PublicKey,
  programId = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("delegation_claim_bot", "utf-8"),
      taskQueue.toBuffer(),
      delegatedPosition.toBuffer(),
    ],
    programId
  );
}

export function epochTrackerKey(dao: PublicKey, programId = PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("epoch_tracker", "utf-8"), dao.toBuffer()],
    programId
  );
}

export function taskReturnAccountKey(programId = PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("task_return_account", "utf-8")],
    programId
  );
}
