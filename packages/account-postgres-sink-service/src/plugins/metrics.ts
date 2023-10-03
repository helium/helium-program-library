import fp from 'fastify-plugin';
import fastifyMetrics from 'fastify-metrics';
import { Counter } from 'prom-client';

declare module 'fastify' {
  interface FastifyInstance {
    customMetrics: {
      integrityCheckCounter: Counter;
      accountWebhookCounter: Counter;
    };
  }
}

export const metrics = fp(async (fastify, _opts) => {
  await fastify.register(fastifyMetrics, { endpoint: '/metrics' });

  const integrityCheckCounter = new fastify.metrics.client.Counter({
    name: 'integrity_check',
    help: 'Number of corrected records from integrity checker',
  });

  const accountWebhookCounter = new fastify.metrics.client.Counter({
    name: 'account_webhook_count',
    help: 'Number of times /account-webhook was hit',
  });

  fastify.customMetrics = {
    integrityCheckCounter,
    accountWebhookCounter,
  };
});
