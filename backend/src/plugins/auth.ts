import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fp = require('fastify-plugin');
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { getRedis } from '../config/redis';
import { JwtPayload, UserRole } from '../types';
import { UnauthorizedError, ForbiddenError } from '../utils/errors';
import { queryOne } from '../config/database';

const authPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate('authenticate', authenticate);
  fastify.decorate('requireRole', requireRole);
  fastify.decorate('requireActive', requireActive);
};

async function authenticate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing or invalid Authorization header');
  }

  const token = authHeader.slice(7);
  let payload: JwtPayload;

  try {
    payload = await new Promise<JwtPayload>((resolve, reject) => {
      jwt.verify(token, env.JWT_SECRET, (err, decoded) => {
        if (err) reject(err);
        else resolve(decoded as JwtPayload);
      });
    });
  } catch {
    throw new UnauthorizedError('Invalid or expired token');
  }

  // Check token is not revoked (stored in Redis on logout) — skip if Redis is unavailable
  try {
    const revoked = await getRedis().get(`revoked:${payload.jti}`);
    if (revoked) throw new UnauthorizedError('Token has been revoked');
  } catch (err) {
    if (err instanceof UnauthorizedError) throw err;
    // Redis unavailable — revocation check skipped
  }

  request.currentUser = payload;
}

function requireRole(...roles: UserRole[]) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    if (!request.currentUser) {
      throw new UnauthorizedError();
    }
    if (!roles.includes(request.currentUser.role)) {
      throw new ForbiddenError('Insufficient permissions');
    }
  };
}

async function requireActive(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  if (!request.currentUser) {
    throw new UnauthorizedError();
  }
  if (request.currentUser.role === 'chiropractor') {
    const practitioner = await queryOne<{ status: string }>(
      'SELECT status FROM practitioners WHERE user_id = $1',
      [request.currentUser.sub],
    );
    if (!practitioner || practitioner.status !== 'ACTIVE') {
      throw new ForbiddenError('Account is not active. Please complete your profile and await approval.');
    }
  }
}

// Extend Fastify type
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole: (...roles: UserRole[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireActive: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export default fp(authPlugin, { name: 'auth' });
