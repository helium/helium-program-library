import { PublicKey } from "@solana/web3.js"
import { PROGRAM_ID } from "./constants"
import { sha256 } from "js-sha256";

export function miniFanoutKey(
  name: string,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("mini_fanout", "utf-8"), Buffer.from(sha256(name), "hex")],
    programId
  )
}

export function queueAuthorityKey(programId: PublicKey = PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("queue_authority", "utf-8")],
    programId
  )
}