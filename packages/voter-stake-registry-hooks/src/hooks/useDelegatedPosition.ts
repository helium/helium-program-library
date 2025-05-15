import { useAnchorAccount } from "@helium/helium-react-hooks";
import { HeliumSubDaos } from "@helium/idls/lib/types/helium_sub_daos";
import { PublicKey } from "@solana/web3.js";

export const useDelegatedPosition = (delegatedPositionKey: PublicKey | undefined) =>
  useAnchorAccount<HeliumSubDaos, 'delegatedPositionV0'>(delegatedPositionKey, 'delegatedPositionV0')
