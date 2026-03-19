import { healthContract } from "./health";
import { tokensContract } from "./tokens";
import { hotspotsContract } from "./hotspots";
import { governanceContract } from "./governance";
import { rewardContract } from "./reward-contract";
import { swapContract } from "./swap";
import { transactionsContract } from "./transactions";
import { welcomePacksContract } from "./welcome-packs";
import { fiatContract } from "./fiat";
import { webhooksContract } from "./webhooks";
import { migrationContract } from "./migration";
import { oc } from "@orpc/contract";

export * from "./governance";
export * from "./health";
export * from "./tokens";
export * from "./hotspots";
export * from "./reward-contract";
export * from "./swap";
export * from "./transactions";
export * from "./welcome-packs";
export * from "./fiat";
export * from "./webhooks";
export * from "./migration";

/**
 * Public API contract definition (for external consumers).
 * Defines all routes, inputs, outputs, and errors for the Helium Blockchain API.
 */
export const apiContract = oc.router({
  governance: governanceContract,
  health: healthContract,
  tokens: tokensContract,
  hotspots: hotspotsContract,
  rewardContract: rewardContract,
  swap: swapContract,
  transactions: transactionsContract,
  welcomePacks: welcomePacksContract,
  migration: migrationContract,
});

/**
 * Full API contract including internal-only routers.
 * Used for the full RPC handler (internal app access).
 */
export const fullApiContract = oc.router({
  ...apiContract,
  fiat: fiatContract,
  webhooks: webhooksContract,
  migration: migrationContract,
});