import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import cors from "@fastify/cors";
import type { IncomingHttpHeaders } from "http";
import { rpcHandler } from "@/server/api/handlers/rpc";
import { openApiHandler } from "@/server/api/handlers/openapi";

const ALLOWED_ORIGIN_PATTERNS = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/.*\.helium\.io$/,
  /^https?:\/\/.*\.test-helium\.com$/,
  /^https?:\/\/.*\.heliumvote\.com$/,
  /^https?:\/\/heliumvote\.com$/,
];

const toFetchHeaders = (headers: IncomingHttpHeaders): Headers => {
  const fetchHeaders = new Headers();
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const entry of value) fetchHeaders.append(name, entry);
    } else {
      fetchHeaders.set(name, value);
    }
  }
  return fetchHeaders;
};

export const buildApp = async (): Promise<FastifyInstance> => {
  const app = Fastify();

  await app.register(cors, {
    origin: ALLOWED_ORIGIN_PATTERNS,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400,
    // Every OPTIONS request gets a 204, not only well-formed preflights
    strictPreflight: false,
  });

  await app.register(async (instance) => {
    // oRPC reads the raw stream itself; a parsed `req.body` would be handed
    // to it as-is and break form, multipart and text bodies
    instance.removeAllContentTypeParsers();
    instance.addContentTypeParser("*", (_req, _payload, done) =>
      done(null, undefined),
    );

    const rpcRoute = async (req: FastifyRequest, reply: FastifyReply) => {
      const { matched } = await rpcHandler.handle(req, reply, {
        prefix: "/rpc",
        // Rate limits key on the client IP of the outer request, and a batch
        // item can override the headers the plugin would otherwise read
        context: { reqHeaders: toFetchHeaders(req.headers) },
      });
      if (!matched) return reply.callNotFound();
      return reply;
    };

    const apiRoute = async (req: FastifyRequest, reply: FastifyReply) => {
      const { matched } = await openApiHandler.handle(req, reply, {
        prefix: "/api/v1",
        // Rate limits key on the client IP of the outer request, and a batch
        // item can override the headers the plugin would otherwise read
        context: { reqHeaders: toFetchHeaders(req.headers) },
      });
      if (!matched) return reply.callNotFound();
      return reply;
    };

    instance.all("/rpc", rpcRoute);
    instance.all("/rpc/*", rpcRoute);
    instance.all("/api/v1", apiRoute);
    instance.all("/api/v1/*", apiRoute);
  });

  return app;
};
