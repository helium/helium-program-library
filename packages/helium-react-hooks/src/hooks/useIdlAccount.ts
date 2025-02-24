import { BorshAccountsCoder, Idl, IdlAccounts } from "@coral-xyz/anchor";
import { AllAccountsMap } from "@coral-xyz/anchor/dist/cjs/program/namespace/types";
import { TypedAccountParser } from "@helium/account-fetch-cache";
import { UseAccountState, useAccount } from "@helium/account-fetch-cache-hooks";
import { PublicKey } from "@solana/web3.js";
import { useMemo } from "react";
import { capitalizeFirstChar } from "./useIdlAccounts";
import { convertIdlToCamelCase } from "@coral-xyz/anchor/dist/cjs/idl";

// Cache parsers per key/type combination to avoid re-creating them on re-render.
// This makes it so we get fewer rerenders using effectively the same parser
const parserCache = new Map<string, TypedAccountParser<any>>();

export function useIdlAccount<IDL extends Idl, A extends keyof AllAccountsMap<IDL>>(
  key: PublicKey | undefined,
  idl: IDL | undefined,
  type: A,
  // Perf optimization - set if the account will never change, to lower websocket usage.
  isStatic: boolean = false
): UseAccountState<IdlAccounts<IDL>[A]> {
  const parser: TypedAccountParser<
    IdlAccounts<IDL>[A]
  > | undefined = useMemo(() => {
    const cacheKey = `${key?.toBase58()}-${type}`;
    if (!parserCache[cacheKey]) {
      if (idl) {
        const coder = new BorshAccountsCoder(convertIdlToCamelCase(idl));
        const tpe = capitalizeFirstChar(type);
        parserCache[cacheKey] = (pubkey, data) => {
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
    }
    return parserCache[cacheKey];
  }, [idl, type]);
  return useAccount(key, parser, isStatic);
}
