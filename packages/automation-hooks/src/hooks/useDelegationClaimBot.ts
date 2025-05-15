import { useAnchorAccount } from '@helium/helium-react-hooks'
import { HplCrons } from '@helium/idls/lib/types/hpl_crons'
import { PublicKey } from '@solana/web3.js'

export const useDelegationClaimBot = (delegationClaimBotKey: PublicKey | undefined) =>
  useAnchorAccount<HplCrons, 'delegationClaimBotV0'>(delegationClaimBotKey, 'delegationClaimBotV0')
