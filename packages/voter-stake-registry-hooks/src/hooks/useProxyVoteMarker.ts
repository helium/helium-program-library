import { useAnchorAccount, useAnchorAccounts } from "@helium/helium-react-hooks";
import { PublicKey } from "@solana/web3.js";
import { VoterStakeRegistry } from "@helium/idls/lib/types/voter_stake_registry";

export const useProxyVoteMarker = (proxyVoteMarkerKey: PublicKey | null | undefined) => {
  return useAnchorAccount<VoterStakeRegistry, "proxyMarkerV0">(
    proxyVoteMarkerKey ?? undefined,
    "proxyMarkerV0"
  );
};
