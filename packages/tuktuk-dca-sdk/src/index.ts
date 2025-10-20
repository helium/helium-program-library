import { AnchorProvider, Idl, Program } from "@coral-xyz/anchor"
import { PublicKey } from "@solana/web3.js"
import { PROGRAM_ID } from "./constants"
import { tuktukDcaResolvers } from "./resolvers"
import { TuktukDca } from "@helium/idls/lib/types/tuktuk_dca"
import { fetchBackwardsCompatibleIdl } from "@helium/spl-utils"

export async function init(
  provider: AnchorProvider,
  programId: PublicKey = PROGRAM_ID,
  idl?: Idl | null
): Promise<Program<TuktukDca>> {
  if (!idl) {
    idl = await fetchBackwardsCompatibleIdl(programId, provider)
  }
  const program = new Program<TuktukDca>(
    idl as TuktukDca,
    provider,
    undefined,
    () => {
      return tuktukDcaResolvers
    }
  ) as Program<TuktukDca>

  return program
}

export * from "./constants"
export * from "./pdas"
export * from "./resolvers"
