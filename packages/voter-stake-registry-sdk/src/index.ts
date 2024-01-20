import { VoterStakeRegistry } from "@helium/idls/lib/types/voter_stake_registry";
import { AnchorProvider, BN, Idl, Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { vsrResolvers } from "./resolvers";
import { PROGRAM_ID } from "./constants";
export * from "./constants";
export * from "./pdas";
export * from "./resolvers";

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
    undefined,
    () => {
      return vsrResolvers;
    }
  ) as Program<VoterStakeRegistry>;

  return heliumVoterStakeRegistry;
};

export function isClaimed({
  epoch,
  lastClaimedEpoch,
  claimedEpochsBitmap
}: {
  epoch: number,
  lastClaimedEpoch: number,
  claimedEpochsBitmap: BN,
}): boolean {
  if (epoch <= lastClaimedEpoch) {
    return true
  } else if (epoch > lastClaimedEpoch + 128) {
    return false
  } else {
    const bitIndex: number = epoch - lastClaimedEpoch - 1;
    return claimedEpochsBitmap.shrn(127 - bitIndex).and(new BN(1)).toNumber() === 1;
  }
}
