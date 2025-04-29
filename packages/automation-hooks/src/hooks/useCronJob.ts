import { useAnchorAccount } from '@helium/helium-react-hooks'
import { Cron } from '@helium/tuktuk-idls/lib/types/cron'
import { PublicKey } from '@solana/web3.js'

export const useCronJob = (cronJobKey: PublicKey | undefined) =>
  useAnchorAccount<Cron, 'cronJobV0'>(cronJobKey, 'cronJobV0')
