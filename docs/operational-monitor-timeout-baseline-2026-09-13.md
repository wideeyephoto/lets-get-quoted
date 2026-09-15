# Operational Monitor Timeout Baseline & Root Cause Diagnosis

**Date:** September 13, 2026  
**Project:** `lets-get-quoted` (`prj_bwbvxqj10cuQKKIflEdNMGhQOWEY`)  
**Database:** Supabase `LETSGETQUOTED-DB` (`mfuvvtrkipkigwqqtcal`)  
**Investigated Window:** September 11, 2026 17:40 UTC to September 13, 2026 17:40 UTC (48 hours)

---

## 1. Preserved Evidence & Observed Baseline

Across the 48-hour sample window, `operational-alerts` fired approximately every 5 minutes:
- **Total Scheduled Runs:** 575
- **Total Invocations Failed:** 11 (~1.9% failure rate)
- **Recovery Rate:** **100%** — every single failure recovered on the immediate next 5-minute scheduled run.
- **Root Cause Code Captured in DB:**
  - `scan:database_error`: 5 occurrences
  - `claim:database_error`: 4 occurrences
  - `queue:database_error`: 1 occurrence
  - `operational-alerts reported logical failures (1 items failed)`: 1 occurrence (transient unconfirmed delivery)

### September 13 Incident Timeline
- **13:30 EDT / 17:30:13 UTC (`runId: ee860c00-1f7c-4e99-97b1-2d762a0d3fb4`):**
  - **Outcome:** `ok = false`
  - **Duration:** 7,456 ms
  - **Error:** `claim:database_error`
  - **Result:** Emergency email dispatched to operator (`[LGQ Ops] operational monitoring cannot complete`), reporting that monitoring could not complete.
- **13:35 EDT / 17:35:13 UTC (`runId: f8da0fee-686b-4d6b-af61-af87d0e21567`):**
  - **Outcome:** `ok = true`
  - **Duration:** 3,572 ms
  - **Summary:** `{ active: 11, queued: 1, claimed: 1, accepted: 1, delivered: 1, observedAt: "2026-09-13T17:35:17.173Z" }`
  - **Recovery:** Zero operator intervention required; full system healthy.

---

## 2. Root Cause Determination: Where the Timeout Originates

### Database Engine Telemetry (Postgres)
Direct inspection of PostgreSQL engine telemetry, system catalogs, and `pg_stat_statements` demonstrates that the Postgres database is healthy and performing sub-second executions:

1. **Query Execution Times (`pg_stat_statements` across 1,200+ calls):**
   - `scan_operational_failures`: Mean = **315.65 ms** (min = 15.61 ms, max = 929.59 ms)
   - `claim_operational_alerts`: Mean = **17.05 ms** (min = 0.48 ms, max = 107.01 ms)
   - `queue_operational_alerts`: Mean = **20.96 ms** (min = 0.66 ms, max = 208.92 ms)
   - Live benchmark in production database: `scan` took 344 ms, `claim` took 84 ms, `queue` took 70 ms.
2. **Postgres Limits & Resources:**
   - Active connections: **21 / 60 max connections** (35% pool utilization).
   - Database `statement_timeout`: **30,000 ms**. No query approached this timeout.
   - Advisory locks: `pg_advisory_xact_lock(782321905)` is released promptly with transaction completion.

### Concurrent Scheduled Job Clustering
Failures clustered consistently on `:00`, `:15`, and `:30` minute boundaries. At `17:30:00 UTC`, **26 scheduled jobs** fired concurrently on Vercel:
`direct-payment-settlement`, `voice-allowance`, `top-up-projection`, `ad-spend-sync`, `waitlist-sweep`, `addon-refunds`, `operational-alerts`, `weather-morning-alert`, `legacy-quick-stop-late-refunds`, `sms-delivery`, `refund-reconciliation`, `billing-allowance-resets`, `quick-stop-sweep`, `plan-change-apply`, `sms-inbound-actions`, `custom-domain-reconcile`, `billing-subscription-projection`, `account-closure`, `arrival-late`, `db-guard`, `google-lsa-sync`, `connected-payment-projection`, `webhook-heal`, `usage-reservation-expiry`, `voice-receipt-recovery`, `ad-wallet-refill`.

### Simultaneous Gateway Timeout Errors
Correlating logs across other jobs executing during these burst windows confirmed that the timeout was an **HTTP 504 Gateway Timeout** from the API gateway / reverse proxy in front of PostgREST:
- `webhook-deliveries` at 2026-09-12 14:20:15 UTC: `claim_webhook_delivery_tasks failed: Gateway Timeout`
- `webhook-deliveries` at 2026-09-13 10:30:15 UTC: `claim_webhook_delivery_tasks failed: Gateway Timeout`
- `voice-allowance` at 2026-09-12 16:30:02 UTC: `voice-allowance failed: account ...: Gateway Timeout`

### Diagnostic Mechanism
When PostgREST / API gateway returns an HTTP 504 or drops a connection:
1. The Supabase JavaScript client returns `{ data: null, error: { message: "504: Gateway Timeout", ... } }` without a Postgres database code (`code` is `undefined`).
2. `requireResult()` previously did:
   ```javascript
   if (result.error) throw new Error(`${stage}:${result.error.code || 'database_error'}`);
   ```
3. Because `result.error.code` was falsy, it collapsed to `'database_error'`, transforming an HTTP 504 Gateway Timeout into `claim:database_error`.
4. The cron route caught the thrown error and immediately dispatched an emergency notification without attempting safe retries or verifying whether the interruption was transient.

---

## 3. Delivery States vs. Scan States
Alert delivery states and monitoring scan states are distinct checks:
- **Monitor Scan Execution:** Verifies whether the monitor can connect to the database, inspect signal sources, queue findings, and claim alert deliveries.
- **Alert Delivery Verification:** Checks whether emails accepted by Resend reached operator mailboxes (via Resend webhook status in `email_events`).
- Previously, an unconfirmed or pending email delivery incremented `result.failed`, causing `if (result.failed) await sendMonitorFailure()` to falsely classify delayed webhook delivery confirmations as monitor failures.

---

## 4. Remediation Architecture
1. Deploy structured error diagnostics in `requireResult` to preserve HTTP status, elapsed time, sanitized messages, and database codes.
2. Introduce safe retries with exponential backoff and jitter for transient gateway/network errors.
3. Establish durable multi-state monitoring (`healthy`, `degraded`, `outage`, `recovered`) with atomic cross-monitor deduplication between Vercel and GitHub watchdog.
4. Render degraded states and recovered interruptions in Admin Health without generating false emergency emails.
