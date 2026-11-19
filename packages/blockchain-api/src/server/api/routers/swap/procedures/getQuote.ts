import { QuoteResponse, QuoteResponseSchema } from "@helium/blockchain-api";
import { publicProcedure } from "../../../procedures";
import { env } from "@/lib/env";
import { createTtlCache } from "@/lib/utils/ttl-cache";
import { classifyJupiterError } from "@/lib/utils/jupiter-errors";
import {
  BUILD_SWAP_MODE,
  boundRoute,
  checkBuildAnswer,
  excludedLabels,
  excludedWithDefaults,
} from "./build-request";

// Quotes are polled repeatedly and often re-requested with identical params.
// A short TTL plus in-flight coalescing collapses those bursts into a single
// Jupiter call, which is what was tripping Jupiter's 429 rate limiting.
const QUOTE_CACHE_TTL_MS = 2000;
const quoteCache = createTtlCache<QuoteResponse>({ ttlMs: QUOTE_CACHE_TTL_MS });

/**
 * The taker `/build` quotes for. `/build` requires a taker, and a quote does
 * not depend on whose wallet swaps, so the system program stands in for one.
 */
const QUOTE_TAKER = "11111111111111111111111111111111";

/**
 * Get a quote for swapping tokens from Jupiter's Swap V2 `/build`. The quote
 * is the route metadata of a swap `/build` would build; its instructions are
 * dropped, because getInstructions builds again for the real taker.
 */
export const getQuote = publicProcedure.swap.getQuote.handler(
  async ({ input, errors }) => {
    const {
      inputMint,
      outputMint,
      amount,
      swapMode,
      slippageBps,
      excludeDexes,
    } = input;

    // `/build` swaps an exact input only, and getInstructions refuses
    // anything else, so an ExactOut quote could never be built.
    if (swapMode !== BUILD_SWAP_MODE) {
      throw errors.BAD_REQUEST({
        message: `Only ${BUILD_SWAP_MODE} quotes are supported, got ${swapMode}`,
      });
    }

    const callerExcluded = [...excludedLabels(excludeDexes)];
    const excludedSet = excludedWithDefaults(excludeDexes);
    const excluded = [...excludedSet].join(",");

    const cacheKey = `${inputMint}:${outputMint}:${amount}:${swapMode}:${slippageBps}:${excluded}`;

    return quoteCache(cacheKey, async () => {
      const quoteUrl = new URL(`${env.JUPITER_API_URL}/swap/v2/build`);
      quoteUrl.searchParams.set("inputMint", inputMint);
      quoteUrl.searchParams.set("outputMint", outputMint);
      quoteUrl.searchParams.set("amount", amount);
      quoteUrl.searchParams.set("taker", QUOTE_TAKER);
      quoteUrl.searchParams.set("slippageBps", slippageBps.toString());
      quoteUrl.searchParams.set("excludeDexes", excluded);
      boundRoute(quoteUrl);

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

      const raw: unknown = await quoteResponse.json();

      const refusal = checkBuildAnswer(raw, excludedSet);
      if (refusal) {
        throw errors.JUPITER_ERROR({ message: refusal });
      }

      // Validate the response from Jupiter
      const {
        data: build,
        success,
        error,
      } = QuoteResponseSchema.safeParse(raw);
      if (!success) {
        console.error("Invalid Jupiter response:", error);
        throw errors.JUPITER_ERROR({
          message: "Invalid response from Jupiter API",
        });
      }
      if (
        build.inputMint !== inputMint ||
        build.outputMint !== outputMint ||
        build.inAmount !== amount
      ) {
        throw errors.JUPITER_ERROR({
          message: "Jupiter quoted a swap that differs from the request",
        });
      }

      // Only the quote fields go back: the instructions, blockhash and lookup
      // tables were built for the placeholder taker, not the caller.
      return {
        inputMint: build.inputMint,
        inAmount: build.inAmount,
        outputMint: build.outputMint,
        outAmount: build.outAmount,
        otherAmountThreshold: build.otherAmountThreshold,
        swapMode: build.swapMode,
        slippageBps: build.slippageBps,
        priceImpactPct: build.priceImpactPct,
        routePlan: build.routePlan,
        // getInstructions applies these again, because it routes again.
        ...(callerExcluded.length > 0 && { excludeDexes: callerExcluded }),
      };
    });
  }
);
