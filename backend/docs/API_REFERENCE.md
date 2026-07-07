# ChiroReferral Network — API & Schema Reference

**Version:** 1.0.0  
**Base URL:** `https://api.chiroreferral.com/v1`  
**Interactive Docs:** `http://localhost:3000/docs` (Swagger UI)

---

## Table of Contents

1. [Overview](#1-overview)
2. [Authentication](#2-authentication)
3. [Pagination](#3-pagination)
4. [Error Handling](#4-error-handling)
5. [Rate Limits](#5-rate-limits)
6. [Data Schemas](#6-data-schemas)
7. [Status Enums](#7-status-enums)
8. [API Endpoints](#8-api-endpoints)

---

## 1. Overview

A referral marketplace connecting patients with chiropractors.

**Core flow:**
```
Patient submits referral
  → Geocoding runs (address → coordinates)
  → Matching engine finds eligible practitioners (PostGIS radius query)
  → Referral published to eligible practitioners (no patient PII)
  → First practitioner to claim wins → 1 token deducted → Patient PII unlocked
  → Practitioner progresses status → Treatment → Feedback
```

> **PII rule:** Patient name, phone, email, and full address are **never** returned to practitioners until the referral is claimed.

---

## 2. Authentication

### Token Types

| Token | Format | TTL | Storage |
|---|---|---|---|
| Access Token | JWT RS256 | 15 min | Memory / Authorization header |
| Refresh Token | JWT RS256 | 7 days | HttpOnly cookie |

### Using the Access Token

```http
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
```

### JWT Payload

```json
{
  "sub":                  "user-uuid",
  "role":                 "chiropractor",
  "practitioner_id":      "practitioner-uuid",
  "practitioner_status":  "ACTIVE",
  "jti":                  "unique-token-id",
  "iat":                  1717200000,
  "exp":                  1717200900
}
```

### Refresh Flow

```http
POST /v1/auth/refresh
Cookie: refresh_token=<httponly-cookie>
```

Returns a new access token. **Refresh tokens are rotated on every use.** Reuse of an old refresh token triggers invalidation of all tokens for the user.

---

## 3. Pagination

All list endpoints use **cursor-based pagination** (stable under concurrent inserts).

### Request

```
GET /v1/referrals/available?limit=20&cursor=eyJpZCI6Ii4uLiIsImNyZWF0ZWRfYXQiOiIuLi4ifQ
```

### Response Shape

```json
{
  "data": [ ...items... ],
  "pagination": {
    "cursor":   "eyJpZCI6Ii4uLiJ9",
    "has_next": true,
    "limit":    20
  }
}
```

Pass the returned `cursor` as a query parameter in the next request. `cursor` is `null` on the last page.

---

## 4. Error Handling

All errors return a consistent JSON body:

```json
{
  "code":    "NOT_FOUND",
  "message": "Referral not found",
  "details": { "field": "reason" }
}
```

| HTTP | Code | When |
|---|---|---|
| 400 | `BAD_REQUEST` | Missing required header or malformed input |
| 401 | `UNAUTHORIZED` | Missing, invalid, or expired JWT |
| 402 | `PAYMENT_REQUIRED` | Insufficient token balance or no active subscription |
| 403 | `FORBIDDEN` | Authenticated but wrong role or inactive status |
| 404 | `NOT_FOUND` | Resource not found or not accessible |
| 409 | `CONFLICT` | Duplicate resource, already claimed, invalid state transition |
| 422 | `VALIDATION_ERROR` | Request body / query param failed validation |
| 423 | `LOCKED` | Claim lock contention — retry after ~1 second |
| 429 | `RATE_LIMITED` | Too many requests |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

---

## 5. Rate Limits

| Endpoint Group | Limit | Window |
|---|---|---|
| `POST /v1/public/referrals` | 5 requests | 10 min / IP |
| Auth endpoints (login, forgot-password) | 10 requests | 15 min / IP |
| All authenticated API endpoints | 300 requests | 1 min / user |
| `POST /v1/referrals/available/:id/claim` | 3 requests | 1 min / user |
| `POST /v1/wallet/purchase` | 5 requests | 1 min / user |
| Admin endpoints | 1000 requests | 1 min / user |

---

## 6. Data Schemas

### User

```typescript
{
  id:             string (uuid)          // required
  email:          string (email)         // required, unique (case-insensitive)
  first_name:     string                 // required
  last_name:      string                 // required
  phone:          string | null
  role:           "chiropractor"|"admin" // required
  is_active:      boolean                // required; false = disabled by admin
  email_verified: boolean                // required
  last_login_at:  datetime | null
  created_at:     datetime               // required
}
```

---

### Practitioner

```typescript
{
  id:              string (uuid)
  user_id:         string (uuid)    // FK → users.id
  status:          PractitionerStatus   // see Status Enums
  quality_score:   number (0–100)  // composite score from matching engine
  warning_count:   integer          // admin-issued warning count
  suspended_at:    datetime | null
  suspension_note: string | null    // admin's reason for suspension
  created_at:      datetime
}
```

---

### Practitioner Profile

```typescript
{
  id:                string (uuid)
  practitioner_id:   string (uuid)       // FK → practitioners.id
  practice_name:     string              // required
  practice_phone:    string | null
  practice_email:    string (email) | null
  website:           string (url) | null
  street_address:    string              // required
  city:              string              // required
  state:             string              // required, 2-char US abbreviation (e.g. "CA")
  zip_code:          string              // required
  bio:               string | null       // max 2000 chars
  years_experience:  integer | null      // min 0, max 60
  languages_spoken:  string[]            // e.g. ["English", "Spanish"]
  service_radius_km: number              // radius for referral matching, default 40km
  areas_served:      string[]            // named areas / neighborhoods
  specialties:       Specialty[]         // see Specialty values below
  updated_at:        datetime
}

// Specialty values:
"Back Pain" | "Neck Pain" | "Headaches/Migraine" | "Pregnancy Care" |
"Pediatrics" | "Tinnitus" | "Wellness Care" | "Other"
```

---

### Practitioner Document

```typescript
{
  id:                string (uuid)
  practitioner_id:   string (uuid)
  document_type:     "LICENSE"|"INSURANCE"|"CERTIFICATION"|"TRAINING"|"SUPPORTING"
  original_filename: string
  mime_type:         string        // "application/pdf"|"image/jpeg"|"image/png"|"image/webp"
  file_size_bytes:   integer       // max 10,485,760 (10MB)
  verified_at:       datetime | null  // set by admin on approval
  expires_at:        date | null      // license / insurance expiry date
  created_at:        datetime
}
```

---

### Referral — Marketplace View *(no patient PII)*

Shown to all eligible practitioners before claiming:

```typescript
{
  id:                 string (uuid)
  referral_number:    string              // e.g. "REF-202506-100001"
  status:             ReferralStatus      // see Status Enums
  primary_complaint:  string              // reason for seeking care
  symptoms:           string | null
  duration_of_problem: string | null      // e.g. "2 weeks"
  urgency_level:      "LOW"|"NORMAL"|"HIGH"|"URGENT"
  preferred_contact:  "phone"|"email"|"either" | null
  additional_notes:   string | null
  // Location — approximate only
  city:               string
  state:              string
  zip_code:           string              // zip only, no street address
  // Matching metadata
  distance_km:        number | null       // distance from practitioner's practice
  priority_score:     number             // higher = shown sooner in feed
  // Timing
  published_at:       datetime | null
  expires_at:         datetime | null     // unclaimed referrals expire (default 72h)
  created_at:         datetime
  viewed_at:          datetime | null     // when THIS practitioner first opened detail view
}
```

---

### Patient *(PII — gated behind claim)*

```typescript
{
  first_name:     string
  last_name:      string
  phone:          string
  email:          string (email) | null
  street_address: string
  city:           string
  state:          string
  zip_code:       string
}
```

> Patient PII is **never** exposed until a practitioner successfully claims the referral.

---

### Referral — Claimed View *(includes patient PII)*

Returned only to the practitioner who successfully claimed:

```typescript
{
  referral_id:     string (uuid)
  referral_number: string
  status:          ReferralStatus
  claimed_at:      datetime
  token_balance:   integer             // wallet balance AFTER deduction
  patient:         Patient             // see Patient schema above
}
```

---

### Token Wallet

```typescript
{
  id:              string (uuid)
  balance:         integer (≥ 0)   // spendable balance; must be ≥ 1 to claim
  total_purchased: integer          // lifetime tokens bought
  total_allocated: integer          // tokens received via subscription renewals
  total_used:      integer          // tokens spent on referral claims
  total_expired:   integer          // tokens that expired (if expiry is configured)
  updated_at:      datetime
}
```

---

### Token Transaction

Immutable ledger entry. Positive `amount` = credit, negative = debit.

```typescript
{
  id:               string (uuid)
  transaction_type: TokenTransactionType  // see Status Enums
  amount:           integer               // +N = credit, -1 = claim debit
  balance_after:    integer (≥ 0)        // wallet balance after this transaction
  referral_id:      string (uuid) | null  // set for REFERRAL_CLAIM
  notes:            string | null
  created_at:       datetime              // immutable — no updated_at
}
```

---

### Token Package

```typescript
{
  id:          string (uuid)
  token_count: integer (> 0)
  price_cents: integer (> 0)   // price in USD cents (e.g. 1500 = $15.00)
  sort_order:  integer
}
```

---

### Subscription Plan

```typescript
{
  id:                  string (uuid)
  name:                string           // e.g. "Starter", "Professional", "Enterprise"
  description:         string | null
  monthly_price_cents: integer          // price in USD cents (e.g. 9900 = $99.00)
  included_tokens:     integer          // tokens allocated on each renewal
  sort_order:          integer          // display order, ascending
}
```

**Default plans:**

| Plan | Price | Tokens/month |
|---|---|---|
| Starter | $49.00 | 5 |
| Professional | $99.00 | 15 |
| Enterprise | $199.00 | 40 |

---

### Subscription

```typescript
{
  id:                   string (uuid)
  status:               SubscriptionStatus    // see Status Enums
  plan_name:            string
  monthly_price_cents:  integer
  included_tokens:      integer
  current_period_start: datetime
  current_period_end:   datetime     // access retained until this date even after cancellation
  cancelled_at:         datetime | null
}
```

Returns `{ "status": "NONE" }` if no subscription exists.

---

### Patient Feedback

One submission per referral. Submitting closes the referral and triggers quality score recomputation.

```typescript
{
  rating_communication:   integer (1–5)  // how clearly did practitioner communicate?
  rating_professionalism: integer (1–5)
  rating_service:         integer (1–5)  // quality of chiropractic treatment
  rating_overall:         integer (1–5)  // overall experience
  comments:               string | null  // max 1000 chars
  submitted_at:           datetime
}
```

---

### Quality Score

Recomputed daily (02:00 UTC) and on each feedback submission.

```typescript
{
  composite_score:     number (0–100)     // drives matching engine priority weighting
  claim_rate:          number (0–1)        // fraction of visible referrals claimed
  completion_rate:     number (0–1)        // fraction of claimed referrals completed
  avg_response_time_s: integer | null      // avg seconds between published → claimed
  avg_patient_rating:  number (1–5) | null
  total_referrals:     integer
  total_claims:        integer
  total_completions:   integer
  score_date:          date
}
```

**Default quality score weights (admin-configurable):**

| Component | Weight |
|---|---|
| Response time | 20% |
| Claim rate | 20% |
| Completion rate | 30% |
| Patient rating | 30% |

---

### Notification

```typescript
{
  id:         string (uuid)
  type:       string           // see notification types below
  title:      string
  body:       string
  is_read:    boolean
  created_at: datetime
}
```

**Notification Types:**

| Type | Trigger |
|---|---|
| `NEW_REFERRAL_AVAILABLE` | New referral published in practitioner's service area |
| `REFERRAL_CLAIMED` | One of the practitioner's referrals was claimed (or by them) |
| `REFERRAL_EXPIRED` | An unclaimed referral expired |
| `APPROVAL_APPROVED` | Admin approved the practitioner application |
| `APPROVAL_REJECTED` | Admin rejected the application |
| `APPROVAL_SUSPENDED` | Admin suspended the practitioner |
| `SUBSCRIPTION_RENEWED` | Subscription successfully renewed, tokens allocated |
| `SUBSCRIPTION_PAST_DUE` | Payment failed |
| `TOKENS_LOW` | Token balance is running low |

---

### Audit Log

```typescript
{
  id:          string (uuid)
  user_id:     string (uuid) | null  // who performed the action
  action:      string                // e.g. "APPROVE_PRACTITIONER", "REFERRAL_CLAIM"
  entity_type: string                // e.g. "practitioner", "referral", "user"
  entity_id:   string (uuid) | null
  ip_address:  string | null
  occurred_at: datetime
}
```

Each row includes an SHA-256 hash of its content for tamper-evidence. Retained for 2 years minimum.

---

## 7. Status Enums

### Practitioner Status Flow

```
PENDING_PROFILE → PROFILE_COMPLETED → PENDING_APPROVAL → ACTIVE
                                                        ↘ REJECTED
ACTIVE → SUSPENDED → ACTIVE (admin reactivates)
```

| Status | Can Access Referrals? | Description |
|---|---|---|
| `PENDING_PROFILE` | No | Just registered — profile not completed |
| `PROFILE_COMPLETED` | No | Profile filled — documents not yet uploaded |
| `PENDING_APPROVAL` | No | All docs uploaded — awaiting admin review |
| `ACTIVE` | **Yes** | Admin approved — fully operational |
| `REJECTED` | No | Application rejected |
| `SUSPENDED` | No | Admin suspended — historical referrals readable only |

---

### Referral Status Flow

```
NEW → OPEN → CLAIMED → PATIENT_CONTACTED → APPOINTMENT_BOOKED → TREATMENT_IN_PROGRESS → COMPLETED → CLOSED
  ↘ CLOSED (expired or admin-closed)
```

| Status | Set By | Description |
|---|---|---|
| `NEW` | System (intake) | Geocoding + matching in progress |
| `OPEN` | Matching engine | Visible in practitioner marketplace |
| `CLAIMED` | Practitioner (claim API) | 1 token deducted, PII unlocked |
| `PATIENT_CONTACTED` | Practitioner | Practitioner has reached the patient |
| `APPOINTMENT_BOOKED` | Practitioner | Appointment scheduled |
| `TREATMENT_IN_PROGRESS` | Practitioner | Active treatment |
| `COMPLETED` | Practitioner | Treatment finished — feedback email sent to patient |
| `CLOSED` | System / Admin | Feedback submitted, or expired/admin-closed |

---

### Subscription Status

| Status | Description |
|---|---|
| `ACTIVE` | Paid and current — practitioner can claim referrals |
| `PAST_DUE` | Payment failed — limited access |
| `CANCELLED` | Cancelled — access until `current_period_end` |
| `EXPIRED` | Period ended — no access |

---

### Token Transaction Types

| Type | Amount | Triggered By |
|---|---|---|
| `PURCHASE` | +N | Token package purchase |
| `MONTHLY_ALLOCATION` | +N | Subscription renewal via Stripe webhook |
| `REFERRAL_CLAIM` | -1 | Successful referral claim |
| `REFUND` | +N | Admin-issued refund |
| `ADJUSTMENT` | ±N | Manual admin adjustment |
| `EXPIRY` | -N | Token expiry (if configured) |

---

## 8. API Endpoints

### Public (no authentication required)

| Method | Path | Rate Limit | Description |
|---|---|---|---|
| `POST` | `/v1/public/referrals` | 5/10min/IP | Patient referral intake |
| `GET` | `/v1/public/subscription-plans` | — | List plans (for pricing page) |

#### POST /v1/public/referrals

```json
// Request body
{
  "first_name":          "John",           // required
  "last_name":           "Doe",            // required
  "phone":               "+12025551234",   // required
  "email":               "john@example.com",
  "street_address":      "123 Main St",    // required
  "city":                "Washington",     // required
  "state":               "DC",             // required, 2-char
  "zip_code":            "20001",          // required
  "primary_complaint":   "Lower back pain", // required
  "symptoms":            "Sharp pain when standing",
  "duration_of_problem": "2 weeks",
  "urgency_level":       "NORMAL",         // LOW|NORMAL|HIGH|URGENT
  "preferred_contact":   "phone",          // phone|email|either
  "additional_notes":    "..."
}

// Response 201
{ "referral_number": "REF-202506-100001" }
```

> Supply `Idempotency-Key: <uuid>` header to prevent duplicate submissions on network retry.

---

### Authentication

| Method | Path | Rate Limit | Auth |
|---|---|---|---|
| `POST` | `/v1/auth/register` | 10/15min/IP | — |
| `POST` | `/v1/auth/login` | 10/15min/IP | — |
| `POST` | `/v1/auth/refresh` | — | cookie |
| `POST` | `/v1/auth/logout` | — | Bearer |
| `POST` | `/v1/auth/forgot-password` | 5/15min/IP | — |
| `POST` | `/v1/auth/reset-password` | 5/15min/IP | — |
| `POST` | `/v1/auth/change-password` | — | Bearer |

---

### Practitioners

All require `Authorization: Bearer <token>`.

| Method | Path | Status Required | Description |
|---|---|---|---|
| `GET` | `/v1/practitioners/me/profile` | any | Get own profile |
| `PUT` | `/v1/practitioners/me/profile` | any | Update profile (triggers geocoding) |
| `GET` | `/v1/practitioners/me/documents` | any | List verification documents |
| `POST` | `/v1/practitioners/me/documents?document_type=LICENSE` | any | Upload document (multipart) |
| `GET` | `/v1/practitioners/me/documents/:id/download` | any | Get pre-signed S3 URL (15 min) |
| `DELETE` | `/v1/practitioners/me/documents/:id` | any | Delete document |
| `GET` | `/v1/practitioners/me/performance` | ACTIVE | Quality score + stats |
| `GET` | `/v1/practitioners/me/notifications` | any | List in-app notifications |
| `PATCH` | `/v1/practitioners/me/notifications/:id/read` | any | Mark single notification read |
| `PATCH` | `/v1/practitioners/me/notifications/read-all` | any | Mark all notifications read |

---

### Referrals

| Method | Path | Status Required | Rate Limit |
|---|---|---|---|
| `GET` | `/v1/referrals/available` | ACTIVE | 120/min |
| `GET` | `/v1/referrals/available/:referralId` | ACTIVE | — |
| `POST` | `/v1/referrals/available/:referralId/claim` | ACTIVE | 3/min |
| `GET` | `/v1/referrals/claimed` | any | — |
| `GET` | `/v1/referrals/claimed/:referralId` | any | — |
| `PATCH` | `/v1/referrals/claimed/:referralId/status` | any | — |
| `POST` | `/v1/referrals/claimed/:referralId/notes` | any | — |
| `GET` | `/v1/referrals/claimed/:referralId/timeline` | any | — |
| `GET` | `/v1/referrals/stream` | ACTIVE | SSE — 10 connections/min |

#### Referral Claim — Important Notes

1. Supply `Idempotency-Key: <uuid>` header (required).
2. Race condition handled: Redis distributed lock + PostgreSQL `SELECT FOR UPDATE NOWAIT`.
3. On **423 Locked** response, retry after ~1 second — you may still win if the competing claim fails.
4. On success: token deducted, patient PII returned, all other practitioners lose visibility.

#### Referral Status Transitions (practitioner-side)

```
CLAIMED → PATIENT_CONTACTED → APPOINTMENT_BOOKED → TREATMENT_IN_PROGRESS → COMPLETED
```

Setting to `COMPLETED` triggers a feedback request email to the patient.

---

### Wallet & Tokens

| Method | Path | Description |
|---|---|---|
| `GET` | `/v1/wallet` | Get balance |
| `GET` | `/v1/wallet/transactions` | Transaction history (cursor-paginated) |
| `GET` | `/v1/wallet/packages` | List purchasable packages |
| `POST` | `/v1/wallet/purchase` | Purchase token package |

Requires `Idempotency-Key` header on `POST /v1/wallet/purchase`.

---

### Subscriptions

| Method | Path | Description |
|---|---|---|
| `GET` | `/v1/subscriptions/plans` | List plans (public) |
| `GET` | `/v1/subscriptions` | Get current subscription |
| `POST` | `/v1/subscriptions` | Subscribe to a plan |
| `PATCH` | `/v1/subscriptions` | Upgrade / downgrade plan |
| `POST` | `/v1/subscriptions/cancel` | Cancel at period end |
| `GET` | `/v1/subscriptions/billing` | Invoice history from Stripe |

Requires `Idempotency-Key` header on `POST /v1/subscriptions`.

---

### Feedback (Public)

```
POST /v1/feedback/:referralId?token=<hmac-token>
```

- No account required.
- `token` query param is HMAC-signed and verified server-side.
- One submission per referral — subsequent attempts return 409.
- Submitting automatically closes the referral and recomputes the practitioner's quality score.

---

### Admin (Admin role only)

#### Practitioners

| Method | Path | Description |
|---|---|---|
| `GET` | `/v1/admin/practitioners` | List + search all practitioners |
| `GET` | `/v1/admin/practitioners/:id` | Detail: profile, docs, stats, warnings |
| `POST` | `/v1/admin/practitioners/:id/approve` | Approve → ACTIVE |
| `POST` | `/v1/admin/practitioners/:id/reject` | Reject (reason required) |
| `POST` | `/v1/admin/practitioners/:id/suspend` | Suspend (reason required) |
| `POST` | `/v1/admin/practitioners/:id/reactivate` | Reactivate from SUSPENDED |
| `POST` | `/v1/admin/practitioners/:id/warn` | Issue formal warning |

#### Referrals

| Method | Path | Description |
|---|---|---|
| `GET` | `/v1/admin/referrals` | List all referrals with full PII |
| `GET` | `/v1/admin/referrals/:id` | Detail with patient PII |
| `POST` | `/v1/admin/referrals/:id/reassign` | Override claim ownership |
| `POST` | `/v1/admin/referrals/:id/close` | Force-close referral |

#### Settings & Analytics

| Method | Path | Description |
|---|---|---|
| `GET` | `/v1/admin/settings` | Get all system settings |
| `PATCH` | `/v1/admin/settings` | Update settings |
| `GET` | `/v1/admin/analytics/overview` | Platform overview |
| `GET` | `/v1/admin/analytics/revenue` | Revenue by date range |
| `GET` | `/v1/admin/analytics/referrals` | Referrals by date range |
| `GET` | `/v1/admin/audit-logs` | Tamper-evident audit logs |
| `GET` | `/v1/admin/users` | List all users |
| `POST` | `/v1/admin/users/:id/disable` | Disable user |
| `POST` | `/v1/admin/users/:id/reactivate` | Reactivate user |

#### Configurable System Settings

| Setting Key | Default | Description |
|---|---|---|
| `referral.expiry_hours` | `72` | Hours before unclaimed referral auto-closes |
| `referral.visibility_radius_buffer_km` | `5` | Extra buffer added to service radius during matching |
| `token.expiry_months` | `null` | Months until allocated tokens expire (null = never) |
| `quality.score_weights` | `{"response_time":0.2,"claim_rate":0.2,"completion_rate":0.3,"patient_rating":0.3}` | Quality score component weights |
| `document.max_size_bytes` | `10485760` | Max upload size (10MB) |
| `matching.min_active_practitioners` | `1` | Min matched practitioners to publish referral |

---

### Live Feed — Server-Sent Events

```
GET /v1/referrals/stream
Authorization: Bearer <token>
Accept: text/event-stream
```

**Events:**

```
event: connected
data: {"status":"connected"}

data: {"event":"referral_available","referral_id":"uuid"}
data: {"event":"referral_revoked","referral_id":"uuid"}
data: {"event":"notification","notification_id":"uuid","type":"NEW_REFERRAL_AVAILABLE","title":"..."}

: heartbeat
```

**JavaScript:**
```javascript
const es = new EventSource('/v1/referrals/stream', {
  headers: { Authorization: `Bearer ${accessToken}` }
});
es.addEventListener('message', (e) => {
  const { event, referral_id } = JSON.parse(e.data);
  if (event === 'referral_available') refreshReferralList();
});
```

---

### Stripe Webhooks

```
POST /v1/webhooks/stripe
Stripe-Signature: t=...,v1=...
```

Configure URL in your Stripe dashboard. Verified via `STRIPE_WEBHOOK_SECRET`.

| Event | Effect |
|---|---|
| `invoice.payment_succeeded` | Allocates monthly tokens, sets subscription ACTIVE |
| `invoice.payment_failed` | Sets PAST_DUE, sends alert email |
| `customer.subscription.deleted` | Sets CANCELLED |
| `customer.subscription.updated` | Syncs status |

---

### Health & Metrics

| Method | Path | Description |
|---|---|---|
| `GET` | `/healthz` | Liveness probe — 200 if process alive |
| `GET` | `/readyz` | Readiness probe — 200 if DB + Redis reachable, 503 if not |
| `GET` | `/metrics` | Prometheus metrics (internal cluster only) |

---

*ChiroReferral Network API Reference v1.0 — generated from source*
