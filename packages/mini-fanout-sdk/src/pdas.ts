import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";

export function miniFanoutKey(
  namespace: PublicKey,
  seed: Buffer,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
    [Buffer.from("mini_fanout", "utf-8"), namespace.toBuffer(), seed],
    programId
  )
}

export function queueAuthorityKey(programId: PublicKey = PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("queue_authority", "utf-8")],
    programId
  )
}
