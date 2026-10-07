import type { FastifyInstance } from "fastify";
import { resolve, sep } from "path";

const srcDir = resolve(__dirname, "../../../src") + sep;

/**
 * Drop the server's own modules from the module cache.
 *
 * `src/lib/env.ts` parses `process.env` once at module load. The whole e2e
 * suite runs in one mocha process, so without this the first file to start a
 * server freezes the env for every later file, and their `before` hooks (fee
 * payer path, RPC url) are ignored. Only `src/` is dropped: node_modules stay
 * cached, and the test files import nothing from `src/` but types and pure
 * helpers, which are safe to hold a second copy of.
 */
export const forgetServerModules = (): void => {
  for (const id of Object.keys(require.cache)) {
    if (id.startsWith(srcDir)) delete require.cache[id];
  }
};

export interface ServerOptions {
  port?: number;
  baseUrl?: string;
}

let app: FastifyInstance | undefined;
let ensurePromise: Promise<void> | null = null;

export function serverPort(): number {
  return parseInt(process.env.PORT || "3000", 10);
}

export function serverBaseUrl(): string {
  return `http://127.0.0.1:${serverPort()}`;
}

export function rpcUrl(): string {
  return `${serverBaseUrl()}/rpc`;
}

export async function ensureServer(opts: ServerOptions = {}): Promise<void> {
  if (ensurePromise) return ensurePromise;
  ensurePromise = (async () => {
    const port = opts.port ?? serverPort();
    const baseUrl = opts.baseUrl || `http://127.0.0.1:${port}`;

    // Anything that answers on the port is treated as our server; Fastify
    // 404s on `/`, which is still a response.
    try {
      await fetch(baseUrl);
      return;
    } catch {}

    // Imported here, not at module load: the server's env schema is validated
    // on import, and tests set their env (fee payer, RPC url) in `before`.
    forgetServerModules();
    const { buildApp, startBackgroundServices } = await import("@/app");

    app = await buildApp();
    startBackgroundServices();
    await app.listen({ port, host: "127.0.0.1" });
    console.log(`[server] Listening on ${baseUrl}`);
  })();
  return ensurePromise;
}

export async function stopServer(): Promise<void> {
  if (app) {
    await app.close();
    app = undefined;
  }
  ensurePromise = null;
}
