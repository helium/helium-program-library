import { AnchorProvider } from "@coral-xyz/anchor";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useMemo } from "react";


export function useAnchorProvider(): AnchorProvider | undefined {
  const { connection } = useConnection();
  const { wallet } = useWallet();
  return useMemo(() => {
    if (wallet && connection) {
      return new AnchorProvider(connection, wallet.adapter as any, {
        commitment: "confirmed",
      });
    }
  }, [connection, wallet]);
}
