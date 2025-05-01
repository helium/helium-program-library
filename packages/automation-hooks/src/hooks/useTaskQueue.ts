import { useAnchorAccount } from '@helium/helium-react-hooks'
import { Tuktuk } from '@helium/tuktuk-idls/lib/types/tuktuk'
import { PublicKey } from '@solana/web3.js'

export const useTaskQueue = (taskQueueKey: PublicKey | undefined) =>
  useAnchorAccount<Tuktuk, 'taskQueueV0'>(taskQueueKey, 'taskQueueV0')
