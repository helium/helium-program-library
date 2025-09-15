import { AnchorProvider, Idl, Program } from "@coral-xyz/anchor"
import { PublicKey } from "@solana/web3.js"
import { PROGRAM_ID } from "./constants"
import { dcAutoTopResolvers } from "./resolvers"
import { DcAutoTop } from "@helium/idls/lib/types/dc_auto_top"
import { fetchBackwardsCompatibleIdl } from "@helium/spl-utils"

export async function init(
  provider: AnchorProvider,
  programId: PublicKey = PROGRAM_ID,
  idl?: Idl | null
): Promise<Program<DcAutoTop>> {
  if (!idl) {
    idl = await fetchBackwardsCompatibleIdl(programId, provider)
  }
  const program = new Program<DcAutoTop>(
    idl as DcAutoTop,
    provider,
    undefined,
    () => {
      return dcAutoTopResolvers
    }
  ) as Program<DcAutoTop>

  return program
}

export * from "./constants"
export * from "./pdas"
export * from "./resolvers" 