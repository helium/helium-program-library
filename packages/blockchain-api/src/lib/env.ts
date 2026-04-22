import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
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
    PRIVY_APP_SECRET: z.string(),
    BRIDGE_API_KEY: z.string(),
    BRIDGE_API_URL: z.string().url().default("https://api.bridge.xyz/v0"),
    ORACLE_SIGNER: z
      .string()
      .default("orc1TYY5L4B4ZWDEMayTqu99ikPM9bQo9fqzoaCPP5Q"),
    ORACLE_URL: z
      .string()
      .url()
      .default("https://hnt-rewards.oracle.helium.io"),
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
    FEE_PAYER_WALLET_PATH: z.string().optional(),
    MIGRATION_PASSWORD: z.string().optional(),
    DUNE_API_KEY: z.string().optional(),
    HELIUM_VOTE_PROXY_REPO: z
      .string()
      .default("https://github.com/helium/helium-vote-proxies.git"),
    ANCHOR_WALLET: z.string().optional(),
    MODIFY_DB: z.string().optional(),
    HELIUM_VOTE_PROXIES_DIR: z.string().optional(),
    PROXY_SYNC_ENABLED: z.string().optional(),
  },
  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    NEXT_PUBLIC_PRIVY_APP_ID: z.string(),
    NEXT_PUBLIC_SOLANA_URL: z.string().optional(),
    NEXT_PUBLIC_SOLANA_CLUSTER: z.string().optional(),
    NEXT_PUBLIC_WORLD_HELIUM_URL: z.string().optional(),
  },
  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    NO_PG: process.env.NO_PG,
    NODE_ENV: process.env.NODE_ENV,
    PG_USER: process.env.PG_USER,
    PG_PASSWORD: process.env.PG_PASSWORD,
    PG_NAME: process.env.PG_NAME,
    PG_HOST: process.env.PG_HOST,
    PG_PORT: process.env.PG_PORT,
    SOLANA_RPC_URL: process.env.SOLANA_RPC_URL,
    ASSET_ENDPOINT: process.env.ASSET_ENDPOINT,
    NEXT_PUBLIC_PRIVY_APP_ID: process.env.NEXT_PUBLIC_PRIVY_APP_ID,
    ACCOUNT_INDEXER_URL: process.env.ACCOUNT_INDEXER_URL,
    ASSET_OWNER_INDEXER_URL: process.env.ASSET_OWNER_INDEXER_URL,
    ACCOUNT_INDEXER_PASSWORD: process.env.ACCOUNT_INDEXER_PASSWORD,
    ASSET_OWNER_INDEXER_PASSWORD: process.env.ASSET_OWNER_INDEXER_PASSWORD,
    NEXT_PUBLIC_SOLANA_URL: process.env.NEXT_PUBLIC_SOLANA_URL,
    NEXT_PUBLIC_SOLANA_CLUSTER: process.env.NEXT_PUBLIC_SOLANA_CLUSTER,
    PRIVY_APP_SECRET: process.env.PRIVY_APP_SECRET,
    BRIDGE_API_KEY: process.env.BRIDGE_API_KEY,
    BRIDGE_API_URL: process.env.BRIDGE_API_URL,
    ORACLE_SIGNER: process.env.ORACLE_SIGNER,
    ORACLE_URL: process.env.ORACLE_URL,
    ORACLE_API_KEY: process.env.ORACLE_API_KEY,
    JITO_BLOCK_ENGINE_URL: process.env.JITO_BLOCK_ENGINE_URL,
    JITO_TIP_ACCOUNT: process.env.JITO_TIP_ACCOUNT,
    JITO_API_KEY: process.env.JITO_API_KEY,
    JITO_TIP_AMOUNT: process.env.JITO_TIP_AMOUNT,
    JUPITER_API_URL: process.env.JUPITER_API_URL,
    JUPITER_API_KEY: process.env.JUPITER_API_KEY,
    SENTRY_DSN: process.env.SENTRY_DSN,
    ONBOARDING_ENDPOINT: process.env.ONBOARDING_ENDPOINT,
    FEE_PAYER_WALLET_PATH: process.env.FEE_PAYER_WALLET_PATH,
    MIGRATION_PASSWORD: process.env.MIGRATION_PASSWORD,
    NEXT_PUBLIC_WORLD_HELIUM_URL: process.env.NEXT_PUBLIC_WORLD_HELIUM_URL,
    DUNE_API_KEY: process.env.DUNE_API_KEY,
    HELIUM_VOTE_PROXY_REPO: process.env.HELIUM_VOTE_PROXY_REPO,
    ANCHOR_WALLET: process.env.ANCHOR_WALLET,
    MODIFY_DB: process.env.MODIFY_DB,
    HELIUM_VOTE_PROXIES_DIR: process.env.HELIUM_VOTE_PROXIES_DIR,
    PROXY_SYNC_ENABLED: process.env.PROXY_SYNC_ENABLED,
  },
  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
   * useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  /**
   * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
   * `SOME_VAR=''` will throw an error.
   */
  emptyStringAsUndefined: true,
});
