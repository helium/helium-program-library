import { implement, os } from "@orpc/server";
import { env } from "@/lib/env";
import { summarizeProcedureInput } from "@/lib/utils/log-input";
import { fullApiContract } from "@helium/blockchain-api";

/**
 * Initial context every procedure receives. `reqHeaders` is preset from the
 * outer request in app.ts on both handlers.
 */
export type AppContext = { reqHeaders?: Headers };

/**
 * Middleware for timing procedure execution and adding an artificial delay in development.
 *
 * You can remove this if you don't like it, but it can help catch unwanted waterfalls by simulating
 * network latency that would occur in production but not in local development.
 */
const IGNORED_PATHS = new Set(["health.check"]);

const timingMiddleware = os.middleware(async ({ next, path }, input) => {
  const routePath = path.join(".");

  if (IGNORED_PATHS.has(routePath)) {
    return next();
  }

  const start = Date.now();

  if (env.NODE_ENV === "development") {
    // artificial delay in dev
    const waitMs = Math.floor(Math.random() * 400) + 100;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  const result = await next();

  const ms = Date.now() - start;
  const ts = new Date().toISOString();
  console.log(
    `${ts} [ORPC] ${routePath}${summarizeProcedureInput(input)} ${ms}ms`
  );

  return result;
});

/**
 * Public (unauthenticated) procedure
 *
 * This is the base piece you use to build new queries and mutations on your API. It does not
 * guarantee that a user querying is authorized.
 */
export const publicProcedure = implement(fullApiContract)
  .$context<AppContext>()
  .use(timingMiddleware);
