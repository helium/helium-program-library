import os from "os";
import dotenv from "dotenv";

dotenv.config();

export const HELIUM_VOTE_PROXY_REPO =
  process.env.HELIUM_VOTE_PROXY_REPO ||
  "https://github.com/helium/helium-vote-proxies.git";

export const SOLANA_URL = process.env.SOLANA_URL || "http://localhost:8899";

process.env.ANCHOR_WALLET =
  process.env.ANCHOR_WALLET || os.homedir() + "/.config/solana/id.json";
