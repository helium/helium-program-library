import { Keypair } from "@solana/web3.js";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

export const SOLANA_URL =
  process.env.SOLANA_URL || "https://api.mainnet-beta.solana.com";
export const JUPITER_API_URL =
  process.env.JUPITER_API_URL || "https://lite-api.jup.ag";
export const JUPITER_API_KEY = process.env.JUPITER_API_KEY;
export const PORT = process.env.PORT || "8123";
export const SLIPPAGE_BPS = process.env.SLIPPAGE_BPS || "50";

export const DCA_SIGNER = Keypair.fromSecretKey(
  new Uint8Array(
    JSON.parse(
      fs
        .readFileSync(
          (process.env.ORACLE_KEYPAIR_PATH || process.env.ANCHOR_WALLET)!
        )
        .toString()
    )
  )
);
