import { AnchorProvider, Idl, Program } from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";
import { VoterStakeRegistry } from "@helium/idls/lib/types/voter_stake_registry";
import { PROGRAM_ID } from "./constants";
export * from "./pdas";
// export * from "./resolvers";
export * from "./constants";

export const init = async (
  provider: AnchorProvider,
  programId: PublicKey = PROGRAM_ID,
  idl?: Idl | null
): Promise<Program<VoterStakeRegistry>> => {
  if (!idl) {
    idl = await Program.fetchIdl(programId, provider);
  }

  const heliumVoterStakeRegistry = new Program<VoterStakeRegistry>(
    idl as VoterStakeRegistry,
    programId,
    provider,
    undefined
    // () => future add resolvers here
  ) as Program<VoterStakeRegistry>;

  return heliumVoterStakeRegistry;
};
