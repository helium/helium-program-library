import { useAnchorAccounts } from "@helium/helium-react-hooks";
import { VoterStakeRegistry } from "@helium/idls/lib/types/voter_stake_registry";
import { PROGRAM_ID } from "@helium/voter-stake-registry-sdk";
import { PublicKey } from "@solana/web3.js";

export const usePositions = (positionKeys: PublicKey[] | undefined, isStatic: boolean = false) => {
  return useAnchorAccounts<VoterStakeRegistry, "positionV0">(
    positionKeys,
    "positionV0",
    isStatic,
    PROGRAM_ID
  );
};
