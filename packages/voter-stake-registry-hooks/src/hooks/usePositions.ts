import { useAnchorAccounts } from "@helium/helium-react-hooks";
import { PublicKey } from "@solana/web3.js";
import { VoterStakeRegistry } from "@helium/idls/lib/types/voter_stake_registry";

export const usePositions = (positionKeys: PublicKey[] | undefined) => {
  return useAnchorAccounts<VoterStakeRegistry, "positionV0">(
    positionKeys,
    "positionV0"
  );
}
