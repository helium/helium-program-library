import { MobileEntityManager } from "@helium/idls/lib/types/mobile_entity_manager";
import { AnchorProvider, Idl, Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";
import { mobileEntityManagerResolvers } from "./resolvers";
import { fetchBackwardsCompatibleIdl } from "@helium/spl-utils";

export const init = async (
  provider: AnchorProvider,
  programId: PublicKey = PROGRAM_ID,
  idl?: Idl | null
): Promise<Program<MobileEntityManager>> => {
  if (!idl) {
    idl = await fetchBackwardsCompatibleIdl(programId, provider);
  }

  const mobileEntityManager = new Program<MobileEntityManager>(
    idl as MobileEntityManager,
    provider,
    undefined,
    () => mobileEntityManagerResolvers
  ) as Program<MobileEntityManager>;

  return mobileEntityManager;
};
