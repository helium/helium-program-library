import { init } from "@helium/price-oracle-sdk";
import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import os from "os";
import yargs from "yargs/yargs";
import { BN } from "bn.js";
import axios from "axios";

async function findBinancePrice(symbol: string): Promise<number> {
  try {
    const response = await axios.get(
      `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`
    );
    const data = response.data;
    return parseFloat(data.price);
  } catch (error: any) {
    console.error(
      `Error fetching ticker price for ${symbol}: ${error.message}`
    );
    throw error;
  }
}

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

export async function run(args: any = process.argv) {
  const yarg = yargs(args).options({
    wallet: {
      alias: "k",
      describe: "Anchor wallet keypair",
      default: `${os.homedir()}/.config/solana/id.json`,
    },
    url: {
      alias: "u",
      default: "http://127.0.0.1:8899",
      describe: "The solana url",
    },
    price: {
      alias: "p",
      type: "number",
      required: false,
      describe: "The price to submit. Required if not using default pricing",
    },
    priceOracle: {
      type: "string",
      required: true,
      alias: "o",
      describe:
        "Name or Address of the price oracle to submit a price to. Example: hnt, iot, mobile, horUtvuHQFWxPFrZ35YZUmXUZ2TSQdSXhcD4kkCVNKi",
    },
    useBinancePrice: {
      type: "string",
      required: false,
      describe:
        "If supplied, will try and find the binance price for this pair. E.g. 'HNTUSDT' will submit the binance HNT-USDT price",
      default: null,
    },
    useCoingeckoPrice: {
      type: "string",
      required: false,
      describe:
        "If supplied, will try and find the coingecko price for this coin. E.g. 'helium' will submit the coingecko HNT price",
      default: null,
    },
  });

  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const program = await init(provider);

  if (!argv.useBinancePrice && !argv.price && !argv.useCoingeckoPrice) {
    throw new Error("Need to supply a price");
  }

  const price = argv.price
    ? argv.price
    : argv.useCoingeckoPrice
    ? await findCoingeckoPrice(argv.useCoingeckoPrice)
    : argv.useBinancePrice
    ? await findBinancePrice(argv.useBinancePrice)
    : null;

  switch (argv.priceOracle) {
    case "hnt":
      argv.priceOracle = "horUtvuHQFWxPFrZ35YZUmXUZ2TSQdSXhcD4kkCVNKi";
      break;
    case "iot":
      argv.priceOracle = "iortGU2NMgWc256XDBz2mQnmjPfKUMezJ4BWfayEZY3";
      break;
    case "mobile":
      argv.priceOracle = "moraMdsjyPFz8Lp1RJGoW4bQriSF5mHE7Evxt7hytSF";
      break;
  }

  const priceOracle = new PublicKey(argv.priceOracle);
  const priceOracleAcc = await program.account.priceOracleV0.fetch(priceOracle);
  const oracleIndex = priceOracleAcc.oracles.findIndex((x) =>
    x.authority.equals(provider.wallet.publicKey)
  );
  if (oracleIndex == -1) {
    throw new Error(
      "Couldn't find your wallet as an oracle authority on this price oracle"
    );
  }

  const decimalShiftedPrice = new BN(price! * 10 ** priceOracleAcc.decimals);

  await program.methods
    .submitPriceV0({
      oracleIndex,
      price: decimalShiftedPrice,
    })
    .accountsPartial({
      priceOracle,
      oracle: provider.wallet.publicKey,
    })
    .rpc({ skipPreflight: true });

  console.log(`Submitted price: ${price}`);
}
