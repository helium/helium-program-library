import { inspect } from "node:util";

const REDACTED = "[redacted]";

/** The request is wrong: a missing or invalid field, or a mint the service does not swap. */
export class RequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequestError";
  }
}

/** Jupiter's answer was refused. */
export class UpstreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UpstreamError";
  }
}

/** The HTTP status for a failed request. */
const failureStatus = (err: unknown): 400 | 500 | 502 => {
  if (err instanceof RequestError) {
    return 400;
  }
  if (err instanceof UpstreamError) {
    return 502;
  }
  return 500;
};

/** The forms an RPC URL takes in an error text: the URL, the URL without its scheme, and the host. */
const rpcUrlForms = (rpcUrl: string): string[] => {
  try {
    const url = new URL(rpcUrl);
    return [
      rpcUrl,
      url.href,
      url.host + url.pathname + url.search,
      url.host,
      url.hostname,
    ];
  } catch {
    // The URL does not parse, so it has no other form to remove.
    return [rpcUrl];
  }
};

/**
 * Removes the RPC URL (`ANCHOR_PROVIDER_URL`) and `JUPITER_API_KEY` from `text`. The RPC URL is
 * removed whole, without its scheme, and as its host alone.
 */
export const redact = (
  text: string,
  env: NodeJS.ProcessEnv = process.env
): string =>
  [...rpcUrlForms(env.ANCHOR_PROVIDER_URL ?? ""), env.JUPITER_API_KEY ?? ""]
    .filter((secret) => secret !== "")
    // The longest goes first, so the host does not split the URL that holds it.
    .sort((a, b) => b.length - a.length)
    .reduce((redacted, secret) => redacted.split(secret).join(REDACTED), text);

/**
 * The answer and the log text for a failed request, both redacted. The status is 400 when the
 * request is wrong, 502 when Jupiter's answer was refused, and 500 for any other failure.
 */
export const failure = (
  err: unknown,
  env: NodeJS.ProcessEnv = process.env
): {
  status: ReturnType<typeof failureStatus>;
  body: { error: string };
  log: string;
} => ({
  status: failureStatus(err),
  body: {
    error: redact(err instanceof Error ? err.message : String(err), env),
  },
  log: redact(inspect(err), env),
});
