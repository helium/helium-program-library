import { web3 } from "@coral-xyz/anchor";
import { PROGRAM_ID } from "@helium/helium-sub-daos-sdk";
import { useAsync, UseAsyncReturn } from "react-async-hook";
import { useHeliumVsrState } from "../contexts/heliumVsrContext";
import { SubDaoWithMeta } from "../sdk/types";
import { getSubDaos } from "../utils/getSubDaos";

export const useSubDaos = (
  programId: web3.PublicKey = PROGRAM_ID
): UseAsyncReturn<SubDaoWithMeta[]> => {
  const { provider } = useHeliumVsrState();
  return useAsync(
    async (provider, programId) => provider && getSubDaos(provider, programId),
    [provider, programId]
  );
};
