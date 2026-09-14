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

### Quick Stop submission receipts

Deploy migration 20260914184145_quick_stop_request_receipts.sql before the new public action. Continue to drain legacy new-request email producers before enabling the request-notice trigger. Old forms without a request UUID must refresh.

The action hashes normalized customer input and attachment content, then looks up the private account/request receipt before active-contact checks, date checks, qualification or upload. The submission transaction serializes that identity, checks client ownership, inserts the request (which queues its owner notice), and inserts its receipt. Matching retries return the original identity or a deletion tombstone; different input cannot reuse a completed identity. The form keeps its identity after a lost response.

Attachment paths include account, request, file index and SHA-256 content. Only a conflict at this deterministic path is accepted as an already-uploaded file; other upload errors prevent request creation. Public visitors retain the existing storage-cap exemption. No attachment deletion occurs on an uncertain submission: another attempt may already reference those files. Hosted retention, orphan cleanup and delivery acceptance remain open.

### Refund confirmation guard and remaining recovery work

The synchronous legacy refund function accepts only a succeeded refund with matching intent, requested amount and USD currency. Pending, action-required, failed, canceled, absent or mismatched evidence returns an instruction to verify provider status before another refund request. Quick Stop cancellation copy describes an uncertain outcome without claiming either success or that no refund occurred.

This guard does not add a durable attempt ledger or complete signed refund reconciliation. The legacy charge.refunded handler still requires a separate evidence review before it can support authoritative outcome notices. A canceled Quick Stop remains terminal after an uncertain refund; operators must inspect provider evidence rather than reopening cancellation. The owner cancellation email continues to request payment-status verification.

