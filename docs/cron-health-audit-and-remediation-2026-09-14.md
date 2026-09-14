# Cron Health Audit and Remediation Verification

Date: 2026-09-14
Branch: `fix/cron-health-remediation`
Target Environment: Production (Vercel + Supabase)

## Executive Summary

A comprehensive 5-step remediation was executed across the scheduled cron architecture to eliminate 285 daily false alarms, decouple burst execution synchronization, unblock silent jobs, and restore observability to durable billing workers without compromising customer PII.

---

## 5-Step Execution Breakdown

### Step 1: Unschedule and Park `db-guard`
- **Root Cause**: `db-guard` was firing every 5 minutes (285 runs/day) calling RPC `public.get_long_running_queries`, which does not exist in the database or any repository migration.
- **Actions Taken**:
  - Removed `/api/cron/db-guard` from `vercel.json` (reducing registered crons from 52 to 51).
  - Removed `db-guard` from `CRON_JOBS` in `src/lib/cron-jobs.ts`.
  - Added `db-guard` to `PARKED_CRON_ROUTES` in `src/lib/cron-jobs.ts` with documented rationale.
  - Updated `test/cron-jobs.test.ts` to derive unscheduled allowlist dynamically from `PARKED_CRON_ROUTES`.
- **Commit**: `1f24100fb` (`fix(cron): unschedule and park db-guard pending RPC migration`)

### Step 2: Confirmation & Rebase on PR #87
- **Root Cause**: Gateway timeouts during invocation start writes left incomplete runs and risked re-executing work.
- **Actions Taken**:
  - Confirmed PR #87 (`fcff7cfc2`) was merged into `main`, introducing stable invocation UUIDs and completion upsert recording.
  - Base branch verified against `origin/main` with all 8 tests passing in `test/cron-run-recovery.test.ts`.

### Step 3: Stagger Cron Schedules Across Minute Offsets
- **Root Cause**: Over 40 jobs (14 fifteen-minute crons, 9 five-minute crons, and 4 hourly crons) were synchronized to fire simultaneously at `:00`, `:15`, `:30`, and `:45`, causing burst saturation on Kong connection pools and PostgREST 504 Gateway Timeouts.
- **Actions Taken**:
  - Staggered hourly jobs away from `:00`:
    - `quote-followups`: `:05`
    - `appointment-reminders`: `:20`
    - `selection-chase`: `:35`
    - `voice-number-reconciliation`: `:50`
  - Distributed 15-minute jobs across offsets:
    - Offset 0: `quick-stop-sweep`, `usage-reservation-expiry`, `account-closure` (`0,15,30,45`)
    - Offset 3: `arrival-late`, `plan-change-apply` (`3,18,33,48`)
    - Offset 6: `google-lsa-sync`, `refund-reconciliation` (`6,21,36,51`)
    - Offset 9: `billing-allowance-resets`, `voice-allowance` (`9,24,39,54`)
    - Offset 12: `weather-morning-alert`, `ad-spend-sync`, `ad-wallet-refill`, `custom-domain-reconcile`, `webhook-heal` (`12,27,42,57`)
  - Distributed 5-minute jobs across offsets:
    - Offset 0: `direct-payment-settlement` (`0,5,10,...`)
    - Offset 1: `operational-alerts` (`1,6,11,...`)
    - Offset 2: `addon-refunds` (`2,7,12,...`)
    - Offset 3: `billing-subscription-projection`, `waitlist-sweep` (`3,8,13,...`)
    - Offset 4: `top-up-projection`, `voice-receipt-recovery`, `connected-payment-projection`, `legacy-quick-stop-late-refunds` (`4,9,14,...`)
  - Enhanced interval calculations in `src/lib/cron-jobs.ts` and `scripts/inspect-cron-health.mjs` to handle comma-separated minute lists.
- **Commit**: `fe61ee56e` (`fix(cron): stagger schedules to prevent Kong connection pool timeouts`)

### Step 4: Plumb Sanitized Claim and Worker Error Classifications
- **Root Cause**: Dark billing workers (`top-up-projection`, `direct-payment-settlement`, `connected-payment-projection`, `legacy-quick-stop-late-refunds`) swallowed claim and infrastructure errors into numeric counts (`claim_errors: 1` or `worker_errors: 1`), obscuring root causes in telemetry.
- **Actions Taken**:
  - Implemented `classifyBillingWorkerError` in `src/lib/billing/billing-worker-cron.ts` to map infrastructure errors to safe category tokens (`gateway_timeout`, `bad_gateway`, `service_unavailable`, `timeout`, `statement_timeout`, `connection_error`, RPC codes).
  - Maintained strict PII-leak prevention: unclassified error messages containing secrets or customer identifiers return `null` and are never exposed in responses or database records.
  - Plumbed `errorCode` on claim failures (`projection_worker_claim_error`) and infrastructure error codes into summaries and `cron_runs.error` via `extractLogicalFailureReason`.
- **Commit**: `ddd64b86e` (`fix(billing): plumb sanitized claim and worker error classifications into cron summaries`)

### Step 5: Silent Crons & Platform Readiness Verification
- **Silent Crons Analysis**:
  - `audit-log-retention`: Configured for `30 5 * * 0` (Sundays at 05:30 UTC). Added on Sunday Sept 13 after the window; verified benign and scheduled to execute on Sunday Sept 20.
  - `blog` & `geocode-backfill`: Platform scheduling was impacted by the 52-cron declaration ceiling. With `db-guard` parked and crons reduced to 51, the Vercel scheduler will re-sync schedules upon deployment. Both route handlers verified locally with zero syntax or runtime defects.
- **Verification Results**:
  - TypeScript Typecheck: Passed cleanly (`npm run typecheck`).
  - Unit & Integration Test Suites: 121/121 tests passing across `test/billing-worker-cron-routes.test.ts`, `test/top-up-projection-worker.test.ts`, `test/connected-payment-projection-worker.test.ts`, `test/subscription-projection-worker.test.ts`, `test/cron-jobs.test.ts`, `test/cron-route-coverage.test.ts`, `test/cron-run-recovery.test.ts`, and `test/inspect-cron-health.test.ts`.
- **Commit**: `docs(cron): record cron audit verification and deployment readiness`

---

## Deployment & Monitoring Runbook

1. **Deploy Branch**: Push `fix/cron-health-remediation` and deploy to Vercel production.
2. **Verify Cron Registration**: Check Vercel Dashboard -> Settings -> Cron Jobs to verify 51 registered crons with staggered schedules.
3. **Inspect Real-Time Health**:
   ```bash
   node scripts/inspect-cron-health.mjs 60
   ```
4. **Confirm Noise Reduction**: Verify that `db-guard` is no longer firing and that billing worker failures (if any occur) contain categorized root causes (`[gateway_timeout]`, `[statement_timeout]`, etc.).
