import { useAnchorAccounts } from "@helium/helium-react-hooks";
import { PublicKey } from "@solana/web3.js";
import { HeliumSubDaos } from "@helium/idls/lib/types/helium_sub_daos";

export const useDelegatedPositions = (delegatedPositionKeys: PublicKey[] | undefined) => {
  return useAnchorAccounts<HeliumSubDaos, "delegatedPositionV0">(
    delegatedPositionKeys,
    "delegatedPositionV0"
  );
};
