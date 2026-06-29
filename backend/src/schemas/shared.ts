/**
 * Shared JSON Schema definitions registered globally on the Fastify instance.
 * Reference them in route schemas as $ref: '#/definitions/SchemaName'
 */

// ─── Reusable field schemas ───────────────────────────────────────────────────

export const uuidSchema = { type: 'string', format: 'uuid' } as const;
export const isoDateSchema = { type: 'string', format: 'date-time' } as const;
export const emailSchema = { type: 'string', format: 'email' } as const;

// ─── Pagination ───────────────────────────────────────────────────────────────

export const PaginationSchema = {
  type: 'object',
  properties: {
    cursor:   { type: 'string', nullable: true, description: 'Cursor for the next page (base64url)' },
    has_next: { type: 'boolean' },
    limit:    { type: 'integer', minimum: 1, maximum: 50 },
  },
  required: ['has_next', 'limit'],
} as const;

// ─── Error ────────────────────────────────────────────────────────────────────

export const ErrorSchema = {
  type: 'object',
  properties: {
    code:    { type: 'string', example: 'NOT_FOUND' },
    message: { type: 'string', example: 'Resource not found' },
    details: { type: 'object', nullable: true },
  },
  required: ['code', 'message'],
} as const;

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const UserSchema = {
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
    created_at:    { type: 'string', format: 'date-time' },
  },
  required: ['id', 'email', 'role', 'is_active'],
} as const;

export const TokenResponseSchema = {
  type: 'object',
  properties: {
    access_token: { type: 'string', description: 'JWT bearer token (15 min TTL)' },
    token_type:   { type: 'string', example: 'bearer' },
    expires_in:   { type: 'integer', example: 900, description: 'Seconds until token expiry' },
  },
  required: ['access_token', 'token_type', 'expires_in'],
} as const;

// ─── Practitioner ─────────────────────────────────────────────────────────────

export const PractitionerStatusEnum = {
  type: 'string',
  enum: ['PENDING_PROFILE','PROFILE_COMPLETED','PENDING_APPROVAL','ACTIVE','REJECTED','SUSPENDED'],
} as const;

export const SpecialtyEnum = {
  type: 'string',
  enum: ['Back Pain','Neck Pain','Sports Injury','Pregnancy','Pediatrics',
         'Rehabilitation','Wellness Care','Other'],
} as const;

export const PractitionerProfileSchema = {
  type: 'object',
  properties: {
    practitioner_id:   { type: 'string', format: 'uuid' },
    status:            PractitionerStatusEnum,
    practice_name:     { type: 'string' },
    practice_phone:    { type: 'string', nullable: true },
    practice_email:    { type: 'string', format: 'email', nullable: true },
    website:           { type: 'string', nullable: true },
    street_address:    { type: 'string' },
    city:              { type: 'string' },
    state:             { type: 'string', minLength: 2, maxLength: 2 },
    zip_code:          { type: 'string' },
    bio:               { type: 'string', nullable: true },
    years_experience:  { type: 'integer', nullable: true, minimum: 0 },
    languages_spoken:  { type: 'array', items: { type: 'string' } },
    service_radius_km: { type: 'number', minimum: 1 },
    areas_served:      { type: 'array', items: { type: 'string' } },
    specialties:       { type: 'array', items: SpecialtyEnum },
    quality_score:     { type: 'number', minimum: 0, maximum: 100 },
    updated_at:        { type: 'string', format: 'date-time' },
  },
} as const;

export const DocumentSchema = {
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
  required: ['id', 'document_type', 'original_filename'],
} as const;

// ─── Referral ─────────────────────────────────────────────────────────────────

export const ReferralStatusEnum = {
  type: 'string',
  enum: ['NEW','OPEN','CLAIMED','PATIENT_CONTACTED',
         'APPOINTMENT_BOOKED','TREATMENT_IN_PROGRESS','COMPLETED','CLOSED'],
} as const;

export const UrgencyLevelEnum = {
  type: 'string',
  enum: ['LOW', 'NORMAL', 'HIGH', 'URGENT'],
} as const;

