import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { createORPCClient, createSafeClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { appRouter } from "@/server/api";
import type { RouterClient } from "@orpc/server";
import fs from "fs";
import { applyMinimalServerEnv } from "./env";
import { ensureSurfpool, getSurfpoolRpcUrl } from "./surfpool";
import { ensureNextServer } from "./next";
import { ensureFunds, loadKeypairFromEnv } from "./wallet";

export interface TestCtx {
  payer: Keypair;
  connection: Connection;
  client: RouterClient<typeof appRouter>;
  safeClient: ReturnType<typeof createSafeClient<RouterClient<typeof appRouter>>>;
}

export interface SetupTestCtxOptions {
  /**
   * Write payer keypair to FEE_PAYER_WALLET_PATH for services that need it
   */
  setupFeePayer?: boolean;
  /**
   * Override HPL_CRONS_TASK_QUEUE env var
   */
  taskQueue?: string;
}

export async function setupTestCtx(
  options: SetupTestCtxOptions = {},
): Promise<TestCtx> {
  if (!process.env.ASSET_ENDPOINT) {
    throw new Error(
      "ASSET_ENDPOINT is not set. You need to set it to a DAS capable mainnet endpoint.",
    );
  }
  applyMinimalServerEnv();
  await ensureSurfpool();
  await ensureNextServer();

  const payer = loadKeypairFromEnv();

  if (options.setupFeePayer) {
    try {
      const keyPath =
        process.env.TEST_WALLET_KEYPAIR_PATH || "/tmp/test-fee-payer.json";
      if (!process.env.TEST_WALLET_KEYPAIR_PATH) {
        fs.writeFileSync(keyPath, JSON.stringify(Array.from(payer.secretKey)));
      }
      process.env.FEE_PAYER_WALLET_PATH = keyPath;
    } catch {}
  }

  if (options.taskQueue) {
    process.env.HPL_CRONS_TASK_QUEUE = options.taskQueue;
  }

  const connection = new Connection(getSurfpoolRpcUrl(), "confirmed");
  await ensureFunds(payer.publicKey, 0.05 * LAMPORTS_PER_SOL);

  const link = new RPCLink({
    url: "http://127.0.0.1:3000/rpc",
  });
  const client: RouterClient<typeof appRouter> = createORPCClient(link);
  const safeClient = createSafeClient(client);

  return {
    payer,
    connection,
    client,
    safeClient,
  };
}
