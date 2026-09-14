# Durable owner event notices

Local implementation, September 14, 2026. This is a partial step 4 migration,
not application-wide owner notification coverage or hosted acceptance.

## Migrated sources

The client question and follow-up functions mark new job_feed events with
meta.owner_email_notice = v1. A private database trigger creates one notice
in the same transaction for client_question, client_followup and rebook_requested.
The follow-up flow includes warranty-help and more-work requests; formal warranty
claims through other actions are not covered by this migration.

The trigger freezes the event title, body and job ID. These source details cannot
be changed in the notice. Its identity is source type, source UUID and event kind.
No historical backfill is performed. Older application workers create unmarked
feed events and keep their original sender, avoiding a duplicate rollout path.

After saving the event, the caller attempts only that event in its verified
workspace. A crash before dispatch leaves a pending notice. The worker saves the
current normalized owner address, exact rendered message, credential fingerprint
and owner-event:v1:<notice UUID> provider key before submission. Deleted sources
cancel unsent notices. One atomic claim wins; an attempted notice is never
blindly reclaimed. Missing recipients, preparation errors, unknown outcomes and
unconfirmed delivery remain visible for review.

Signed callbacks bind the saved notice/account/single recipient/provider before
changing event history or suppression. Delivered evidence closes the notice;
stronger negative outcomes require review. A delayed acknowledgement or timeout
cannot overwrite an early callback. Missing/unprepared callbacks are quarantined.
Operator resolution retains evidence; this path never sends another message.

## Background pickup and rollout

Apply 20260914175031_owner_event_notices.sql after the existing email migrations,
then deploy the marked callers, worker and callback handler together. The proposed
owner-event-notices cron runs every five minutes, with at most five new claims
per run and a 120-second function limit. It uses the existing authenticated cron
wrapper and health reporting. LGQ_OWNER_EVENT_NOTICES_ENABLED must equal true
before background pickup runs; it defaults disabled. Inline attempts preserve
the existing request-time notification behavior. The background switch is not
a global email pause control.

Before enabling in a hosted environment, verify provider capacity, scoped cohort
controls, pending legacy evidence, scheduler receipt and operator alerts under
steps 8–10. No environment setting or hosted schedule was changed in this pass.

Review deadline: five minutes for a lost sending claim and thirty minutes for
accepted messages with no final outcome. Notices and snapshots remain private.
Deleting a source retains evidence; deleting its account follows the registered
account cleanup policy. Legal-hold execution and runtime retention remain hosted
release checks, not conclusions from the registry alone.

## Verification and limits

192 application tests across nine selected files passed, including the real
cron authentication wrapper, disabled/enabled controls, unhealthy backlog,
source dispatch, attachments, snapshot worker, signed callbacks and installed SDK
HTTP request boundary. The combined PostgreSQL 17 runner passed 93 checks; new
coverage includes atomic source rollback, concurrent claims, tenant boundaries,
immutable source/message data, deletion and callback ordering. Ten sender-registry
tests and changed-file lint passed. The local security advisor reported no issues.
Full application/test type checking completed with no diagnostics.

The subsequent request-receipt migration below closes repeated-submission protection for these two migrated request flows. Remaining contractor alerts,
owner confirmations and lead notices are still
open under step 4; steps 5–10 also remain open.

## Request receipts — September 14 follow-up

Apply 20260914175807_client_owner_request_receipts.sql before the updated forms,
actions and request libraries. Questions include a request UUID in their server-rendered
form. Follow-up forms create one UUID at first submission, keep it and the input
contents after an uncertain response, and replace it when the customer closes
and reopens the form. Old forms without an ID must refresh; the server never
silently generates a new identity for an unidentifiable retry.

Every request revalidates the access token. A private receipt is unique to account,
job and request UUID and binds the normalized request category/text and attachment
content hashes. The service-only submission RPC checks job ownership, serializes
concurrent submissions of that identity, and commits the receipt, feed event and
owner notice together. Identical retries reuse the event. Changed content under
the same ID fails; a new ID represents a deliberate new request.

