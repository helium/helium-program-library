import os from "os";

process.env.ANCHOR_WALLET =
  process.env.ANCHOR_WALLET || os.homedir() + "/.config/solana/id.json";

export const SOLANA_URL = process.env.SOLANA_URL || "http://127.0.0.1:8899";
// The Jupiter API's base URL: the service appends /swap/v2/build.
export const JUPITER_API_URL =
  process.env.JUPITER_API_URL || "https://api.jup.ag";
export const JUPITER_API_KEY = process.env.JUPITER_API_KEY || undefined;

if (!JUPITER_API_KEY) {
  console.warn(
    "JUPITER_API_KEY is not set: Jupiter applies its keyless rate limit to every /build request"
  );
}
