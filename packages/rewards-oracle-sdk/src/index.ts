import { RewardsOracle } from "@helium/idls/lib/types/rewards_oracle";
import { AnchorProvider, Idl, Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";

export * from "./constants";
export * from "./pdas";

export async function init(
  provider: AnchorProvider,
  programId: PublicKey = PROGRAM_ID,
  idl?: Idl | null
): Promise<Program<RewardsOracle>> {
  if (!idl) {
    idl = await Program.fetchIdl(programId, provider);
  }

  const program = new Program<RewardsOracle>(
    idl as RewardsOracle,
    programId,
    provider,
    undefined,
  ) as Program<RewardsOracle>;

  return program;
}
