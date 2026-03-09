import { createRouterClient } from "@orpc/server";
import { governanceRouter } from "./routers/governance/router";
import { healthRouter } from "./routers/health/router";
import { hotspotsRouter } from "./routers/hotspots/router";
import { tokensRouter } from "./routers/tokens/router";
import { rewardContractRouter } from "./routers/reward-contract/router";
import { swapRouter } from "./routers/swap/router";
import { transactionsRouter } from "./routers/transactions/router";
import { welcomePacksRouter } from "./routers/welcomePacks/router";
import { fiatRouter } from "./routers/fiat/router";
import { webhooksRouter } from "./routers/webhooks/router";
import { migrationRouter } from "./routers/migration/router";
import { implement } from "@orpc/server";
import { fullApiContract, apiContract } from "@helium/blockchain-api";

const sharedRouters = {
  governance: governanceRouter,
  health: healthRouter,
  hotspots: hotspotsRouter,
  tokens: tokensRouter,
  rewardContract: rewardContractRouter,
  swap: swapRouter,
  transactions: transactionsRouter,
  welcomePacks: welcomePacksRouter,
};

export const publicRouter = implement(apiContract).router(sharedRouters);

export const appRouter = implement(fullApiContract).router({
  ...sharedRouters,
  fiat: fiatRouter,
  webhooks: webhooksRouter,
  migration: migrationRouter,
});

/** Type of the main router for client-side type inference */
export type ORPCRouter = typeof appRouter;

/** Server-side router client for direct procedure calls */
export const api = createRouterClient(appRouter);
