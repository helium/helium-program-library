import { web3 } from '@coral-xyz/anchor'
import { useAsync, UseAsyncReturn } from 'react-async-hook'
import { SubDaoWithMeta } from '../sdk/types'
import { PROGRAM_ID } from '@helium/helium-sub-daos-sdk'
import { getSubDaos } from '../utils/getSubDaos'
import { useAnchorProvider } from '@helium/helium-react-hooks'

export const useSubDaos = (
  programId: web3.PublicKey = PROGRAM_ID
): UseAsyncReturn<SubDaoWithMeta[]> => {
  const provider = useAnchorProvider();
  return useAsync(
    async (provider, programId) => provider && getSubDaos(provider, programId),
    [provider, programId]
  );
};