Provider reference: [Stripe Refund object and status](https://docs.stripe.com/api/refunds/object).

### Legacy refund webhook evidence

The legacy route now handles charge.refunded plus refund.created, refund.updated and refund.failed. Verify the live endpoint subscription against REQUIRED_LIVE_WEBHOOK_EVENTS during rollout; the declaration is local configuration evidence only. The handler reloads the charge in platform context and binds the current provider payment intent, captured amount, currency and mode before paginating all refunds (bounded to ten pages). Only succeeded refund amounts advance accounting. Incomplete or contradictory evidence returns a retryable handler error; it never creates another refund. A lower current provider total is flagged for operator review instead of silently rewriting financial history.

Writes fence the saved account, payment intent, amount and rail. Owner outcome notices and durable recovery of side effects are still outstanding. The existing mock webhook script's fabricated charge must now be rejected; it is not a substitute for real provider refund acceptance.

Provider reference: [Stripe refund pagination](https://docs.stripe.com/api/refunds/list).

### Recorded refund owner notices

Apply 20260914185901_payment_refund_owner_notices.sql before deploying the refund writers. The new payments.refund_notice_event_id column is rotated only by the two provider-verified accounting paths. Its trigger rejects invalid source transitions and commits the private owner notice alongside the payment update. No historical refund is backfilled, and an unchanged marker does not turn an unrelated payment edit into a new notice.

The immutable notice records the refund increment, cumulative refunded total, payment amount and payment intent. Source checks require the same account, payment identity and amount, a compatible paid/refunded state and a total at least as large as the saved event. A later partial refund preserves prior history; a deleted or changed source stops pending delivery. The notice opens the payments dashboard and describes recorded accounting rather than claiming bank receipt.

Immediate pickup failure leaves the committed notice for the existing owner-event worker. Verify background pickup configuration, signed callbacks and real owner receipt during hosted acceptance. This does not yet save refund attempts before money submission or recover interrupted invoice/customer-message side effects.

### Quick Stop cancellation refund attempts

Deploy 20260914190341_quick_stop_cancellation_refund_attempts.sql before the new cancellation caller. A positive cancellation refund intention saves an account-scoped private attempt in the cancellation transaction. A failed attempt insert rolls back cancellation and its owner notice before any provider call. No historical attempt is created automatically.

A prepared attempt can be claimed once. Current cancellation identity, payment intent, rail and prior balance are rechecked; competing attempts for the same payment cannot both submit. The provider key is quick_stop_cancellation_refund_v1_<attempt UUID>, with the same UUID in provider metadata and an explicit amount. Matching provider evidence is saved before reporting success. Only a succeeded provider refund with matching local accounting can mark the attempt accounted and set the Quick Stop refunded cents.

Prepared attempts interrupted before submission remain saved. Submitting and manual_review attempts are never automatically reclaimed. Deleted or changed sources require review; do not reopen cancellation or create another refund to resolve an uncertain result. Late signed-outcome reconciliation and operator recovery still need implementation. The existing refund accounting webhook can update the payment and owner notice, but does not yet close these attempts. The ledger follows the existing financial-record retention policy and restricts parent-account deletion rather than cascading away refund evidence. Hosted retention and legal-hold acceptance remain open.

### Late Quick Stop refund outcomes

Apply 20260914191438_quick_stop_refund_outcome_reconciliation.sql before deploying its caller. The legacy refund evidence reader exposes outcomes only after complete pagination and charge/refund validation. The webhook uses the saved attempt UUID from provider metadata and rechecks account, payment, payment intent, original amount, refund amount, currency and provider refund ID in the database.

A matching succeeded outcome closes an attempted request only after its payment accounting is present. Already-updated payment retries still reconcile the attempt; they do not repeat accounting, refund submission or the owner notice. Deleted requests retain verified provider evidence for review. Terminal failed/canceled evidence wins over stale positive or pending observations, and the affected Quick Stop no longer displays those cents as confirmed. The payment's financial history is left for operator review if the verified total contradicts it.

Late SDK responses and completion/timeout bookkeeping cannot downgrade an accounted result, except for matching terminal negative evidence. No reconciliation path calls the provider to create a refund. Missing callbacks still require recovery work and operator controls; hosted event subscriptions, actual receiver delivery and retention acceptance remain open.

### Connected-account transfer interruptions

Apply 20260914191924_connect_transfer_owner_notices.sql before deploying the updated webhook and onboarding-return caller. Drain old callers so an inline sender cannot compete with the saved workflow. Existing unmarked account rows are not backfilled. New accounts that never completed onboarding do not generate interruption notices.

Each status check reads the account before retrieving the current Accounts v2 Recipient stripe_transfers capability. Updates bind account ID, Stripe account ID, observed onboarding state, disabled timestamp, notice ID and observation version. Every successful observation rotates connect_status_version, even if capability status is unchanged. A competing update returns an error for a fresh provider check; unavailable status and failed saves return webhook 500 instead of acknowledging the event. The owner can retry an interrupted onboarding return.

A previously working account becoming inactive receives a new connect_notice_event_id and disabled timestamp. Its trigger commits a private owner notice in the same transaction. Recovery clears the disabled timestamp and retains the notice ID; repeated inactive observations preserve the original interruption. Current source validation cancels pending alerts after recovery, reconnection or a subsequent interruption. The saved title is Payment collection needs attention and the action opens payment settings. This describes Recipient transfers, not the separate bank payout capability.

An immediate pickup failure preserves the saved notice. The onboarding return uses the existing authenticated client; service-only queue pickup may be deferred to the background worker. Verify LGQ_OWNER_EVENT_NOTICES_ENABLED and signed callback/receiver evidence during hosted acceptance. Already submitted messages cannot be recalled. Local verification: 106 application tests, 144 PostgreSQL checks, type checking, lint, sender registry and clean local security advisor.

### Verified payment dispute notices

Apply 20260914192733_payment_dispute_owner_notices.sql before deploying the new dispute caller; drain the prior inline dispute sender. No historical or unmarked payment edit is backfilled. The existing charge.dispute.created and charge.dispute.closed events now wake one reconciler rather than prescribing the outcome from an old event body.

The reconciler looks up the saved PaymentIntent and destination rail, then retrieves the current platform dispute. It verifies dispute ID, PaymentIntent, live/test mode, USD currency and full payment amount. A database update binds account, payment amount/intent, prior status, prior dispute ID/status, notice ID and destination rail. Competing updates return an error for a fresh read. An early closing outcome can be applied from paid without waiting for an opening event; a terminal result cannot be reopened. Different dispute identities require review.

The payment marker saves opening and lost owner notices in the same transaction. Won changes invalidate pending opening instructions without adding another owner email. The snapshot identifies account, payment, amount, PaymentIntent and dispute; source validation stops pending mail after resolution or identity/rail changes. Copy asks the owner to review payments and makes no claim that an invoice was voided, funds settled or a particular balance was debited.

Partial/currency-adjusted amounts return legacy_dispute_amount_review_required before changing payment state. Incompatible payment states (including existing partial refunds), conflicting terminal results and identity conflicts are separately recorded webhook error codes. These require further accounting/recovery work; do not treat retry as permission to refund the full payment. Warning/inquiry and prevented statuses do not enter formal-chargeback accounting; their owner-notification policy remains open. The invoice update and feed append still occur after the payment transaction, and an interruption there requires recovery work. The saved owner notice remains durable even if those operations fail.

Local evidence: 217 application tests, 149 PostgreSQL checks, type checking, lint, registry and clean local security advisor. Hosted acceptance must include actual test-mode provider disputes, early/duplicate/out-of-order delivery, suppression and owner inbox evidence. Synthetic signed events with fabricated dispute IDs are now rejection tests and cannot prove positive financial acceptance.

Provider references: [Dispute object and statuses](https://docs.stripe.com/api/disputes/object), [retrieve the current dispute](https://docs.stripe.com/api/disputes/retrieve).

### Recurring-payment failure owner notices

Deploy 20260914193348_recurring_failure_owner_notices.sql before the updated dunning and recurring callers; drain the legacy inline owner sender. This migration adds a saved failure event UUID and the last recorded lifetime charge attempt on payments. It does not create historical notices or authorize another charge.

The failure recorder compares account, recurring plan, amount, lifetime counter, cycle counter and prior dunning state, and excludes paid/refunded/disputed outcomes. Only the current attempt can advance the last-recorded failure number. Replayed or competing handlers return before owner/client/feed effects. Database storage errors have a distinct RecurringFailureSaveError name; the initial charge and retry catch paths propagate them instead of interpreting a storage failure as a new card decline.

The trigger saves an owner notice on attempt one and on needs-card/exhausted outcomes. Intermediate scheduled failures update the failure identity without notifying. Source validation binds the same account, payment, plan, amount, attempt and dunning state; newer attempts, recovery or changed source identity stop pending old notices. The message links to recurring plans and asks the owner to review the payment and contact the client if needed. It does not promise a successful retry or that a card-update message reached the client.

Local verification: 104 application tests, 154 PostgreSQL checks, lint, registry and clean local security advisor; full type checking passed. This is a post-attempt recording/owner-notice change. Durable pre-provider charge attempts, authoritative recovery after a lost provider response, retry safety for unknown outcomes, and client/feed delivery recovery remain separate launch requirements. Retry exits for missing plans/cards, missing Connect setup and lifetime caps outside the recorder need explicit notice/recovery policy. Verify the background owner worker and real inbox evidence during hosted acceptance.

### Client-link quote approval notices

Apply 20260914194033_quote_approval_owner_notices.sql before deploying the updated approval caller, and drain the old inline owner-email producer. Only new quote_approved feed records marked owner_email_notice=quote_approval_v1 and acceptance_source=client_link enqueue. Existing feed records, owner-entered approvals, invoice signing and schedule acceptance do not get backfilled notices by this migration.

The source feed and its owner notice commit together. Feed uniqueness remains source_table/source_id/kind; the shared writer now recovers the account/job-scoped winning record on a unique-insert race. Replays dispatch the saved event ID through the existing one-attempt owner worker. Failed inline pickup does not fail acceptance, and a later job or lead failure still leaves the notice saved for background pickup.

Notice preparation requires the same job/account, original approval text/title, source and accepted amount, including a current matching job quote total. Deleted or edited evidence and changed quote totals stop pending delivery. The message states that approval was recorded and opens the job; it does not assert successful job promotion or deposit creation. Job promotion itself now compares status=new_lead before writing in_progress, preserving a later concurrent stage.

Local evidence: 66 application tests, 158 PostgreSQL checks, lint, registry and clean local advisor; full type checking passed. This is not an atomic transaction for the complete acceptance workflow. Add-on changes and signature writes happen before the feed; job/lead updates and deposits happen after it. Acceptance revision/request identity, concurrent deposit safety and recovery after interrupted side effects remain launch requirements. Verify background pickup, source cancellation, real inbox delivery and deployment order during hosted acceptance.

### Portal message requests

Apply 20260914194628_portal_message_request_receipts.sql before updated portal readers/actions and drain the old inline sender. Old open forms must refresh to obtain request IDs. The service-only transaction stores the message body, account/client binding, request hash, optional job history and inbox copy, and owner notice atomically. Explicit jobs must belong to the same account and client; phone snapshots are checked under the client lock. Matching concurrent or delayed requests reuse one saved message ID. Deleted clients/jobs retain replay receipts and invalidate pending notices.

Portal history reads the private receipt through account/client-scoped server queries, including jobless and phoneless messages. Inbox/job copies use the same ID and are deduplicated in the portal reader. Jobless owner notices open the saved client. Form retries preserve text and request UUID after uncertainty; only a confirmed save appends a message. An explicit new message resets the UUID. Accepted retries do not consume the new-message quota.

Local evidence: 69 application tests, 163 PostgreSQL checks, full type checking, registry and clean local security advisor; lint has no errors and one existing warning. Tests include rollback, concurrent submission, changed content, foreign-client job rejection, deletion replay, jobless history, concurrent-return identity and lost-response form retry. Owner SMS uses the saved ID as its key but interrupted SMS delivery remains outside the durable email queue. Verify migration ordering, portal/inbox history, background owner pickup and receiver delivery during hosted acceptance. Legacy history duplicates and timestamp pagination still need separate review.

### Quote-option prerequisite checks

Customer quote-option changes now stop when job, account settings, payment-plan or payment-history reads fail. Unavailable history cannot be interpreted as zero paid. Invalid payment amounts, overflow and invalid new quote totals also stop before writes or notices. Local verification: 54 quote-option tests, full type checking and lint passed.

The quote-option owner alert remains inline. This guard does not close the family: transactionally saved quote/history/notice records, concurrent payment/plan/quote protection, stable request/revision binding and interrupted follow-up recovery are still required. No hosted changes were made.

### Atomic quote-option changes

Apply 20260914200123_quote_option_owner_notices.sql before the updated caller; drain old inline quote-option writers. save_client_quote_options is service-only and locks the job before comparing expected status, start/schedule, quote items and amount. It locks the current account and existing plan/payment rows, rechecks the option window in the account timezone, rejects authorized plans and totals below current paid amounts, then saves the quote, client-financial feed revision and owner notice in one transaction. Failed history/notice storage rolls back the quote. Unchanged saves produce no new notice.

The owner worker uses the saved feed ID. Source validation requires original title/body/amount and current matching quote items/total; changed or deleted evidence stops pending delivery. Titles lead with removals when work was removed, and the body directs the owner to review existing invoices. Failed immediate pickup leaves the notice available for background processing. No invoice rewrite is implied.

Local evidence: 65 application tests, 167 PostgreSQL checks, full type checking, lint, registry and clean local security advisor. This protects one read/save attempt; the form still needs stable request and rendered-revision binding so a delayed HTTP retry after another edit cannot become a new change. Audit all payment/plan writer lock ordering and test hosted quote/history/inbox behavior before acceptance. Other owner families and the full ten-step goal remain open.

### Quote-option request receipts and displayed versions

Apply 20260914200549_quote_option_request_receipts.sql after 20260914200123_quote_option_owner_notices.sql and before updated callers. Existing open forms must refresh. The page hashes normalized displayed items and the stored amount; the form retains that version with one request UUID across uncertain responses. The server resolves token access, hashes job/version/unique sorted choices and checks the account-scoped private receipt before current quote reads. Matching retries return the original result and dispatch the original owner event; a different payload cannot reuse an ID.

The wrapper transaction serializes account/request IDs and commits the receipt with the existing quote/history/notice transaction. Receipt-write failures roll everything back. Job deletion clears its nullable reference while retaining the request hash, original total and event ID. Receipt data is included in the account-disposition registry. Form errors return without redirecting, preserving choices and request identity; users can reload the latest quote to begin another request. Success clears the request ID and refreshes server data. UI copy promises a saved notice, not immediate email delivery or automatically revised invoices.

Local verification: 127 application tests, 171 PostgreSQL checks, type checking, sender registry and clean local advisor; lint has four existing client-page/shared-test warnings and no errors. Rendered component tests are not hosted browser acceptance. Verify actual displayed-version matching, refresh behavior, background owner pickup and inbox evidence during release acceptance. Audit payment/plan writer ordering and finish separate approval/deposit recovery requirements before closing the full goal.

### Margin warnings

Apply 20260914201115_margin_owner_notices.sql before the evaluator and drain the previous inline sender. record_margin_owner_notice serializes account/job evaluations and validates current revenue, cost plus labor burden, ownership and account floor under source row locks. It commits internal margin_alert history and an eligible owner notice together. The cooldown uses persisted owner notices, not the nonexistent job_activity_feed relation; no second notice is created within four hours. Separate evaluations still create separate internal history entries. Failed notice insertion rolls back its history entry but does not undo the earlier cost write.

Pending notice validation checks original feed title/body and whether the job still has a current warning. Recovery or deleted/moved jobs cancel pending mail. A zero floor suppresses below-floor warnings while real losses remain eligible. Copy describes the recorded check and asks the owner to review current costs, with an estimated-cost caveat where appropriate. The legacy emailSent result represents provider acceptance, not inbox delivery; noticeSaved exposes durable persistence separately.

Local evidence: 26 application tests, 175 PostgreSQL checks, full type checking, lint, registry and clean local advisor. Cost creation is outside this evaluation transaction, so a crash before evaluation still needs a recovery mechanism. Review all cost-writer ordering and verify hosted pickup/delivery before closing this family. The four-hour cooldown includes pending, cancelled and reviewed notices and does not immediately re-alert after recovery within that window.
