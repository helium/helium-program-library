import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { useHeliumVsrState } from "../contexts/heliumVsrContext";
import { DELEGATED_POSITION_SPACE } from "@helium/helium-sub-daos-sdk";
import { useSolOwnedAmount } from "@helium/helium-react-hooks";
import { DELEGATION_CLAIM_BOT_SPACE } from "@helium/hpl-crons-sdk";
import { useMemo } from "react";
import { useAsync } from "react-async-hook";

export const PREPAID_TX_FEES = 0.01;

export interface UsePositionFeesProps {
  numPositions: number;
  automationEnabled?: boolean;
  numDelegatedPositions?: number;
  numDelegationClaimBots?: number;
  wallet?: PublicKey;
}

export const usePositionFees = ({
  automationEnabled = false,
  isDelegated = false,
  hasDelegationClaimBot = false,
  wallet,
}: {
  automationEnabled?: boolean;
  isDelegated?: boolean;
  hasDelegationClaimBot?: boolean;
  wallet?: PublicKey;
}) => {
  return usePositionsFees({
    numPositions: 1,
    automationEnabled,
    numDelegatedPositions: isDelegated ? 1 : 0,
    numDelegationClaimBots: hasDelegationClaimBot ? 1 : 0,
    wallet,
  });
};

export const usePositionsFees = ({
  numPositions,
  automationEnabled = false,
  numDelegatedPositions = 0,
  numDelegationClaimBots = 0,
  wallet: wallet,
}: UsePositionFeesProps) => {
  const { amount: userLamports } = useSolOwnedAmount(wallet);
  const { provider } = useHeliumVsrState();
  const { result: rent, loading } = useAsync(async () => {
    const connection = provider?.connection;
    if (!connection) return undefined;
    const [bot, delegatedPosition] = await Promise.all([
      connection.getMinimumBalanceForRentExemption(DELEGATION_CLAIM_BOT_SPACE),
      connection.getMinimumBalanceForRentExemption(DELEGATED_POSITION_SPACE),
    ]);
    return {
      bot: bot / LAMPORTS_PER_SOL,
      delegatedPosition: delegatedPosition / LAMPORTS_PER_SOL,
    };
  }, [provider?.connection]);

  const rentFee = useMemo(() => {
    const botFee = automationEnabled
      ? (numPositions - numDelegationClaimBots) * (rent?.bot ?? 0)
      : 0;
    // Only positions not yet delegated create a DelegatedPositionV0.
    const delegationFee =
      (numPositions - numDelegatedPositions) * (rent?.delegatedPosition ?? 0);
    return botFee + delegationFee;
  }, [
    numPositions,
    numDelegationClaimBots,
    numDelegatedPositions,
    automationEnabled,
    rent,
  ]);

  const prepaidTxFees = automationEnabled
    ? (numPositions - numDelegationClaimBots) * PREPAID_TX_FEES
    : 0;
  const totalFees = rentFee + prepaidTxFees;

  const insufficientBalance =
    userLamports && userLamports < totalFees * LAMPORTS_PER_SOL;

  return {
    rentFee,
    prepaidTxFees,
    totalFees,
    insufficientBalance,
    loading,
  };
};
