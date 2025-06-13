import { AnchorProvider, Idl, Program } from "@coral-xyz/anchor"
import { PublicKey } from "@solana/web3.js"
import { PROGRAM_ID } from "./constants"
import { miniFanoutResolvers } from "./resolvers"
import { MiniFanout } from "@helium/idls/lib/types/mini_fanout"
import { fetchBackwardsCompatibleIdl } from "@helium/spl-utils"

export async function init(
  provider: AnchorProvider,
  programId: PublicKey = PROGRAM_ID,
  idl?: Idl | null
): Promise<Program<MiniFanout>> {
  if (!idl) {
    idl = await fetchBackwardsCompatibleIdl(programId, provider)
  }
  const program = new Program<MiniFanout>(
    idl as MiniFanout,
    provider,
    undefined,
    () => {
      return miniFanoutResolvers
    }
  ) as Program<MiniFanout>

  return program
}

export * from "./constants"
export * from "./pdas"
export * from "./resolvers" 