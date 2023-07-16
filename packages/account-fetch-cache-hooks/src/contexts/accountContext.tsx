import { Commitment, Connection } from "@solana/web3.js";
import { AccountFetchCache } from "@helium/account-fetch-cache";
import React, {
  createContext,
  FC,
  ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export interface IAccountProviderProps {
  children: ReactNode;
  connection: Connection;
  commitment: Commitment;
  extendConnection?: boolean;
}

export const AccountContext = createContext<AccountFetchCache | undefined>(
  undefined
);

function usePrevious<T>(state: T): T | undefined {
  const ref = useRef<T>();

  useEffect(() => {
    ref.current = state;
  });

  return ref.current;
}

export const AccountProvider: FC<IAccountProviderProps> = ({
  children,
  commitment = "confirmed",
  extendConnection = true,
  connection,
}) => {
  const cache = useMemo(() => {
    return new AccountFetchCache({
      connection,
      delay: 50,
      commitment,
      extendConnection,
    });
  }, [connection]);
  const prevCache = usePrevious(cache);
  useEffect(() => {
    if (prevCache) {
      prevCache.close();
    }
  }, [prevCache]);

  return (
    <AccountContext.Provider value={cache}>{children}</AccountContext.Provider>
  );

  return null;
};
