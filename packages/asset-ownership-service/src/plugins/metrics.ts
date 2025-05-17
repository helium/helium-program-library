import fp from "fastify-plugin";
import fastifyMetrics from "fastify-metrics";
import { Counter } from "prom-client";

declare module "fastify" {
  interface FastifyInstance {
    customMetrics: {
      staleCursorCounter: Counter;
      treeFailureCounter: Counter;
    };
  }
}

export const metrics = fp(async (fastify, _opts) => {
  await fastify.register(fastifyMetrics, { endpoint: "/metrics" });
  const staleCursorCounter = new fastify.metrics.client.Counter({
    name: "stale_cursor_count",
    help: "Number of times a cursor has been stale",
  });

  const treeFailureCounter = new fastify.metrics.client.Counter({
    name: "tree_failure_counter",
    help: "Number of times we failed to track a new tree",
  });

  fastify.customMetrics = {
    staleCursorCounter,
    treeFailureCounter,
  };
});
