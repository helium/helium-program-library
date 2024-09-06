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

  const prevKeys = usePrevious(keys);
  const { result, loading, error, status } = useAsync(
    async (
      keys: null | undefined | PublicKey[],
      parsedAccountBaseParser:
        | ((pubkey: PublicKey, data: AccountInfo<Buffer>) => ParsedAccountBase)
        | undefined
    ) => {
      const { accounts: accs, disposers } = keys
        ? await cache.searchMultipleAndWatch(
            keys,
            parsedAccountBaseParser,
            isStatic
          )
        : { accounts: [], disposers: [] };

      // Watch the account(s) for at least 30 seconds
      setTimeout(() => {
        disposers.map((d) => d());
      }, 1000 * 30);
      return accs.map((acc, index) => {
        const key = keys && keys[index];

        // The cache caches the parser, so we need to check if the parser is different
        let info = acc?.info;
        if (
          key &&
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
    },
    [keys, parsedAccountBaseParser]
  );

  const accounts = useMemo(() => {
    if (keys) {
      if (
        result &&
        result.length !== 0 &&
        (!eagerResult ||
          result.length !== eagerResult.length ||
          result.some((item, index) => {
            const eager = eagerResult[index];
            return (
              (!item.account && eager.account) ||
              (!eager.account && item.account) ||
              (item.account &&
                eager.account &&
                !item.account.data.equals(eager.account.data))
            );
          }))
      ) {
        return result;
      }
      return eagerResult;
    }

    return [];
  }, [eagerResult, result]);

  useEffect(() => {
    if (error) {
      console.error(error);
    }
  }, [error]);

  // Start watchers
  useEffect(() => {
    if (accounts) {
      const disposers = accounts.map((account) => {
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
  }, [accounts]);

  const [watchedAccounts, setWatchedAccounts] = useState<
    {
      account?: AccountInfo<Buffer>;
      info?: T;
      publicKey: PublicKey;
    }[]
  >(accounts || []);

  useEffect(() => {
    if (watchedAccounts != accounts) {
      setWatchedAccounts(accounts);
    }
  }, [accounts]);

  useEffect(() => {
    const accountsByKey = accounts.reduce((acc, account, index) => {
      acc[account.publicKey.toBase58()] = {
        index,
        account: account.account,
        info: account.info,
      };
      return acc;
    }, {} as Record<string, { index: number; account: AccountInfo<Buffer>; info: T }>);

    const disposeEmitter = cache.emitter.onCache(async (e) => {
      const event = e;
      if (accountsByKey[event.id]) {
        const current = accountsByKey[event.id].account;
        const acc = await cache.get(event.id);
        if (acc && (!current || !acc.account?.data.equals(current.data))) {
          const parsed = parser && parser(acc.pubkey, acc?.account);
          const newParsed = accountsByKey[event.id]
            ? mergePublicKeys(accountsByKey[event.id].info, parsed)
            : parsed;
          const index = accountsByKey[event.id].index;
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
          setWatchedAccounts(newAccounts);
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
    accounts: watchedAccounts,
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
