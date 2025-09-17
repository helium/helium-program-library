import { DataCredits } from "@helium/idls/lib/types/data_credits";
import { AnchorProvider, Idl, Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";
import { dataCreditsResolvers } from "./resolvers";
import { fetchBackwardsCompatibleIdl } from "@helium/spl-utils";

export * from "./constants";
export * from "./pdas";

export { mintDataCredits } from "./functions/mintDataCredits";

export async function init(
  provider: AnchorProvider,
  programId: PublicKey = PROGRAM_ID,
  idl?: Idl | null
): Promise<Program<DataCredits>> {
  if (!idl) {
    idl = await fetchBackwardsCompatibleIdl(programId, provider);
  }

  const dataCredits = new Program<DataCredits>(
    idl as DataCredits,
    provider,
    undefined,
    () => dataCreditsResolvers
  ) as Program<DataCredits>;

  return dataCredits;
}
