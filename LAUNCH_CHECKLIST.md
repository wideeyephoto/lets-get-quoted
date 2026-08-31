# Official Pre-Launch & Go-Live Checklist — Let's Get Quoted

This is the definitive production deployment and launch checklist. All automated testing gates, database migrations, and schema verifications are complete and passing.

---

## 1. Verified System Readiness (Gates at 100%)

- [x] **TypeScript Strict Typecheck**: `npm run typecheck` (0 errors)
- [x] **Vitest Unit & Integration Suite**: `npm test` (851 test files, 11,379 tests passed, 0 failures)
- [x] **Framework Security & Compilation**: Next.js `15.5.24` (LTS) upgraded; `npm audit --omit=dev` reports 0 vulnerabilities; `npm run build` passes with clean SSR/SSG compilation across all routes, subdomains, and contractor templates
- [x] **Database Schema & Migrations**: Schema dependency ordering and runtime migrations synchronized
- [x] **Row-Level Security & Multi-Tenancy**: Tenant boundary isolation confirmed across all account roles
- [x] **Security & Integrity Hardening**:
  - SSRF protection on photo proxy with strict Supabase storage allowlist and loopback/metadata IP blocking
  - SWAIG voice webhook strict cryptographic tool token validation (`verifyVoiceToolToken`)
  - Cross-tenant SMS isolation with verified session account context
- [x] **Ad Billing Money Rails**:
  - Synthetic spend generation eliminated; delta-spend computation on syncs
  - Persistent pre-charge transaction idempotency keys with dual-layer webhook reconciliation and durable replay deduplication
  - Cancellation/pause state synchronization and monthly budget rollover
- [x] **Core Lifecycles Verified**:
  - Lead Intake → Estimation → Job Conversion → Crew Dispatch → Invoice E-Sign
  - Schedule Day Planning & Route Geographic Optimization
  - Stripe Checkout Webhook Idempotency, E-Signature Preservation, Charge Failure, Disputes, and Refunds
  - Outbox SMS Delivery, 10DLC Consent Ledgers, and White-Label Invariants
  - 1-Page PDF Generation (Invoices, Estimates, Lien Waivers)
  - 35 of 35 Scheduled Vercel Background Crons

---

## 2. Stripe Production Billing & Live Keys

### Base Plan Price Bindings (Catalog: `2026-08-18-preview`)
The following Price IDs exist in the live Stripe account, are active, single-currency USD, and bound:

| Variable Name | Plan Tier | Interval | Price | Bound Stripe Price ID |
| :--- | :--- | :--- | :--- | :--- |
| `STRIPE_PRICE_SOLO_MONTHLY` | Solo | Monthly | $39/mo | `price_1U5n8eGqh5LFKuTCh9KIQFws` |
| `STRIPE_PRICE_SOLO_ANNUAL` | Solo | Annual | $420/yr | `price_1U5n8eGqh5LFKuTCTSUmI5CR` |
| `STRIPE_PRICE_GROWTH_MONTHLY` | Growth | Monthly | $129/mo | `price_1U5n8eGqh5LFKuTCZKW7rINt` |
| `STRIPE_PRICE_GROWTH_ANNUAL` | Growth | Annual | $1,188/yr | `price_1U5n8fGqh5LFKuTCjJRhOzQ9` |
| `STRIPE_PRICE_SCALE_MONTHLY` | Scale | Monthly | $329/mo | `price_1U5n8fGqh5LFKuTCUBcPBlFY` |
| `STRIPE_PRICE_SCALE_ANNUAL` | Scale | Annual | $3,588/yr | `price_1U5n8fGqh5LFKuTCOEm7ACLn` |

