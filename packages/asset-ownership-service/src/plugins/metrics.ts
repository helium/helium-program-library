import fp from "fastify-plugin";
import fastifyMetrics from "fastify-metrics";
import { Counter } from "prom-client";

declare module "fastify" {
  interface FastifyInstance {
    customMetrics: {
      staleCursorCounter: Counter;
    };
  }
}

export const metrics = fp(async (fastify, _opts) => {
  await fastify.register(fastifyMetrics, { endpoint: "/metrics" });
  const staleCursorCounter = new fastify.metrics.client.Counter({
    name: "stale_cursor_count",
    help: "Number of times a cursor has been stale",
  });

  fastify.customMetrics = {
    staleCursorCounter,
  };
});
