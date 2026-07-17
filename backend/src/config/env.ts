import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  APP_VERSION: z.string().default('1.0.0'),
  APP_URL: z.string().url().default('http://localhost:3000'),

  // Database
  DATABASE_URL: z.string().min(1),
  DATABASE_POOL_MIN: z.coerce.number().default(2),
  DATABASE_POOL_MAX: z.coerce.number().default(20),

  // Redis
  REDIS_URL: z.string().min(1).default('redis://localhost:6379/0'),
  REDIS_QUEUE_URL: z.string().optional(),

  // JWT
  JWT_SECRET: z.string().min(1).default('dev-secret-change-in-production-min-32-chars'),
  JWT_ACCESS_EXPIRES_IN: z.coerce.number().default(900),
  JWT_REFRESH_EXPIRES_IN: z.coerce.number().default(604800),
  COOKIE_SAME_SITE: z.enum(['strict', 'lax', 'none']).default('lax'),

  // AWS / S3
  AWS_REGION: z.string().default('us-east-1'),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  S3_BUCKET_DOCUMENTS: z.string().default('chiroreferral-documents-dev'),
  S3_ENDPOINT: z.string().optional(),

  // Cloudinary
  CLOUDINARY_CLOUD_NAME: z.string().default('zigvspcx'),
  CLOUDINARY_API_KEY: z.string().default('123456789012345'),
  CLOUDINARY_API_SECRET: z.string().default('devsecret-xxxxxxxxxxxxxxx'),

  // Stripe
  STRIPE_SECRET_KEY: z.string().default('sk_test_dev'),
  STRIPE_WEBHOOK_SECRET: z.string().default('whsec_dev'),

  // SendGrid
  SENDGRID_API_KEY: z.string().default('SG.dev'),
  SENDGRID_FROM_EMAIL: z.string().default('no-reply@chiroreferral.com'),
  SENDGRID_FROM_NAME: z.string().default('ChiroReferral'),
  // Admin password reset
  ADMIN_RESET_EMAIL_FROM: z.string().default('admin@chiroreferral.com'),
  ADMIN_RESET_EMAIL_SUBJECT: z.string().default('Admin Password Reset'),
  ADMIN_RESET_TOKEN_EXPIRY: z.coerce.number().default(3600),
  // SMTP
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z.preprocess((val) => val === 'true' || val === '1' || val === true, z.boolean()).default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM_EMAIL: z.string().default('no-reply@chiroreferral.com'),
  SMTP_FROM_NAME: z.string().default('ChiroReferral'),

  // Google Maps
  GOOGLE_MAPS_API_KEY: z.string().default('dev-maps-key'),

  // Rate limiting
  RATE_LIMIT_MAX: z.coerce.number().default(300),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),

  // Feedback token
  FEEDBACK_TOKEN_SECRET: z.string().default('dev-feedback-secret-change-in-production'),
});

function loadEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Invalid environment variables:');
    console.error(result.error.flatten().fieldErrors);
    process.exit(1);
  }
  return result.data;
}

export const env = loadEnv();
export type Env = typeof env;
