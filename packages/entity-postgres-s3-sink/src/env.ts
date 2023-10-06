export const LOOKBACK_HOURS = process.env.LOOKBACK_HOURS
  ? Number(process.env.LOOKBACK_HOURS)
  : 25;
export const AWS_REGION = process.env.AWS_REGION;
export const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT;
export const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY;
export const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY;
export const S3_BUCKET = process.env.S3_BUCKET!;
export const CLOUDFRONT_DISTRIBUTION = process.env.CLOUDFRONT_DISTRIBUTION;

// Check for required environment variables
const requiredEnvVars = ["AWS_REGION", "S3_BUCKET"];
for (const varName of requiredEnvVars) {
  if (!process.env[varName]) {
    throw new Error(`Environment variable ${varName} is required`);
  }
}
