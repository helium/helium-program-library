import {
  formBulkTransactions,
  getBulkRewards,
} from "@helium/distributor-oracle";
import { closeSingleton as closeAccountFetchCacheSingleton } from "@helium/account-fetch-cache";
import { createSolanaConnection } from "@/lib/solana";
import { PublicKey } from "@solana/web3.js";
import axios from "axios";
import { env } from "@/lib/env";

// Add x-api-key header to oracle requests to bypass rate limits
if (env.ORACLE_API_KEY) {
  axios.interceptors.request.use((config) => {
    if (config.url?.includes(env.ORACLE_URL)) {
      config.headers["X-API-Key"] = env.ORACLE_API_KEY;
    }
    return config;
  });
}

function closeSingleton() {
  const { connection } = createSolanaConnection(PublicKey.default.toBase58());
  closeAccountFetchCacheSingleton(connection);
}

process.on("SIGINT", () => {
  closeSingleton();
});
process.on("SIGTERM", () => {
  closeSingleton();
});
process.on("exit", () => {
  closeSingleton();
});

export { formBulkTransactions, getBulkRewards };
