import { Connection, PublicKey, Cluster } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, getAccount } from "@solana/spl-token";
import {
  getPythProgramKeyForCluster,
  PythHttpClient,
} from "@pythnetwork/client";

export const getBalance = async ({
  pubKey,
  mint,
  connection,
}: {
  connection: Connection;
  pubKey: PublicKey;
  mint: PublicKey;
}) => {
  try {
    const address = getAssociatedTokenAddressSync(mint, pubKey, true);
    const acct = await getAccount(connection, address);

    return acct.amount;
  } catch {
    return BigInt(0);
  }
};

export const getOraclePrice = async ({
  tokenType,
  cluster,
  connection,
}: {
  tokenType: "HNT";
  cluster: Cluster;
  connection: Connection;
}) => {
  const pythPublicKey = getPythProgramKeyForCluster(cluster);
  const pythClient = new PythHttpClient(connection, pythPublicKey);
  const data = await pythClient.getData();

  let symbol = "";
  switch (tokenType) {
    case "HNT":
      symbol = "Crypto.HNT/USD";
  }

  return data.productPrice.get(symbol);
};
