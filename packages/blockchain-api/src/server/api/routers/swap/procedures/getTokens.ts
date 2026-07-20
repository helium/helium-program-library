import { publicProcedure } from "../../../procedures";
import type { Token } from "@helium/blockchain-api";
import { env } from "@/lib/env";
import { TOKEN_MINTS } from "@/lib/constants/tokens";
import { createTtlCache } from "@/lib/utils/ttl-cache";

// The verified token list changes rarely and hits the same rate-limited Jupiter
// API as quotes. A long TTL plus in-flight coalescing keeps these requests from
// drawing down Jupiter's budget. The upstream fetch ignores `limit` (it always
// pulls the full verified list), so the cache is keyed independent of `limit`
// and we slice per request — that way requests with differing limits still
// coalesce onto a single Jupiter call.
const TOKENS_CACHE_TTL_MS = 2 * 60 * 1000;
const TOKENS_CACHE_KEY = "verified";
const tokensCache = createTtlCache<Token[]>({
  ttlMs: TOKENS_CACHE_TTL_MS,
});

/**
 * Get list of verified tokens available for swapping from Jupiter.
 */
export const getTokens = publicProcedure.swap.getTokens.handler(
  async ({ input, errors }) => {
    const { limit } = input;

    const allTokens = await tokensCache(TOKENS_CACHE_KEY, async () => {
      // Use Jupiter's Token API V2 endpoint for verified tokens
      const jupiterUrl = new URL(`${env.JUPITER_API_URL}/tokens/v2/tag`);
      jupiterUrl.searchParams.set("query", "verified");

      const jupiterResponse = await fetch(jupiterUrl.toString(), {
        headers: {
          "User-Agent": "my-helium-api/1.0",
          "x-api-key": env.JUPITER_API_KEY,
        },
      });

      if (!jupiterResponse.ok) {
        const errorText = await jupiterResponse.text();
        console.error("Jupiter Token API error:", errorText);
        throw errors.JUPITER_ERROR({
          message: `Failed to fetch tokens from Jupiter: HTTP ${jupiterResponse.status}`,
        });
      }

      const jupiterTokens: {
        id: string;
        symbol: string;
        name: string;
        decimals: number;
        icon?: string;
        tags?: string[];
      }[] = await jupiterResponse.json();

      // Transform the V2 response format to our expected format. We cache the
      // full list (no `limit` slice) so callers with any limit share one fetch;
      // the per-request slice happens below.
      return jupiterTokens.map((token) => ({
        address: token.id,
        symbol: token.symbol,
        name: token.name,
        decimals: token.decimals,
        logoURI: token.icon,
        tags: token.tags || [],
      }));
    });

    // slice() returns a fresh array, so the HNT reordering below never mutates
    // the shared cached list (see the shared-reference note in ttl-cache.ts).
    const validatedTokens = allTokens.slice(0, limit);

    // Add HNT token at the top if it's not already in the list
    const hntToken: Token = {
      address: TOKEN_MINTS.HNT,
      symbol: "HNT",
      name: "Helium",
      decimals: 8,
      logoURI: "https://cryptologos.cc/logos/helium-hnt-logo.png",
      tags: ["helium", "iot", "crypto"],
    };

    // Check if HNT is already in the list
    const hasHNT = validatedTokens.some((token) => token.symbol === "HNT");

    // Add HNT at the top if not present
    if (!hasHNT) {
      validatedTokens.unshift(hntToken);
    } else {
      // Move HNT to the top if it exists
      const hntIndex = validatedTokens.findIndex(
        (token) => token.symbol === "HNT",
      );
      if (hntIndex > 0) {
        const hnt = validatedTokens.splice(hntIndex, 1)[0];
        validatedTokens.unshift(hnt);
      }
    }

    return { tokens: validatedTokens };
  },
);
