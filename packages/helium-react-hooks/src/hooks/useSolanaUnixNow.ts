import { useEffect, useMemo, useState } from "react";
import { Connection, SYSVAR_CLOCK_PUBKEY } from "@solana/web3.js";
import { useAsync } from "react-async-hook";
import { useConnection } from "@solana/wallet-adapter-react";

export const useSolanaUnixNow = (refreshInterval: number = 10000): number | undefined => {
  const { connection } = useConnection();
  const connectionWithoutCache = useMemo(() => {
    if (connection) {
      return new Connection(connection.rpcEndpoint)
    }
  }, [connection?.rpcEndpoint])
  const [refresh, setRefresh] = useState(0);

  const { result: unixTs } = useAsync(
    async (connectionWithoutCache: Connection | undefined, _: number) => {
      if (connectionWithoutCache) {
        const clock = await connectionWithoutCache.getAccountInfo(
          SYSVAR_CLOCK_PUBKEY
        );
        return Number(clock!.data.readBigInt64LE(8 * 4));
      }
    },
    [connectionWithoutCache, refresh]
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setRefresh((prev) => prev + 1);
    }, refreshInterval)

    return () => {
      clearInterval(interval);
    }
  }, [])


  return unixTs;
};
