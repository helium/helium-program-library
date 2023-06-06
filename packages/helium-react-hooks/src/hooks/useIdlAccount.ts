import { UseAccountState, useAccount } from "@helium/account-fetch-cache-hooks";
import { BorshAccountsCoder, Idl, IdlAccounts } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { useMemo } from "react";
import { TypedAccountParser } from "@helium/account-fetch-cache";

export function useIdlAccount<IDL extends Idl, A extends string = string>(
  key: PublicKey,
  idl: IDL,
  type: A
): UseAccountState<IdlAccounts<Idl>[A]> {
  const parser: TypedAccountParser<IdlAccounts<Idl>[A]> = useMemo(() => {
    return (pubkey, data) => {
      try {
        const coder = new BorshAccountsCoder(idl);
        const decoded = coder.decode(type, data.data);
        decoded.pubkey = pubkey;
        return decoded;
      } catch (e: any) {
        console.error(e);
      }
    };
  }, [idl, type]);
  return useAccount(key, parser);
}
