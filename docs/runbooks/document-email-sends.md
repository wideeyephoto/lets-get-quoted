# Quote and invoice email send recovery

September 14, 2026. Local implementation; migration and hosted rollout remain pending. This extends the [lifecycle send ledger](contractor-lifecycle-email-sends.md) to customer quote emails and invoice emails. Track remaining live gates in the [customer email checklist](../customer-email-handling-checklist-2026-09-14.md).

## Send identity and behavior

Each saved job and invoice has a `document_email_revision`. Database triggers advance it when relevant content changes. Quote name, email, reference, scope, amount or line-item changes advance the job revision. Invoice reference, totals, tax/discount, job binding and line-item insert/edit/delete advance the invoice revision. No-op saves and status-only updates do not. Editing back to earlier content still creates a new revision.

The private `document_email_sends` ledger reserves one send per workspace, document and saved revision. Invoice identity includes both the invoice and job revisions. Claims recheck workspace/job/invoice ownership, current recipient, revision, account eligibility and transactional delivery blocks. An unresolved older revision blocks new revisions until reviewed. An accepted unchanged revision returns its saved provider ID without another email. Deliberate reminder/resend operations for unchanged documents are not added here; do not edit a document or reset a revision merely to bypass the send record.

The first claim saves exact HTML, links, tags and attachment bytes. Invoice PDFs are encoded as base64 before saving. Later attempts use that snapshot even if a renderer produces another token, PDF timestamp or branding. PDF generation remains best-effort before the first claim; a snapshot without an attachment stays unchanged during recovery.

Claims have a five-minute lease/backoff and at most three claim attempts within 23 hours of the original attempt. The clock never resets. The only additional HTTP request allowed within a claim is one fallback after a definitive rejection of the exact original From domain. The database saves the fallback payload and phase **before** submission. Primary and fallback use distinct stable keys. A crash resumes the saved phase, so an uncertain fallback never starts again with the original sender. This supplements Resend's [24-hour provider idempotency window](https://resend.com/docs/dashboard/emails/idempotency-keys).

Changing the provider credential stops uncertain retries, including a rotation within the same provider workspace. Timeouts, general failures, quota/rate limits and suppression do not change sender. Fallback also rechecks current document, recipient, suspension and delivery blocks. Marketing opt-outs remain eligible for these requested transactional documents; hard bounce, complaint and provider suppression block them locally.

Provider acceptance is not delivery. A signed callback can restore acceptance using the exact intent, workspace, recipient, provider ID and saved phase. Actual delivery outcome remains in `email_events`. If a document deletion removed its intent, the callback is retained as `DOCUMENT_SEND_QUARANTINE` for routing/deletion review before acknowledgement; applicable suppression still runs. Failed required writes return a retryable response.

The invoice status action no longer marks an emailed invoice sent when acceptance is unknown. Its final status update also checks the invoice revision, so accepting an older invoice cannot label an edited invoice sent. Repeating an already accepted, already sent invoice avoids duplicate owner receipts/feed entries. Quote updates similarly report an already emailed version without another feed row.

Concurrent lead conversions use an atomic `converted_job IS NULL` update: only the winner continues to payment/link/email side effects. A losing request deletes only the job it just created. An uncertain conversion acknowledgement leaves the possibly committed job for reconciliation instead of deleting it. This is not an atomic transaction for the entire lead-to-job/payment workflow.

## Deployment order

1. Pause and drain the affected producers. Verify the intended database/release. Reconcile uncertain historical quote/invoice sends from provider and activity records first; existing sends have no reliable automatic backfill into this new ledger.
2. Apply `migrations/20260914135714_document_email_send_ledger.sql` through the normal migration process before the application deployment. It adds revision columns, revision triggers, the private ledger and five worker/operator RPCs. Column defaults populate existing documents; plan for the migration's table locks.
3. Verify service-role RPC/table access, RLS and refreshed API schema. Deploy the updated senders, actions and webhook together. Missing revisions/RPCs stop sending.
4. In the approved test environment/cohort, verify duplicate submission, content edit, confirmed domain fallback, timeout recovery, callback correlation and invoice status behavior. Retain provider ID, intent ID, document/revision IDs and release evidence. Do not infer receiver delivery from an accepted record.
5. Resume only the approved rollout scope. No live sends, migration or deployment were performed during this local implementation.

