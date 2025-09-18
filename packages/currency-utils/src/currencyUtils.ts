import { getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Cluster, Connection, PublicKey } from "@solana/web3.js";
import { HermesClient } from "@pythnetwork/hermes-client";
import { HNT_PRICE_FEED_ID } from "@helium/spl-utils";
import BN from "bn.js";

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

export const PYTH_HERMES_URL = "https://hermes.pyth.network/"

type PythReturn = {
  priceMessage: {
    emaPrice: {
      feedId: number[]
      price: BN
      conf: BN
      exponent: number
      publishTime: BN
      prevPublishTime: BN
      emaPrice: BN
      emaConf: BN
    }
  }
}

export const getOraclePrice = async ({ tokenType }: {
  tokenType?: "HNT";
  cluster?: Cluster;
  connection?: Connection;
}) => {
  if (tokenType !== "HNT") {
    throw new Error("Only HNT is supported");
  }
  const priceServiceConnection = new HermesClient(
    PYTH_HERMES_URL,
    {}
  );

  const priceUpdates = (
    await priceServiceConnection.getLatestPriceUpdates(
      [HNT_PRICE_FEED_ID],
      { encoding: "base64" }
    )
  );
  const price = priceUpdates.parsed![0];
  return {
    priceMessage: {
      feedId: HNT_PRICE_FEED_ID,
      price: price.price.price,
      emaPrice: price.ema_price.ema_price,
      conf: price.price.conf,
      emaConf: price.ema_price.ema_conf,
      exponent: price.ema_price.expo,
      publishTime: price.ema_price.publish_time,
      prevPublishTime: price.ema_price.prev_publish_time,
    }
  }
};
