import { QuoteResponseSchema } from "@helium/blockchain-api";
import { publicProcedure } from "../../../procedures";
import { env } from "@/lib/env";

/**
 * Get a quote for swapping tokens from Jupiter.
 */
export const getQuote = publicProcedure.swap.getQuote.handler(
  async ({ input, errors }) => {
    const { inputMint, outputMint, amount, swapMode, slippageBps } = input;

    // Get quote from Jupiter
    const quoteUrl = new URL(`${env.JUPITER_API_URL}/swap/v1/quote`);
    quoteUrl.searchParams.set("inputMint", inputMint);
    quoteUrl.searchParams.set("outputMint", outputMint);
    quoteUrl.searchParams.set("amount", amount);
    quoteUrl.searchParams.set("swapMode", swapMode);
    quoteUrl.searchParams.set("slippageBps", slippageBps.toString());

    const quoteResponse = await fetch(quoteUrl.toString(), {
      headers: {
        "x-api-key": env.JUPITER_API_KEY,
      },
    });

    if (!quoteResponse.ok) {
      const errorText = await quoteResponse.text();
      console.error("Jupiter API error:", errorText);

      // TOKEN_NOT_TRADABLE is a client issue (e.g. wallet requesting a non-tradable token),
      // not a server error — return 400 so it doesn't get sent to Sentry.
      if (errorText.includes("TOKEN_NOT_TRADABLE")) {
        throw errors.BAD_REQUEST({
          message: `Token is not tradable`,
        });
      }

      throw errors.JUPITER_ERROR({
        message: `Failed to get quote from Jupiter: HTTP ${quoteResponse.status}: ${errorText.slice(0, 500)}`,
      });
    }

    const raw = await quoteResponse.json();

    // Validate the response from Jupiter
    const { data: quote, success, error } = QuoteResponseSchema.safeParse(raw);
    if (!success) {
      console.error("Invalid Jupiter response:", error);
      throw errors.JUPITER_ERROR({
        message: "Invalid response from Jupiter API",
      });
    }
    return quote;
  },
);
