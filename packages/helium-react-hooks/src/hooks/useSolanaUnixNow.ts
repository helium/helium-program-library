import { useEffect, useMemo, useState } from "react";
import { Connection, SYSVAR_CLOCK_PUBKEY } from "@solana/web3.js";
import { useAsync } from "react-async-hook";
import { useConnection } from "@solana/wallet-adapter-react";

export const useSolanaUnixNow = (refreshInterval: number = 10000): number | undefined => {
  const { connection } = useConnection();
  const connectionWithoutCache = useMemo(() => {
    if (connection) {
      return new Connection(connection.rpcEndpoint);
    }
  }, [connection?.rpcEndpoint]);
  const [startTsJs, setStartTsJs] = useState<number | null>(null)
  const [ret, setRet] = useState<number | undefined>(undefined);
  const { result: unixTs } = useAsync(
    async (connectionWithoutCache: Connection | undefined) => {
      if (connectionWithoutCache) {
        const clock = await connectionWithoutCache.getAccountInfo(
          SYSVAR_CLOCK_PUBKEY
        );
        return Number(clock!.data.readBigInt64LE(8 * 4));
      }
    },
    [connectionWithoutCache]
  );
  useEffect(() => {
    setStartTsJs(new Date().valueOf() / 1000);
    setRet(unixTs)
  }, [unixTs]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (startTsJs && unixTs) {
        setRet(Math.ceil(unixTs + ((new Date().valueOf() / 1000) - startTsJs)));
      }
    }, refreshInterval)

    return () => {
      clearInterval(interval);
    }
  }, [startTsJs, unixTs, refreshInterval, setRet])


  return ret;
};
