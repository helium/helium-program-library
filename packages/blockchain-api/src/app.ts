import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import cors from "@fastify/cors";
import { rpcHandler } from "@/server/api/handlers/rpc";
import { openApiHandler } from "@/server/api/handlers/openapi";

const ALLOWED_ORIGIN_PATTERNS = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/.*\.helium\.io$/,
  /^https?:\/\/.*\.test-helium\.com$/,
  /^https?:\/\/.*\.heliumvote\.com$/,
  /^https?:\/\/heliumvote\.com$/,
];

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
        context: {},
      });
      if (!matched) return reply.callNotFound();
      return reply;
    };

    const apiRoute = async (req: FastifyRequest, reply: FastifyReply) => {
      const { matched } = await openApiHandler.handle(req, reply, {
        prefix: "/api/v1",
        context: {},
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
