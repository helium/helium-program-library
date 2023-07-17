import { Idl, IdlAccounts } from "@coral-xyz/anchor";
import { AllAccountsMap } from "@coral-xyz/anchor/dist/cjs/program/namespace/types";
import { UseAccountState, useAccount } from "@helium/account-fetch-cache-hooks";
import { PublicKey } from "@solana/web3.js";
import { useIdl } from "./useIdl";
import { useIdlAccount } from "./useIdlAccount";

export function useAnchorAccount<IDL extends Idl, A extends keyof AllAccountsMap<IDL>>(
  key: PublicKey | undefined,
  type: A
): UseAccountState<IdlAccounts<IDL>[A]> & {
  error?: Error;
} {
  const { account: rawAccount } = useAccount(key);
  const { info: idl, error } = useIdl<IDL>(rawAccount?.owner);

  return {
    ...useIdlAccount(key, idl, type),
    error
  };
}
