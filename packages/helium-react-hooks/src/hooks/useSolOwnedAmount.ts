import { PublicKey } from "@solana/web3.js";
import React from "react";
import { useAccount } from "@helium/account-fetch-cache-hooks";

export function useSolOwnedAmount(ownerPublicKey?: PublicKey): {
  amount: bigint;
  loading: boolean;
} {
  const { info: lamports, loading } = useAccount<bigint>(
    ownerPublicKey,
    (_, account) => BigInt(account.lamports)
  );

  return {
    amount: lamports,
    loading,
  };
}
