import { Hexboosting } from "@helium/idls/lib/types/hexboosting";
import { AnchorProvider, Idl, Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";
import { hexboostingResolvers } from "./resolvers";


export * from "./constants";
export * from "./pdas";

export async function init(
  provider: AnchorProvider,
  programId: PublicKey = PROGRAM_ID,
  idl?: Idl | null
): Promise<Program<Hexboosting>> {
  if (!idl) {
    idl = await Program.fetchIdl(programId, provider);
  }

  const hexboosting = new Program<Hexboosting>(
    idl as Hexboosting,
    programId,
    provider,
    undefined,
    () => hexboostingResolvers
  ) as Program<Hexboosting>;

  return hexboosting;
}
