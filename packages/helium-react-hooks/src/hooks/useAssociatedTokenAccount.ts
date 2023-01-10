import { Account } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { useMemo } from "react";
import { useAssociatedTokenAddress } from "./useAssociatedTokenAddress";
import { useTokenAccount } from "./useTokenAccount";

export interface AssociatedAccountState {
  associatedAccount?: Account;
  associatedAccountKey?: PublicKey;
  loading: boolean;
}

/**
 * Get the associcated token account for this wallet, or the account itself is this address is already an ata
 *
 * @param walletOrAta
 * @param mint
 * @returns
 */
export function useAssociatedTokenAccount(
  walletOrAta: PublicKey | undefined | null,
  mint: PublicKey | undefined | null
): AssociatedAccountState {
  const { result: associatedTokenAddress, loading: loading } =
    useAssociatedTokenAddress(walletOrAta, mint);
  const { info: associatedAccount, loading: loading2 } = useTokenAccount(
    associatedTokenAddress
  );

  const result = useMemo(() => {
    if (associatedAccount?.mint === mint) {
      // The passed value is the ata
      return associatedAccount;
    } else {
      return associatedAccount;
    }
  }, [associatedAccount, associatedAccount, mint]);

  return {
    associatedAccount: result,
    loading: loading || loading2,
    associatedAccountKey: associatedTokenAddress,
  };
}
