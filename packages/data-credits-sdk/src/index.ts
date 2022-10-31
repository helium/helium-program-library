import { DataCredits } from "@helium/idls/lib/types/data_credits";
import { AnchorProvider, Idl, Program } from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";
import { dataCreditsResolvers } from "./resolvers";


export * from "./constants";
export * from "./pdas";

export async function init(
  provider: AnchorProvider,
  programId: PublicKey = PROGRAM_ID,
  idl?: Idl | null
): Promise<Program<DataCredits>> {
  if (!idl) {
    idl = await Program.fetchIdl(programId, provider);
  }

  const dataCredits = new Program<DataCredits>(
    idl as DataCredits,
    programId,
    provider,
    undefined,
    () => dataCreditsResolvers
  ) as Program<DataCredits>;

  return dataCredits;
}
