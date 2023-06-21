import { Commitment, Connection } from "@solana/web3.js";
import { AccountFetchCache } from "@helium/account-fetch-cache";
import React, {
  createContext,
  FC,
  ReactNode,
  useEffect,
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

export const AccountProvider: FC<IAccountProviderProps> = ({
  children,
  commitment = "confirmed",
  extendConnection = true,
  connection
}) => {
  const [cache, setCache] = useState<AccountFetchCache>();
  useEffect(() => {
    if (connection) {
      cache?.close();

      setCache(
        new AccountFetchCache({
          connection,
          delay: 50,
          commitment,
          extendConnection,
        })
      );
    }
  }, [connection]);

  return (
    <AccountContext.Provider value={cache}>{children}</AccountContext.Provider>
  );

  return null;
};
