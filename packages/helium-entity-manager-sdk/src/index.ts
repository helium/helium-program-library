import { AnchorProvider, Idl, Program } from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";
import { HeliumEntityManager } from "@helium/idls/lib/types/helium_entity_manager";
import { PROGRAM_ID } from "./constants";
import { hotspotIssuanceResolvers } from "./resolvers";
export * from "./pdas";
export * from "./resolvers";
export * from "./constants";

export const init = async (
  provider: AnchorProvider,
  programId: PublicKey = PROGRAM_ID,
  idl?: Idl | null
): Promise<Program<HeliumEntityManager>> => {
  if (!idl) {
    idl = await Program.fetchIdl(programId, provider);
  }

  const hotspotIssuance = new Program<HeliumEntityManager>(
    idl as HeliumEntityManager,
    programId,
    provider,
    undefined,
    () => hotspotIssuanceResolvers
  ) as Program<HeliumEntityManager>;

  return hotspotIssuance;
};
