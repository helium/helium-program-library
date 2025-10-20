import { PublicKey } from "@solana/web3.js"
import { PROGRAM_ID } from "./constants"

export function dcaKey(
  authority: PublicKey,
  inputMint: PublicKey,
  outputMint: PublicKey,
  index: number,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  const indexBuffer = Buffer.alloc(2)
  indexBuffer.writeUInt16LE(index)
  
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("dca", "utf-8"),
      authority.toBuffer(),
      inputMint.toBuffer(),
      outputMint.toBuffer(),
      indexBuffer,
    ],
    programId
  )
}

export function queueAuthorityKey(programId: PublicKey = PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("queue_authority", "utf-8")],
    programId
  )
}

