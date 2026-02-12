import fp from "fastify-plugin";
import fastifyMetrics from "fastify-metrics";
import { Counter } from "prom-client";

declare module "fastify" {
  interface FastifyInstance {
    customMetrics: {
      staleCursorCounter: Counter;
      treeFailureCounter: Counter;
      conversionFailureCounter: Counter;
      transactionFailureCounter: Counter;
      blocksProcessedCounter: Counter;
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

  const conversionFailureCounter = new fastify.metrics.client.Counter({
    name: "conversion_failure_count",
    help: "Number of substream transactions that failed to convert",
  });

  const transactionFailureCounter = new fastify.metrics.client.Counter({
    name: "transaction_failure_count",
    help: "Number of individual transactions that failed to process",
  });

  const blocksProcessedCounter = new fastify.metrics.client.Counter({
    name: "blocks_processed_count",
    help: "Number of blocks successfully processed by substream",
  });

  fastify.customMetrics = {
    staleCursorCounter,
    treeFailureCounter,
    conversionFailureCounter,
    transactionFailureCounter,
    blocksProcessedCounter,
  };
});
