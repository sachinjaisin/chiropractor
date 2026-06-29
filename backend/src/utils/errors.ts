export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(422, 'VALIDATION_ERROR', message, details);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(404, 'NOT_FOUND', `${resource} not found`);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(401, 'UNAUTHORIZED', message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(403, 'FORBIDDEN', message);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, 'CONFLICT', message);
  }
}

export class PaymentRequiredError extends AppError {
  constructor(message: string) {
    super(402, 'PAYMENT_REQUIRED', message);
  }
}

export class LockedError extends AppError {
  constructor(message: string) {
    super(423, 'LOCKED', message);
  }
}

export class RateLimitError extends AppError {
  constructor() {
    super(429, 'RATE_LIMITED', 'Too many requests');
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
