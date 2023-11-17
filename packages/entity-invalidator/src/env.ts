export const LOOKBACK_HOURS = process.env.LOOKBACK_HOURS
  ? Number(process.env.LOOKBACK_HOURS)
  : 25;
export const INVALIDATE_ALL_RECORD_THRESHOLD = process.env.INVALIDATE_ALL_RECORD_THRESHOLD
  ? Number(process.env.INVALIDATE_ALL_RECORD_THRESHOLD)
  : 500; // $0.005/invalidation * 500 records * 3 invalidations/record = $7.5
export const AWS_REGION = process.env.AWS_REGION;
export const CLOUDFRONT_DISTRIBUTION = process.env.CLOUDFRONT_DISTRIBUTION!;

// Check for required environment variables
const requiredEnvVars = ["AWS_REGION", "CLOUDFRONT_DISTRIBUTION"];
for (const varName of requiredEnvVars) {
  if (!process.env[varName]) {
    throw new Error(`Environment variable ${varName} is required`);
  }
}
