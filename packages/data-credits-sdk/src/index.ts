import { DataCredits } from "@helium-foundation/idls/lib/types/data_credits";
import { AnchorProvider, Idl, Program } from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";
import { dataCreditsResolvers } from "./resolvers";
import { dataCreditsKey } from "./pdas";
export * from "./instructions";
export * from "./pdas";
export * from "./constants";

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

export const isInitialized = async (program: Program<DataCredits>) =>
  (await program.provider.connection.getAccountInfo(dataCreditsKey()[0]))
    ? true
    : false;
