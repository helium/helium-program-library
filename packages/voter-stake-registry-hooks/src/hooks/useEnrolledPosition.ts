import { useAnchorAccount } from "@helium/helium-react-hooks";
import { PositionVotingRewards } from "@helium/idls/lib/types/position_voting_rewards";
import { PublicKey } from "@solana/web3.js";

export const useEnrolledPosition = (
  enrolledPositionKey: PublicKey | undefined
) => {
  return useAnchorAccount<PositionVotingRewards, "enrolledPositionV0">(
    enrolledPositionKey,
    "enrolledPositionV0"
  );
};
