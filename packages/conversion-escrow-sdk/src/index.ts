import { ConversionEscrow } from "@helium/idls/lib/types/conversion_escrow";
import { AnchorProvider, Idl, Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";
import { conversionEscrowResolvers } from "./resolvers";


export * from "./constants";
export * from "./pdas";

export async function init(
  provider: AnchorProvider,
  programId: PublicKey = PROGRAM_ID,
  idl?: Idl | null
): Promise<Program<ConversionEscrow>> {
  if (!idl) {
    idl = await Program.fetchIdl(programId, provider);
  }

  const conversionEscrow = new Program<ConversionEscrow>(
    idl as ConversionEscrow,
    programId,
    provider,
    undefined,
    () => conversionEscrowResolvers
  ) as Program<ConversionEscrow>;

  return conversionEscrow;
}
