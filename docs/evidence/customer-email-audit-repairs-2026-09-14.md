# Customer email audit repairs — September 14

Repair branch: `codex/email-audit-repairs-20260914`, initially based on `daadc8317`.
This checkpoint follows the committed-work audit through `0b2f1e772` and includes the subsequently landed owner, customer and platform email migrations.

## Locally verified repairs

- Repaired seven unapplied migrations and their schema mirror, including malformed function bodies, invalid constraints, missing source tables and overwritten notice validators/triggers.
- Customer sends use the configured provider, enforce final recipient suppression, preserve leases and backoff, stop outside the provider retry window, and only fall back after a definitive rejection of the attempted sender domain. Jobless rebooking and selection notices use valid identities.
- Operator mutation controls require `ops.manage` and MFA. Deliberate document resends have a stable form request, fresh leased intent, distinct provider key and callback identity; original document claims exclude resend rows.
- Quote approval rejects an outdated viewed revision, restores lead conversion, retains one approval event and serializes automatic deposit/invoice setup across concurrent replays.
- Warranty sweeps enqueue only rows actually claimed. Payment notices use the service client and payment identity; subcontractor response occurrences no longer share one constant identity. Owner requests retain feedback and plan-change notices.
- Platform notices persist the exact message before bounded submission and recheck platform suppression. Sign-in links attempt immediate delivery and expire in the queue; digest identity includes the account. Signed callbacks reconcile saved platform snapshots. The scheduled worker is registered behind a disabled-by-default switch.

## Verification

- 194 real PostgreSQL checks passed, including migration installation, concurrent customer claims, domain fallback, quote/deposit replays, warranty claims, explicit resend leases and platform callbacks arriving before the send response.
- 294 application tests passed across 15 selected suites, including signed webhook tests, permissions, suppression, stale quote revisions and cron registry coverage.
- Full TypeScript check passed. Changed-file lint has no errors; remaining warnings originate in existing incoming code. Sender registry matches 22 reviewed transport files.
- Local database advisor reported no issues. No real email, charge or refund was submitted by these checks.

## Release status and remaining gates

At this checkpoint, staging migration rollout is the next action. Staging has no September 14 email foundations; production has a subset under different migration timestamps. Apply reviewed content according to actual installed objects, not filename timestamps alone.

Production deployment, worker enablement, provider/receiver acceptance and controlled canary remain open. The customer ledger still needs integration into background recovery selection, monitoring and callback reconciliation; direct retry protections do not close that work. Legacy direct platform senders and null-account auth-token retention also remain explicit release work. Keep the prelaunch list open until these have evidence.
