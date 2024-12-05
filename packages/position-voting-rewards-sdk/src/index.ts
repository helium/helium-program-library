import { AnchorProvider, Idl, Program } from "@coral-xyz/anchor";
import { PositionVotingRewards } from "@helium/idls/lib/types/position_voting_rewards";
import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";
import { positionVotingRewardsResolvers } from "./resolvers";
import { fetchBackwardsCompatibleIdl } from "@helium/spl-utils";
export * from "./constants";
export * from "./pdas";
export * from "./resolvers";

export const init = async (
  provider: AnchorProvider,
  programId: PublicKey = PROGRAM_ID,
  idl?: Idl | null
): Promise<Program<PositionVotingRewards>> => {
  if (!idl) {
    idl = await fetchBackwardsCompatibleIdl(programId, provider);
  }

  const positionVotingRewards = new Program<PositionVotingRewards>(
    idl as PositionVotingRewards,
    programId,
    provider,
    undefined,
    () => {
      return positionVotingRewardsResolvers;
    }
  ) as Program<PositionVotingRewards>;

  return positionVotingRewards;
};
