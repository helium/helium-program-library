import { BorshAccountsCoder, Idl, IdlAccounts } from "@coral-xyz/anchor";
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

export function useIdlAccounts<
  IDL extends Idl,
  A extends keyof AllAccountsMap<IDL>
>(
  keys: PublicKey[] | undefined,
  idl: IDL | undefined,
  type: A
): UseAccountsState<IdlAccounts<IDL>[A]> {
  const parser: TypedAccountParser<IdlAccounts<IDL>[A]> = useMemo(() => {
    return (pubkey, data) => {
      if (idl) {
        try {
          const coder = new BorshAccountsCoder(idl);
          const decoded = coder.decode(capitalizeFirstChar(type), data.data);
          decoded.pubkey = pubkey;
          return decoded;
        } catch (e: any) {
          console.error(e);
        }
      }
    };
  }, [idl, type]);
  return useAccounts(keys, parser);
}
