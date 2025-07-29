import os from "os";
import dotenv from "dotenv";

dotenv.config();
process.env.ANCHOR_WALLET =
  process.env.ANCHOR_WALLET || os.homedir() + "/.config/solana/id.json";

const getEnvBoolean = (key: string): boolean => process.env[key] === "true";
export const PRODUCTION = process.env.NODE_ENV === "production" || false;
export const SOLANA_URL = process.env.SOLANA_URL || "http://127.0.0.1:8899";

export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
export const PG_POOL_SIZE = Number(process.env.PG_POOL_SIZE) || 50;
export const PROGRAM_ACCOUNT_CONFIGS =
  process.env.PROGRAM_ACCOUNT_CONFIGS ||
  `${__dirname}/../program_account_configs_example.json`;

export const USE_YELLOWSTONE = getEnvBoolean("USE_YELLOWSTONE");
export const YELLOWSTONE_TOKEN = process.env.YELLOWSTONE_TOKEN;
export const YELLOWSTONE_URL =
  process.env.YELLOWSTONE_URL || "http://127.0.0.1:8899";

export const USE_HELIUS_WEBHOOK = getEnvBoolean("USE_HELIUS_WEBHOOK");
export const REFRESH_ON_BOOT = getEnvBoolean("REFRESH_ON_BOOT");
export const HELIUS_AUTH_SECRET = process.env.HELIUS_AUTH_SECRET;

export const USE_SUBSTREAM = getEnvBoolean("USE_SUBSTREAM");
export const SUBSTREAM_API_KEY = process.env.SUBSTREAM_API_KEY;
export const SUBSTREAM_URL = process.env.SUBSTREAM_URL;
export const SUBSTREAM = process.env.SUBSTREAM;
export const SUBSTREAM_CURSOR_STALENESS_THRESHOLD_MS =
  Number(process.env.SUBSTREAM_CURSOR_STALENESS_THRESHOLD_MS) || 5 * 60 * 1000; // 5 minutes default

export const USE_KAFKA = getEnvBoolean("USE_KAFKA");
export const KAFKA_USER = process.env.KAFKA_USER;
export const KAFKA_GROUP_ID = process.env.KAFKA_CROUP_ID;
export const KAFKA_BROKERS = process.env.KAFKA_BROKERS?.split(",");
export const KAFKA_TOPIC = process.env.KAFKA_TOPIC;
export const KAFKA_PASSWORD = process.env.KAFKA_PASSWORD?.replace(
  /(\r\n|\n|\r)/gm,
  ""
);

export const INTEGRITY_CHECK_REFRESH_THRESHOLD_MS =
  Number(process.env.INTEGRITY_CHECK_REFRESH_THRESHOLD_MS) || 5 * 60 * 1000; // 5 minutes default
