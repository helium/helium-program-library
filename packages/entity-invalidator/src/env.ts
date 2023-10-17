export const LOOKBACK_HOURS = process.env.LOOKBACK_HOURS
  ? Number(process.env.LOOKBACK_HOURS)
  : 25;
export const AWS_REGION = process.env.AWS_REGION;
export const CLOUDFRONT_DISTRIBUTION = process.env.CLOUDFRONT_DISTRIBUTION!;

// Check for required environment variables
const requiredEnvVars = ["AWS_REGION", "CLOUDFRONT_DISTRIBUTION"];
for (const varName of requiredEnvVars) {
  if (!process.env[varName]) {
    throw new Error(`Environment variable ${varName} is required`);
  }
}
