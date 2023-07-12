import { TypedAccountParser } from "@helium/account-fetch-cache";
import { AccountInfo, PublicKey } from "@solana/web3.js";
import { useAccounts } from "./useAccounts";
import { useMemo } from "react";

export interface ParsedAccountBase {
  pubkey: PublicKey
  account: AccountInfo<Buffer>
  info: any; // TODO: change to unkown
}

export interface UseAccountState<T> {
  loading: boolean
  account?: AccountInfo<Buffer>
  info?: T
}

/**
 * Generic hook to get a cached, auto updating, deserialized form of any Solana account. Massively saves on RPC usage by using
 * the spl-utils accountFetchCache.
 *
 * @param key
 * @param parser
 * @param isStatic
 * @returns
 */
export function useAccount<T>(
  key: null | undefined | PublicKey,
  parser?: TypedAccountParser<T>,
  isStatic = false, // Set if the accounts data will never change, optimisation to lower websocket usage.
): UseAccountState<T> {
  const args = useMemo(() => key ? [key] : undefined, [key?.toBase58()])
  const ret = useAccounts<T>(args, parser, isStatic)

  return {
    loading: ret.loading,
    account: ret.accounts?.[0]?.account,
    info: ret.accounts?.[0]?.info,
  }
}
