import os from "os";

process.env.ANCHOR_WALLET =
  process.env.ANCHOR_WALLET || os.homedir() + "/.config/solana/id.json";
export const SOLANA_URL = process.env.SOLANA_URL || "http://127.0.0.1:8899";
export const AWS_REGION = process.env.AWS_REGION || "";
export const GLOBAL_CRON_CONFIG =
  process.env.GLOBAL_CRON_CONFIG || "*/30 * * * *"; // every 30 minutes
export const PG_HOST = process.env.PG_HOST || "127.0.0.1";
export const PG_PORT = process.env.PG_PORT ? Number(process.env.PG_PORT) : 5432;
export const PG_USER = process.env.PG_USER || "postgres";
export const PG_PASSWORD = process.env.PG_PASSWORD || "postgres";
export const PG_DATABASE = process.env.PG_DATABASE || "postgres";
