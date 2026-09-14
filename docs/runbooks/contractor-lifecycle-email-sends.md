# Contractor lifecycle email send recovery

September 14, 2026. Local implementation and verification; not yet deployed. Covers immediate welcome, the lifecycle sweep and approved activation batches. Quote/invoice sends are outside this change. See the [customer email checklist](../customer-email-handling-checklist-2026-09-14.md) for remaining gates.

## Behavior

Before contacting Resend, the sender atomically saves one intent per workspace and lifecycle step. It retains the exact payload and provider idempotency key. An account lock also prevents concurrent different steps from bypassing the 48-hour cadence. Legacy activity events still prevent repeat sends; new accepted sends remain authoritative even if the activity feed write fails.

Only one worker holds the five-minute lease. A retry keeps the original payload, recipient, key and first-attempt timestamp, waits at least five minutes after a failed response, and permits at most three attempts within 23 hours. This leaves margin before Resend's [24-hour idempotency expiry](https://resend.com/docs/dashboard/emails/idempotency-keys). A changed recipient or provider credential cannot silently reuse an uncertain intent in a different recipient/provider context. Eligibility, owner, suppression and applicable quote/payment milestones are rechecked when claiming.

A provider message ID means **accepted**, not delivered. Signed delivery callbacks can recover acceptance when the HTTP response or local acknowledgement was lost. Callback correlation requires the intent ID, workspace, recipient and compatible provider ID. Delivery outcomes remain in `email_events`.

This is not a scheduled retry worker. Retries occur only when an existing entry point runs again. The daily sweep can miss the 23-hour retry window; overdue intents require review. Suppressed, suspended or otherwise ineligible accounts may retain unresolved records until an operator inspects them. Failed or potentially truncated history reads stop sending; pagination beyond the conservative 1,000-row bound remains open.

## Deployment order

1. Pause lifecycle producers and drain old instances/in-flight requests. Identify the release and intended database. Review any uncertain earlier Resend sends against retained activity history; the new ledger cannot reconstruct historical sends whose only log was lost.
2. Apply `migrations/20260914133327_contractor_lifecycle_send_ledger.sql` through the project's migration process before deploying the application. Verify the table and four RPC functions, service-role access, RLS and API schema refresh. Do not apply `schema.sql` to an existing database as a substitute for this migration.
3. Deploy the sender and webhook together. Keep the ledger while old workers drain; an old unguarded producer can bypass it.
4. Run the read-only lifecycle preview with explicitly supplied credentials for the verified environment. It now reads `contractor_lifecycle_sends` as well as the existing sources and fails closed when the migration is absent. A planned preview row is a candidate, not a reserved send: the live claim rechecks eligibility, cadence and unresolved work.
5. Resume only the approved cohort, inspect acceptance and callback correlation, and retain release/database evidence. Existing rollout and receiver acceptance gates still apply.

For rollback, pause lifecycle producers and retain the ledger and callbacks. Do not roll back to the former unguarded sender while enabling sends, delete intent rows, change keys, reset attempt timestamps, or drop the ledger to clear an error.

## Inspect stalled sends

Use an authorized database operator session. This query exposes operational identifiers, not message bodies or recipients:

```sql
select id, account_id, step_id, state, attempts, first_attempt_at,
       lease_until, next_retry_at, provider_id, accepted_at,
       first_attempt_at + interval '23 hours' as retry_before,
       last_error, resolved_by, resolved_at
from public.contractor_lifecycle_sends
where state in ('sending', 'retry_wait', 'manual_review')
order by first_attempt_at;
```

- `sending`: wait for a live lease; after expiry the normal entry point may reclaim within the original attempt/window bounds.
- `retry_wait`: retry through the same existing entry point only after `next_retry_at` and before `retry_before`. Do not call the provider directly. It may remain blocked by current eligibility.
- `manual_review`, or any expired retry window: reconcile in Resend and retained signed webhook events before closeout. Another lifecycle step remains blocked while the outcome is unresolved.
- `accepted`: do not resend the same step. Investigate delivery using the provider ID and `email_events`.

Never treat a timeout, missing activity-feed row or missing callback as proof that Resend rejected the send. Record provider workspace, message ID where available, event/request timestamps, release, investigation result and operator identity. A provider credential rotation blocks uncertain retries conservatively even when the new credential belongs to the same provider workspace.

## Evidence-based closeout

After verifying acceptance, use this function with the exact intent/workspace IDs and verified provider message ID. The placeholders below are intentionally not executable values:

```sql
select public.resolve_contractor_lifecycle_send(
  p_id => '<intent UUID>'::uuid,
  p_account_id => '<workspace UUID>'::uuid,
  p_actor => '<operator identity>',
  p_evidence => '<verified provider workspace, message and investigation evidence>',
  p_provider_id => '<verified Resend message ID>'
);
```

To close without sending, use the same call with `p_provider_id => null` and evidence explaining the decision. This permanently cancels that step; it does not authorize a replacement send. A delayed signed callback can still record provider acceptance while preserving cancellation. Closeout requires evidence and an unresolved/expired state, and returns `true` only when it updates the matching record. A `false` result requires a fresh read, not a forced update. The function records operator assertions; it does not itself query Resend to verify them.

Payloads contain private message content and signed unsubscribe links. Keep ledger access restricted to the service role/authorized operators, and avoid copying payloads into logs, tickets or screenshots. Account deletion cascades to that account's intents. Any future payload-retention policy must preserve the durable deduplication identity and acceptance evidence.

## Local verification

- `npm run test:pg17:lifecycle-email`: 14 checks against the actual migration in disposable PostgreSQL 17, including concurrent workers, lease fencing, retry limits, changed provider credential, delayed callbacks, evidence closeout, tenant binding and access restrictions.
- `npm run test:email-dry-run`: two standalone tests, including the compiled real sweep with a transport that forbids sends and writes.
- Email and affected regression selection: 36 files, 392 tests passed; full application/test typecheck and changed-file lint passed.
- Supabase security advisor against the disposable local database: no issues reported. This does not assess the hosted database. Optional local advisor invocation uses `LGQ_SUPABASE_CLI` to specify the installed CLI path; TLS is disabled only for the disposable loopback fixture.

Both standalone checks are included in CI. No live messages or hosted migrations were executed for this verification.
