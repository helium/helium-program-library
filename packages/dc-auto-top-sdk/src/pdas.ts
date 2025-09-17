import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";

export function autoTopOffKey(
  delegatedDataCredits: PublicKey,
  authority: PublicKey,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
    [Buffer.from("auto_top_off", "utf-8"), delegatedDataCredits.toBuffer(), authority.toBuffer()],
    programId
  )
}

export function queueAuthorityKey(programId: PublicKey = PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("queue_authority", "utf-8")],
    programId
  )
}
