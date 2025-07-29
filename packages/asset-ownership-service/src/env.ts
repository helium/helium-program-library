import os from "os";
import dotenv from "dotenv";

dotenv.config();
process.env.ANCHOR_WALLET =
  process.env.ANCHOR_WALLET || os.homedir() + "/.config/solana/id.json";

const getEnvBoolean = (key: string): boolean => process.env[key] === "true";
export const PRODUCTION = process.env.NODE_ENV === "production" || false;
export const SOLANA_URL = process.env.SOLANA_URL || "http://127.0.0.1:8899";
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
export const PG_POOL_SIZE = Number(process.env.PG_POOL_SIZE) || 20;
export const PG_MAKER_TABLE = process.env.PG_MAKER_TABLE;
export const PG_DATA_ONLY_TABLE = process.env.PG_DATA_ONLY_TABLE;
export const PG_ASSET_TABLE = process.env.PG_ASSET_TABLE;
export const PG_CARRIER_TABLE = process.env.PG_CARRIER_TABLE;
export const USE_SUBSTREAM = getEnvBoolean("USE_SUBSTREAM");
export const REFRESH_ON_BOOT = getEnvBoolean("REFRESH_ON_BOOT");
export const SUBSTREAM_API_KEY = process.env.SUBSTREAM_API_KEY;
export const SUBSTREAM_URL = process.env.SUBSTREAM_URL;
export const SUBSTREAM = process.env.SUBSTREAM;
export const SUBSTREAM_CURSOR_STALENESS_THRESHOLD_MS =
  Number(process.env.SUBSTREAM_CURSOR_STALENESS_THRESHOLD_MS) || 5 * 60 * 1000; // 5 minutes default
