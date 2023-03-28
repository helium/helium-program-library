import os from "os";

process.env.ANCHOR_WALLET =
  process.env.ANCHOR_WALLET || os.homedir() + "/.config/solana/id.json";
export const SOLANA_URL = process.env.SOLANA_URL || "http://127.0.0.1:8899";
export const GLOBAL_CRON_CONFIG =
  process.env.GLOBAL_CRON_CONFIG || "*/30 * * * *"; // every 30 minutes
