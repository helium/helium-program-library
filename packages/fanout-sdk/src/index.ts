import { AnchorProvider, Idl, Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";
import { fanoutResolvers } from "./resolvers";
import { Fanout, IDL } from "@helium/idls/lib/types/fanout";

export async function init(
  provider: AnchorProvider,
  programId: PublicKey = PROGRAM_ID,
  idl?: Idl | null
): Promise<Program<Fanout>> {
  if (!idl) {
    idl = await Program.fetchIdl(programId, provider);
  }
  const program = new Program<Fanout>(
    idl as Fanout,
    programId ?? PROGRAM_ID,
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
