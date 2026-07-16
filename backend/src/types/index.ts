// ─── Core domain types ───────────────────────────────────────────────────────

export type UserRole = 'chiropractor' | 'admin';

export type PractitionerStatus =
  | 'PENDING_PROFILE'
  | 'PROFILE_COMPLETED'
  | 'PENDING_APPROVAL'
  | 'ACTIVE'
  | 'REJECTED'
  | 'SUSPENDED';

export type ReferralStatus =
  | 'NEW'
  | 'OPEN'
  | 'CLAIMED'
  | 'PATIENT_CONTACTED'
  | 'APPOINTMENT_BOOKED'
  | 'TREATMENT_IN_PROGRESS'
  | 'COMPLETED'
  | 'CLOSED';

export type UrgencyLevel = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
export type PreferredContact = 'phone' | 'email' | 'either';
export type DocumentType = 'LICENSE' | 'INSURANCE' | 'CERTIFICATION' | 'TRAINING' | 'SUPPORTING';

export type SubscriptionStatus = 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED';

export type TokenTransactionType =
  | 'PURCHASE'
  | 'MONTHLY_ALLOCATION'
  | 'REFERRAL_CLAIM'
  | 'REFUND'
  | 'ADJUSTMENT'
  | 'EXPIRY';

export type ReferralActivityEvent =
  | 'CREATED'
  | 'PUBLISHED'
  | 'VIEWED'
  | 'CLAIMED'
  | 'PATIENT_CONTACTED'
  | 'APPOINTMENT_BOOKED'
  | 'TREATMENT_IN_PROGRESS'
  | 'COMPLETED'
  | 'CLOSED'
  | 'REASSIGNED'
  | 'EXPIRED';

// ─── DB row types (snake_case matching PostgreSQL columns) ───────────────────

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  role: UserRole;
  is_active: boolean;
  email_verified: boolean;
  last_login_at: Date | null;
  profile_pic_url: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface PractitionerRow {
  id: string;
  user_id: string;
  status: PractitionerStatus;
  quality_score: number;
  warning_count: number;
  suspended_at: Date | null;
  suspended_by: string | null;
  suspension_note: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface PractitionerProfileRow {
  id: string;
  practitioner_id: string;
  practice_name: string;
  practice_phone: string | null;
  practice_email: string | null;
  website: string | null;
  street_address: string;
  city: string;
  state: string;
  zip_code: string;
  location: unknown | null;
  bio: string | null;
  years_experience: number | null;
  languages_spoken: string[];
  service_radius_km: number;
  areas_served: string[];
  specialties: string[];
  created_at: Date;
  updated_at: Date;
}

export interface PatientRow {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string | null;
  street_address: string;
  city: string;
  state: string;
  zip_code: string;
  location: unknown | null;
  created_at: Date;
  updated_at: Date;
}

/** API response shape — PII fields only, no DB internals */
export interface Patient {
  first_name: string;
  last_name: string;
  phone: string;
  email: string | null;
  street_address: string;
  city: string;
  state: string;
  zip_code: string;
}

export interface ReferralRow {
  id: string;
  referral_number: string;
  patient_id: string;
  status: ReferralStatus;
  primary_complaint: string;
  symptoms: string | null;
  duration_of_problem: string | null;
  urgency_level: UrgencyLevel;
  preferred_contact: PreferredContact | null;
  additional_notes: string | null;
  claimed_by: string | null;
  claimed_at: Date | null;
  expires_at: Date | null;
  published_at: Date | null;
  closed_at: Date | null;
  patient_problems: string[];
  created_at: Date;
  updated_at: Date;
}

export interface ReferralVisibilityRow {
  id: string;
  referral_id: string;
  practitioner_id: string;
  priority_score: number;
  distance_km: number | null;
  revealed_at: Date;
  revoked_at: Date | null;
  viewed_at: Date | null;
}

export interface SubscriptionPlanRow {
  id: string;
  name: string;
  description: string | null;
  monthly_price_cents: number;
  included_tokens: number;
  stripe_price_id: string;
  is_active: boolean;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}

export interface SubscriptionRow {
  id: string;
  practitioner_id: string;
  plan_id: string;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  status: SubscriptionStatus;
  current_period_start: Date;
  current_period_end: Date;
  cancelled_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface TokenWalletRow {
  id: string;
  practitioner_id: string;
  balance: number;
  total_purchased: number;
  total_allocated: number;
  total_used: number;
  total_expired: number;
  created_at: Date;
  updated_at: Date;
}

export interface TokenTransactionRow {
  id: string;
  wallet_id: string;
  practitioner_id: string;
  transaction_type: TokenTransactionType;
  amount: number;
  balance_after: number;
  referral_id: string | null;
  stripe_payment_intent_id: string | null;
  idempotency_key: string | null;
  notes: string | null;
  created_at: Date;
}

export interface FeedbackRow {
  id: string;
  referral_id: string;
  practitioner_id: string;
  patient_id: string;
  rating_communication: number;
  rating_professionalism: number;
  rating_service: number;
  rating_overall: number;
  comments: string | null;
  feedback_token_hash: string | null;
  submitted_at: Date;
}

export interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  is_read: boolean;
  sent_at: Date | null;
  read_at: Date | null;
  created_at: Date;
}

// ─── JWT payload ─────────────────────────────────────────────────────────────

export interface JwtPayload {
  sub: string;             // user_id
  role: UserRole;
  practitioner_id?: string;
  practitioner_status?: PractitionerStatus;
  jti: string;
  iat: number;
  exp: number;
}

// ─── Pagination ───────────────────────────────────────────────────────────────

export interface CursorPayload {
  id: string;
  created_at: string;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    cursor: string | null;
    has_next: boolean;
    limit: number;
  };
}

// ─── Fastify augmentation ────────────────────────────────────────────────────

declare module 'fastify' {
  interface FastifyRequest {
    currentUser: JwtPayload;
  }
}