The receipt survives feed deletion with a null event ID, so delayed retries cannot
recreate deleted requests or notices. Account closure removes only that account's
receipts. Quote-question SMS also uses the stable request ID. This does not migrate
other SMS families or other owner email callers.

Follow-up attachments use deterministic workspace/job/request/content paths and
never overwrite an existing object. A completed receipt skips repeat upload;
a provider 409 at the identical path is treated as the already-saved object.
Other upload failures stop source creation rather than silently losing a photo.
Storage is external to the database transaction: interrupted uploads can leave
unreferenced files and capacity is checked before a batch. Existing storage
retention and capacity acceptance remain release requirements.

Verification: **50 application tests**, **99 PostgreSQL 17 checks**, full type
checking and the local security advisor passed. Changed-file lint had no errors;
one existing unused-variable warning in the page and four existing unused-import
warnings in the server-action test remain. The rendered DOM test proves stable
request IDs and preserved text across a lost response, plus a new ID after reopening.
No hosted migration, email, configuration change or deployment occurred.

## Messaging application events

Apply 20260914180733_messaging_owner_event_notices.sql after the owner-event
foundation. Drain old messaging submission/review/reconciliation actions before
applying the trigger and deploying the new callers: old code sends inline and
would otherwise overlap the queued notice. No historical backfill is included.

The append-only messaging audit event is the source identity. Submission and
resubmission receipts, review decisions requiring action or recording approval/
rejection, and completed activation transitions enqueue in the source transaction.
Unchanged review retries and already-active polls remain silent. The source
snapshot contains business name, application ID/revision, normalized application
contact and the customer-facing update; tax/provider audit metadata is excluded.

A new revision/contact or obsolete status/review note cancels an unsent notice.
Submission receipts remain valid after later statuses within the same revision.
Messages link to the dedicated-number dashboard and use the shared owner-event
snapshot, provider identity, signed callback and manual-review controls. Pickup
is bounded to five pending notices for the exact account/application. Pickup
failure does not undo a committed business action; background pickup remains
required to recover pending work after interruption.

Messaging tables grant the service only SELECT. The source-availability helper
therefore uses SECURITY DEFINER solely to reload the persisted notice and acquire
source row locks, returning a boolean. It has an empty search path, no mutation,
and EXECUTE only for service_role. Other notice operations remain invoker functions.
Production-style service privileges are exercised in the actual provisioning suite.

Verification: 85 application tests, 103 email database checks, 45 provisioning
checks, full type checking, lint, registry checks and clean local security advisor.
Founder/staff submission alerts remain a separate, unmigrated family under step 7.
Legacy messaging email helper exports remain for compatibility but have no production
callers after this migration. Hosted acceptance and canary evidence remain open.

## Change-order decisions

Apply 20260914181805_change_order_owner_notices.sql after draining legacy
change-order response actions. The source is the change-order row and its single
sent-to-approved/declined transition. The decision and notice commit together;
source type/order UUID/decision identify the message. There is no backfill.

The trigger requires the same account/job/order identity and a response timestamp
and signature. It is a private SECURITY DEFINER trigger because an authorized
parent row update must be able to append to the private queue without granting
customers queue access. Parent UPDATE authorization remains governed by RLS.
It has an empty search path and no public execute privilege.

The saved title, amount, signature, decline reason, job and response timestamp
must still match before claim/preparation. Timestamp comparison uses epoch values
so a database session timezone change does not invalidate a legitimate decision.
Deletion or changed evidence cancels pending delivery. Immediate dispatch uses
the exact account/order, and errors leave the saved decision successful.

Verification: 50 application tests, 107 PostgreSQL checks, full type checking,
lint and clean local security advisor. Customer-facing change-order delivery,
job-total reconciliation and remaining owner families are separate workstreams.
Hosted release and canary acceptance remain open.
