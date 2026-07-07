import { FastifyInstance, FastifyError } from 'fastify';
import { ZodError } from 'zod';
import { AppError, isAppError } from '../utils/errors';
import { logger } from '../config/logger';
import { env } from '../config/env';

export function registerErrorHandler(fastify: FastifyInstance): void {
  fastify.setErrorHandler((error: FastifyError | AppError | ZodError | Error, request, reply) => {
    const correlationId = request.headers['x-correlation-id'] as string;

    if (isAppError(error)) {
      if (error.statusCode >= 500) {
        logger.error({ err: error, correlationId }, 'Application error');
      } else {
        logger.warn({ err: error, correlationId }, 'Client error');
      }
      return reply.status(error.statusCode).send({
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      });
    }

    if (error instanceof ZodError) {
      return reply.status(422).send({
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: error.flatten().fieldErrors,
      });
    }

    // Fastify built-in validation errors
    if ((error as FastifyError).validation) {
      return reply.status(422).send({
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: (error as FastifyError).validation,
      });
    }

    // @fastify/rate-limit v9 passes the errorResponseBuilder result as a plain object
    // (no statusCode property), so check both statusCode and code
    if (
      (error as FastifyError).statusCode === 429 ||
      (error as { code?: string }).code === 'RATE_LIMITED'
    ) {
      return reply.status(429).send({
        code: 'RATE_LIMITED',
        message: 'Too many requests. Please slow down.',
      });
    }

    logger.error({ err: error, correlationId, url: request.url }, 'Unhandled error');
    return reply.status(500).send({
      code: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'An unexpected error occurred',
      stack: env.NODE_ENV === 'development' ? (error instanceof Error ? error.stack : undefined) : undefined
    });
  });
}
