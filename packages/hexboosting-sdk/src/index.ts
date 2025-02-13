import { Hexboosting } from "@helium/idls/lib/types/hexboosting";
import { AnchorProvider, Idl, Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";
import { hexboostingResolvers } from "./resolvers";
import { fetchBackwardsCompatibleIdl } from "@helium/spl-utils";

export * from "./constants";
export * from "./pdas";

export async function init(
  provider: AnchorProvider,
  programId: PublicKey = PROGRAM_ID,
  idl?: Idl | null
): Promise<Program<Hexboosting>> {
  if (!idl) {
    idl = await fetchBackwardsCompatibleIdl(programId, provider);
  }

  const hexboosting = new Program<Hexboosting>(
    idl as Hexboosting,
    provider,
    undefined,
    () => hexboostingResolvers
  ) as Program<Hexboosting>;

  return hexboosting;
}
