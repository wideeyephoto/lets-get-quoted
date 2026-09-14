# Saved email recovery worker

Local M1 implementation, September 14, 2026. No hosted migration, deployment, enablement or customer email was performed. The [implementation plan](../customer-email-implementation-plan-2026-09-14.md) and existing lifecycle/document recovery rules remain authoritative.

## What the worker does

`/api/cron/email-recovery` is registered locally for every five minutes and uses the existing authenticated cron/heartbeat wrapper. Sending is off unless both `EMAIL_RECOVERY_ENABLED=true` and the private database control is enabled with an explicit workspace cohort. The migration defaults to disabled with an empty cohort. The cohort supports at most 100 workspace IDs.

The worker reads up to 20 due records, prioritizing documents over lifecycle mail. It resumes the original lifecycle/document intent through the existing claim logic and shared executors. No templates, access tokens, PDF bytes, provider keys or document revisions are regenerated. A saved fallback resumes its saved phase. Only a definitive rejection of the exact original sender domain can create the existing separate fallback phase.

A three-minute database run lease excludes overlapping recovery runs. Individual send claims retain their existing fencing, maximum three attempts and original 23-hour cutoff. The worker processes sequentially, paces provider calls at least one second apart, stops starting work after 50 seconds, and refuses a provider submission after 85 seconds. Each HTTP request has a 30-second timeout; the route's configured maximum is 120 seconds. The batch ceiling is 20 work items and at most two provider requests per item. These limits are conservative worker limits, not a reservation of capacity across every independent application sender.

Before each HTTP request, including after pacing and before fallback, a read rechecks the run token, enabled control, cohort, cooldown, send lease/cutoff, account eligibility, recipient/suppression and current source revision. Lifecycle checks also cover owner identity and obsolete setup/quote nudges. The read cannot cancel a request already in flight or make the external request atomic with a subsequent database change.

Outcomes are saved in the same transaction as recovery failure classification:

- Transient/ambiguous errors preserve the original attempt and defer recovery; the batch stops after a failed item.
- Rate-limit responses establish a global recovery cooldown. `Retry-After` seconds and HTTP-date values are honored with a five-minute minimum and 23-hour maximum.
- Daily/monthly quota exhaustion establishes a cooldown and disables recovery until an operator verifies capacity. Credential/access failures also disable recovery. Repeated five-minute invocations cannot spend the remaining attempts during that hold.
- Definitive validation, attachment, configuration and changed-payload idempotency errors stop that send in manual review. Identity/key changes are not a recovery mechanism.
- Expired/exhausted and no-longer-eligible records are left in manual review; accepted/cancelled/deleted records are never recreated by the worker.

Provider error names were checked against [Resend's error reference](https://resend.com/docs/api-reference/errors). Unknown or malformed responses do not establish acceptance. Redirects are refused.

## Acceptance reconciliation

An accepted, unchanged draft invoice can be marked sent without another provider request. The reconciliation checks the workspace, job, invoice and saved revisions under database locks and updates only `draft` invoices. Paid/void or edited invoices remain untouched. A callback that recovered acceptance can therefore be followed by bookkeeping repair on a subsequent run.

Lifecycle acceptance is already its durable history. Quote activity entries and owner receipts remain best-effort; this worker does not replay them, create payments, change quote business state or make the entire creation/payment workflow atomic. Provider acceptance still does not establish delivery.

## Preview, enable and pause

1. In the intended environment, reconcile historical uncertain sends and follow the prerequisite lifecycle/document/monitor deployment runbooks. Apply `migrations/20260914150046_email_recovery_worker.sql` before enabling recovery. Verify service-role RPC access and denial to anonymous/authenticated users. The definition is mirrored in `schema.sql`.
2. Keep the environment flag false while deploying. In an authorized operator session, inspect the control and configure only the approved workspace cohort:

```sql
select enabled, account_ids, lease_until, cooldown_until from public.email_recovery_control;

-- Substitute reviewed UUIDs; this example does not enable sending.
update public.email_recovery_control
set enabled=false, account_ids=array['<approved workspace UUID>']::uuid[]
where id;
```

3. Call the authenticated route with `?dryRun=true`, or call `runEmailRecovery(admin, { dryRun: true })` in a reviewed runner. Preview reads only `due_email_recovery_work`; it does not claim sends, acquire a run lease, contact the provider or write a cron heartbeat. It reports a bounded sample of due/review/reconciliation counts, not a global all-clear. An empty cohort produces an empty preview, so verify configuration first.
4. After the M5 release review, set `EMAIL_RECOVERY_ENABLED=true` and enable the database control for that same cohort. Do not remove cooldowns until the corresponding provider condition is resolved. Verify actual scheduled runs and receiver/alert evidence in the hosted environment.

For an immediate recovery hold:

```sql
update public.email_recovery_control set enabled=false where id;
```

Disabling the environment flag requires a deployment; the database hold is checked by an active worker before its next submission. An already submitted request may still be accepted. The hold applies to this recovery worker, not all initial sends or enrollment. Do not clear leases, erase uncertain records or reset provider keys to force another attempt.

After verified quota/credential repair, review each outstanding send's remaining window and provider scope before re-enabling the control. Credential rotation intentionally requires review of old uncertain intents. Keep expired work in evidence-based closeout.

## Monitoring and rollback

Actual invocations report selected, accepted, reconciled, review, deferred and failed counts in `cron_runs`. Disabled/held runs remain distinguishable in their summaries. Failed work returns the existing failure response. The cron registry and operational scanner cover missed runs; the existing recovery panel covers overdue/uncertain intent records. Preview failures return an error without making the worker appear to have run.

To roll back, disable the database control first, drain in-flight work, and retain ledgers and signed callback handling. Keep the previous protected initial senders. Do not restore an unguarded sender or interpret missing callback evidence as rejection.

## Local verification

- Selected regression suite: 46 files / 491 tests passed, followed by 18 passing focused tests including an additional persisted-fallback case (492 distinct regression tests). Both standalone dry-run tests also passed. Coverage includes worker, route authentication/preview, existing senders, cron registry and environment-example checks.
- Document and recovery database verification: 22 PostgreSQL 17 checks passed. This includes eight recovery groups covering private grants, disabled/cohort gates, concurrent runs, exact snapshots, stale tokens, post-claim suppression/pausing, quota holds, terminal errors, expiry/provider changes, fallback resume, invoice reconciliation and lifecycle suspension.
- Supabase security advisor: no issues in the disposable local fixture. Full app/test typecheck and changed-file lint passed.
- `npm run test:pg17:document-email` now includes the recovery checks and is already part of CI. Hosted acceptance remains open.
