import pino from 'pino';

const isDev = process.env['NODE_ENV'] === 'development';

export const logger = pino({
  level: process.env['LOG_LEVEL'] ?? 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  base: {
    service: 'chiroreferral-api',
    version: process.env['APP_VERSION'] ?? '1.0.0',
    env: process.env['NODE_ENV'] ?? 'development',
  },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.password_hash',
      '*.token',
      '*.patient.phone',
      '*.patient.email',
      '*.patient.street_address',
    ],
    censor: '[REDACTED]',
  },
  transport: isDev
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } }
    : undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
});
