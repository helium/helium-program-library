import { implement, os, type Middleware, ORPCError } from "@orpc/server";
import type { Meta } from "@orpc/contract";
import { cookies, headers } from "next/headers";
import { privy } from "@/lib/privy";
import { env } from "@/lib/env";
import type { User } from "@privy-io/server-auth";
import { fullApiContract } from "@helium/blockchain-api";

/**
 * Session context provided to authenticated procedures.
 */
export interface SessionContext {
  /** Privy user ID */
  userId: string;
  /** User's wallet address (if available) */
  walletAddress: string | null;
  /** Full Privy user object */
  user: User;
}

/**
 * Context available to authenticated procedures.
 */
export interface AuthenticatedContext {
  session: SessionContext;
}

/**
 * Context available to public procedures that require wallet identity.
 */
export interface UnverifiedWalletIdentityContext {
  unverifiedWalletAddress: string;
}

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
  const params =
    input &&
    typeof input === "object" &&
    Object.keys(input as object).length > 0
      ? ` ${JSON.stringify(input)}`
      : "";
  console.log(`${ts} [ORPC] ${routePath}${params} ${ms}ms`);

  return result;
});

/**
 * Public (unauthenticated) procedure
 *
 * This is the base piece you use to build new queries and mutations on your API. It does not
 * guarantee that a user querying is authorized, but you can still access user session data if they
 * are logged in.
 */
export const publicProcedure = implement(fullApiContract).use(timingMiddleware);

/**
 * Error constructor map that requires UNAUTHENTICATED error.
 * Used to constrain the withAuth middleware at compile time.
 */
type AuthErrorConstructorMap = {
  UNAUTHENTICATED: (opts?: {
    message?: string;
  }) => ORPCError<"UNAUTHENTICATED", unknown>;
};

/**
 * Creates an auth guard middleware for use with `.use()`.
 * Requires the contract to include UNAUTHENTICATED error (use `protectedOc`).
 *
 * @example
 * ```ts
 * export const myHandler = publicProcedure.myRoute
 *   .use(withAuth)
 *   .handler(async ({ context }) => {
 *     // context.session is guaranteed to be SessionContext
 *   });
 * ```
 */
export const withAuth: Middleware<
  Record<never, never>,
  AuthenticatedContext,
  unknown,
  any,
  AuthErrorConstructorMap,
  Meta
> = async ({ context, next, errors }) => {
  const cookieStore = await cookies();
  let idToken = cookieStore.get("privy-id-token")?.value;

  if (!idToken) {
    const headerStore = await headers();
    const authHeader = headerStore.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      idToken = authHeader.slice(7);
    }
  }

  if (!idToken) {
    throw errors.UNAUTHENTICATED({
      message: "No authentication token provided",
    });
  }

  const privyUser = await privy.getUser({ idToken });
  if (!privyUser) {
    throw errors.UNAUTHENTICATED({
      message: "Invalid authentication token",
    });
  }

  let walletAddress = privyUser.wallet?.address ?? null;

  // Debug: allow overriding wallet address via x-view-as header (dev only)
  if (env.NODE_ENV === "development") {
    const headerStore = await headers();
    const viewAs = headerStore.get("x-view-as");
    if (viewAs) {
      walletAddress = viewAs;
    }
  }

  return next({
    context: {
      ...context,
      session: {
        userId: privyUser.id,
        walletAddress,
        user: privyUser,
      },
    } as AuthenticatedContext,
  });
};
