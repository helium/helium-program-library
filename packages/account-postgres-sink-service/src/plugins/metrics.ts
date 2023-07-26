import fp from 'fastify-plugin';
import fastifyMetrics from 'fastify-metrics';
import { Counter } from 'prom-client';

declare module 'fastify' {
  interface FastifyInstance {
    customMetrics: {
      integrityMetric: Counter;
    };
  }
}

export const metrics = fp(async (fastify, _opts) => {
  await fastify.register(fastifyMetrics, { endpoint: '/metrics' });

  const integrityMetric = new fastify.metrics.client.Counter({
    name: 'integrity_check',
    help: 'Number of corrected records from integrity checker',
  });

  fastify.customMetrics = {
    integrityMetric,
  };
});
