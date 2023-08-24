import { useAnchorAccounts } from "@helium/helium-react-hooks";
import { PublicKey } from "@solana/web3.js";
import { VoterStakeRegistry } from "@helium/idls/lib/types/voter_stake_registry";

export const useVoteMarkers = (voteMarkerKeys: PublicKey[] | undefined) => {
  return useAnchorAccounts<VoterStakeRegistry, "voteMarkerV0">(
    voteMarkerKeys,
    "voteMarkerV0"
  );
};