### Top-Up Add-Ons (Live & Sellable)
- [x] `flex_text_250`: `price_1U5tXzGqh5LFKuTCXUPxSJY7` ($15/mo)
- [x] `text_1000`: `price_1U5tXzGqh5LFKuTCyqyMSkQ7` ($45/mo)
- [x] `marketing_email_5000`: `price_1U5tY0Gqh5LFKuTCITQbEhEK` ($20/mo)
- [x] `ai_intake_100`: `price_1U5tY1Gqh5LFKuTCzgsuPkbj` ($25/mo)
- [x] `ai_writing_250`: `price_1U5tY2Gqh5LFKuTCNgbygfUp` ($15/mo)
- [x] `crew_user`: `price_1U6gVfGqh5LFKuTC9wFCN28D` ($5/mo)
- [x] Withheld from sale: `storage_100gb`, `office_user`, AI Voice SKUs

### Live Stripe Webhook Endpoints
- [x] **Standard Connect Webhook**: `https://letsgetquoted.com/api/stripe/webhook`
  - Verified 2026-08-31 in Stripe Live Workbench: active, 11 subscribed events, 4 deliveries this week, 0 failed; `STRIPE_WEBHOOK_SECRET` is present in Vercel Production.
  - Events: `checkout.session.completed`, `checkout.session.expired`, `charge.failed`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed`, `account.updated`
  - Variable: `STRIPE_WEBHOOK_SECRET=whsec_...`
- [x] **Platform Billing Webhook**: `https://letsgetquoted.com/api/stripe/billing/webhook`
  - Verified 2026-08-31 in Stripe Live Workbench: active, 18 subscribed events, 1 delivery this week, 0 failed; the signing secret is present in Vercel Production and the production flag resolves to `1`.
  - Events: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`
  - Variable: `STRIPE_BILLING_WEBHOOK_SECRET=whsec_...`
  - Flag: `LGQ_STRIPE_BILLING_WEBHOOK_ENABLED=1`

---

## 3. Telephony, SMS & Carrier 10DLC Approval

- [x] **10DLC Brand & Campaign Registration**: Verified 2026-08-31 against SignalWire: the Let's Get Quoted brand is completed, the Account & Support Notifications campaign is active, and its number assignment is completed. Two non-primary campaigns remain pending/inactive and do not carry the verified transactional lane.
- [x] **Shared Number & SignalWire Space**: Verified 2026-08-31 that `+19479412323` exists in `lets-get-quoted.signalwire.com`, uses the expected LaML handler, and routes inbound SMS to `https://app.letsgetquoted.com/api/sms/inbound`. Both production variables are present in Vercel.
- [x] **White-Labeling Invariant**: Ensure no internal persona names appear in homeowner-facing SMS payloads.

---

## 4. Transactional Email & Deliverability (Resend)

- [x] **DNS Records**: Verified 2026-08-31. Resend reports `letsgetquoted.com` ready to send with DKIM and SPF verified. Public DNS publishes DMARC at `_dmarc.letsgetquoted.com` with monitoring policy `p=none`.
- [x] **API Key**: `RESEND_API_KEY` is present in Vercel Production (verified 2026-08-31), and production requests reach Resend without an authentication error.

---

## 5. Google Maps & Geocoding APIs

- [x] **Browser Key (`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`)**: Restrict in Google Cloud Console by HTTP Referrers:
  - `https://letsgetquoted.com/*`
  - `https://*.letsgetquoted.com/*`
  - `https://app.letsgetquoted.com/*`
  - `https://lets-get-quoted.vercel.app/*`
  - `http://localhost:*/*`
  - **Verification status (2026-08-31)**: Verified in Google Cloud Console (`hello@letsgetquoted.com`). The browser key (`Maps Platform API Key`) has active HTTP Referrer restrictions configured with exact allowlist matching `https://*.letsgetquoted.com/*`, `https://app.letsgetquoted.com/*`, `https://letsgetquoted.com/*`, `https://www.letsgetquoted.com/*`, and Vercel preview environments.
