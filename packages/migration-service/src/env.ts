import os from "os";

process.env.ANCHOR_WALLET =
  process.env.ANCHOR_WALLET || os.homedir() + "/.config/solana/id.json";

export const SOLANA_URL = process.env.SOLANA_URL || "http://127.0.0.1:8899";

export const LAZY_TRANSACTIONS_NAME = process.env.NAME || "helium";

export const MIGRATE_THROTTLE_PERCENTAGE =
  Number(process.env.MIGRATE_THROTTLE_PERCENTAGE) || 0;
