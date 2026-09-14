# Email delivery audit and recovery monitoring

Local implementation and audit, September 14, 2026. No hosted migration, deployment, customer email or rollout change was performed. This extends T12, T16, T17, T19 and T20; it does not complete their live acceptance gates.

Subsequent local work added the disabled-by-default [recovery worker](email-recovery-worker.md) for the two existing ledgers. The inventory and verification below describe the monitoring pass; consult the worker runbook for the updated retry capability and its remaining hosted gates.

## Shared delivery policy

The account-tagged transport in `src/lib/email.ts` now checks `email_suppression` immediately before every provider request, including a platform fallback. It normalizes and deduplicates To, Cc and Bcc recipients, rejects header injection, scopes the query to the tagged workspace and refuses to send if the check fails. If any recipient is blocked, the whole request stops.

For transactional sends, `hard_bounce`, `complaint` and `provider_suppressed` block submission. Marketing opt-outs alone remain eligible for transactional mail. For the shared `campaign`, `review_request` and `rebook_invite` kinds, every suppression reason blocks submission. A definitive domain rejection cannot bypass a suppression recorded before the fallback attempt. This application check is not atomic with the external provider request; a concurrent suppression can still arrive after the last local read.

The marketing suppression-list helper now refuses null or potentially capped results (1,000 rows). Pagination remains necessary before exceeding that limit. No historical suppression reason backfill or provider-region inventory was performed.

## Sender inventory and remaining work

| Path or family | Local protection now | Remaining work |
| --- | --- | --- |
| Welcome, lifecycle sweep and activation batch | Private lifecycle ledger, bounded same-message recovery and delivery-block checks | Scheduled recovery worker and hosted acceptance |
| Customer quote and invoice sends | Private document/revision ledger, persisted fallback phase, delivery-block checks and callback reconciliation | Hosted acceptance, explicit unchanged-document resend flow and full creation/payment transaction |
| Shared `email.ts`: office invitation, contractor alert, quote follow-up, selection, appointment/booking reminders, portal/card links, domain notices, daily digest, lead and messaging notices | Final account-scoped delivery-block gate when an account tag is present | Durable identities and recovery per business event, including owner notices |
| Shared campaign, review and rebook emails | Final account-scoped check blocks all suppression reasons | Durable per-recipient campaign/event identity and capacity budgeting |
| Shared contact and support staff/customer messages | No account tag; no invented tenant suppression scope | Define platform recipient policy, recovery identity and reporting |
| `admin-platform-campaigns.ts` | Separate transport and existing audience suppression checks | Final per-recipient recheck, complete platform/account opt-out scope and durable submission |
| `ai-operator/digest.ts`, `founder-alerts.ts` | Separate platform staff/founder transports; mentioning a customer account does not scope the recipient to it | Platform delivery-block policy, durable notice identity, lost-acceptance recovery |
| `crew-auth.ts` account invitations | Final workspace delivery-block check; failed/missing account lookup stops token creation; acceptance ID required | Durable request identity and bounded recovery without changing authentication/token semantics |
| `crew-auth.ts` self-login, `magic-link.ts` | Authentication before workspace selection; no invented tenant scope | Platform delivery-block policy and bounded request recovery |
| `merchandise/merchandise-emails.ts` | Customer receipt checks the order workspace immediately before submission; customer and staff results require provider acceptance IDs | Order-event identity and recovery; platform staff delivery policy |
| `app/api/tools/email-report/route.ts` | Separate public report transport | Appropriate recipient policy, report identity and recovery |
| `app/dashboard/marketing/actions.ts`: theme test | Final check in the authorized workspace; acceptance ID required | Explicit test-send identity and recovery |
| `operational-monitor.mjs` | Existing durable alert delivery queue, saved payload/key, bounded retry and expiry handling | Hosted notification/channel verification; not routed through the tenant sender |

Inventory covers the application transport call sites reviewed in `src/lib` and `src/app`. It is not certification of external scripts, third-party automations, all caller prerequisites or provider-wide enforcement. In particular, untagged mail must not borrow an arbitrary tenant's opt-out records.

The independent workspace transports use `sendAccountScopedEmail`: reject missing/conflicting scope, attach the authoritative account tag, then check immediately before submission. These three families are transactional; marketing opt-outs alone do not block them. Crew tokens are generated before the final delivery check so a block recorded during token generation is observed; a blocked token is not emailed. This does not introduce retries or a durable send identity. As with the shared gate, the database read and external request are not atomic.

