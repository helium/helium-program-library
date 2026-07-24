import os from "os";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

// __dirname is `src` when run via ts-node and `lib/src` when compiled, so
// locate the package root by finding package.json instead of trusting NODE_ENV
// or the process cwd.
export const PACKAGE_ROOT = fs.existsSync(
  path.join(__dirname, "..", "package.json")
)
  ? path.join(__dirname, "..")
  : path.join(__dirname, "..", "..");

export const PROXIES_DIR = path.join(PACKAGE_ROOT, "helium-vote-proxies");

export const HELIUM_VOTE_PROXY_REPO =
  process.env.HELIUM_VOTE_PROXY_REPO ||
  "https://github.com/helium/helium-vote-proxies.git";

export const SOLANA_URL = process.env.SOLANA_URL || "http://localhost:8899";

process.env.ANCHOR_WALLET =
  process.env.ANCHOR_WALLET || os.homedir() + "/.config/solana/id.json";
