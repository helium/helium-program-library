import { Idl, IdlAccounts } from "@coral-xyz/anchor";
import { decodeIdlAccount, idlAddress } from "@coral-xyz/anchor/dist/cjs/idl";
import { AllAccountsMap } from "@coral-xyz/anchor/dist/cjs/program/namespace/types";
import { utf8 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { TypedAccountParser } from "@helium/account-fetch-cache";
import {
  UseAccountsState,
  useAccount,
  useAccounts
} from "@helium/account-fetch-cache-hooks";
import { PublicKey } from "@solana/web3.js";
import { inflate } from "pako";
import { useMemo, useState } from "react";
import { useAsync } from "react-async-hook";
import { useIdlAccounts } from "./useIdlAccounts";
import { useIdl } from "./useIdl";

export function useAnchorAccounts<IDL extends Idl, A extends keyof AllAccountsMap<IDL>>(
  keys: PublicKey[] | undefined,
  type: A
): UseAccountsState<IdlAccounts<IDL>[A]> & {
  error?: Error;
} {
  const { accounts: rawAccounts } = useAccounts(keys);
  const { info: idl, error } = useIdl<IDL>(rawAccounts && rawAccounts[0] && rawAccounts[0].account?.owner);

  const { error: useAccErr, ...result } = useIdlAccounts<IDL, A>(keys, idl, type);
  return {
    ...result,
    error: error || useAccErr,
  };
}
