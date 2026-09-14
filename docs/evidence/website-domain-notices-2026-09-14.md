# Website connection notices — local evidence, September 14, 2026

Scope: local changes following `696bc8da8` on
`codex/customer-email-checks-20260914`. No hosted migration, provider email,
deployment or fresh canary observation was performed.

Application command:

```text
node node_modules/vitest/vitest.mjs run test/custom-domain-reconciler.test.ts test/custom-domain-connected-email.test.ts test/api-cron-custom-domain-reconcile.test.ts test/email-required-workspace.test.ts test/domain-failure-email-transport.test.ts test/data-disposition-registry.test.ts
```

Final observed output:

```text
Test Files  6 passed (6)
Tests  54 passed (54)
Start at  13:21:50
```

These tests use mocked provider and application database calls. They cover
retained failures after connection, failed preparation, lost acceptance writes,
credential loss, acceptance-ID enforcement, existing workspace policy and account
data-disposition contracts.

Database command: `node scripts/verify-email-domain-failure-notices.mjs`, with the
local Supabase advisor selected by `LGQ_SUPABASE_CLI` and `PGSSLMODE=disable` for
the disposable loopback PostgreSQL 17 server. This runner is already in CI.
It now includes nine website-notice groups alongside 33 earlier domain checks.

Observed output excerpts:

```text
PASS website notice migration matches fresh schema, uses private RLS and invoker functions
PASS legacy and interactive verification do not enqueue duplicate unsolicited notices
PASS failed notice creation rolls back the connection stamp
PASS concurrent promotion and claims have one winner; recipient preparation is owned and one-time
PASS acceptance is saved separately from delivery and overdue evidence becomes review without resending
PASS a crash after recipient preparation or submission is retained and never blindly retried
PASS obsolete website connections cancel before claim and cannot prepare after a concurrent change
PASS a genuinely new connection creates a separate notice while retaining earlier incidents
PASS operator closeout requires evidence and account cleanup leaves other workspaces intact
No issues found
42/42 checks passed
```

The advisor result applies to the disposable database only. The actual migration
is also checked against `schema.sql`. Changed-file lint and the 10 sender-registry
tests passed; all 21 reviewed transport signatures still match. Full type checking
completed with no diagnostics. `git diff --check` passed.

Release limits and manual-review behavior are documented in the
[website notice runbook](../runbooks/website-domain-connection-notices.md).
Snapshots, provider scope/key binding, signed callback repair and hosted acceptance
remain open; this evidence does not authorize automatic retries or expansion.
