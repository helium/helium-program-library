import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";

export function notEmittedKey(programId = PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("not_emitted", "utf-8")],
    programId
  );
}
