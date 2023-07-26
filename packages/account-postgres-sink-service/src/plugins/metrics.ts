import fp from 'fastify-plugin';
import { Counter } from 'prom-client';

declare module 'fastify' {
  interface FastifyInstance {
    customMetrics: {
      integrityMetric: Counter;
    };
  }
}

export const metrics = fp(async (fastify, _opts) => {
  let integrityMetric: Counter;

  if (!integrityMetric) {
    integrityMetric = new fastify.metrics.client.Counter({
      name: 'integrity_check',
      help: 'Number of corrected records from integrity checker',
    });
  }

  fastify.customMetrics = {
    integrityMetric,
  };
});
