import { PublicKey, Keypair } from "@solana/web3.js";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

export const SOLANA_URL =
  process.env.SOLANA_URL || "https://api.devnet.solana.com";
export const PYTH_HERMES_URL =
  process.env.PYTH_HERMES_URL || "https://hermes.pyth.network/";
// Bearer token for keyed Hermes endpoints (required post Pyth Core upgrade).
export const PYTH_API_KEY = process.env.PYTH_API_KEY;
// Program IDs default to the legacy deployments so the existing crank runs
// unchanged; the pro instance overrides all three via env.
export const PYTH_RECEIVER_PROGRAM_ID = new PublicKey(
  process.env.PYTH_RECEIVER_PROGRAM_ID ||
    "rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ"
);
export const PYTH_PUSH_ORACLE_PROGRAM_ID = new PublicKey(
  process.env.PYTH_PUSH_ORACLE_PROGRAM_ID ||
    "pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT"
);
export const WORMHOLE_PROGRAM_ID = new PublicKey(
  process.env.WORMHOLE_PROGRAM_ID ||
    "HDwcJBJXjL9FpJ7UBsYBtaDjsBUhuLCUYoz3zr8SWWaQ"
);
export const ORIGIN = process.env.ORIGIN || "http://localhost:8081";
export const KEYPAIR = Keypair.fromSecretKey(
  new Uint8Array(
    JSON.parse(fs.readFileSync(process.env.KEYPAIR_PATH!).toString())
  )
);
