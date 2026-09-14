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

Staging (`uydlabvgauzujdwuqzxq`) received all 45 September 14 email migrations plus the operational-alert foundation in 11 recorded batches, versions `20260914221552` through `20260914221736`. The initial oversized connector request failed before any database change; a read-only check confirmed that before the smaller batches began. Follow-up index migrations address the three foreign keys identified by the staging advisor.

Hosted verification confirmed private-table RLS and denied public insert/resend access, disabled recovery with no enrolled accounts, and an empty recovery queue. A synthetic platform notice completed claim, recipient preparation, immutable snapshot and callback resolution inside a transaction that was rolled back; zero fixture rows remain and no provider was called. This is database verification, not inbox acceptance.

The staging security advisor reported no actionable warnings on the functions or tables in this release. Informational RLS-without-policy findings are intentional for service-only queues. Other pre-existing project findings remain and were not cleared by this release. See [Supabase's advisor descriptions](https://supabase.com/docs/guides/database/database-linter) for the distinction. The batch/file manifest accompanies this evidence.

Production has an earlier subset under different timestamps and was not changed. Its rollout must use actual installed content and coordinate the application release and legacy workers. The repair branch incorporates committed stream work through `b25769350`; 197 additional tests across ten suites and the full typecheck passed after resolving duplicate cron and registry changes. Shared checkout work was preserved.

All three release-specific foreign-key advisor findings are now cleared. Follow-ups are recorded as `email_release_foreign_key_indexes` and `portal_message_client_fk_index`; the second adds a client-leading index because the pre-existing similarly named index begins with account ID. These changes are retained in the canonical migrations and schema mirror.

Production deployment, worker enablement, provider/receiver acceptance and controlled canary remain open. 

## Batch 12 — Customer Recovery Integration & Hosted Verification

Staging (`uydlabvgauzujdwuqzxq`) received Batch 12 (`20260914223000_customer_email_recovery_integration.sql`):
- Functions `confirm_customer_email_send` and `resolve_customer_email_send` applied and verified.
- Privileges confirmed: denied to `anon` and `authenticated`; granted to `service_role` and `postgres`.
- `email_send_recovery_queue()` updated to union `customer_email_sends` alongside `contractor_lifecycle_sends` and `document_email_sends`.
- Tested full customer recovery lifecycle in a staging transaction with immediate rollback: claim -> confirm -> manual review -> operator resolution. Verified state transitioned to accepted with operator audit trail (`admin@example.com`). Zero test rows retained in staging.
- Preview deployment verified at `https://lets-get-quoted-khzc56sim-lets-get-quoted.vercel.app` (ID `dpl_BMp2192EyaMZMBnHeLBgiubwadR9`): HTTP 200 on root, HTTP 400 invalid signature on unsigned webhook, HTTP 401 on cron routes (`email-recovery` and `platform-event-notices`).

