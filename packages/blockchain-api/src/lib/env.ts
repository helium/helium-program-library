import { z } from "zod";

export const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  NO_PG: z.string().default("false"),
  PG_USER: z.string(),
  PG_PASSWORD: z.string().optional(),
  PG_NAME: z.string(),
  PG_HOST: z.string(),
  PG_PORT: z.string(),
  SOLANA_RPC_URL: z
    .string()
    .url()
    .default("https://api.mainnet-beta.solana.com"),
  ASSET_ENDPOINT: z.string().url().optional(),
  ACCOUNT_INDEXER_URL: z.string().url().optional(),
  ASSET_OWNER_INDEXER_URL: z.string().url().optional(),
  ACCOUNT_INDEXER_PASSWORD: z.string().optional(),
  ASSET_OWNER_INDEXER_PASSWORD: z.string().optional(),
  ORACLE_SIGNER: z
    .string()
    .default("orc1TYY5L4B4ZWDEMayTqu99ikPM9bQo9fqzoaCPP5Q"),
  ORACLE_URL: z.string().url().default("https://hnt-rewards.oracle.helium.io"),
  ORACLE_API_KEY: z.string().optional(),
  JITO_BLOCK_ENGINE_URL: z
    .string()
    .default("https://mainnet.block-engine.jito.wtf"),
  JITO_API_KEY: z.string().optional(),
  JITO_TIP_ACCOUNT: z.string().optional(),
  JITO_TIP_AMOUNT: z.string().optional(),
  JUPITER_API_URL: z.string().url().default("https://api.jup.ag"),
  JUPITER_API_KEY: z.string(),
  SENTRY_DSN: z.string().optional(),
  ONBOARDING_ENDPOINT: z
    .string()
    .url()
    .default("https://onboarding.dewi.org/api/v3"),
  // ECC verifier service that co-signs data-only hotspot issue transactions
  // after verifying the gateway's ECC key signature. Base URL; the issue
  // procedure POSTs to `${ECC_VERIFIER_URL}/verify`. Require https so the
  // transaction to be co-signed is never sent over a cleartext channel.
  ECC_VERIFIER_URL: z
    .string()
    .url()
    .refine((u) => u.startsWith("https://"), "ECC_VERIFIER_URL must be https")
    .default("https://ecc-verifier.web.helium.io"),
  FEE_PAYER_WALLET_PATH: z.string().optional(),
  SOLANA_CLUSTER: z.preprocess(
    (v) => (typeof v === "string" ? v.trim() : v),
    z.enum(["mainnet", "mainnet-beta", "devnet"]).optional(),
  ),
  NEXT_PUBLIC_SOLANA_CLUSTER: z
    .undefined({
      error: "NEXT_PUBLIC_SOLANA_CLUSTER was renamed to SOLANA_CLUSTER",
    })
    .optional(),
  PUBLIC_URL: z.string().url().optional(),
});

// Empty strings are treated as undefined. `SOME_VAR: z.string()` and
// `SOME_VAR=''` will throw an error.
export const env = envSchema.parse(
  Object.fromEntries(
    Object.entries(process.env).map(([key, value]) => [
      key,
      value === "" ? undefined : value,
    ]),
  ),
);
