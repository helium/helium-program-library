import { useEffect, useMemo, useState } from "react";
import { PublicKey, AccountInfo } from "@solana/web3.js";
import { useAccountFetchCache } from "./useAccountFetchCache";
import { TypedAccountParser } from "@helium/account-fetch-cache";
import { ParsedAccountBase } from "./useAccount";
import { AsyncStateStatus, useAsync } from "react-async-hook";
import { usePrevious } from "../contexts/accountContext";

export interface UseAccountsState<T> {
  loading: boolean;
  accounts?: {
    account?: AccountInfo<Buffer>;
    info?: T;
    publicKey: PublicKey;
  }[];
  error: Error | undefined;
  status: AsyncStateStatus;
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

  const parsedAccountBaseParser = useMemo(() => {
    if (parser) {
      return (
        pubkey: PublicKey,
        data: AccountInfo<Buffer>
      ): ParsedAccountBase => {
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
          if (cache.enableLogging) {
            console.error(`Error while parsing: ${(e as Error).message}`);
          }
          return {
            pubkey,
            account: data,
            info: undefined,
          };
        }
      };
    }
  }, [parser]);

  const eagerResult = useMemo(() => {
    return keys?.map((key) => {
      const acc = cache.get(key);

      // The cache caches the parser, so we need to check if the parser is different
      let info = acc?.info as T | undefined;
      if (
        cache.keyToAccountParser[key.toBase58()] != parsedAccountBaseParser &&
        parsedAccountBaseParser &&
        acc?.account
      ) {
        info = parsedAccountBaseParser(key, acc?.account).info;
      }
      if (acc) {
        return {
          info,
          account: acc.account,
          publicKey: acc.pubkey,
          parser: parsedAccountBaseParser,
        };
      } else {
        return {
          publicKey: key,
        };
      }
    });
  }, [cache, keys, parsedAccountBaseParser]);

  const [accounts, setAccounts] = useState<
    {
      account?: AccountInfo<Buffer>;
      info?: T;
      publicKey: PublicKey;
    }[]
  >(eagerResult || []);

  // Sometimes eager result never gets set because cache or keys is undefined
  useEffect(() => {
    if (eagerResult && accounts.length != keys?.length && (eagerResult?.length || 0) == keys?.length) {
      setAccounts(eagerResult);
    }
  }, [accounts, eagerResult])

  useEffect(() => {
    if (!keys) {
      setAccounts([]);
    }
  }, [keys]);

  const prevKeys = usePrevious(keys);
  const { result, loading, error, status } = useAsync(
    async (
      keys: null | undefined | PublicKey[],
      parsedAccountBaseParser:
        | ((pubkey: PublicKey, data: AccountInfo<Buffer>) => ParsedAccountBase)
        | undefined
    ) => {
      return (
        keys &&
        (await Promise.all(
          keys.map(async (key) => {
            // Important: MUST searchAndWatch here to guarentee caching.
            // account fetch cache will not cache things unles it is watching them,
            // or it could offer stale data
            const [acc, dispose] = await cache.searchAndWatch(
              key,
              parsedAccountBaseParser,
              isStatic
            );

            // Watch the account for at least 30 seconds
            setTimeout(dispose, 1000 * 30);

            // The cache caches the parser, so we need to check if the parser is different
            let info = acc?.info;
            if (
              cache.keyToAccountParser[key.toBase58()] !=
                parsedAccountBaseParser &&
              parsedAccountBaseParser &&
              acc?.account
            ) {
              info = parsedAccountBaseParser(key, acc?.account).info;
            }
            if (acc) {
              return {
                info,
                account: acc.account,
                publicKey: acc.pubkey,
                parser: parsedAccountBaseParser,
              };
            } else {
              return {
                publicKey: key,
              };
            }
          })
        ))
      );
    },
    [keys, parsedAccountBaseParser]
  );

  // Start watchers
  useEffect(() => {
    if (
      result &&
      (!eagerResult ||
        result.length !== eagerResult.length ||
        result.some(
          (item, index) =>
            item.account !== eagerResult[index]?.account ||
            item.info !== eagerResult[index]?.info
        ))
    ) {
      setAccounts(result);
      const disposers = result.map((account) => {
        return cache.watch(
          account.publicKey,
          account.parser,
          !!account.account
        );
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
        if (acc) {
          const parsed = parser && parser(acc.pubkey, acc?.account);
          const newParsed = accounts[index]
            ? mergePublicKeys(accounts[index].info, parsed)
            : parsed;
          const newAccounts = [
            ...accounts.slice(0, index),
            {
              info: newParsed,
              account: acc.account,
              publicKey: acc.pubkey,
              parser: parsedAccountBaseParser,
            },
            ...accounts.slice(index + 1),
          ];
          setAccounts(newAccounts);
        }
      }
    });
    return () => {
      disposeEmitter();
    };
  }, [accounts, keys, parsedAccountBaseParser, parser]);

  return {
    status,
    loading: loading || prevKeys !== keys,
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
    typeof input === "object" &&
    Object.getPrototypeOf(input).isPrototypeOf(Object)
  );
}

/**
 * Updates to a solana account will contain new PublicKeys that are
 * actually the same, just a new JS object. This will cause a lot of useMemo
 * to fail.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mergePublicKeys(arg0: any, arg1: any) {
  if (!isPureObject(arg1) || !arg1 || !arg0) {
    return arg1;
  }

  return Object.entries(arg1).reduce((acc, [key, value]) => {
    if (
      arg1[key] &&
      arg1[key].equals &&
      arg0[key] &&
      arg1[key].equals(arg0[key])
    ) {
      acc[key as keyof typeof acc] = arg0[key];
    } else {
      acc[key as keyof typeof acc] = value;
    }

    return acc;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }, {} as Record<string, any>);
}
