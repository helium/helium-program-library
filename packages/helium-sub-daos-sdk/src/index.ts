import { AnchorProvider, Idl, Program } from "@project-serum/anchor";
import { HeliumSubDaos } from "../../../target/types/helium_sub_daos";
import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";
import { heliumSubDaosResolvers } from "./resolvers";
export * from "./constants";
export * from "./pdas";
export * from "./resolvers";

export async function init(
  provider: AnchorProvider,
  programId: PublicKey = PROGRAM_ID,
  idl?: Idl | null
) {
  if (!idl) {
    idl = await Program.fetchIdl(programId, provider);
  }

  const heliumSubDaos = new Program<HeliumSubDaos>(
    idl as HeliumSubDaos,
    programId ?? PROGRAM_ID,
    provider,
    undefined,
    () => heliumSubDaosResolvers
  ) as Program<HeliumSubDaos>;

  return heliumSubDaos;
}