export const ReferralSummarySchema = {
  type: 'object',
  description: 'Referral card shown in marketplace (no patient PII)',
  properties: {
    id:                { type: 'string', format: 'uuid' },
    referral_number:   { type: 'string', example: 'cr_001' },
    status:            ReferralStatusEnum,
    primary_complaint: { type: 'string' },
    symptoms:          { type: 'string', nullable: true },
    urgency_level:     UrgencyLevelEnum,
    city:              { type: 'string', description: 'Patient city (not full address)' },
    state:             { type: 'string' },
    distance_km:       { type: 'number', nullable: true, description: 'Distance from practitioner location' },
    priority_score:    { type: 'number', description: 'Matching engine priority score' },
    published_at:      { type: 'string', format: 'date-time', nullable: true },
    expires_at:        { type: 'string', format: 'date-time', nullable: true },
    created_at:        { type: 'string', format: 'date-time' },
    viewed_at:         { type: 'string', format: 'date-time', nullable: true },
    patient_problems:  { type: 'array', items: { type: 'string' } },
    claimed_by_name:   { type: 'string', nullable: true },
  },
  required: ['id', 'referral_number', 'status', 'primary_complaint', 'urgency_level', 'patient_problems'],
} as const;

export const ReferralDetailSchema = {
  type: 'object',
  description: 'Full referral detail (still no PII — not yet claimed)',
  allOf: [
    ReferralSummarySchema,
    {
      type: 'object',
      properties: {
        duration_of_problem: { type: 'string', nullable: true },
        preferred_contact:   { type: 'string', enum: ['phone','email','either'], nullable: true },
        additional_notes:    { type: 'string', nullable: true },
        zip_code:            { type: 'string', description: 'Zip code only — no street' },
      },
    },
  ],
} as const;

export const PatientSchema = {
  type: 'object',
  description: 'Patient PII — gated behind claim',
  properties: {
    first_name:     { type: 'string' },
    last_name:      { type: 'string' },
    phone:          { type: 'string' },
    email:          { type: 'string', format: 'email', nullable: true },
    street_address: { type: 'string' },
    city:           { type: 'string' },
    state:          { type: 'string' },
    zip_code:       { type: 'string' },
  },
  required: ['first_name', 'last_name', 'phone'],
} as const;

export const ClaimedReferralSchema = {
  type: 'object',
  description: 'Referral after successful claim — includes patient PII',
  properties: {
    referral_id:     { type: 'string', format: 'uuid' },
    referral_number: { type: 'string' },
    status:          ReferralStatusEnum,
    primary_complaint: { type: 'string' },
    symptoms:          { type: 'string', nullable: true },
    duration_of_problem: { type: 'string', nullable: true },
    urgency_level:     UrgencyLevelEnum,
    preferred_contact:   { type: 'string', enum: ['phone','email','either'], nullable: true },
    additional_notes:    { type: 'string', nullable: true },
    claimed_at:      { type: 'string', format: 'date-time', nullable: true },
    token_balance:   { type: 'integer', description: 'Remaining token balance after deduction', nullable: true },
    patient:         PatientSchema,
    patient_problems: { type: 'array', items: { type: 'string' } },
  },
  required: ['referral_id', 'status', 'patient', 'token_balance', 'patient_problems'],
} as const;

// ─── Wallet & Tokens ──────────────────────────────────────────────────────────

export const TokenWalletSchema = {
  type: 'object',
  properties: {
    id:              { type: 'string', format: 'uuid' },
    balance:         { type: 'integer', minimum: 0, description: 'Current spendable token balance' },
    total_purchased: { type: 'integer' },
    total_allocated: { type: 'integer', description: 'Tokens received via subscription renewals' },
    total_used:      { type: 'integer', description: 'Tokens spent on referral claims' },
    total_expired:   { type: 'integer' },
    updated_at:      { type: 'string', format: 'date-time' },
  },
  required: ['balance'],
} as const;

