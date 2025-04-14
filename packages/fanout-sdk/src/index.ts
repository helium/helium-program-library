import { AnchorProvider, Idl, Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";
import { fanoutResolvers } from "./resolvers";
import { Fanout } from "@helium/idls/lib/types/fanout";
import { fetchBackwardsCompatibleIdl } from "@helium/spl-utils";
export async function init(
  provider: AnchorProvider,
  programId: PublicKey = PROGRAM_ID,
  idl?: Idl | null
): Promise<Program<Fanout>> {
  if (!idl) {
    idl = await fetchBackwardsCompatibleIdl(programId, provider);
  }
  const program = new Program<Fanout>(
    idl as Fanout,
    provider,
    undefined,
    () => {
      return fanoutResolvers;
    }
  ) as Program<Fanout>;

  return program;
}

export * from "./constants";
export * from "./pdas";
export * from "./resolvers";
