import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js"
import { useSolOwnedAmount } from "@helium/helium-react-hooks"
import { useMemo } from "react"

export const PREPAID_TX_FEES = 0.01
export const AUTOMATION_BOT_FEE = 0.00210192
export const DELEGATION_FEE = 0.00258912

export interface UsePositionFeesProps {
  numPositions: number
  automationEnabled?: boolean
  numDelegatedPositions?: number
  numDelegationClaimBots?: number
  wallet?: PublicKey
}

export const usePositionFees = ({
  automationEnabled = false,
  isDelegated = false,
  hasDelegationClaimBot = false,
  wallet
}: {
  automationEnabled?: boolean
  isDelegated?: boolean
  hasDelegationClaimBot?: boolean
  wallet?: PublicKey
}) => {
  return usePositionsFees({
    numPositions: 1,
    automationEnabled,
    numDelegatedPositions: isDelegated ? 1 : 0,
    numDelegationClaimBots: hasDelegationClaimBot ? 1 : 0,
    wallet
  })
}

export const usePositionsFees = ({
  numPositions,
  automationEnabled = false,
  numDelegatedPositions = 0,
  numDelegationClaimBots = 0,
  wallet: wallet
}: UsePositionFeesProps) => {
  const { amount: userLamports } = useSolOwnedAmount(wallet)

  const rentFee = useMemo(() => {
    const botFee = automationEnabled ? (numPositions - numDelegationClaimBots) * AUTOMATION_BOT_FEE : 0
    const delegationFee = numDelegatedPositions > 0 ? 0 : numDelegatedPositions * DELEGATION_FEE
    return botFee + delegationFee
  }, [numDelegationClaimBots, numDelegatedPositions, automationEnabled])

  const prepaidTxFees = automationEnabled ? (numPositions - numDelegationClaimBots) * PREPAID_TX_FEES : 0
  const totalFees = rentFee + prepaidTxFees

  const insufficientBalance = userLamports && userLamports < (totalFees * LAMPORTS_PER_SOL)

  return {
    rentFee,
    prepaidTxFees,
    totalFees,
    insufficientBalance
  }
}
