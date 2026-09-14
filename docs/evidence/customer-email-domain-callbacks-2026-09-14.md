# Domain failure callback recovery — local evidence, September 14, 2026

Scope: local work on `codex/customer-email-checks-20260914`, following snapshot
commit `c527286c1`. This report records observed command results for the callback
change committed with this file. No hosted database, provider send, deployment or
fresh canary observation was used.

## Application checks

Command:

```text
node node_modules/vitest/vitest.mjs run test/resend-webhook-route.test.ts test/email-domain-failure-notices.test.ts
```

Observed output from the final run:

```text
✓ test/email-domain-failure-notices.test.ts (17 tests)
✓ test/resend-webhook-route.test.ts (58 tests)
Test Files  2 passed (2)
Tests  75 passed (75)
Start at  13:15:23
```

The cases cover signature rejection, object/array tags, ambiguous recipient/tag
rejection, snapshot binding, quarantine failures, delivery suppression retry and
callbacks arriving before worker success or timeout. Provider transport and
application database calls are mocked in these application tests.

## Actual PostgreSQL checks

Command: `node scripts/verify-email-domain-failure-notices.mjs`, with the local
Supabase advisor binary selected using `LGQ_SUPABASE_CLI` and `PGSSLMODE=disable`
for the disposable loopback PostgreSQL server. The runner creates and removes its
own PostgreSQL 17 database and applies the actual migrations. It also checks that
their SQL appears in `schema.sql`.

Observed output excerpts:

```text
PASS early delivery repairs acceptance and survives delayed acknowledgement or timeout
PASS stronger negative evidence survives older and newer delivery or sent callbacks
PASS provider IDs cannot move between incidents or replace an existing binding
PASS concurrent callback and acceptance bookkeeping preserve the negative result in both arrival orders
PASS lost acknowledgements and expired observation windows recover from bound delivery without resending
PASS operator closeout remains intact while later callback evidence is retained
PASS legacy observation remains available and callbacks never modify snapshots or retry keys
No issues found
33/33 checks passed
```

The security advisor's “No issues found” applies to this disposable database,
not the hosted environment. The other checks cover original notice atomicity,
private grants/RLS, immutable snapshots, expired claims and scoped deletion.

## Other verification

- Full type check: `node --max-old-space-size=4096 node_modules/typescript/bin/tsc --noEmit -p tsconfig.test.json` exited 0 with no diagnostics.
- Changed application, test and verification-script lint exited 0.
- `npm run test:email-registry`: 10 tests passed; reviewed transport signatures matched all 21 files.
- `git diff --check`: passed.

## Release limits

Apply the original notice migration, snapshot migration
`20260914170327_email_domain_failure_snapshots.sql`, then callback migration
`20260914171033_email_domain_failure_callbacks.sql` before the updated application.
Drain earlier workers during cutover. Automatic domain notice retry remains disabled.
Provider workspace/region, capacity, retention approval, hosted receiver/callback
acceptance, remaining email families and canary expansion remain open in
[the prelaunch list](../../LAUNCH_CHECKLIST.md) and
[the implementation plan](../customer-email-implementation-plan-2026-09-14.md).
