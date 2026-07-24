import { getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Cluster, Connection, PublicKey } from "@solana/web3.js";
import { PythSolanaReceiver } from "@pythnetwork/pyth-solana-receiver";
import { HNT_PRICE_FEED_ID, HNT_PYTH_PRICE_FEED } from "@helium/spl-utils";
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

export const getOraclePrice = async ({
  tokenType,
  connection,
}: {
  tokenType?: "HNT";
  cluster?: Cluster;
  connection: Connection;
}) => {
  if (tokenType !== "HNT") {
    throw new Error("Only HNT is supported");
  }

  // Read the crank-fed feed account directly; the placeholder wallet is only
  // required by the receiver constructor and is never used to sign.
  const pythSolanaReceiver = new PythSolanaReceiver({
    connection,
    wallet: { publicKey: PublicKey.default } as any,
  });
  const priceUpdate =
    await pythSolanaReceiver.receiver.account.priceUpdateV2.fetch(
      HNT_PYTH_PRICE_FEED
    );
  const { priceMessage } = priceUpdate;

  return {
    priceMessage: {
      feedId: HNT_PRICE_FEED_ID,
      price: new BN(priceMessage.price.toString()),
      emaPrice: new BN(priceMessage.emaPrice.toString()),
      conf: new BN(priceMessage.conf.toString()),
      emaConf: new BN(priceMessage.emaConf.toString()),
      exponent: priceMessage.exponent,
      publishTime: priceMessage.publishTime.toNumber(),
      prevPublishTime: priceMessage.prevPublishTime.toNumber(),
    },
  };
};
