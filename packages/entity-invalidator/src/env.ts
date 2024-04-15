export const LOOKBACK_HOURS = process.env.LOOKBACK_HOURS
  ? Number(process.env.LOOKBACK_HOURS)
  : 25;

export const DOMAIN = process.env.DOMAIN;

export const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
export const CLOUDFLARE_ZONE_ID = process.env.CLOUDFLARE_ZONE_ID;

// Check for required environment variables
const requiredEnvVars = ["DOMAIN", "CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ZONE_ID"];
for (const varName of requiredEnvVars) {
  if (!process.env[varName]) {
    throw new Error(`Environment variable ${varName} is required`);
  }
}
