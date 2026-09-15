# Production Configuration Audit
Date: 2026-09-10

## Executive Summary
This document consolidates all known production configuration mismatches and system statuses into a single auditable artifact. Overall, the database schema is clean and matches the codebase, but there are unapplied migrations. Several tests (including PG17 compatibility and some test suites) are failing due to recent redesigns. Cron jobs are mostly healthy with 3 failing jobs. A significant webhook routing leak occurred from preview to production, which has been contained.

## Database Schema Parity
- **Status:** Clean
- **Details:** `schema.sql` exactly mirrors 64 runtime migrations. No forward references exist. Every FK target is created before it is used.

## Unapplied Migrations
The following migrations prefixed with `20260910*` are present but may be unapplied:
- `20260910104058_marketing_flow_repair.sql`: Creates storage bucket for merchandise artwork
- `20260910112758_halo_wallet_debit_column.sql`: Adds wallet column to neighborhood_halo_campaigns
- `20260910120000_email_domain_failure_notices.sql`: Adds failure notice requested at and domain failure notices table
- `20260910121506_overage_recovery_guards.sql`: Adds overage recovery idempotency guards
- `20260910124845_card_cancellation_payment_replay.sql`: Prevents canceled card fulfillment orders from restarting
- `20260910133921_account_closure_domain_cleanup.sql`: Captures provider handles in closure request transaction
- `20260910140253_account_closure_request_contract.sql`: Records prior active member IDs on account closure
- `20260910140758_account_closure_actor_type.sql`: Fixes account closure function to use text for suspended_by

## Cron Health
- **Status:** 44 OK, 3 FAILING, 1 IDLE (not due).
- **Failing Jobs:**
  - `direct-payment-settlement`: 287 run(s), 4 failure(s)
  - `overage-settlement`: 24 run(s), 1 failure(s)
  - `voice-allowance`: 94 run(s), 1 failure(s)
- **Idle Job:** `service-reminders` (last ran 2026-09-07)

## Webhook Routing
- **Status:** Endpoint Disabled, Data Leak Identified
- **Details:** The preview environment was leaking data into the production database due to shared Supabase URLs. There were 185 leaked rows (non-live reviews) in the billing rehearsal production verification. 
- **Endpoint Disabled:** `we_1U5dHvPqTgiW6iRM8Si0gH56` at URL `https://lets-get-quoted-git-subscription-rehearsal-lets-get-quoted.vercel.app/api/stripe/billing/webhook`

## Environment Scope Issues
- **Finding:** Preview environment is sharing the production Supabase URL.
- **Evidence:** `NEXT_PUBLIC_SUPABASE_URL` is mapped to both `preview` and `production` environments in the Vercel env scopes for `mfuvvtrkipkigwqqtcal.supabase.co`. Also, `STRIPE_SECRET_KEY` and `LGQ_STRIPE_BILLING_LIVEMODE` are set for preview.

## Test Suite Status
- **Overall Pass Rate:** 1149 / 1152 test files passed. 14848 / 14861 tests passed.
- **Failing Suites (3):**
  1. `test/feature-social-cards.test.ts`: AI intake page fails on secondary label assertion.
  2. `test/quick-stop-hero.test.ts`: Hero simulation fails due to a CTA change (primary label mismatch).
  3. `test/suite-feature-pages.test.ts`: Feature hero component mismatch on the template picker.
- **Root Cause:** Mismatched hero component props and CTA labels in the Marketing pages after a recent redesign.

## PG17 Compatibility
- **Status:** 43 / 45 tests passed.
- **Failing Tests (2):**
  - `test:pg17:late-success`
  - `test:pg17:messaging-schema`

## Feature Flag Inventory
The system maintains a comprehensive inventory of feature flags in `.env.example`. Notable active categories include:
- **Service Rollout Gates:** `LGQ_STRIPE_MERCHANT_ONBOARDING_V2_ENABLED`, `LGQ_DASHBOARD_ORIENTATION_ENABLED`, `LGQ_NAV_PERSONA_ENABLED`, `LGQ_EMAIL_SENDING_DOMAINS_ENABLED`, `LGQ_HOMEOWNER_FINANCING_ENABLED`.
- **Billing Flags:** `LGQ_STRIPE_BILLING_LIVEMODE`, `LGQ_STRIPE_BILLING_WEBHOOK_ENABLED`, `LGQ_BASE_PLAN_SUBSCRIPTION_CANCELLATION_ENABLED`, `LGQ_BASE_PLAN_SUBSCRIPTION_PLAN_CHANGE_ENABLED`.
- **Worker/Cron Dark Gates:** `LGQ_STRIPE_SUBSCRIPTION_PROJECTION_WORKER_ENABLED`, `LGQ_PAID_PLAN_ALLOWANCE_RESET_WORKER_ENABLED`, `LGQ_DIRECT_PAYMENT_SETTLEMENT_WORKER_ENABLED`, `LGQ_SMS_DELIVERY_WORKER_ENABLED`, `LGQ_SMS_INBOUND_ACTION_WORKER_ENABLED`.
- **AI/Voice Features:** `LGQ_AI_VOICE_ENABLED`, `LGQ_VOICE_MINUTE_METER_ENABLED`, `LGQ_VOICE_MINUTE_GATE_ENABLED`, `LGQ_VOICE_ALLOWANCE_WORKER_ENABLED`.

## Action Items

| Priority | Finding | Owner | Remediation |
|----------|---------|-------|-------------|
| **P0** | Webhook Data Leak (185 leaked rows) | Brett | Verify original source and webhook destination routing before closing the configuration case. Fully segment Preview & Prod Supabase DBs. |
| **P1** | Environment Scope (Supabase URL shared) | Operations | Remove production `NEXT_PUBLIC_SUPABASE_URL` from the Vercel preview scope. Provision a separate staging DB. |
| **P1** | Failing Cron Jobs (3) | Engineering | Investigate and fix `direct-payment-settlement`, `overage-settlement`, and `voice-allowance` cron failures. |
| **P2** | PG17 Incompatibilities (2 tests) | Database Team | Fix the `late-success` and `messaging-schema` tests against PG17. |
| **P2** | Test Suite Failures (3 suites) | Frontend Team | Update Marketing page tests to reflect the new CTA/Hero components redesign. |
| **P3** | Unapplied 20260910* Migrations | Database Team | Review and apply the 8 pending database migrations sequentially. |
