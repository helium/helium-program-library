import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";

export function notEmittedKey(programId = PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("not_emitted", "utf-8")],
    programId
  );
}

export function notEmittedCounterKey(
  mint: PublicKey,
  programId = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("not_emitted_counter", "utf-8"), mint.toBuffer()],
    programId
  );
}
