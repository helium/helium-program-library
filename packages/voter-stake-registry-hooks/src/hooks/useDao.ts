import { useAnchorAccount } from "@helium/helium-react-hooks";
import { HeliumSubDaos } from "@helium/idls/lib/types/helium_sub_daos";
import { PublicKey } from "@solana/web3.js";

export const useDao = (daoKey: PublicKey | undefined) =>
  useAnchorAccount<HeliumSubDaos, "daoV0">(daoKey, "daoV0");
