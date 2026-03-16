import fp from "fastify-plugin";
import fastifyMetrics from "fastify-metrics";
import { Counter, Gauge } from "prom-client";

declare module "fastify" {
  interface FastifyInstance {
    customMetrics: {
      integrityCheckCounter: Counter;
      accountWebhookCounter: Counter;
      transactionWebhookCounter: Counter;
      staleCursorCounter: Counter;
      blocksReceivedCounter: Counter;
      lastBlockHeightGauge: Gauge;
    };
  }
}

export const metrics = fp(async (fastify, _opts) => {
  await fastify.register(fastifyMetrics, { endpoint: "/metrics" });

  const integrityCheckCounter = new fastify.metrics.client.Counter({
    name: "integrity_check",
    help: "Number of corrected records from integrity checker",
  });

  const accountWebhookCounter = new fastify.metrics.client.Counter({
    name: "account_webhook_count",
    help: "Number of times /account-webhook was hit",
  });

  const transactionWebhookCounter = new fastify.metrics.client.Counter({
    name: "transaction_webhook_count",
    help: "Number of times transaction-webhook was hit",
  });

  const staleCursorCounter = new fastify.metrics.client.Counter({
    name: "stale_cursor_count",
    help: "Number of times a cursor has been stale",
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
    integrityCheckCounter,
    accountWebhookCounter,
    transactionWebhookCounter,
    staleCursorCounter,
    blocksReceivedCounter,
    lastBlockHeightGauge,
  };
});
