import { FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { env } from '../config/env';

// Shared schemas — registered with addSchema() so routes can reference them as 'Name#'
// @fastify/swagger auto-includes addSchema-registered schemas in components/schemas
const SCHEMAS = [
  {
    $id: 'Error',
    type: 'object',
    properties: {
      code:    { type: 'string', example: 'NOT_FOUND' },
      message: { type: 'string', example: 'Resource not found' },
      details: { type: 'object', nullable: true },
    },
    required: ['code', 'message'],
  },
  {
    $id: 'Pagination',
    type: 'object',
    properties: {
      cursor:   { type: 'string', nullable: true },
      has_next: { type: 'boolean' },
      limit:    { type: 'integer' },
    },
  },
  {
    $id: 'User',
    type: 'object',
    properties: {
      id:            { type: 'string', format: 'uuid' },
      email:         { type: 'string', format: 'email' },
      first_name:    { type: 'string' },
      last_name:     { type: 'string' },
      phone:         { type: 'string', nullable: true },
      role:          { type: 'string', enum: ['chiropractor', 'admin'] },
      is_active:     { type: 'boolean' },
      last_login_at: { type: 'string', format: 'date-time', nullable: true },
      profile_pic_url: { type: 'string', nullable: true },
      profile_pic_key: { type: 'string', nullable: true },
      created_at:    { type: 'string', format: 'date-time' },
    },
  },
  {
    $id: 'TokenResponse',
    type: 'object',
    properties: {
      access_token: { type: 'string' },
      token_type:   { type: 'string', example: 'bearer' },
      expires_in:   { type: 'integer', example: 900 },
    },
  },
  {
    $id: 'PractitionerProfile',
    type: 'object',
    properties: {
      id:                { type: 'string', format: 'uuid' },
      practitioner_id:   { type: 'string', format: 'uuid' },
      email:             { type: 'string', format: 'email' },
      first_name:        { type: 'string' },
      last_name:         { type: 'string' },
      phone:             { type: 'string', nullable: true },
      status:            { type: 'string', enum: ['PENDING_PROFILE','PROFILE_COMPLETED','PENDING_APPROVAL','ACTIVE','REJECTED','SUSPENDED'] },
      practice_name:     { type: 'string', nullable: true },
      practice_phone:    { type: 'string', nullable: true },
      practice_email:    { type: 'string', nullable: true },
      website:           { type: 'string', nullable: true },
      street_address:    { type: 'string', nullable: true },
      city:              { type: 'string', nullable: true },
      state:             { type: 'string', nullable: true },
      zip_code:          { type: 'string', nullable: true },
      bio:               { type: 'string', nullable: true },
      years_experience:  { type: 'integer', nullable: true },
      languages_spoken:  { type: 'array', items: { type: 'string' } },
      service_radius_km: { type: 'number', nullable: true },
      areas_served:      { type: 'array', items: { type: 'string' } },
      specialties:       { type: 'array', items: { type: 'string' } },
      quality_score:     { type: 'number', nullable: true },
      is_flagged:        { type: 'boolean', nullable: true },
      profile_pic_url:   { type: 'string', nullable: true },
      profile_pic_key:   { type: 'string', nullable: true },
      created_at:        { type: 'string', format: 'date-time' },
      updated_at:        { type: 'string', format: 'date-time' },
    },
  },
  {
    $id: 'Document',
    type: 'object',
    properties: {
      id:                { type: 'string', format: 'uuid' },
      document_type:     { type: 'string', enum: ['LICENSE','INSURANCE','CERTIFICATION','TRAINING','SUPPORTING'] },
      original_filename: { type: 'string' },
      mime_type:         { type: 'string' },
      file_size_bytes:   { type: 'integer' },
      verified_at:       { type: 'string', format: 'date-time', nullable: true },
      expires_at:        { type: 'string', format: 'date', nullable: true },
      created_at:        { type: 'string', format: 'date-time' },
    },
  },
  {
    $id: 'ReferralSummary',
    type: 'object',
    description: 'Referral card — no patient PII',
    properties: {
      id:                { type: 'string', format: 'uuid' },
      referral_number:   { type: 'string', example: 'cr_001' },
      status:            { type: 'string', enum: ['NEW','OPEN','CLAIMED','PATIENT_CONTACTED','APPOINTMENT_BOOKED','TREATMENT_IN_PROGRESS','COMPLETED','CLOSED'] },
      primary_complaint: { type: 'string' },
      symptoms:          { type: 'string', nullable: true },
      urgency_level:     { type: 'string', enum: ['LOW','NORMAL','HIGH','URGENT'] },
      city:              { type: 'string' },
      state:             { type: 'string' },
      distance_km:       { type: 'number', nullable: true },
      priority_score:    { type: 'number' },
      published_at:      { type: 'string', format: 'date-time', nullable: true },
      expires_at:        { type: 'string', format: 'date-time', nullable: true },
      created_at:        { type: 'string', format: 'date-time' },
      viewed_at:         { type: 'string', format: 'date-time', nullable: true },
      patient_problems:  { type: 'array', items: { type: 'string' } },
      claimed_by_name:   { type: 'string', nullable: true },
    },
  },
  {
    $id: 'Patient',
    type: 'object',
    description: 'Patient PII — gated behind claim',
    properties: {
      first_name:     { type: 'string' },
      last_name:      { type: 'string' },
      phone:          { type: 'string' },
      email:          { type: 'string', nullable: true },
      street_address: { type: 'string' },
      city:           { type: 'string' },
      state:          { type: 'string' },
      zip_code:       { type: 'string' },
    },
    required: ['first_name', 'last_name', 'phone', 'street_address', 'city', 'state', 'zip_code'],
  },
  {
    $id: 'ReferralDetail',
    allOf: [
      { '$ref': 'ReferralSummary#' },
      {
        type: 'object',
        properties: {
          duration_of_problem: { type: 'string', nullable: true },
          preferred_contact:   { type: 'string', enum: ['phone','email','either'], nullable: true },
          additional_notes:    { type: 'string', nullable: true },
          zip_code:            { type: 'string' },
        },
      },
    ],
  },
  {
    $id: 'ClaimedReferral',
    type: 'object',
    properties: {
      referral_id:     { type: 'string', format: 'uuid' },
      referral_number: { type: 'string' },
      status:          { type: 'string', enum: ['NEW','OPEN','CLAIMED','PATIENT_CONTACTED','APPOINTMENT_BOOKED','TREATMENT_IN_PROGRESS','COMPLETED','CLOSED'] },
      primary_complaint: { type: 'string' },
      symptoms:          { type: 'string', nullable: true },
      duration_of_problem: { type: 'string', nullable: true },
      urgency_level:     { type: 'string', enum: ['LOW','NORMAL','HIGH','URGENT'] },
      preferred_contact:   { type: 'string', enum: ['phone','email','either'], nullable: true },
      additional_notes:    { type: 'string', nullable: true },
      claimed_at:      { type: 'string', format: 'date-time', nullable: true },
      token_balance:   { type: 'integer', description: 'Balance after deduction', nullable: true },
      patient:         { '$ref': 'Patient#' },
      patient_problems: { type: 'array', items: { type: 'string' } },
    },
  },
  {
    $id: 'TokenWallet',
    type: 'object',
    properties: {
      id:              { type: 'string', format: 'uuid' },
      balance:         { type: 'integer', minimum: 0 },
      total_purchased: { type: 'integer' },
      total_allocated: { type: 'integer' },
      total_used:      { type: 'integer' },
      total_expired:   { type: 'integer' },
      updated_at:      { type: 'string', format: 'date-time' },
    },
  },
  {
    $id: 'TokenTransaction',
    type: 'object',
    properties: {
      id:               { type: 'string', format: 'uuid' },
      transaction_type: { type: 'string', enum: ['PURCHASE','MONTHLY_ALLOCATION','REFERRAL_CLAIM','REFUND','ADJUSTMENT','EXPIRY'] },
      amount:           { type: 'integer' },
      balance_after:    { type: 'integer' },
      referral_id:      { type: 'string', format: 'uuid', nullable: true },
      notes:            { type: 'string', nullable: true },
      created_at:       { type: 'string', format: 'date-time' },
      first_name:       { type: 'string', nullable: true },
      last_name:        { type: 'string', nullable: true },
      practice_name:    { type: 'string', nullable: true },
      email:            { type: 'string', format: 'email', nullable: true },
    },
  },
  {
    $id: 'TokenPackage',
    type: 'object',
    properties: {
      id:          { type: 'string', format: 'uuid' },
      token_count: { type: 'integer' },
      price_cents: { type: 'integer' },
      sort_order:  { type: 'integer' },
    },
  },
  {
    $id: 'SubscriptionPlan',
    type: 'object',
    properties: {
      id:                  { type: 'string', format: 'uuid' },
      name:                { type: 'string' },
      description:         { type: 'string', nullable: true },
      monthly_price_cents: { type: 'integer' },
      included_tokens:     { type: 'integer' },
      sort_order:          { type: 'integer' },
    },
  },
  {
    $id: 'Subscription',
    type: 'object',
    properties: {
      id:                   { type: 'string', format: 'uuid' },
      status:               { type: 'string', enum: ['ACTIVE','PAST_DUE','CANCELLED','EXPIRED','NONE'] },
      plan_name:            { type: 'string' },
      monthly_price_cents:  { type: 'integer' },
      included_tokens:      { type: 'integer' },
      current_period_start: { type: 'string', format: 'date-time' },
      current_period_end:   { type: 'string', format: 'date-time' },
      cancelled_at:         { type: 'string', format: 'date-time', nullable: true },
    },
  },
  {
    $id: 'Feedback',
    type: 'object',
    properties: {
      rating_communication:   { type: 'integer', minimum: 1, maximum: 5 },
      rating_professionalism: { type: 'integer', minimum: 1, maximum: 5 },
      rating_service:         { type: 'integer', minimum: 1, maximum: 5 },
      rating_overall:         { type: 'integer', minimum: 1, maximum: 5 },
      comments:               { type: 'string', nullable: true },
    },
  },
  {
    $id: 'Notification',
    type: 'object',
    properties: {
      id:         { type: 'string', format: 'uuid' },
      type:       { type: 'string' },
      title:      { type: 'string' },
      body:       { type: 'string' },
      is_read:    { type: 'boolean' },
      created_at: { type: 'string', format: 'date-time' },
    },
  },
  {
    $id: 'QualityScore',
    type: 'object',
    properties: {
      composite_score:     { type: 'number', description: '0–100 composite quality score' },
      claim_rate:          { type: 'number', description: 'Proportion of visible referrals claimed' },
      completion_rate:     { type: 'number', description: 'Proportion of claimed referrals completed' },
      avg_response_time_s: { type: 'integer', nullable: true, description: 'Average seconds to claim after publish' },
      avg_patient_rating:  { type: 'number', nullable: true, description: '1–5 average patient rating' },
      score_date:          { type: 'string', format: 'date' },
    },
  },
  {
    $id: 'AuditLog',
    type: 'object',
    properties: {
      id:          { type: 'string', format: 'uuid' },
      user_id:     { type: 'string', format: 'uuid', nullable: true },
      action:      { type: 'string' },
      entity_type: { type: 'string' },
      entity_id:   { type: 'string', format: 'uuid', nullable: true },
      ip_address:  { type: 'string', nullable: true },
      occurred_at: { type: 'string', format: 'date-time' },
    },
  },
] as const;

export async function registerSwagger(fastify: FastifyInstance): Promise<void> {
  // Register all shared schemas with Fastify's AJV so routes can reference as 'Name#'
  for (const schema of SCHEMAS) {
    fastify.addSchema(schema);
  }

  await fastify.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title:       'ChiroReferral Network API',
        description: `
## Chiropractor Referral Network

A referral marketplace connecting patients with chiropractors.

### How it works
1. Patients submit referral requests via the **public intake form**
2. The **matching engine** finds eligible practitioners by geographic radius
3. Practitioners see available referrals in their **marketplace feed** (no patient PII)
4. The **first practitioner to claim** gets exclusive ownership — 1 lead token is deducted
5. Patient contact details are unlocked only for the claiming practitioner
6. Practitioners progress the referral through status stages until completion
7. Patients are invited to leave **feedback**, which drives the quality score

### Authentication
All authenticated endpoints require a **Bearer JWT** in the \`Authorization\` header.
Obtain tokens via \`POST /v1/auth/login\`.

Refresh tokens are delivered as \`HttpOnly\` cookies and exchanged at \`POST /v1/auth/refresh\`.
        `.trim(),
        version:     '1.0.0',
        contact: {
          name:  'ChiroReferral Support',
          email: 'support@chiroreferral.com',
        },
        license: {
          name: 'Proprietary',
        },
      },
      servers: [
        {
          url:         env.APP_URL,
          description: env.NODE_ENV === 'production' ? 'Production' : 'Development',
        },
        {
          url:         'https://api.chiroreferral.com',
          description: 'Production',
        },
        {
          url:         'https://staging-api.chiroreferral.com',
          description: 'Staging',
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type:         'http',
            scheme:       'bearer',
            bearerFormat: 'JWT',
            description:  'Access token obtained from POST /v1/auth/login (15 min TTL)',
          },
          feedbackToken: {
            type:        'apiKey',
            in:          'query',
            name:        'token',
            description: 'HMAC token embedded in patient feedback email link',
          },
        },
      },
      tags: [
        { name: 'Auth',          description: 'Authentication and token management' },
        { name: 'Practitioners', description: 'Practitioner profile, documents, notifications, performance' },
        { name: 'Referrals',     description: 'Referral marketplace — browse, claim, progress' },
        { name: 'Wallet',        description: 'Lead token wallet, packages, and transaction history' },
        { name: 'Subscriptions', description: 'Subscription plan management and billing' },
        { name: 'Feedback',      description: 'Patient feedback submission (public, token-authenticated)' },
        { name: 'Public',        description: 'Public endpoints — patient referral intake, plan listing' },
        { name: 'Admin',         description: 'Admin operations — practitioners, referrals, settings, analytics' },
        { name: 'Webhooks',      description: 'Stripe event receiver' },
        { name: 'Ops',           description: 'Health and readiness probes, Prometheus metrics' },
        { name: 'SSE',           description: 'Server-Sent Events for live referral feed' },
      ],
    },
    hideUntagged: false,
  });

  await fastify.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion:    'list',
      deepLinking:     true,
      persistAuthorization: true,
      displayRequestDuration: true,
      filter:          true,
      syntaxHighlight: { theme: 'monokai' },
    },
    uiHooks: {
      onRequest: (_req, _reply, next) => next(),
      preHandler: (_req, _reply, next) => next(),
    },
    staticCSP:        true,
    transformStaticCSP: (header) => header,
    transformSpecification: (swaggerObject) => swaggerObject,
    transformSpecificationClone: true,
    theme: {
      title: 'ChiroReferral API Docs',
    },
    logo: {
      type:    'image/png',
      content: Buffer.from('').toString('base64'),
    },
  });
}
