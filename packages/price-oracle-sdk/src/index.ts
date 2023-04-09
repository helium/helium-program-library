import { PriceOracle } from "@helium/idls/lib/types/price_oracle";
import { AnchorProvider, Idl, Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";

export * from "./constants";

export async function init(
  provider: AnchorProvider,
  programId: PublicKey = PROGRAM_ID,
  idl?: Idl | null
): Promise<Program<PriceOracle>> {
  if (!idl) {
    idl = await Program.fetchIdl(programId, provider);
  }

  const program = new Program<PriceOracle>(
    idl as PriceOracle,
    programId,
    provider,
    undefined,
  ) as Program<PriceOracle>;

  return program;
}
