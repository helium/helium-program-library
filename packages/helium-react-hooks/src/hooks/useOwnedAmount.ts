import { NATIVE_MINT } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { useMemo } from "react";
import { useAssociatedTokenAccount } from "./useAssociatedTokenAccount";
import { useMint } from "./useMint";
import { useSolOwnedAmount } from "./useSolOwnedAmount";

export function useOwnedAmount(
  wallet: PublicKey | undefined | null,
  mint: PublicKey | undefined | null
): { amount: bigint, decimals: number, loading: boolean } {
  const { amount: solOwnedAmount } = useSolOwnedAmount(wallet || undefined);
  const { associatedAccount, loading: loadingAssoc } =
    useAssociatedTokenAccount(wallet, mint);
  const { info: mintAcc, loading: loadingMint } = useMint(mint);

  const amount = useMemo(() => {
    if (mint?.equals(NATIVE_MINT)) {
      return solOwnedAmount
    } else if (associatedAccount) {
      return associatedAccount.amount
    }
  }, [solOwnedAmount, associatedAccount?.amount]);
  return {
    loading: loadingAssoc || loadingMint,
    amount,
    decimals: mintAcc?.decimals,
  };
}
