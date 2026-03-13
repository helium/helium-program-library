import { publicProcedure } from "../../../procedures";
import type { Token } from "@helium/blockchain-api";
import { env } from "@/lib/env";
import { TOKEN_MINTS } from "@/lib/constants/tokens";

/**
 * Get list of verified tokens available for swapping from Jupiter.
 */
export const getTokens = publicProcedure.swap.getTokens.handler(
  async ({ input, errors }) => {
    const { limit } = input;

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

    // Transform the V2 response format to our expected format
    const validatedTokens: Token[] = jupiterTokens
      .slice(0, limit)
      .map((token) => ({
        address: token.id,
        symbol: token.symbol,
        name: token.name,
        decimals: token.decimals,
        logoURI: token.icon,
        tags: token.tags || [],
      }));

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