export const TokenTransactionSchema = {
  type: 'object',
  properties: {
    id:               { type: 'string', format: 'uuid' },
    transaction_type: { type: 'string', enum: ['PURCHASE','MONTHLY_ALLOCATION','REFERRAL_CLAIM','REFUND','ADJUSTMENT','EXPIRY'] },
    amount:           { type: 'integer', description: 'Positive = credit, negative = debit' },
    balance_after:    { type: 'integer', minimum: 0 },
    referral_id:      { type: 'string', format: 'uuid', nullable: true },
    notes:            { type: 'string', nullable: true },
    created_at:       { type: 'string', format: 'date-time' },
    first_name:       { type: 'string', nullable: true },
    last_name:        { type: 'string', nullable: true },
    practice_name:    { type: 'string', nullable: true },
    email:            { type: 'string', format: 'email', nullable: true },
  },
  required: ['id', 'transaction_type', 'amount', 'balance_after'],
} as const;

export const TokenPackageSchema = {
  type: 'object',
  properties: {
    id:          { type: 'string', format: 'uuid' },
    token_count: { type: 'integer', minimum: 1 },
    price_cents: { type: 'integer', minimum: 1, description: 'Price in USD cents' },
    sort_order:  { type: 'integer' },
  },
  required: ['id', 'token_count', 'price_cents'],
} as const;

// ─── Subscriptions ────────────────────────────────────────────────────────────

export const SubscriptionPlanSchema = {
  type: 'object',
  properties: {
    id:                  { type: 'string', format: 'uuid' },
    name:                { type: 'string', example: 'Professional' },
    description:         { type: 'string', nullable: true },
    monthly_price_cents: { type: 'integer', minimum: 0, description: 'Monthly price in USD cents' },
    included_tokens:     { type: 'integer', minimum: 0, description: 'Tokens allocated on each renewal' },
    sort_order:          { type: 'integer' },
  },
  required: ['id', 'name', 'monthly_price_cents', 'included_tokens'],
} as const;

export const SubscriptionSchema = {
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
  required: ['status'],
} as const;

// ─── Feedback ─────────────────────────────────────────────────────────────────

export const FeedbackSchema = {
  type: 'object',
  properties: {
    rating_communication:   { type: 'integer', minimum: 1, maximum: 5 },
    rating_professionalism: { type: 'integer', minimum: 1, maximum: 5 },
    rating_service:         { type: 'integer', minimum: 1, maximum: 5 },
    rating_overall:         { type: 'integer', minimum: 1, maximum: 5 },
    comments:               { type: 'string', maxLength: 1000, nullable: true },
    submitted_at:           { type: 'string', format: 'date-time' },
  },
  required: ['rating_communication','rating_professionalism','rating_service','rating_overall'],
} as const;

// ─── Notification ─────────────────────────────────────────────────────────────

export const NotificationSchema = {
  type: 'object',
  properties: {
    id:         { type: 'string', format: 'uuid' },
    type:       { type: 'string' },
    title:      { type: 'string' },
    body:       { type: 'string' },
    is_read:    { type: 'boolean' },
    created_at: { type: 'string', format: 'date-time' },
  },
  required: ['id', 'type', 'title', 'body', 'is_read'],
} as const;

// ─── Common query params ───────────────────────────────────────────────────────

export const CursorQuerySchema = {
  type: 'object',
  properties: {
    cursor: { type: 'string', description: 'Pagination cursor from previous response' },
    limit:  { type: 'integer', minimum: 1, maximum: 50, default: 20 },
  },
} as const;

export const UuidParamSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
  },
  required: ['id'],
} as const;

export const ReferralIdParamSchema = {
  type: 'object',
  properties: {
    referralId: { type: 'string', format: 'uuid' },
  },
  required: ['referralId'],
} as const;

// ─── Common response wrappers ─────────────────────────────────────────────────

export function listResponse<T>(itemSchema: T) {
  return {
    type: 'object',
    properties: {
      data:       { type: 'array', items: itemSchema },
      pagination: PaginationSchema,
    },
    required: ['data', 'pagination'],
  };
}

export function messageResponse(example = 'Operation successful') {
  return {
    type: 'object',
    properties: {
      message: { type: 'string', example },
    },
    required: ['message'],
  };
}
