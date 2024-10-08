import { useAnchorAccounts } from "@helium/helium-react-hooks";
import { NftProxy } from "@helium/modular-governance-idls/lib/types/nft_proxy";
import { PublicKey } from "@solana/web3.js";

export const useProxyAssignments = (
  delegationKeys: PublicKey[] | undefined,
  isStatic: boolean = false
) => {
  return useAnchorAccounts<NftProxy, "proxyAssignmentV0">(
    delegationKeys,
    "proxyAssignmentV0",
    isStatic
  );
};
