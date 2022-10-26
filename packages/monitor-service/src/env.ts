import {
  PublicKey
} from "@solana/web3.js";
import os from "os";

process.env.ANCHOR_WALLET =
  process.env.ANCHOR_WALLET || os.homedir() + "/.config/solana/id.json";

export const SOLANA_URL = process.env.SOLANA_URL || "http://127.0.0.1:8899";
export const HNT_MINT = process.env.HNT_MINT
  ? new PublicKey(process.env.HNT_MINT)
  : new PublicKey("hntg4GdrpMBW8bqs4R2om4stE6uScPRhPKWAarzoWKP");
export const MOBILE_MINT = process.env.MOBILE_MINT
  ? new PublicKey(process.env.MOBILE_MINT)
  : new PublicKey("mob1r1x3raXXoH42RZwxTxgbAuKkBQzTAQqSjkUdZbd");
