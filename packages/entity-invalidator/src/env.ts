export const LOOKBACK_HOURS = process.env.LOOKBACK_HOURS
  ? Number(process.env.LOOKBACK_HOURS)
  : 25;

export const DOMAIN = process.env.DOMAIN;

export const CLOUDFLARE_EMAIL = process.env.CLOUDFLARE_EMAIL;
export const CLOUDFLARE_API_KEY = process.env.CLOUDFLARE_API_KEY;
export const CLOUDFLARE_ZONE_ID = process.env.CLOUDFLARE_ZONE_ID;

// Check for required environment variables
const requiredEnvVars = ["DOMAIN", "CLOUDFLARE_EMAIL", "CLOUDFLARE_API_KEY", "CLOUDFLARE_ZONE_ID"];
for (const varName of requiredEnvVars) {
  if (!process.env[varName]) {
    throw new Error(`Environment variable ${varName} is required`);
  }
}
