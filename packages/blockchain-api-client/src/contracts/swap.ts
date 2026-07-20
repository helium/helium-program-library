import { oc } from "@orpc/contract";
import {
  GetTokensInputSchema,
  TokenListOutputSchema,
  GetQuoteInputSchema,
  QuoteResponseSchema,
  GetInstructionsInputSchema,
} from "../schemas/swap";
import {
  TransactionDataSchema,
} from "../schemas/common";
import { INSUFFICIENT_FUNDS } from "../errors/solana";
import { RATE_LIMITED } from "../errors/common";

export const swapContract = oc
  .tag("Swap")
  .router({
    getTokens: oc
      .route({ method: "GET", path: "/swap/tokens", })
      .input(GetTokensInputSchema)
      .output(TokenListOutputSchema)
      .errors({
        JUPITER_ERROR: { message: "Failed to fetch tokens from Jupiter" },
        RATE_LIMITED,
      }),
    getQuote: oc
      .route({ method: "GET", path: "/swap/quote", })
      .input(GetQuoteInputSchema)
      .output(QuoteResponseSchema)
      .errors({
        BAD_REQUEST: { message: "Invalid quote parameters", status: 400 },
        JUPITER_ERROR: { message: "Failed to get quote from Jupiter" },
        RATE_LIMITED,
      }),
    getInstructions: oc
      .route({ method: "POST", path: "/swap/instructions", })
      .input(GetInstructionsInputSchema)
      .output(TransactionDataSchema)
      .errors({
        BAD_REQUEST: { message: "Invalid instruction parameters", status: 400 },
        JUPITER_ERROR: { message: "Failed to get swap instructions from Jupiter" },
        INSUFFICIENT_FUNDS,
        RATE_LIMITED,
      }),
  });
