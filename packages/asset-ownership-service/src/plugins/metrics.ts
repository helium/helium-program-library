import fp from "fastify-plugin";
import fastifyMetrics from "fastify-metrics";
import { Counter, Gauge } from "prom-client";

declare module "fastify" {
  interface FastifyInstance {
    customMetrics: {
      staleCursorCounter: Counter;
      treeFailureCounter: Counter;
      conversionFailureCounter: Counter;
      transactionFailureCounter: Counter;
      blocksProcessedCounter: Counter;
      blocksReceivedCounter: Counter;
      lastBlockHeightGauge: Gauge;
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

  const blocksReceivedCounter = new fastify.metrics.client.Counter({
    name: "blocks_received_count",
    help: "Total number of blocks received from substream",
  });

  const lastBlockHeightGauge = new fastify.metrics.client.Gauge({
    name: "last_block_height",
    help: "Height of the most recently received block from substream",
  });

  fastify.customMetrics = {
    staleCursorCounter,
    treeFailureCounter,
    conversionFailureCounter,
    transactionFailureCounter,
    blocksProcessedCounter,
    blocksReceivedCounter,
    lastBlockHeightGauge,
  };
});
