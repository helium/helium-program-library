import { PublicKey } from "@solana/web3.js"
import { PROGRAM_ID } from "./constants"

export function welcomePackKey(
  authority: PublicKey,
  id: number,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  const idBuffer = Buffer.alloc(4)
  idBuffer.writeUInt32LE(id, 0)
  return PublicKey.findProgramAddressSync(
    [Buffer.from("welcome_pack", "utf-8"), authority.toBuffer(), idBuffer],
    programId
  )
}

export function userWelcomePacksKey(
  authority: PublicKey,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("user_welcome_packs", "utf-8"), authority.toBuffer()], programId)
}
