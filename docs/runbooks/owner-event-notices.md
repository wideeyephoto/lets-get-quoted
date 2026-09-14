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

## Formal warranty claims

Apply 20260914182041_warranty_claim_owner_notices.sql after draining legacy
warranty claim actions. The claim row is the source; its insertion atomically
creates the private notice. The trigger verifies exact warranty/account/job
ownership and records original coverage status, description and attachment paths.
Parent RLS authorizes the insert; the restricted SECURITY DEFINER trigger permits
only queue insertion without exposing queue privileges to customers.

The worker checks that the claim remains open/scheduled and that source evidence
still matches. Resolved, changed or deleted claims cancel pending notices.
Immediate pickup uses only the saved claim/account and does not undo success on
mail errors. Coverage text refers to the date of the original report.

Verification: 52 application tests, 110 PostgreSQL checks, type checking, lint
and clean local security advisor. Request IDs and stable attachment paths remain
required for formal warranty forms: duplicate source creation is not yet covered.
Other warranty reminder senders remain in their scheduled-message workstream.
No hosted changes or receiver evidence in this pass.

## Warranty request receipts

Apply 20260914182236_warranty_request_receipts.sql before deploying updated
warranty forms/actions. Missing request IDs require a refreshed form. The form
retains its ID and inputs after an uncertain response and starts a new ID when
explicitly reopened. The action resolves current job access on every request.

A receipt is unique to account/job/warranty/request and binds normalized text and
attachment names/types/content hashes. The transaction rechecks warranty ownership,
serializes the request, snapshots coverage on the UTC report date, and commits the
claim, owner notice and receipt together. Replays return the original claim or a
null tombstone after deletion. Changed content cannot reuse the same request ID.

Completed receipts skip uploads. Files use stable account/warranty/request/content
paths with no overwrite; only identical-path 409 is treated as already uploaded.
Other upload errors stop claim creation. Interrupted storage writes can still
leave orphan files; storage capacity and retention are hosted acceptance checks.
The job timeline remains best effort; replay does not append a duplicate feed item.

Verification: 56 application tests, 112 PostgreSQL checks, type checking, lint
and clean local security advisor. This closes local formal warranty submission
retry protection; remaining owner families and hosted release stay open.

## Completed-job private feedback

Apply 20260914182551_private_feedback_owner_requests.sql before updated feedback
forms/actions. The shared request RPC accepts review_feedback and forces internal
visibility; other supported request kinds keep client visibility. Only marked
feed events enqueue, so older unmarked callers retain their existing behavior.

The rating and normalized feedback bind the request hash. Failed persistence is
reported to the customer; a saved receipt is required before success. A request
interruption retains pending owner mail. A deleted event remains a replay tombstone.
The form preserves inputs/ID after uncertainty and resets the ID when reopened.

Verification: 24 application tests, 114 database checks, type checking, lint
without errors and clean local security advisor. Other private-feedback entry
points, review campaigns and hosted acceptance remain open.

## Review-link private feedback

Apply 20260914182814_review_link_feedback_requests.sql before the updated
review-link form and action. Existing forms without IDs must refresh. The
server-rendered form carries a UUID for that form instance; rendering a new form
starts a new request. Public Google review routes are unchanged.

The service-only submission RPC resolves and locks the exact invite token,
binds a receipt to account/invite/request and normalized feedback, then commits
the invite response, notice and internal job event together. Jobless invites
produce notices without job events. Tokens are not copied into the notice.
Repeated requests reuse their receipt; changed feedback under the same ID fails.
The saved owner snapshot retains the rating at submission even if the invite
rating changes later. A deleted invite cancels pending notification.

The worker saves the current owner and exact rendered message before sending,
uses the dashboard for jobless feedback, and retains uncertain outcomes for
review. Confirmation says the note is saved, not that its email has arrived.

Verification: 59 application tests, 116 PostgreSQL checks, full type checking,
production-file lint and clean local security advisor. Hosted acceptance remains
open; no provider delivery or canary evidence is implied by these local checks.

## Quick Stop confirmations

Drain legacy confirmation email producers before applying
20260914183134_quick_stop_confirmation_notices.sql and deploying the new caller.
The awaiting_customer_payment to confirmed transition creates one notice per
Quick Stop. The trigger requires a paid payment belonging to the same account,
and a saved paid timestamp. No historical backfill or provider mutation is added.

The saved payment, paid timestamp, customer/address and arrival details must
still match before sending. Canceled, disputed, refunded or rescheduled sources
stop pending confirmation; progress to en_route/arrived/completed remains valid.
The recipient is the current owner and the link opens the Quick Stops dashboard.
The copy reports confirmation and directs the owner to review the appointment,
without claiming downstream calendar work already succeeded.

Verification: 19 application tests, 118 PostgreSQL checks, type checking, lint
and clean local security advisor. Refund/cancellation messages remain open:
intended refund cents written before a provider result cannot serve as proof
that money was refunded. Hosted payment and receiver acceptance remain open.

## Quick Stop cancellation and no-show notices

Drain legacy cancellation email producers before applying
20260914183419_quick_stop_cancellation_notices.sql and deploying its caller.
The status transition saves one notice for the Quick Stop, separately from its
confirmation notice. Saved customer/reason/cancellation timestamps bind delivery.
Later refunded/disputed status retains the historical cancellation notice.

Terminal requests return before refund side effects, and the database rejects
changing a terminal outcome into a different cancellation. Competing requests
still use the existing compare-and-set winner. The notice does not embed intended
refund cents, because those are recorded before the provider result. It tells the
owner to check payment details for refund status. This is not a refund-completion
notice or a migration of the customer refund SMS.

Verification: 26 application tests, 120 PostgreSQL checks, full type checking,
lint and clean local security advisor. Actual refund-outcome notification and
hosted financial/receiver acceptance remain open.

## Quick Stop payment-window expiration

Drain legacy expiry email producers before applying
20260914183645_quick_stop_expiry_notices.sql and deploying the updated sweep.
Only awaiting_customer_payment to offer_expired creates a notice. The saved
payment deadline must already have passed; an extended deadline makes a stale
sweep fail without expiring the request. Response-only expiration stays silent.

The saved deadline, payment ID and customer must match before sending. Paid or
refunded local payment evidence cancels pending expiry mail. Copy reports only
the expired window and directs the owner to review the request/payment; it does
not claim no charge occurred or that separate calendar cleanup succeeded.

Verification: 15 application tests, 122 PostgreSQL checks, full type checking,
production-file lint and clean local security advisor. New-request and verified
refund-outcome notices, other families and hosted acceptance remain open.

## New Quick Stop requests

Drain legacy new-request email producers before applying
20260914183857_quick_stop_request_owner_notices.sql and deploying the new caller.
An awaiting-contractor insert atomically records its owner notice. The current
request must still await a response, retain its source details and have an open
response window before sending. The email points to Quick Stops for its deadline.

A BEFORE INSERT invoker trigger normalizes email/phone whitespace and locks
account/contact keys in consistent order. A matching active email or phone rejects
the overlapping insert, closing the race in the old preflight check. Existing
application phone normalization remains in use. Closed requests allow a later
request; another account is independent. This is not delayed replay protection:
form request IDs and receipts remain necessary after a prior request closes.

Verification: 36 application tests, 124 PostgreSQL checks, full type checking,
lint and clean local security advisor. Hosted release and receiver acceptance,
form replay receipts and confirmed refund-outcome notices remain open.
