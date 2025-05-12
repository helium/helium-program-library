import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";

export function sessionManagerKey(
  programId = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("session_manager")],
    programId
  );
}

export function sessionKey(
  application: string,
  wallet: PublicKey,
  programId = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("session"), Buffer.from(application, "utf-8"), wallet.toBuffer()],
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
