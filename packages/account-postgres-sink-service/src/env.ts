import os from "os";
import dotenv from "dotenv";

dotenv.config();

process.env.ANCHOR_WALLET =
  process.env.ANCHOR_WALLET || os.homedir() + "/.config/solana/id.json";

export const SOLANA_URL = process.env.SOLANA_URL || "http://127.0.0.1:8899";
export const YELLOWSTONE_URL =
  process.env.YELLOWSTONE_URL || "http://127.0.0.1:8899";
export const YELLOWSTONE_TOKEN = process.env.YELLOWSTONE_TOKEN!;

export const REFRESH_PASSWORD = process.env.REFRESH_PASSWORD;

export const PROGRAM_ACCOUNT_CONFIGS =
  process.env.PROGRAM_ACCOUNT_CONFIGS ||
  `${__dirname}/../program_account_configs_example.json`;

export const HELIUS_AUTH_SECRET = process.env.HELIUS_AUTH_SECRET;

export const RUN_JOBS_AT_STARTUP = process.env.RUN_JOBS_AT_STARTUP === "true";

export const FETCH_DELAY_SECONDS = Number(
  process.env.FETCH_DELAY_SECONDS || "10"
);

export const USE_SUBSTREAMS = process.env.USE_SUBSTREAMS === "true";

export const USE_YELLOWSTONE = process.env.USE_YELLOWSTONE === "true";

export const SUBSTREAM = process.env.SUBSTREAM;
export const USE_KAFKA = process.env.USE_KAFKA === "true";
