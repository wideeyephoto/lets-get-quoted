# Launch Blockers Summary (2026-09-10)

## Hard Blockers (must resolve before launch)
1. Two unapplied database migrations: `20260910104058_marketing_flow_repair.sql` and `20260910121506_overage_recovery_guards.sql` — production worker code calls RPCs that don't exist yet
2. R04 domain observation clock — requires 7 consecutive healthy days of scheduled domain reconciliation runs, clock has NOT started
3. Webhook routing formal sign-off — preview Stripe webhook `we_1U5dHvPqTgiW6iRM8Si0gH56` was pointed at production DB, leaked 185 rows. Disabled but needs operator sign-off
4. Two failing PG17 test suites: `test:pg17:late-success` and `test:pg17:messaging-schema`

## Closed September 11

Office Data API: FINANCE-REST, WRITER-FINANCE and WRITER-FOREIGN-PARENT are closed. PRs #78/#79 and both corrective database phases are deployed; the final production browser/API rehearsal passed 47/47 on `1633473fb0253b757b31d3e2f85cf6d3297f730d`, deployment `dpl_4xoqSw1KS1XwC2DbhzTv4nknkTXc`. Service-role pricing and session permits pass, and fixture cleanup was independently verified. The old 83/83 claim is invalidated. See [September 11 remediation and evidence](office-data-api-remediation-2026-09-11.md). Other entries retain their prior audit status and were not re-audited by this office-security work.

## Soft Blockers (should resolve)
1. Three failing cron jobs: `direct-payment-settlement` (4 failures/287 runs), `overage-settlement` (1/24), `voice-allowance` (1/94)
2. Three failing test suites: `feature-social-cards`, `quick-stop-hero`, `suite-feature-pages` — generic CTA links instead of contextual targets
3. Storage enforcement dark: `LGQ_STORAGE_CAP_ENFORCED=0` — all tests pass but enforcement is off
4. `new-halo-worker-20260910.txt` workaround exists at c:\dev — must NOT be deployed, breaks test contract
