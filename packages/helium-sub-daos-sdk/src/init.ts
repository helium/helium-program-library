import { Idl, Program, Provider } from "@coral-xyz/anchor";
import { HeliumSubDaos } from "@helium/idls/lib/types/helium_sub_daos";
import { fetchBackwardsCompatibleIdl } from "@helium/spl-utils";
import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";
import { heliumSubDaosResolvers } from "./resolvers";

export async function init(
  provider: Provider,
  programId: PublicKey = PROGRAM_ID,
  idl?: Idl | null
): Promise<Program<HeliumSubDaos>> {
  if (!idl) {
    idl = await fetchBackwardsCompatibleIdl(programId, provider);
  }
  const program = new Program<HeliumSubDaos>(
    idl as HeliumSubDaos,
    provider,
    undefined,
    () => {
      return heliumSubDaosResolvers;
    }
  ) as Program<HeliumSubDaos>;

  return program;
}
