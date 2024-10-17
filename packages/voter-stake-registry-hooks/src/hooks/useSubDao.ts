import { useAnchorAccount } from "@helium/helium-react-hooks";
import { HeliumSubDaos } from "@helium/idls/lib/types/helium_sub_daos";
import { PublicKey } from "@solana/web3.js";

export const useSubDao = (subDaoKey: PublicKey | undefined) =>
  useAnchorAccount<HeliumSubDaos, "subDaoV0">(subDaoKey, "subDaoV0");
