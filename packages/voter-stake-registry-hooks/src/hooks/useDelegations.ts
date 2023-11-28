import { useAnchorAccounts } from "@helium/helium-react-hooks";
import { NftDelegation } from "@helium/modular-governance-idls/lib/types/nft_delegation";
import { PublicKey } from "@solana/web3.js";

export const useDelegations = (
  delegationKeys: PublicKey[] | undefined,
  isStatic: boolean = false
) => {
  return useAnchorAccounts<NftDelegation, "delegationV0">(
    delegationKeys,
    "delegationV0",
    isStatic
  );
};
