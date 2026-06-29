import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AuthService } from '../services/auth.service';
import { env } from '../config/env';

const S = {
  tags: ['Auth'],
  security: [] as never[],
};

const authRoutes: FastifyPluginAsync = async (fastify) => {
  const authService = new AuthService();

  // ── POST /v1/auth/register ────────────────────────────────────────────────
  fastify.post('/register', {
    config: { rateLimit: { max: 10, timeWindow: 900000 } },
    schema: {
      ...S,
      summary:     'Register a chiropractor account',
      description: 'Creates a user account, practitioner record, and empty token wallet. Status starts as PENDING_PROFILE.',
      body: {
        type: 'object',
        required: ['first_name', 'last_name', 'email', 'phone', 'password'],
        properties: {
          first_name: { type: 'string', minLength: 1, maxLength: 100, example: 'Jane' },
          last_name:  { type: 'string', minLength: 1, maxLength: 100, example: 'Smith' },
          email:      { type: 'string', format: 'email', example: 'jane@example.com' },
          phone:      { type: 'string', minLength: 7, maxLength: 20, example: '+12025551234' },
          password:   { type: 'string', minLength: 10, maxLength: 128, description: 'Min 10 characters' },
        },
      },
      response: {
        201: {
          description: 'Account created',
          type: 'object',
          properties: {
            user: { '$ref': 'User#' },
          },
        },
        409: { description: 'Email already registered', '$ref': 'Error#' },
        422: { description: 'Validation error',        '$ref': 'Error#' },
      },
    },
  }, async (req, reply) => {
    const body = z.object({
      first_name: z.string().min(1).max(100),
      last_name:  z.string().min(1).max(100),
      email:      z.string().email(),
      phone:      z.string().min(7).max(20),
      password:   z.string().min(10).max(128),
    }).parse(req.body);
    const result = await authService.register(body);
    return reply.status(201).send(result);
  });

  // ── POST /v1/auth/login ───────────────────────────────────────────────────
  fastify.post('/login', {
    config: { rateLimit: { max: 10, timeWindow: 900000 } },
    schema: {
      ...S,
      summary:     'Authenticate user',
      description: 'Returns a short-lived access token and sets an HttpOnly refresh-token cookie.',
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email:    { type: 'string', format: 'email', example: 'jane@example.com' },
          password: { type: 'string', example: 'mypassword123' },
        },
      },
      response: {
        200: {
          description: 'Login successful',
          type: 'object',
          properties: {
            access_token: { type: 'string' },
            token_type:   { type: 'string' },
            expires_in:   { type: 'integer' },
            user: {
              type: 'object',
              properties: {
                id:                  { type: 'string' },
                email:               { type: 'string' },
                first_name:          { type: 'string' },
                last_name:           { type: 'string' },
                role:                { type: 'string' },
                practitioner_id:     { type: 'string', nullable: true },
                practitioner_status: { type: 'string', nullable: true },
                rejection_reason:    { type: 'string', nullable: true },
              },
            },
          },
        },
        401: { description: 'Invalid credentials', '$ref': 'Error#' },
      },
    },
  }, async (req, reply) => {
    const { email, password } = z.object({
      email:    z.string().email(),
      password: z.string().min(1),
    }).parse(req.body);
    const result = await authService.login(email, password);
    reply.setCookie('refresh_token', result.refresh_token, {
      httpOnly: true,
      secure:   env.NODE_ENV === 'production',
      sameSite: 'strict',
      path:     '/v1/auth/refresh',
      maxAge:   env.JWT_REFRESH_EXPIRES_IN,
    });
    return reply.send({ access_token: result.access_token, token_type: 'bearer', expires_in: env.JWT_ACCESS_EXPIRES_IN, user: result.user });
  });

  // ── POST /v1/auth/refresh ─────────────────────────────────────────────────
  fastify.post('/refresh', {
    schema: {
      ...S,
      summary:     'Refresh access token',
      description: 'Exchanges the HttpOnly refresh_token cookie for a new access token. Old refresh token is rotated.',
      response: {
        200: {
          description: 'New access token',
          type: 'object',
          properties: {
            access_token: { type: 'string' },
            expires_in:   { type: 'integer' },
            user: {
              type: 'object',
              properties: {
                id:                  { type: 'string' },
                email:               { type: 'string' },
                first_name:          { type: 'string' },
                last_name:           { type: 'string' },
                role:                { type: 'string' },
                practitioner_id:     { type: 'string', nullable: true },
                practitioner_status: { type: 'string', nullable: true },
                rejection_reason:    { type: 'string', nullable: true },
              },
            },
          },
        },
        401: { description: 'Invalid or expired refresh token', '$ref': 'Error#' },
      },
    },
  }, async (req, reply) => {
    const refreshToken = (req.cookies as Record<string, string>)['refresh_token'];
    if (!refreshToken) return reply.status(401).send({ code: 'UNAUTHORIZED', message: 'No refresh token' });
    const result = await authService.refreshToken(refreshToken);
    reply.setCookie('refresh_token', result.refresh_token, {
      httpOnly: true,
      secure:   env.NODE_ENV === 'production',
      sameSite: 'strict',
      path:     '/v1/auth/refresh',
      maxAge:   env.JWT_REFRESH_EXPIRES_IN,
    });
    return reply.send({ access_token: result.access_token, expires_in: env.JWT_ACCESS_EXPIRES_IN, user: result.user });
  });

  // ── POST /v1/auth/logout ──────────────────────────────────────────────────
  fastify.post('/logout', {
    // No preHandler auth required — we just clear the cookie.
    // Optionally we try to blacklist the access token if it is present & valid.
    schema: {
      tags: ['Auth'],
      summary:     'Logout',
      description: 'Clears the refresh token cookie and optionally revokes the access token. Does not require a valid Bearer token so it always succeeds.',
      response: {
        204: { description: 'Logged out', type: 'null' },
      },
    },
  }, async (req, reply) => {
    // Best-effort: revoke the refresh token in Redis so it can't be reused
    const refreshToken = (req.cookies as Record<string, string>)['refresh_token'];
    if (refreshToken) {
      try {
        await authService.revokeRefreshToken(refreshToken);
      } catch { /* ignore */ }
    }

    // Best-effort: revoke the access token JTI if a valid Bearer is provided
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        await authService.revokeAccessTokenFromHeader(authHeader.slice(7));
      } catch { /* ignore — token may be expired, that's fine */ }
    }

    // Always clear the cookie — this is the critical step
    reply.clearCookie('refresh_token', { path: '/v1/auth/refresh' });
    return reply.status(204).send();
  });

  // ── POST /v1/auth/forgot-password ─────────────────────────────────────────
  fastify.post('/forgot-password', {
    config: { rateLimit: { max: 5, timeWindow: 900000 } },
    schema: {
      ...S,
      summary:     'Request password reset email',
      description: 'Always returns 204 to prevent email enumeration. Reset link expires in 1 hour.',
      body: {
        type: 'object',
        required: ['email'],
        properties: { email: { type: 'string', format: 'email' } },
      },
      response: {
        204: { description: 'Reset email sent (regardless of whether account exists)', type: 'null' },
      },
    },
  }, async (req, reply) => {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    await authService.forgotPassword(email).catch(() => undefined);
    return reply.status(204).send();
  });

  // ── POST /v1/auth/reset-password ─────────────────────────────────────────
  fastify.post('/reset-password', {
    config: { rateLimit: { max: 5, timeWindow: 900000 } },
    schema: {
      ...S,
      summary: 'Reset password using email token',
      body: {
        type: 'object',
        required: ['token', 'new_password'],
        properties: {
          token:        { type: 'string' },
          new_password: { type: 'string', minLength: 10, maxLength: 128 },
        },
      },
      response: {
        204: { description: 'Password updated', type: 'null' },
        400: { description: 'Invalid or expired token', '$ref': 'Error#' },
      },
    },
  }, async (req, reply) => {
    const { token, new_password } = z.object({
      token: z.string(), new_password: z.string().min(10).max(128),
    }).parse(req.body);
    await authService.resetPassword(token, new_password);
    return reply.status(204).send();
  });

  // ── POST /v1/auth/change-password ─────────────────────────────────────────
  fastify.post('/change-password', {
    preHandler: [fastify.authenticate],
    schema: {
      tags:     ['Auth'],
      summary:  'Change password (authenticated)',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['current_password', 'new_password'],
        properties: {
          current_password: { type: 'string' },
          new_password:     { type: 'string', minLength: 10, maxLength: 128 },
        },
      },
      response: {
        204: { description: 'Password changed', type: 'null' },
        422: { description: 'Current password incorrect', '$ref': 'Error#' },
      },
    },
  }, async (req, reply) => {
    const { current_password, new_password } = z.object({
      current_password: z.string(), new_password: z.string().min(10).max(128),
    }).parse(req.body);
    await authService.changePassword(req.currentUser.sub, current_password, new_password);
    return reply.status(204).send();
  });
};

export default authRoutes;
