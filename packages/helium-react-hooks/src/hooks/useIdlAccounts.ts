import { BorshAccountsCoder, Idl, IdlAccounts } from "@coral-xyz/anchor";
import { convertIdlToCamelCase } from "@coral-xyz/anchor/dist/cjs/idl";
import { AllAccountsMap } from "@coral-xyz/anchor/dist/cjs/program/namespace/types";
import { TypedAccountParser } from "@helium/account-fetch-cache";
import {
  UseAccountsState,
  useAccounts,
} from "@helium/account-fetch-cache-hooks";
import { PublicKey } from "@solana/web3.js";
import { useMemo } from "react";

export const capitalizeFirstChar = (str) =>
  str.charAt(0).toUpperCase() + str.substring(1);

export function useIdlAccounts<IDL extends Idl, A extends keyof AllAccountsMap<IDL>>(
  keys: PublicKey[] | undefined,
  idl: IDL | undefined,
  type: A,
  // Perf optimization - set if the account will never change, to lower websocket usage.
  isStatic: boolean = false
): UseAccountsState<IdlAccounts<IDL>[A]> {
  const parser: TypedAccountParser<IdlAccounts<IDL>[A]> | undefined =
    useMemo(() => {
      if (idl) {
        const coder = new BorshAccountsCoder(convertIdlToCamelCase(idl));
        const tpe = capitalizeFirstChar(type);
        return (pubkey, data) => {
          try {
            if (data.data.length === 0) return;
            const decoded = coder.decode(tpe, data.data);
            decoded.pubkey = pubkey;
            return decoded;
          } catch (e: any) {
            console.error(e);
          }
        };
      }
    }, [idl, type]);

  return useAccounts(keys, parser, isStatic);
}
