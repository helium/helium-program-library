import { QuoteResponse, QuoteResponseSchema } from "@helium/blockchain-api";
import { publicProcedure } from "../../../procedures";
import { env } from "@/lib/env";
import { createTtlCache } from "@/lib/utils/ttl-cache";
import { classifyJupiterError } from "@/lib/utils/jupiter-errors";

// Quotes are polled repeatedly and often re-requested with identical params.
// A short TTL plus in-flight coalescing collapses those bursts into a single
// Jupiter call, which is what was tripping Jupiter's 429 rate limiting.
const QUOTE_CACHE_TTL_MS = 2000;
const quoteCache = createTtlCache<QuoteResponse>({ ttlMs: QUOTE_CACHE_TTL_MS });

/**
 * Get a quote for swapping tokens from Jupiter.
 */
export const getQuote = publicProcedure.swap.getQuote.handler(
  async ({ input, errors }) => {
    const { inputMint, outputMint, amount, swapMode, slippageBps } = input;

    const cacheKey = `${inputMint}:${outputMint}:${amount}:${swapMode}:${slippageBps}`;

    return quoteCache(cacheKey, async () => {
      // Get quote from Jupiter
      const quoteUrl = new URL(`${env.JUPITER_API_URL}/swap/v1/quote`);
      quoteUrl.searchParams.set("inputMint", inputMint);
      quoteUrl.searchParams.set("outputMint", outputMint);
      quoteUrl.searchParams.set("amount", amount);
      quoteUrl.searchParams.set("swapMode", swapMode);
      quoteUrl.searchParams.set("slippageBps", slippageBps.toString());
      // Exclude RFQ (JupiterZ) routes: those return maker-co-signed transactions
      // the requesting wallet cannot sign on its own, so a self-signed swap can't
      // be completed. The paid api-key host respects `excludeRouters=jupiterz` but
      // ignores `excludeRfq` (only the keyless lite-api host respects the latter).
      quoteUrl.searchParams.set("excludeRouters", "jupiterz");

      const quoteResponse = await fetch(quoteUrl.toString(), {
        headers: {
          "x-api-key": env.JUPITER_API_KEY,
        },
      });

      if (!quoteResponse.ok) {
        const errorText = await quoteResponse.text();
        console.error("Jupiter API error:", errorText);

        const classification = classifyJupiterError({
          status: quoteResponse.status,
          body: errorText,
          operation: "Failed to get quote from Jupiter",
        });
        if (classification.kind === "BAD_REQUEST") {
          throw errors.BAD_REQUEST({ message: classification.message });
        }
        if (classification.kind === "RATE_LIMITED") {
          throw errors.RATE_LIMITED();
        }
        throw errors.JUPITER_ERROR({ message: classification.message });
      }

      const raw = await quoteResponse.json();

      // Validate the response from Jupiter
      const {
        data: quote,
        success,
        error,
      } = QuoteResponseSchema.safeParse(raw);
      if (!success) {
        console.error("Invalid Jupiter response:", error);
        throw errors.JUPITER_ERROR({
          message: "Invalid response from Jupiter API",
        });
      }
      return quote;
    });
  }
);
