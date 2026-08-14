import { getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Connection, PublicKey } from "@solana/web3.js";
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

// Matches the on-chain mint freshness window; a price older than this would be
// rejected by the program anyway, so surface the crank outage instead of
// returning a silently frozen price.
const MAX_PRICE_AGE_SECS = 10 * 60;

// Used purely as a priceUpdateV2 decoder (the placeholder wallet never signs
// and the account is read through the caller's connection), so build it once —
// the constructor re-parses embedded IDLs, which is wasteful on polled reads.
let pythReceiver: PythSolanaReceiver | undefined;

export const getOraclePrice = async ({
  tokenType,
  connection,
}: {
  tokenType?: "HNT";
  connection: Connection;
}) => {
  if (tokenType !== "HNT") {
    throw new Error("Only HNT is supported");
  }

  pythReceiver ??= new PythSolanaReceiver({
    connection,
    wallet: { publicKey: PublicKey.default } as any,
  });
  const accountInfo = await connection.getAccountInfo(HNT_PYTH_PRICE_FEED);
  if (!accountInfo) {
    throw new Error("HNT price update account not found");
  }
  const priceUpdate = pythReceiver.receiver.coder.accounts.decode(
    "priceUpdateV2",
    accountInfo.data,
  );
  const { priceMessage } = priceUpdate;

  const ageSecs = Date.now() / 1000 - priceMessage.publishTime.toNumber();
  if (ageSecs > MAX_PRICE_AGE_SECS) {
    throw new Error(
      `HNT price update is stale (published ${Math.round(ageSecs)}s ago); is the pyth crank running?`,
    );
  }

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
