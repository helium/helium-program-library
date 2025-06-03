import { useAnchorAccount, useAnchorAccounts } from "@helium/helium-react-hooks";
import { PublicKey } from "@solana/web3.js";
import { NftProxy } from "@helium/modular-governance-idls/lib/types/nft_proxy"

export const useProxyConfig = (proxyConfigKey: PublicKey | undefined) => {
  return useAnchorAccount<NftProxy, "proxyConfigV0">(
    proxyConfigKey,
    "proxyConfigV0"
  );
};
