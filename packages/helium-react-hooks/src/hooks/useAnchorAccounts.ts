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

export function useAnchorAccounts<
  IDL extends Idl,
  A extends keyof AllAccountsMap<IDL>
>(
  keys: PublicKey[] | undefined,
  type: A,
  // Perf optimization - set if the account will never change, to lower websocket usage.
  isStatic: boolean = false,
  programId?: PublicKey
): UseAccountsState<IdlAccounts<IDL>[A]> & {
  error?: Error;
} {
  const rawAccountKeys = useMemo(
    () => (programId ? [] : keys),
    [programId, keys]
  );
  const { accounts: rawAccounts } = useAccounts(rawAccountKeys);
  const owner = useMemo(() => {
    return programId ?? rawAccounts?.find((a) => a.account)?.account?.owner;
  }, [rawAccounts, programId]);
  const { account: idlAccount, info: idl, error, loading } = useIdl<IDL>(owner);
  useEffect(() => {
    if (!loading && owner && !idl && !idlAccount) {
      console.warn(`Idl not found for ${owner.toBase58()}`, error);
    }
  }, [idl, loading, owner, error, idlAccount]);

  const { error: useAccErr, ...result } = useIdlAccounts<IDL, A>(
    keys,
    idl,
    type,
    isStatic
  );
  return {
    ...result,
    error: error || useAccErr,
  };
}
