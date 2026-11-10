import axios from "axios";

const RETRIES = 2;
const BASE_DELAY_MS = 200;

/** Socket-level failures that a new connection can clear. */
const TRANSIENT_ERROR_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EPIPE",
  "EAI_AGAIN",
  "UND_ERR_SOCKET",
  "UND_ERR_CONNECT_TIMEOUT",
]);

/** Statuses an RPC provider sends while it sheds load. */
const TRANSIENT_HTTP_STATUSES = new Set([429, 502, 503, 504]);

/** Statuses whose `Response` must have a null body. */
const NULL_BODY_STATUSES = new Set([101, 103, 204, 205, 304]);

/**
 * axios puts the socket code on the error; fetch wraps the socket error in a
 * TypeError("fetch failed") and puts it on `cause`.
 */
const socketErrorCode = (error: unknown): string | undefined => {
  const { code, cause } = (error ?? {}) as {
    code?: unknown;
    cause?: { code?: unknown };
  };
  const found = code ?? cause?.code;
  return typeof found === "string" ? found : undefined;
};

const isTransientNetworkError = (error: unknown): boolean => {
  if (axios.isAxiosError(error) && error.response) {
    return TRANSIENT_HTTP_STATUSES.has(error.response.status);
  }
  const code = socketErrorCode(error);
  return code !== undefined && TRANSIENT_ERROR_CODES.has(code);
};

/**
 * Run a read-only RPC call, and run it again up to twice, with backoff, when
 * it fails on a dropped connection or a load-shedding status. Any other
 * failure is thrown at once.
 */
export const withTransientRetry = async <T>(
  call: () => Promise<T>
): Promise<T> => {
  for (let retry = 0; ; retry++) {
    try {
      return await call();
    } catch (error) {
      if (retry >= RETRIES || !isTransientNetworkError(error)) throw error;
      await new Promise((resolve) =>
        setTimeout(resolve, BASE_DELAY_MS * 2 ** retry)
      );
    }
  }
};

/**
 * A `fetch` for a web3.js `Connection` that only reads. It retries dropped
 * connections; an HTTP error status comes back as a response, as from
 * `fetch`. The request body must be a string or buffer, so it can be sent
 * again.
 */
export const fetchRetryingTransientErrors: typeof fetch = (input, init) =>
  withTransientRetry(async () => {
    const r = await fetch(input, init);
    const body = NULL_BODY_STATUSES.has(r.status)
      ? null
      : await r.arrayBuffer();
    return new Response(body, {
      status: r.status,
      statusText: r.statusText,
      headers: r.headers,
    });
  });
