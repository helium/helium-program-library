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
 * Read Jupiter's own `errorCode` field. Only the parsed field counts: a body
 * that merely mentions a code — an echo of the request, a proxy's error page —
 * is not Jupiter classifying the request.
 */
const parseErrorCode = (body: string): string | undefined => {
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed === "object" && parsed !== null) {
      const code = (parsed as { errorCode?: unknown }).errorCode;
      return typeof code === "string" ? code : undefined;
    }
  } catch {
    return undefined;
  }
  return undefined;
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
  // Surface Jupiter rate limiting as a 429 so clients can back off instead of
  // us spamming Sentry with JUPITER_ERROR 500s. Decided before the error codes
  // because a throttled or failing response can echo the request's own code
  // back to us, which does not make it the caller's fault.
  if (status === 429) {
    return { kind: "RATE_LIMITED" };
  }

  const errorCode = parseErrorCode(body);
  const clientMessage =
    errorCode === undefined ? undefined : CLIENT_ERROR_MESSAGES[errorCode];
  if (clientMessage !== undefined) {
    return { kind: "BAD_REQUEST", message: clientMessage };
  }

  return {
    kind: "JUPITER_ERROR",
    message: `${operation}: HTTP ${status}: ${body.slice(0, 500)}`,
  };
};
