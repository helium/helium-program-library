import { HeliumSubDaos } from "../../../target/types/helium_sub_daos";
import { PublicKey } from "@solana/web3.js";
import { AnchorProvider, Program } from "@project-serum/anchor";
import { PROGRAM_ID } from "./constants";
export { subDaoEpochInfoResolver, heliumSubDaosResolvers } from "./resolvers";
export { subDaoEpochInfoKey } from "./pdas"

export async function init(
  provider: AnchorProvider,
  programId?: PublicKey
) {
  const dataCreditsIdlJson = await Program.fetchIdl(
    programId ?? PROGRAM_ID,
    provider
  );
  const dataCredits = new Program<HeliumSubDaos>(
    dataCreditsIdlJson as HeliumSubDaos,
    programId ?? PROGRAM_ID,
    provider
  ) as Program<HeliumSubDaos>;
  return dataCredits;
}
