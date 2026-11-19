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

/** The BAD_REQUEST message for a swap Jupiter finds no route for. */
export const NO_ROUTE_MESSAGE = "No route found for this swap";

/**
 * Jupiter error texts, from the `error` field of a body that carries no
 * `errorCode`, that describe the caller's request. Swap V2 `/build` answers a
 * pair it cannot route with a bare `{"error":"No routes found"}`.
 */
const CLIENT_ERROR_TEXTS: Record<string, string> = {
  "No routes found": NO_ROUTE_MESSAGE,
};

/**
 * Read Jupiter's own `errorCode` field. Only the parsed field counts: a body
 * that merely mentions a code — an echo of the request, a proxy's error page —
 * is not Jupiter classifying the request.
 */
const parseErrorField = (
  body: string,
  field: "errorCode" | "error"
): string | undefined => {
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed === "object" && parsed !== null) {
      const value = (parsed as Record<string, unknown>)[field];
      return typeof value === "string" ? value : undefined;
    }
  } catch {
    return undefined;
  }
  return undefined;
};

/** The client message `table` holds for `key`, never one off its prototype. */
const lookup = (
  table: Record<string, string>,
  key: string | undefined
): string | undefined =>
  key !== undefined && Object.hasOwn(table, key) ? table[key] : undefined;

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

  const clientMessage =
    lookup(CLIENT_ERROR_MESSAGES, parseErrorField(body, "errorCode")) ??
    (status === 400
      ? lookup(CLIENT_ERROR_TEXTS, parseErrorField(body, "error"))
      : undefined);
  if (clientMessage !== undefined) {
    return { kind: "BAD_REQUEST", message: clientMessage };
  }

  return {
    kind: "JUPITER_ERROR",
    message: `${operation}: HTTP ${status}: ${body.slice(0, 500)}`,
  };
};
