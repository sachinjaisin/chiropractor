import { FastifyPluginAsync } from 'fastify';
import { registry } from '../utils/metrics';

const metricsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /metrics — Prometheus scrape target (not exposed externally via NetworkPolicy)
  fastify.get('/metrics', {
    schema: {
      tags:     ['Ops'],
      security: [],
      summary:     'Prometheus metrics scrape endpoint',
      description: 'Exposes Prometheus metrics in text format. Protected by Kubernetes NetworkPolicy — only accessible from within the cluster (prometheus namespace).',
      produces: ['text/plain'],
      response: {
        200: {
          description: 'Prometheus metrics text',
          type: 'string',
        },
      },
    },
  }, async (_req, reply) => {
    const metrics = await registry.metrics();
    return reply.header('Content-Type', registry.contentType).send(metrics);
  });
};

export default metricsRoutes;
