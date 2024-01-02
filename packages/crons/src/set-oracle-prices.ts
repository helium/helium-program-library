import axios from "axios";
import * as anchor from "@coral-xyz/anchor";
import { init } from "@helium/price-oracle-sdk";
import { PublicKey } from "@solana/web3.js";

export async function findCoingeckoPrice(token: string): Promise<number> {
  try {
    const response = await axios.get(
      `https://api.coingecko.com/api/v3/simple/price?ids=${token}&vs_currencies=usd`
    );
    const data = response.data;
    return parseFloat(data[token]["usd"]);
  } catch (error: any) {
    console.error(`Error fetching price for ${token}: ${error.message}`);
    throw error;
  }
}

(async () => {
  if (!process.env.ANCHOR_WALLET) throw new Error("ANCHOR_WALLET not provided");

  if (!process.env.SOLANA_URL) throw new Error("SOLANA_URL not provided");

  process.env.ANCHOR_PROVIDER_URL = process.env.SOLANA_URL;
  anchor.setProvider(anchor.AnchorProvider.local(process.env.SOLANA_URL));
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const program = await init(provider);
  const oracles = [
    {
      id: "helium-mobile",
      oracle: "moraMdsjyPFz8Lp1RJGoW4bQriSF5mHE7Evxt7hytSF",
    },
    {
      id: "helium-iot",
      oracle: "iortGU2NMgWc256XDBz2mQnmjPfKUMezJ4BWfayEZY3",
    },
  ];
  for (const { id, oracle } of oracles) {
    const price = await findCoingeckoPrice(id);
    const priceOracle = new PublicKey(oracle);
    const priceOracleAcc = await program.account.priceOracleV0.fetch(
      priceOracle
    );
    const oracleIndex = priceOracleAcc.oracles.findIndex((x) =>
      x.authority.equals(provider.wallet.publicKey)
    );
    if (oracleIndex == -1) {
      throw new Error(
        "Couldn't find your wallet as an oracle authority on this price oracle"
      );
    }

    const decimalShiftedPrice = new anchor.BN(price! * 10 ** priceOracleAcc.decimals);

    await program.methods
      .submitPriceV0({
        oracleIndex,
        price: decimalShiftedPrice,
      })
      .accounts({
        priceOracle,
        oracle: provider.wallet.publicKey,
      })
      .rpc({ skipPreflight: true });

    console.log(`Submitted price: ${price} for ${id}`);
  }
  try {
    process.exit(0);
  } catch (err) {
    console.log(err);
    process.exit(1);
  }
})();
