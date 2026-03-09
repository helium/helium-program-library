/**
 * Internal ORPC client for the Helium app.
 *
 * Handles
 * - Dynamic token updates during session (setAccessToken)
 * - SSR cookie forwarding from Next.js headers
 * - TanStack Query integration (orpc utils)
 *
 * External consumers should create a client using contracts from @helium/blockchain-api.
 */
import type { RouterClient } from "@orpc/server";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createRouterUtils } from "@orpc/tanstack-query";
import type { appRouter } from "@/server/api";

function getBaseUrl() {
  if (typeof window !== "undefined") return window.location.origin;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

/**
 * @see {@link https://orpc.dev/docs/adapters/next#optimize-ssr}
 */
declare global {
  var $client: RouterClient<typeof appRouter> | undefined;
}

let globalAccessToken: string | null = null;

export function setAccessToken(token: string | null) {
  globalAccessToken = token;
}

function getViewAsAddress(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  return params.get("viewAs");
}

const link = new RPCLink({
  url: getBaseUrl() + "/rpc",
  fetch: (input, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    if (globalAccessToken) {
      headers.set("Authorization", `Bearer ${globalAccessToken}`);
    }
    const viewAs = getViewAsAddress();
    if (viewAs) {
      headers.set("x-view-as", viewAs);
    }
    return fetch(input, {
      ...init,
      headers,
      credentials: "include",
    });
  },
  headers: async () => {
    if (typeof window === "undefined") {
      const { headers: nextHeaders } = await import("next/headers");
      const reqHeaders = await nextHeaders();
      const cookie = reqHeaders.get("cookie");
      if (cookie) {
        return { cookie };
      }
    }
    return {};
  },
});

export const client: RouterClient<typeof appRouter> =
  globalThis.$client ?? createORPCClient(link);

export const orpc = createRouterUtils(client);
