import { AnchorProvider, BN, Idl, Program } from "@coral-xyz/anchor"
import { WelcomePack } from "@helium/idls/lib/types/welcome_pack"
import { fetchBackwardsCompatibleIdl } from "@helium/spl-utils"
import { Keypair, PublicKey } from "@solana/web3.js"
import { sign } from "tweetnacl"
import { PROGRAM_ID } from "./constants"
import { welcomePackResolvers } from "./resolvers"

export type ClaimApprovalV0 = {
  uniqueId: Number,
  expirationTimestamp: BN,
}

export { claimWelcomePack } from "./functions/claimWelcomePack"
export { closeWelcomePack } from "./functions/closeWelcomePack"
export { initializeWelcomePack } from "./functions/initializeWelcomePack"

export function claimApprovalSignature(
  claimApproval: ClaimApprovalV0,
  approver: Keypair,
) {
  const buf = Buffer.from(
    `Approve invite ${claimApproval.uniqueId.toString()} expiring ${claimApproval.expirationTimestamp.toString()}`
  )
  return Buffer.from(
    sign.detached(Uint8Array.from(buf), approver.secretKey)
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
