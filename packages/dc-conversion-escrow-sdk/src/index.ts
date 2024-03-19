import { DcConversionEscrow } from "@helium/idls/lib/types/dc_conversion_escrow";
import { AnchorProvider, Idl, Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";
import { dcConversionEscrowResolvers } from "./resolvers";


export * from "./constants";
export * from "./pdas";

export async function init(
  provider: AnchorProvider,
  programId: PublicKey = PROGRAM_ID,
  idl?: Idl | null
): Promise<Program<DcConversionEscrow>> {
  if (!idl) {
    idl = await Program.fetchIdl(programId, provider);
  }

  const dcConversionEscrow = new Program<DcConversionEscrow>(
    idl as DcConversionEscrow,
    programId,
    provider,
    undefined,
    () => dcConversionEscrowResolvers
  ) as Program<DcConversionEscrow>;

  return dcConversionEscrow;
}
