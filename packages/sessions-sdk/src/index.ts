import { AnchorProvider, Idl, Program } from "@coral-xyz/anchor";
import { heliumCommonResolver } from "@helium/anchor-resolvers";
import { Sessions } from "@helium/idls/lib/types/sessions";
import { fetchBackwardsCompatibleIdl } from "@helium/spl-utils";
import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";

export * from "./constants";
export * from "./pdas";

export async function init(
  provider: AnchorProvider,
  programId: PublicKey = PROGRAM_ID,
  idl?: Idl | null
): Promise<Program<Sessions>> {
  if (!idl) {
    idl = await fetchBackwardsCompatibleIdl(programId, provider);
  }

  const program = new Program<Sessions>(
    idl as Sessions,
    provider,
    undefined,
    () => {
      return heliumCommonResolver;
    }
  ) as Program<Sessions>;

  return program;
} 