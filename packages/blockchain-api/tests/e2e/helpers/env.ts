import { getSurfpoolRpcUrl } from "./surfpool";
import { config } from "dotenv";
import { existsSync } from "fs";
import { resolve } from "path";

function loadTestEnv(): void {
  const rootDir = resolve(__dirname, "../../..");
  const localEnvPath = resolve(rootDir, ".env.test");

  if (existsSync(localEnvPath)) {
    config({ path: localEnvPath });
  }
}

loadTestEnv();

export function applyMinimalServerEnv(): void {
  process.env.PG_USER ||= "test";
  process.env.PG_NAME ||= "test";
  process.env.PG_HOST ||= "localhost";
  process.env.PG_PORT ||= "5432";
  process.env.PRIVY_APP_SECRET ||= "test";
  process.env.BRIDGE_API_KEY ||= "test";
  process.env.NEXT_PUBLIC_PRIVY_APP_ID ||= "test";
  process.env.SOLANA_RPC_URL = getSurfpoolRpcUrl();
  process.env.NEXT_PUBLIC_SOLANA_CLUSTER ||= "mainnet";
  process.env.NO_PG ||= "true";
  process.env.ORACLE_URL ||= "https://hnt-rewards.oracle.helium.io";
  process.env.JUPITER_API_KEY ||= "test";
  process.env.ONBOARDING_ENDPOINT ||= "https://onboarding.dewi.org/api/v3";
  process.env.HPL_CRONS_TASK_QUEUE ||=
    "H39gEszvsi6AT4rYBiJTuZHJSF5hMHy6CKGTd7wzhsg7";
  process.env.JITO_TIP_ACCOUNT ||= "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5";
}
