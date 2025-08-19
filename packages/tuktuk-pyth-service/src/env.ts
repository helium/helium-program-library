import { Keypair } from "@solana/web3.js";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

export const SOLANA_URL = process.env.SOLANA_URL || "https://api.devnet.solana.com";
export const PYTH_HERMES_URL = process.env.PYTH_HERMES_URL || "https://hermes.pyth.network/"
export const ORIGIN = process.env.ORIGIN || "http://localhost:8081"
export const KEYPAIR = Keypair.fromSecretKey(
  new Uint8Array(
    JSON.parse(
      fs
        .readFileSync(
          process.env.KEYPAIR_PATH!
        )
        .toString()
    )
  )
)