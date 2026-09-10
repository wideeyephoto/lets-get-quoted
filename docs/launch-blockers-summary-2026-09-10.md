# Launch Blockers Summary (2026-09-10)

## Hard Blockers (must resolve before launch)
1. Two unapplied database migrations: `20260910104058_marketing_flow_repair.sql` and `20260910121506_overage_recovery_guards.sql` — production worker code calls RPCs that don't exist yet
2. Three office Data API security vulnerabilities (FINANCE-REST, WRITER-FINANCE, WRITER-FOREIGN-PARENT) — PostgREST returns financial data the UI redacts, and permits cross-tenant writes
3. R04 domain observation clock — requires 7 consecutive healthy days of scheduled domain reconciliation runs, clock has NOT started
4. Webhook routing formal sign-off — preview Stripe webhook `we_1U5dHvPqTgiW6iRM8Si0gH56` was pointed at production DB, leaked 185 rows. Disabled but needs operator sign-off
5. Two failing PG17 test suites: `test:pg17:late-success` and `test:pg17:messaging-schema`

## Soft Blockers (should resolve)
1. Three failing cron jobs: `direct-payment-settlement` (4 failures/287 runs), `overage-settlement` (1/24), `voice-allowance` (1/94)
2. Three failing test suites: `feature-social-cards`, `quick-stop-hero`, `suite-feature-pages` — generic CTA links instead of contextual targets
3. Storage enforcement dark: `LGQ_STORAGE_CAP_ENFORCED=0` — all tests pass but enforcement is off
4. `new-halo-worker-20260910.txt` workaround exists at c:\dev — must NOT be deployed, breaks test contract
