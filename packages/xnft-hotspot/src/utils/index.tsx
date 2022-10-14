import { useState, useEffect } from "react";
import ReactXnft, { LocalStorage, usePublicKey, useConnection } from "react-xnft";
import { PublicKey, Connection } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Program } from "@project-serum/anchor";

export function useTokenAccounts() {
  const publicKey = usePublicKey();
  const connection = useConnection();

  const [tokenAccounts, setTokenAccounts] = useState<
    [any, any, any, any] | null
  >(null);
  useEffect(() => {
    (async () => {
      setTokenAccounts(null);
      const res = await fetchTokenAccounts(publicKey);
      setTokenAccounts(res);
    })();
  }, [publicKey, connection]);
  return tokenAccounts;
}

async function fetchTokenAccounts(
  wallet: PublicKey,
): Promise<any> {
  const resp = await window.xnft.connection.customSplTokenAccounts(wallet);
  const tokens = resp.nftMetadata
    .map((m) => m[1])
    // TODO uncomment this filter with hotspot names
    // .filter((t) => t.tokenMetaUriData.name.startsWith("Hotspot"));
  return tokens;
}