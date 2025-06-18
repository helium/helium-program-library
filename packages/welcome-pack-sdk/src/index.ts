import { AnchorProvider, BN, Idl, IdlAccounts, IdlTypes, Program } from "@coral-xyz/anchor"
import { Keypair, PublicKey } from "@solana/web3.js"
import { PROGRAM_ID } from "./constants"
import { welcomePackResolvers } from "./resolvers"
import { WelcomePack } from "@helium/idls/lib/types/welcome_pack"
import { fetchBackwardsCompatibleIdl } from "@helium/spl-utils"
import { sha256 } from "js-sha256"
import { sign } from "tweetnacl"

export type ClaimApprovalV0 = {
  welcomePack: PublicKey,
  expirationTimestamp: BN,
}

export { initializeWelcomePack } from "./functions/initializeWelcomePack"
export { claimWelcomePack } from "./functions/claimWelcomePack"
export { closeWelcomePack } from "./functions/closeWelcomePack"

export function claimApprovalSignature(
  claimApproval: ClaimApprovalV0,
  approver: Keypair,
) {
  const expirationTimestampBuffer = Buffer.alloc(8)
  expirationTimestampBuffer.writeBigInt64LE(BigInt(claimApproval.expirationTimestamp.toString()))
  const fullBuffer = Buffer.concat([claimApproval.welcomePack.toBuffer(), expirationTimestampBuffer])
  const msgHash = sha256(fullBuffer)
  return Buffer.from(
    sign.detached(Uint8Array.from(Buffer.from(msgHash, "hex")), approver.secretKey)
  )
}

export async function init(
  provider: AnchorProvider,
  programId: PublicKey = PROGRAM_ID,
  idl?: Idl | null
): Promise<Program<WelcomePack>> {
  if (!idl) {
    idl = await fetchBackwardsCompatibleIdl(programId, provider)
  }
  const program = new Program<WelcomePack>(
    idl as WelcomePack,
    provider,
    undefined,
    () => {
      return welcomePackResolvers
    }
  ) as Program<WelcomePack>

  return program
}

export * from "./constants"
export * from "./pdas"
export * from "./resolvers" 