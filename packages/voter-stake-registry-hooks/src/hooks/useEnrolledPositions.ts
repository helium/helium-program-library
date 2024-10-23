import { useAnchorAccounts } from "@helium/helium-react-hooks";
import { PositionVotingRewards } from "@helium/idls/lib/types/position_voting_rewards";
import { PublicKey } from "@solana/web3.js";

export const useEnrolledPositions = (
  enrolledPositionKeys: PublicKey[] | undefined
) => {
  return useAnchorAccounts<PositionVotingRewards, "enrolledPositionV0">(
    enrolledPositionKeys,
    "enrolledPositionV0"
  );
};