Rollback requires pausing producers and retaining both ledger and webhook handling. Do not enable the old unguarded sender, drop the ledger, reset revision IDs, delete uncertain intents or mint new provider keys as a recovery shortcut.

## Inspect and resolve

Use an authorized database operator session. Keep message payloads and recipients out of ordinary logs/tickets:

```sql
select id, account_id, job_id, invoice_id, kind, document_id, revision,
       state, phase, attempts, first_attempt_at, lease_until, next_retry_at,
       first_attempt_at + interval '23 hours' as retry_before,
       provider_id, accepted_at, last_error, resolved_by, resolved_at
from public.document_email_sends
where state in ('sending', 'retry_wait', 'manual_review')
order by first_attempt_at;
```

- A live lease means wait. A retry must go through the same send entry point after backoff, within the original window, against the same saved revision and credential.
- Do not retry an expired, changed or unresolved message directly through Resend. Verify provider workspace, intent/phase tags, message ID, request/event times and outcome. Missing callbacks/activity rows are not proof of rejection.
- If the document changed after a failed send, resolve the old intent first; do not send its stale payload to the current recipient.
- For a lost lead-conversion acknowledgement, inspect `leads.converted_job` and the created job before proceeding. A failed action may already have saved the conversion, and email intent creation might not yet have occurred.

Record evidence-based closeout using the exact IDs. Placeholders are intentionally not executable values:

```sql
select public.resolve_document_email_send(
  p_id => '<intent UUID>'::uuid,
  p_account_id => '<workspace UUID>'::uuid,
  p_actor => '<operator identity>',
  p_evidence => '<verified provider workspace, saved phase, message and investigation evidence>',
  p_provider_id => '<verified Resend message ID>'
);
```

Use `p_provider_id => null` only for an evidence-based decision to close without another send. It cancels that revision permanently. A later callback can record acceptance while preserving cancellation. The function records operator assertions, not an automatic provider lookup. A `false` return means no matching eligible row was updated; inspect again instead of forcing a write.

Payloads contain private document content, access links and invoice PDF copies. Access is service-role/operator only. Document deletion cascades its intents; account deletion cascades all that account's intents. Preserve deduplication and acceptance evidence when designing any future payload-retention policy.

## Verification and remaining scope

- Actual PostgreSQL 17 migration: **14 checks passed**, covering revision changes/no-op saves, simultaneous claims, tenant/recipient binding, saved fallback recovery, stale-worker fencing, attempt limits, expiry, provider changes, callbacks, operator closeout, suppression and deletion.
- Supabase security advisor against the disposable local database: no issues reported. This does not assess hosted settings. `LGQ_SUPABASE_CLI` optionally runs it from `npm run test:pg17:document-email`; TLS is disabled only for the disposable loopback fixture.
- Email and affected action regressions: **52 files / 629 tests passed**, followed by the updated webhook file passing **18 tests**, including one new deleted-document case (**630 distinct tests** total).
- Full app/test typecheck passed, including the final incremental check after callback changes. Changed-file lint has zero errors and six pre-existing unused-variable warnings, verified against the previous commit. Schema ordering and diff whitespace checks passed.
- The database check is included in CI. All tests used synthetic data and no real email sends.

This does not add a retry scheduler, unchanged-document resend UI, end-to-end creation transaction, or universal suppression gate for every email path. Separately created jobs/invoices remain distinct documents; owner notifications and other email families still need their own durable-send audit. The shared legacy fallback wrapper remains for those other families; quote/invoice sends now use the durable phase transition instead.
