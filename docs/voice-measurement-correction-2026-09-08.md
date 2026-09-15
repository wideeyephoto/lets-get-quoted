# Measurement-mode duration and absorbed usage

With one to nine minutes available, the previous admission path used the credit
hold as the carrier duration limit and also capped receipt measurement at that
hold. A two-minute balance could therefore shorten a call despite exhaustion
blocking being disabled, and extra measured usage had no explicit accounting.

The corrected path persists `allowed_minutes`, `minute_mode`, and any
`unmetered_reason` with admission finalization. Measurement mode retains the
normal ten-minute limit; enforcement mode retains the reserved duration. Retries
use the saved duration even when flags change. Legacy admissions retain their
previous reservation-derived limit because their original mode is unknown.

Receipt settlement debits no more than the hold. History separately records
`measured_minutes`, `absorbed_minutes`, and `absorption_reason`. A database
constraint requires known absorbed usage plus billed minutes to equal measured
minutes. Unknown settlement stays unknown and retries; it is not treated as a
write-off. Carrier overruns and expired/released holds remain distinguishable
from the normal partial-balance policy. Raw AI seconds remain available.

## Verification

- Balance matrix: 0, 1, 2, 9, 10, and 15 minutes; initial admission, replay across
  mode changes, completion, duplicate receipts, and failure recovery.
- 160 focused tests and a 332-test voice/billing/capacity regression set passed.
- Full suite: 13,943 tests in 1,089 files passed.
- Type checking, lint, production build, 22 SEO tests, and 14 stock tests passed.
  Lint/build retain pre-existing warnings outside the changed files.
- `npm run test:pg17:voice-measurement`: 15 checks passed against disposable
  PostgreSQL 17 using the real ledger and admission function definitions.
- The migration and required foundations were installed in the designated
  staging database. The six-balance accounting matrix passed against that
  installed schema inside a transaction that rolled back its test fixtures.
  This is database verification, not a hosted application or paid-purchase test.

## Rollout and rollback

Apply `20260908160159_voice_measurement_duration_and_absorbed_usage.sql` before
deploying the application. The original finalization RPC remains available for
old instances. Confirm service-role execution and that browser roles cannot
execute the new RPC. No configuration flag changes are required.

Keep `LGQ_VOICE_MINUTE_GATE_ENABLED=0`. Verify the deployed admission snapshot and
receipt totals on a designated low-balance call. Paid tests and a successful
human transfer still require their own evidence and controlled participants.

Application rollback can leave the additive schema in place. It restores the
old partial-balance behavior and stops populating the new accounting columns, so
record the rollback boundary and stop claiming complete post-fix measurement
after that point. Do not remove accounting columns or delete history to roll
back. A database restore is unnecessary.

## Remaining release evidence

The approved staging voice, overage, and office-permission foundations and the
correction are installed. Later shared SMS and office application dependencies
still need validation for complete application testing. Natural renewals,
effective cancellation, provider invoices,
complete two-phone transfer coverage, paid checkout, and production deployment are not proved
by these automated results.