- [x] **Server-Side Geocoding Key (`GOOGLE_MAPS_API_KEY`)**: Must be unrestricted by HTTP referrer (or IP-restricted) so server-side background geocoding and drive-time calculations succeed.
  - **Verification status (2026-08-31)**: Verified in Google Cloud Console (`Google-Maps-Job-Organizer`, `AIzaSyBZ2...`). Application restrictions are set to **None** (unrestricted), and API restrictions are explicitly scoped to 5 backend APIs (Geocoding API, Routes API, Directions API, Distance Matrix API, Places API New) without HTTP Referrer blocks.

---

## 6. DNS, Domains & Routing (Vercel)

- [x] **Apex & Application Domains** (verified 2026-08-31 in Vercel and by live browser routing):
  - `letsgetquoted.com` → Vercel
  - `app.letsgetquoted.com` → Vercel
- [x] **Wildcard Contractor Websites & Portals**: `*.letsgetquoted.com` is assigned to the Vercel project. Public DNS resolves arbitrary subdomains to Vercel-managed edge addresses, and HTTPS wildcard routing reaches the application's branded not-found surface.
- [x] **Cron Security**: `CRON_SECRET` is present in Vercel Production and Preview (verified 2026-08-31) and protects the 35 configured background cron endpoints.

---

## 7. Master Production Environment Variable Checklist

| Environment Variable | Production Value / Note |
| :--- | :--- |
| `NEXT_PUBLIC_APP_URL` | `https://app.letsgetquoted.com` |
| `NEXT_PUBLIC_ROOT_DOMAIN` | `letsgetquoted.com` |
| `DATABASE_URL` | *Supabase Production Postgres URI* |
| `NEXT_PUBLIC_SUPABASE_URL` | *Supabase Project URL* |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | *Supabase Anon Key* |
| `SUPABASE_SERVICE_ROLE_KEY` | *Supabase Service Role Key (Sensitive)* |
| `LGQ_STRIPE_BILLING_LIVEMODE` | `1` |
| `STRIPE_SECRET_KEY` | `sk_live_...` (or restricted live key) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | *Connect Webhook Signing Secret* |
| `STRIPE_BILLING_WEBHOOK_SECRET` | *Platform Billing Webhook Signing Secret* |
| `LGQ_STRIPE_BILLING_WEBHOOK_ENABLED` | `1` |
| `STRIPE_PRICE_SOLO_MONTHLY` | `price_1U5n8eGqh5LFKuTCh9KIQFws` |
| `STRIPE_PRICE_SOLO_ANNUAL` | `price_1U5n8eGqh5LFKuTCTSUmI5CR` |
| `STRIPE_PRICE_GROWTH_MONTHLY` | `price_1U5n8eGqh5LFKuTCZKW7rINt` |
| `STRIPE_PRICE_GROWTH_ANNUAL` | `price_1U5n8fGqh5LFKuTCjJRhOzQ9` |
| `STRIPE_PRICE_SCALE_MONTHLY` | `price_1U5n8fGqh5LFKuTCUBcPBlFY` |
| `STRIPE_PRICE_SCALE_ANNUAL` | `price_1U5n8fGqh5LFKuTCOEm7ACLn` |
| `RESEND_API_KEY` | `re_...` |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | `AIzaSy...` (Referrer-restricted) |
| `GOOGLE_MAPS_API_KEY` | `AIzaSy...` (Server-side geocoding) |
| `SIGNALWIRE_PROJECT_ID` | `2687f308-939e-4e73-97bd-4edfc0d7fd5a` |
| `SIGNALWIRE_API_TOKEN` | *Live API Token* |
| `SIGNALWIRE_SPACE_URL` | `lets-get-quoted.signalwire.com` |
| `SIGNALWIRE_FROM_NUMBER` | `+19479412323` |
| `LGQ_SMS_PROVIDER` | `signalwire` |
| `LGQ_SMS_SHARED_ENABLED` | `1` |
| `LGQ_SMS_DISPATCH_ENABLED` | `1` |
| `LGQ_SMS_INBOUND_ACTION_WORKER_ENABLED` | `1` |
| `CRON_SECRET` | *Vercel Cron Secret Token* |
| `LGQ_PRICING_DASHBOARD_ENABLED` | `1` |
| `LGQ_BASE_PLAN_SUBSCRIPTION_CHECKOUT_ENABLED` | `1` |
| `LGQ_BASE_PLAN_SUBSCRIPTION_CANCELLATION_ENABLED` | `1` |
| `LGQ_TOP_UP_PURCHASE_ENABLED` | `1` |
| `LGQ_OVERAGE_SELF_SERVE_ENABLED` | `1` |
| `LGQ_STRIPE_MERCHANT_ONBOARDING_V2_ENABLED` | `1` |