September 14 M2 verification: 10 selected regression files / 182 tests passed, covering actual crew/theme/merchandise paths, account scope, late suppression, failed lookups, provider rejection and related caller behavior. Hosted email receipt and provider-wide enforcement remain unverified.

## Recovery queue and existing monitor

`public.email_send_recovery_queue()` is a stable, read-only, invoker-rights function with an empty search path. Only the service role can execute it. It returns identifiers, kind, state, phase, attempt count and timestamps, without recipient addresses, message bodies, attachments, access links or free-text errors.

| Condition | Reported reason |
| --- | --- |
| `manual_review` state | Delivery needs review |
| Original first attempt is at least 23 hours old | Retry window closed |
| Three attempts reached and no live send lease | Attempt limit reached |
| Sending lease expired at least five minutes ago | Send interrupted |
| Retry due at least ten minutes ago | Retry overdue |

The fixed 23-hour window never resets. Active leases within that window and ordinary short backoff periods are excluded. Accepted and cancelled sends are excluded. A recovered acceptance can therefore clear a recovery finding even if its eventual delivery failed; inspect delivery events separately.

The existing five-minute operational scanner adds these records to `operational_alert_findings`, keyed by source and send ID. Its existing notification queue sends a digest under the current operational configuration. An unchanged finding is not repeatedly notified. A later recurrence after verified resolution can raise a new alert. A failed source read aborts the scan instead of falsely resolving existing findings. Scans do not submit customer mail or update either send ledger.

The admin health page links to `#email-recovery`, displays the oldest 50 records, and discloses when more exist. Missing data is an explicit unavailable warning, not a healthy empty queue. Each entry shows its reference, workspace link, saved phase and UTC cutoff. It offers no direct resend action. The separate recent email-events panel also includes failed and provider-suppressed events alongside bounces and complaints. Failure-list totals use the same scope. Operator triage distinguishes these outcomes, and the briefing no longer invents a 100% inbox rate from an empty failure sample.

## Deployment and operation

1. Follow the lifecycle and document runbooks for historical reconciliation, producer pause/drain and their prerequisite migrations. Preserve all existing rollout gates.
2. Apply `migrations/20260914142641_email_send_recovery_monitoring.sql` after both ledgers and the existing operational-alert/billing migrations, before deploying the new health page. The same definition is mirrored in `schema.sql`.
3. Verify service-role RPC access, denial to anonymous/authenticated roles, and refreshed API schema in the intended environment. Confirm the existing operational scanner is scheduled and its current notification destination is correct.
4. In the approved test environment, create controlled recovery states, run the existing scan, and confirm one initial notification, silence on unchanged rescans, and closure after verified resolution. An alert's provider acceptance does not establish receipt by the responder.
5. Rehearse responder and backup handling before opening any new cohort. No new scheduler, destination or recurring task was created by this local change.

Read the full recovery queue from an authorized operator session when the dashboard is capped:

```sql
select * from public.email_send_recovery_queue();
```

Use the send reference to inspect the matching lifecycle/document ledger and provider evidence. Keep private payloads out of ordinary logs and tickets. Reconcile uncertain acceptance first. Retry only through the existing supported sender, within its original window, with the saved identity and payload. Do not rotate keys, edit document revisions or compose a replacement to bypass recovery controls. For expired or terminal uncertainty, use the evidence-based closeout documented in the corresponding runbook.

Monitoring alone does not ensure retry execution. A daily lifecycle sweep may miss the 23-hour window, so timely operator handling remains required until an automatic recovery worker is implemented.

## Verification

- Final selected email/admin/worker/monitor/operator regressions: **45 files and 510 tests passed**, including the shared transport, failure-list/count agreement and operator outcome distinctions.
- Actual PostgreSQL 17: 14 checks passed, including existing alert delivery, five recovery conditions, access restrictions, privacy, unchanged-scan deduplication, source immutability, resolution and failed-read rollback. The security advisor reported no issues against this disposable local fixture; hosted settings were not assessed.
- Full application/test typecheck passed. Changed-file lint reported zero errors and three unchanged unused-variable warnings (one in the health page and two in the existing operator tests), verified against the previous commit.
- The actual recovery component and admin stylesheet were rendered with synthetic data and inspected in a local browser for populated, empty and unavailable states. This is isolated component verification, not an authenticated hosted-page test.
- Database checks are included in CI under `npm run test:pg17:operational-alerts`.

Related runbooks: [lifecycle recovery](contractor-lifecycle-email-sends.md), [document recovery](document-email-sends.md), [task checklist](../customer-email-handling-checklist-2026-09-14.md).
