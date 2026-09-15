# Voice operational health — September 8, 2026

The existing five-minute receipt-recovery worker now checks operational health
after recovery. The database observer reports stranded receipts, overdue call
history (including still-connected transfers), observed duration overruns, stale
minute holds, and inconsistent accounting on new policy-snapshotted AI calls.
It never terminates calls, invokes a provider, releases credit, or replays work.

Each issue appears once in the existing administrator failure inbox with its
call/receipt/reservation reference, stage, and supported investigation action.
Caller phone numbers, notes, transcripts, and credentials are absent. Query
failure is an error, not a healthy empty result. Active issues fail the cron
health summary. Database and HTTP deadlines bound execution.

Cleared conditions resolve only this observer's records. An explicit operator
resolution is retained for classified historical probes; it is excluded before
the scan limit so it cannot starve new alerts. A truncated scan reports failure
and never auto-resolves unseen issues. Receipt scope is checked on both reads
and automatic resolution. The helper is SECURITY INVOKER and service-role-only.

## Evidence

- 10/10 disposable PostgreSQL cases passed: all five classes, healthy/expected
  exclusions, repetition, foreign scope, condition resolution, operator
  classification, truncation, invalid scope, and browser-role denial.
- 40 focused application/recovery tests passed. Full release CI remains required.
- Migration `20260908210359_voice_operational_health_alerts.sql` is installed.
  A production service-role invocation found only the known 600.938-second
  historical cutoff. Its review links the corrected 598-second timer and the
  new 593.807-second handset test. Historical call data was preserved.
- After that explicit classification, the same production observer returned
  zero active failures, zero new alerts, and an untruncated scan.
- Security advisors did not flag the helper. The cron integration still requires
  the application release and an observed scheduled invocation.

## Operator procedure

Open `/admin/failures` and use the issue reference with the read-only
`scripts/inspect-voice-production-health.sql` queries. Check provider timestamps
before classifying a duration report; application history is not authoritative
proof of a carrier cutoff. Inspect existing ledger finalization and SMS keys
before any supported receipt replay. Never reset retry counters or re-debit.

For a confirmed historical test with an explained cause, resolve that precise
failure and retain the explanation/evidence. Do not bulk-resolve unknown voice
failures. For a repaired condition, the observer can resolve its own alert on a
complete subsequent scan. The existing generic webhook failures are untouched.

Containment: stop the affected producer or action while retaining inbound,
terminal, recording, and receipt callbacks. BrokePipes post-call customer SMS
was contained this way; its owner alerts and voice continue. Keep metering and
the allowance worker enabled, with the exhaustion gate off under owner policy.
