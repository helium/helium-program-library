import { Idl, IdlAccounts } from "@coral-xyz/anchor";
import { AllAccountsMap } from "@coral-xyz/anchor/dist/cjs/program/namespace/types";
import { UseAccountState, useAccount } from "@helium/account-fetch-cache-hooks";
import { PublicKey } from "@solana/web3.js";
import { useIdl } from "./useIdl";
import { useIdlAccount } from "./useIdlAccount";
import { useEffect } from "react";

export function useAnchorAccount<IDL extends Idl, A extends keyof AllAccountsMap<IDL>>(
  key: PublicKey | undefined,
  type: A,
  // Perf optimization - set if the account will never change, to lower websocket usage.
  isStatic: boolean = false
): UseAccountState<IdlAccounts<IDL>[A]> & {
  error?: Error;
} {
  const { account: rawAccount } = useAccount(key);
  const { info: idl, error, loading } = useIdl<IDL>(rawAccount?.owner);
  useEffect(() => {
    if (!loading && rawAccount && !idl) {
      console.warn(`Idl not found for ${rawAccount.owner.toBase58()}`);
    }
  }, [idl, loading, rawAccount]);

  return {
    ...useIdlAccount(key, idl, type, isStatic),
    error,
  };
}
