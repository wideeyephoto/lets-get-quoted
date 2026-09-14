# Durable operational callback evidence

Local implementation, September 14, 2026. No hosted migration, email, deployment or enrollment change was performed.

## Arrival order

Signed callbacks can arrive before the monitor saves the provider's acceptance ID. Previously, those events were retained in the general event projection but could not establish operational scope. Their permanent-bounce classification was not retained for later suppression reconciliation.

The webhook now records eligible unscoped negative evidence through `record_operational_callback_evidence` before attempting immediate operational binding. It retains the unique provider ID, normalized single recipient, reason, signed event reference and source timestamp in private `operational_callback_evidence` storage. It does not save message bodies, authentication tokens or provider keys. Only permanent bounces, complaints and provider suppression qualify; transient/undetermined bounces and generic failures do not become delivery blocks.

The record operation attempts reconciliation immediately. A trigger also reconciles when an operational delivery's provider ID is inserted or updated. Both directions serialize by provider ID before looking for their counterpart, closing the overlap race as well as ordinary callback-first and acceptance-first arrival. Reconciliation requires an exact saved single recipient, no extra Cc/Bcc recipients and no tenant tag. Unknown or mismatched provider/recipient evidence never establishes platform scope.

Reason precedence is monotonic: complaint outranks hard bounce, which outranks provider suppression. Replays and weaker events cannot replace stronger provenance. Conflicting recipients for the same provider ID are rejected. The existing platform preference RPC retains its own stronger-reason precedence as well.

Saved email payloads, provider keys and send behavior are unchanged. Database reconciliation makes no provider request. If suppression persistence fails while acceptance is being saved, that acceptance update rolls back; retained evidence remains available for the existing saved-key recovery path. Do not create a replacement message to repair this failure.

## Migration and permissions

Apply `migrations/20260914164359_operational_callback_evidence.sql` after operational alert delivery and platform preference migrations, before deploying the updated callback handler. The migration is mirrored in `schema.sql`. The new table has RLS, no anonymous/authenticated grants, and service-only access. All three functions use invoker rights and fixed empty search paths. Indexes bound the lookup to provider ID; this does not scan historical events on every callback.

Preserve the evidence table and reconciliation trigger when rolling back application code. Removing them loses protection for retained early callbacks. A deployment without the migration returns retryable callback errors for evidence that cannot be retained. Validate permissions, trigger behavior and API schema refresh in the target environment before release.

## Review and limitations

Unmatched evidence stays private and inert until an operational provider ID is recorded. This includes emergency notifications without ledger rows and events from another environment sharing the provider. No address-only matching, automatic reassignment or historical import occurs. An operational provider ID that is never recovered cannot be reconciled automatically.

Older callbacks predating this migration are not reconstructed from free-text errors: those records may lack the permanent/transient classification. Reconcile historical failures from retained provider evidence with explicit environment and recipient provenance. Storage retention and unmatched-evidence review remain operational work; no automatic purge was added that might discard unresolved evidence. Existing deletion of a send does not delete its negative evidence or remove a recipient block.

The general `email_events` status projector keeps its existing ordering rules. The new evidence is independently monotonic so delayed stronger negative evidence is not lost merely because the status projection rejects an older event. Local evidence does not certify provider workspace/region, capacity or actual responder receipt.

## Verification

- 4 selected application files / 100 tests passed, covering signed receipt handling, evidence write failures, unknown IDs, recipient isolation and existing monitor behavior.
- 35 actual PostgreSQL 17 checks passed, including six new groups: real migration/schema agreement and access controls; early-event reconciliation; late/replayed reason precedence and provenance; mismatched scopes; concurrent arrival in both lock orders; and failed-write rollback/retry.
- The local security advisor reported no issues. Full application/test type checking, changed-file lint and the sender-registry check passed. The database checks run in the existing CI document/recovery/platform suite.

Database trigger behavior was checked against the [Supabase trigger documentation](https://supabase.com/docs/guides/database/postgres/triggers); local tests establish the behavior of this migration, not hosted acceptance.
