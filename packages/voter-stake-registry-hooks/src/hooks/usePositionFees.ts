import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js"
import { useSolOwnedAmount } from "@helium/helium-react-hooks"
import { useMemo } from "react"

const PREPAID_TX_FEES = 0.01
const AUTOMATION_BOT_FEE = 0.00210192
const DELEGATION_FEE = 0.00258912

export interface UsePositionFeesProps {
  automationEnabled?: boolean
  isDelegated?: boolean
  hasDelegationClaimBot?: boolean
  wallet?: PublicKey
}

export const usePositionFees = ({
  automationEnabled = false,
  isDelegated = false,
  hasDelegationClaimBot = false,
  wallet: wallet
}: UsePositionFeesProps) => {
  const { amount: userLamports } = useSolOwnedAmount(wallet)

  const rentFee = useMemo(() => {
    const botFee = automationEnabled && !hasDelegationClaimBot ? AUTOMATION_BOT_FEE : 0
    const delegationFee = isDelegated ? 0 : DELEGATION_FEE
    return botFee + delegationFee
  }, [hasDelegationClaimBot, isDelegated, automationEnabled])

  const prepaidTxFees = automationEnabled ? PREPAID_TX_FEES : 0
  const totalFees = rentFee + prepaidTxFees

  const insufficientBalance = userLamports && userLamports < (totalFees * LAMPORTS_PER_SOL)

  return {
    rentFee,
    prepaidTxFees,
    totalFees,
    insufficientBalance
  }
} 