import { Idl, IdlAccounts } from "@coral-xyz/anchor";
import { AllAccountsMap } from "@coral-xyz/anchor/dist/cjs/program/namespace/types";
import {
  UseAccountsState,
  useAccounts
} from "@helium/account-fetch-cache-hooks";
import { PublicKey } from "@solana/web3.js";
import { useIdl } from "./useIdl";
import { useIdlAccounts } from "./useIdlAccounts";
import { useEffect, useMemo } from "react";

export function useAnchorAccounts<IDL extends Idl, A extends keyof AllAccountsMap<IDL>>(
  keys: PublicKey[] | undefined,
  type: A
): UseAccountsState<IdlAccounts<IDL>[A]> & {
  error?: Error;
} {
  const { accounts: rawAccounts } = useAccounts(keys);
  const owner = useMemo(() => {
    return rawAccounts?.find((a) => a.account)?.account?.owner;
  }, [rawAccounts]);
  const { info: idl, error, loading } = useIdl<IDL>(owner);
  useEffect(() => {
    if (!loading && owner && !idl) {
      console.warn(`Idl not found for ${owner.toBase58()}`);
    }
  }, [idl, loading, owner]);

  const { error: useAccErr, ...result } = useIdlAccounts<IDL, A>(keys, idl, type);
  return {
    ...result,
    error: error || useAccErr,
  };
}
