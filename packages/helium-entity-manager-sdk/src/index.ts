import { AnchorProvider, Idl, Program } from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";
import { HeliumEntityManager } from "@helium/idls/lib/types/helium_entity_manager";
import { PROGRAM_ID } from "./constants";
import { heliumEntityManagerResolvers } from "./resolvers";
export * from "./pdas";
export * from "./resolvers";
export * from "./constants";
export { changeMetadata } from "./functions/changeMetadata";

export const init = async (
  provider: AnchorProvider,
  programId: PublicKey = PROGRAM_ID,
  idl?: Idl | null
): Promise<Program<HeliumEntityManager>> => {
  if (!idl) {
    idl = await Program.fetchIdl(programId, provider);
  }

  const heliumEntityManager = new Program<HeliumEntityManager>(
    idl as HeliumEntityManager,
    programId,
    provider,
    undefined,
    () => heliumEntityManagerResolvers
  ) as Program<HeliumEntityManager>;

  return heliumEntityManager;
};
