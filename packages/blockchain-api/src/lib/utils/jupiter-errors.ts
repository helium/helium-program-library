/**
 * How a failed Jupiter HTTP response should be surfaced to our own callers.
 */
export type JupiterErrorClassification =
  | { kind: "BAD_REQUEST"; message: string }
  | { kind: "RATE_LIMITED" }
  | { kind: "JUPITER_ERROR"; message: string };

/**
 * Jupiter error codes that describe the caller's request, not a fault on our
 * side or Jupiter's. Each one must come back as a 400 so it never reaches
 * Sentry as a JUPITER_ERROR 500.
 */
const CLIENT_ERROR_MESSAGES: Record<string, string> = {
  CIRCULAR_ARBITRAGE_IS_DISABLED: "Input and output mints must be different",
  TOKEN_NOT_TRADABLE: "Token is not tradable",
};

/**
 * Classify a non-ok Jupiter response body.
 *
 * @param operation - what we were doing, used as the JUPITER_ERROR prefix.
 */
export const classifyJupiterError = ({
  status,
  body,
  operation,
}: {
  status: number;
  body: string;
  operation: string;
}): JupiterErrorClassification => {
  for (const [code, message] of Object.entries(CLIENT_ERROR_MESSAGES)) {
    if (body.includes(code)) {
      return { kind: "BAD_REQUEST", message };
    }
  }

  // Surface Jupiter rate limiting as a 429 so clients can back off instead of
  // us spamming Sentry with JUPITER_ERROR 500s.
  if (status === 429) {
    return { kind: "RATE_LIMITED" };
  }

  return {
    kind: "JUPITER_ERROR",
    message: `${operation}: HTTP ${status}: ${body.slice(0, 500)}`,
  };
};