---

## 8. Final Go-Live Verification Step

- [x] **Deploy to Vercel Production**: Verified active with apex/subdomain routing and 35 cron endpoints enabled.
- [x] **Live Preflight Price Verification**: `npm run preflight:prices`
  - **Verification status (2026-08-31)**: Passed (3/3 tests). All 6 production Price IDs in Stripe Live account verified against catalog version `2026-08-18-preview`, currency `usd`, recurring intervals, exact unit amounts, and active status:
    - `STRIPE_PRICE_SOLO_MONTHLY` (`price_1U5n8eGqh5LFKuTCh9KIQFws` - $39/mo) — `ok`
    - `STRIPE_PRICE_SOLO_ANNUAL` (`price_1U5n8eGqh5LFKuTCTSUmI5CR` - $420/yr) — `ok`
    - `STRIPE_PRICE_GROWTH_MONTHLY` (`price_1U5n8eGqh5LFKuTCZKW7rINt` - $129/mo) — `ok`
    - `STRIPE_PRICE_GROWTH_ANNUAL` (`price_1U5n8fGqh5LFKuTCjJRhOzQ9` - $1,188/yr) — `ok`
    - `STRIPE_PRICE_SCALE_MONTHLY` (`price_1U5n8fGqh5LFKuTCUBcPBlFY` - $329/mo) — `ok`
    - `STRIPE_PRICE_SCALE_ANNUAL` (`price_1U5n8fGqh5LFKuTCOEm7ACLn` - $3,588/yr) — `ok`
    - Real checkout validator (`loadVerifiedStripePlanPrices`) confirmed passing.
- [x] **Live End-to-End Test Checkout & Webhook Receipt**:
  - **Verification status (2026-08-31)**: Live subscription checkout completed for Solo Monthly ($39/mo, `price_1U5n8eGqh5LFKuTCh9KIQFws`).
  - Webhook endpoint `https://letsgetquoted.com/api/stripe/billing/webhook` received and ingested signed platform events:
    - `checkout.session.completed` (`evt_1U7kt4Gqh5LFKuTCQjW6tbbo`)
    - `invoice.created` (`evt_1U7kt4Gqh5LFKuTCWo2lxx6j`)
    - `invoice.finalized` (`evt_1U7kt4Gqh5LFKuTCQRCMxLaI`)
    - `invoice.payment_succeeded` (`evt_1U7kt4Gqh5LFKuTC4lxaacy1`)
    - `invoice.paid` (`evt_1U7kt4Gqh5LFKuTC7YZvu1jo`)
  - Subscription event projector processed events with `subscription_and_invoice_state_applied`.
- [x] **Account Provisioning & Dashboard Presentation (`/dashboard/settings`)**:
  - **Database Entitlements**:
    - `workspace_entitlements`: `plan_code = 'solo'`, `billing_interval = 'monthly'`, `billing_status = 'active'`, `entitlement_state = 'active'`
    - `billing_subscriptions`: `status = 'active'`, `provider_subscription_id = 'sub_1U7kt1Gqh5LFKuTCJENle4Ew'`, `current_period_end = 2026-09-23`
  - **Settings UI**:
    - Plan & Usage panel displays active Solo subscription ($39/month).
    - Usage allowances, seat counts, and storage meters reflect Solo plan limits.
    - Plan change and cancellation controls verified accessible.

