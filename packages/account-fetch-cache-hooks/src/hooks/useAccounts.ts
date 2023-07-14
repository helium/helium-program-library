import { useEffect, useMemo, useState } from "react";
import { PublicKey, AccountInfo } from "@solana/web3.js";
import { useAccountFetchCache } from "./useAccountFetchCache";
import { TypedAccountParser } from "@helium/account-fetch-cache";
import { ParsedAccountBase } from "./useAccount";
import { useAsync } from "react-async-hook";

export interface UseAccountsState<T> {
  loading: boolean;
  accounts?: {
    account?: AccountInfo<Buffer>;
    info?: T;
    publicKey: PublicKey;
  }[];
  error: Error | undefined;
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
export function useAccounts<T>(
  keys: null | undefined | PublicKey[],
  parser?: TypedAccountParser<T>,
  isStatic = false // Set if the accounts data will never change, optimisation to lower websocket usage.
): UseAccountsState<T> {
  const cache = useAccountFetchCache();
  const [accounts, setAccounts] = useState<
    {
      account?: AccountInfo<Buffer>;
      info?: T;
      publicKey: PublicKey;
    }[]
  >();

  const parsedAccountBaseParser = useMemo(
    () =>
      (pubkey: PublicKey, data: AccountInfo<Buffer>): ParsedAccountBase => {
        try {
          if (parser) {
            const info = parser(pubkey, data);
            return {
              pubkey,
              account: data,
              info,
            };
          }

          return {
            pubkey,
            account: data,
            info: undefined,
          };
        } catch (e) {
          console.error(`Error while parsing: ${(e as Error).message}`);
          return {
            pubkey,
            account: data,
            info: undefined,
          };
        }
      },
    [parser]
  );

  const { result, loading, error } = useAsync(
    async (
      keys: null | undefined | PublicKey[],
      parser: TypedAccountParser<T>
    ) => {
      return (
        keys &&
        (await Promise.all(
          keys.map(async (key) => {
            const acc = await cache.search(
              key,
              parser ? parsedAccountBaseParser : undefined,
              isStatic
            );
            return {
              info: acc && parser && parser(acc.pubkey, acc?.account),
              account: acc && acc.account,
              publicKey: acc.pubkey,
              parser: parser ? parsedAccountBaseParser : undefined,
            };
          })
        ))
      );
    },
    [keys, parser]
  );

  // Start watchers
  useEffect(() => {
    if (result) {
      setAccounts(result);
      const disposers =
        result.map((account) => {
          return cache.watch(account.publicKey, account.parser, true);
        });

      return () => {
        disposers?.forEach((disposer) => disposer());
      };
    }
  }, [result]);

  useEffect(() => {
    const keySet = new Set(keys ? keys.map((k) => k.toBase58()) : []);

    const disposeEmitter = cache.emitter.onCache(async (e) => {
      const event = e;
      if (keySet.has(event.id)) {
        const index = accounts.findIndex(
          (acc) => acc.publicKey.toBase58() === event.id
        );
        const acc = await cache.get(event.id);
        const newAccounts = [
          ...accounts.slice(0, index),
          {
            info: mergePublicKeys(accounts[index].info, acc && parser && parser(acc.pubkey, acc?.account)),
            account: acc && acc.account,
            publicKey: acc.pubkey,
            parser: parser ? parsedAccountBaseParser : undefined,
          },
          ...accounts.slice(index + 1),
        ];
        setAccounts(newAccounts);
      }
    });
    return () => {
      disposeEmitter();
    };
  }, [accounts, keys]);

  return {
    loading,
    accounts,
    error,
  };
}


/**
 *
 * @param input
 * @returns
 */
export function isPureObject(input: typeof Object | null) {
  return (
    input !== null &&
    typeof input === 'object' &&
    Object.getPrototypeOf(input).isPrototypeOf(Object)
  )
}

/**
 * Updates to a solana account will contain new PublicKeys that are
 * actually the same, just a new JS object. This will cause a lot of useMemo
 * to fail.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mergePublicKeys(arg0: any, arg1: any) {
  if (!isPureObject(arg1) || !arg1 || !arg0) {
    return arg1
  }

  return Object.entries(arg1).reduce((acc, [key, value]) => {
    if (
      arg1[key] &&
      arg1[key].equals &&
      arg0[key] &&
      arg1[key].equals(arg0[key])
    ) {
      acc[key as keyof typeof acc] = arg0[key]
    } else {
      acc[key as keyof typeof acc] = value
    }

    return acc
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }, {} as Record<string, any>)
}
