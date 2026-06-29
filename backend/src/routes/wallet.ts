import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { WalletService } from '../services/wallet.service';

const SEC  = [{ bearerAuth: [] }];
const TAGS = ['Wallet'];

const walletRoutes: FastifyPluginAsync = async (fastify) => {
  const walletSvc = new WalletService();

  // GET /v1/wallet
  fastify.get('/', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: TAGS, security: SEC,
      summary:     'Get token wallet balance',
      description: 'Returns current balance and lifetime totals. Balance must be ≥ 1 to claim referrals.',
      response: {
        200: { '$ref': 'TokenWallet#' },
        401: { '$ref': 'Error#' },
      },
    },
  }, async (req) => walletSvc.getWallet(req.currentUser.practitioner_id!));

  // GET /v1/wallet/transactions
  fastify.get('/transactions', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: TAGS, security: SEC,
      summary:     'List token transaction history',
      description: 'Cursor-paginated immutable ledger of all credits and debits, newest first.',
      querystring: {
        type: 'object',
        properties: {
          cursor: { type: 'string' },
          limit:  { type: 'integer', minimum: 1, maximum: 50, default: 20 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            data:       { type: 'array', items: { '$ref': 'TokenTransaction#' } },
            pagination: { '$ref': 'Pagination#' },
          },
        },
      },
    },
  }, async (req) => {
    const { cursor, limit = '20' } = req.query as Record<string, string>;
    return walletSvc.listTransactions(req.currentUser.practitioner_id!, cursor, parseInt(limit, 10));
  });

  // GET /v1/wallet/packages
  fastify.get('/packages', {
    schema: {
      tags: ['Wallet'],
      summary:     'List purchasable token packages',
      description: 'Public listing of available token bundles with pricing.',
      response: {
        200: {
          type: 'object',
          properties: {
            data: { type: 'array', items: { '$ref': 'TokenPackage#' } },
          },
        },
      },
    },
  }, async () => walletSvc.listPackages());

  // POST /v1/wallet/purchase
  fastify.post('/purchase', {
    preHandler: [fastify.authenticate],
    config: { rateLimit: { max: 5, timeWindow: 60000 } },
    schema: {
      tags: TAGS, security: SEC,
      summary:     'Purchase a token package',
      description: 'Creates a Stripe Checkout Session for purchasing a token package.',
      body: {
        type: 'object',
        required: ['package_id', 'success_url', 'cancel_url'],
        properties: {
          package_id:   { type: 'string', format: 'uuid', description: 'ID from GET /v1/wallet/packages' },
          success_url:  { type: 'string', format: 'uri' },
          cancel_url:   { type: 'string', format: 'uri' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            checkout_url: { type: 'string', format: 'uri', description: 'Stripe Checkout redirect URL' },
          },
          required: ['checkout_url'],
        },
        404: { description: 'Package not found',        '$ref': 'Error#' },
      },
    },
  }, async (req, reply) => {
    const { package_id, success_url, cancel_url } = z.object({
      package_id: z.string().uuid(),
      success_url: z.string().url(),
      cancel_url: z.string().url(),
    }).parse(req.body);
    
    const result = await walletSvc.purchaseTokens(
      req.currentUser.practitioner_id!,
      package_id,
      success_url,
      cancel_url
    );
    
    return reply.send(result);
  });
};

export default walletRoutes;
