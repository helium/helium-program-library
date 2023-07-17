import { useEffect, useState } from "react";
import { Connection, SYSVAR_CLOCK_PUBKEY } from "@solana/web3.js";
import { useAsync } from "react-async-hook";
import { useConnection } from "@solana/wallet-adapter-react";

export const useSolanaUnixNow = (refreshInterval: number = 10000): number | undefined => {
  const { connection } = useConnection();
  const [refresh, setRefresh] = useState(0);

  const { result: unixTs } = useAsync(async (connection: Connection) => {
    const clock = await connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY);
    return Number(clock!.data.readBigInt64LE(8 * 4));
  }, [connection, refresh]);

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
