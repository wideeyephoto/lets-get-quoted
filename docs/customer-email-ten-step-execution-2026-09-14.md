# Customer email ten-step execution record

Objective: complete all ten agreed steps, commit verified work along the way,
then push when finished. This record supplements the M1–M6 rollout plan; it does
not replace any requirement with a smaller target. Hosted acceptance and the
controlled canary require actual environment and receiver evidence.

| Step | Requirement | Status | Evidence needed to close |
| --- | --- | --- | --- |
| 1 | Complete website-notice snapshots | Implemented locally; verification below | Immutable recipient/content/link/sender snapshots before submission; failure and mutation tests |
| 2 | Provider identity and deduplication keys | Implemented locally; verification below | Saved credential fingerprint and stable per-notice key; actual request-boundary proof; hosted scope verified in step 9 |
| 3 | Signed website callback recovery | Implemented locally; verification below | Saved binding checks, lost-acceptance repair, monotonic outcomes and callback/worker race tests without resend |
| 4 | Remaining domain/owner notices | Implemented locally; verification below | Inventoried source events and recipients; defined restoration behavior; every intended event has durable identity |
| 5 | Appointment/booking/selection reminders | Ledger repaired locally; background recovery/callback integration remains | Durable scheduled occurrences and obsolete-event cancellation, including concurrent and repeated triggers |
| 6 | Campaign/review/rebook messages | Ledger repaired locally; background recovery/callback integration remains | Durable recipient occurrences, audience-rerun deduplication, correct opt-out policy |
| 7 | Remaining email families | Platform queue repaired; legacy identities and auth-token retention remain | Digests/support/merchandise/auth/report inventory closed with durable identities and token/report preservation |
| 8 | Operator recovery controls | Implemented locally; verification below | Authorized detail/closeout and deliberate-resend flows; state, tenancy and duplicate-request verification |
| 9 | Hosted release and acceptance | Database rollout verified on staging; application/inbox and production acceptance open | Environment/provider/capacity/retention evidence; applied migrations; inbox, suppression, failure and rollback acceptance |
| 10 | Controlled canary and expansion review | Open | Required clean scheduled runs, alert receipt, responder/backup and reviewed expansion decision |

Push remains pending until the agreed work is finished. An existing historical
canary check or prior release is not proof for this release.

## September 14 — website snapshots and keys

Prepared migration `20260914173129_website_domain_notice_snapshots.sql` adds one
immutable snapshot per connection notice. It requires the saved owner recipient,
workspace and current claim, plus the unchanged site's domain/verification event.
It freezes the rendered message, credential fingerprint and
`website-domain-connected:v1:<notice UUID>` key. Current delivery blocks are
checked again after persistence. No retry was enabled.

Observed local verification:

- Four selected application files: **47 tests passed** (`custom-domain-reconciler`, `custom-domain-connected-email`, `domain-failure-email-transport`, `email-required-workspace`).
- `node scripts/verify-email-domain-failure-notices.mjs`: **48/48 checks passed**, using actual migrations on disposable PostgreSQL 17. Includes six new website snapshot groups and the previous 42 checks.
- Local Supabase security advisor: **No issues found**.
- Changed-file lint and sender-registry tests: passed; all **21** reviewed transport signatures still match.
- Full application/test type checking completed with exit 0 and no diagnostics.

The request-boundary tests use the installed SDK with offline HTTP responses,
and compare saved content to the submitted body and actual idempotency header.
Hosted scope, receiver delivery and canary results remain unverified for this change.

## September 14 — website signed callback recovery

Steps 1–2 committed as 84ccbad1f. Step 3 adds migration
20260914173622_website_domain_notice_callbacks.sql and signed webhook binding.
Callbacks match the saved notice, workspace, single recipient and provider ID
before event history or suppression changes. Early callbacks repair acceptance;
late acknowledgements/timeouts cannot overwrite them. Stronger negative evidence
wins out of order. Explicit operator closeout survives while evidence is retained.
Missing/unprepared notices are quarantined without assigning recipient effects.
No callback triggers another send.

Verification: **97 application tests**, **57/57 actual PostgreSQL 17 checks**,
changed-file lint and full application/test type checking passed. The local
Supabase security advisor reported **No issues found**. PostgreSQL checks cover
concurrent callback/completion, provider collisions, tenant/recipient mismatch,
expired observation, immutable snapshots and operator closeout. Worker tests
cover early delivery followed by acknowledgement or timeout and a second run.
Hosted acceptance and canary evidence remain open. Step 4 is next.

## September 14 — restoration notices and remaining owner inventory

Step 3 committed as a959c44f7. Restoration now has an atomic source event,
private immutable snapshot, current recipient/provider key, one-attempt worker
and signed callback repair. See the [restoration runbook](runbooks/email-domain-restoration-notices.md).
The domain reconciler processes both queues even without management credentials,
and a failure reading one queue does not hide the other. Interactive verification
and scheduled reconciliation fence status/provider changes to preserve the
winning recovery timestamp.

Observed local verification: **153 application tests**, **75/75 PostgreSQL 17
checks**, changed-file lint, **10 registry tests** and the local security advisor
passed. Provider receiver/region/capacity evidence remains unverified.

Step 4 remains open: the source scan found generic contractor alerts for client
questions/changes, payments/disputes, scheduling, warranty, margin, review and
subcontractor events; quote/invoice/payment/review confirmation wrappers; lead
notifications from public leads, marketplace and booking; and messaging
application submission/status notices. These need source identities and saved
payloads too. They must not be described as protected merely because domain
notices are done. Digests/support are also tracked in step 7 and booking/reminder
notifications in step 5; overlap does not remove their acceptance requirement.

Full application/test type checking completed successfully with no diagnostics after the final application changes.

## September 14 — shared owner-event queue, first source migration

Restoration committed as 639a2e877. Added a shared owner-event ledger with atomic
source creation, immutable source/message snapshots, one-winner claims and signed
callback repair. Client questions and follow-up/more-work requests now dispatch
their saved event ID, so a request interruption cannot lose the pending notice.
A bounded, authenticated five-minute pickup route is configured locally and
background sending defaults disabled. See the [owner-event runbook](runbooks/owner-event-notices.md).

Observed verification: **192 application tests**, **93/93 PostgreSQL 17 checks**,
**10 sender-registry tests**, changed-file lint and a clean local security advisor.
No hosted migration, email, environment change, deployment or canary expansion.

Step 4 remains in progress. Dispatch deduplication now covers each migrated feed
event, but repeated HTTP submissions creating separate feed rows still need an
explicit request identity. Remaining owner alert callers and families are not
silently counted as migrated. The full ten-step goal and final push stay open.

Full application/test type checking completed with exit 0 and no diagnostics for the owner-event implementation.

## September 14 — request IDs for migrated customer requests

Owner event foundation committed as 31db0be62. Question and follow-up forms now
carry stable request IDs through their actions. A private request receipt binds
content and atomically commits with its feed event and owner notice. Concurrent
or delayed identical submissions reuse the result; changed content is rejected.
Deletion retains a replay tombstone. Attachment paths and quote-question SMS keys
are stable across retries. See the [updated owner-event runbook](runbooks/owner-event-notices.md).

Verification: **50 application tests**, **99 PostgreSQL checks**, full type checking
and local security advisor passed. Changed-file lint reports no errors and the
same existing unused-variable/import warnings. The form is exercised in a rendered
DOM, including uncertain response, retry and explicit new request.

Step 4 remains open for the remaining owner alert/confirmation, lead and messaging
application families. The full ten-step goal, hosted acceptance and final push
remain open. No live changes were made.

## September 14 — messaging owner notices

Prepared messaging event trigger and switched submission, review and activation
actions to the owner-event queue. Saved application contacts and dashboard links
are used; unchanged reviews and repeated active polls do not enqueue duplicates.
Changed revision/status/review notes cancel obsolete pending notices.

Verification: 85 application tests, 103 combined email PostgreSQL checks, 45 real
provisioning PostgreSQL checks, full type checking, lint and 10 registry tests
passed. The local security advisor reported no issues. The real provisioning
suite includes the owner migrations and validates source locking with production
service privileges. Action tests preserve successful review after pickup failure.
Deployment must drain legacy inline senders before enabling the event trigger.
No hosted changes or receiver evidence; step 4 remains in progress.

### Twenty-ninth-pass implementation — change-order decision notices

- **T16/T17/T19:** A sent-to-approved/declined transition now commits its owner notice atomically. Existing one-winner response guards prevent repeated decisions; saved job, title, amount, signature, reason and response time bind the source before sending. Changed/deleted decisions cancel pending notices.
- **Verification:** 50 application tests, 107 PostgreSQL checks, full type checking, lint and clean local security advisor passed. Database checks include concurrent responses, replay, invalid-source rollback, timezone changes and obsolete decisions. Immediate pickup failure preserves the saved customer response.
- **Remaining:** Drain legacy response actions before deploying this trigger. This migration covers owner decision alerts; customer change-order delivery and other owner families retain their separate requirements. No hosted rollout or canary evidence.

### Thirtieth-pass implementation — formal warranty claim owner notices

- **T16/T17/T19:** Claim insertion now saves an owner notice in the same transaction, binding warranty/job ownership, original coverage, description and attachments. One worker claims each notice. Resolved, changed and deleted claims cancel pending alerts; immediate pickup failure leaves the saved claim successful.
- **Verification:** 52 application tests, 110 PostgreSQL checks, full type checking, changed-file lint and clean local security advisor passed. A failed notice write rolls back its claim.
- **Remaining:** Formal warranty forms still need request IDs and stable attachment paths so repeated submissions cannot create separate claims. The queue protects one saved claim, not repeated source creation. Drain legacy warranty actions before deployment. Other owner families and hosted acceptance remain open.

### Thirty-first-pass implementation — warranty submission request receipts

- **T16/T17:** Warranty forms retain a request UUID and entered text after uncertain submission. A private scoped receipt atomically commits with the claim and owner notice; matching retries reuse it and changed content is rejected. Deleted claims retain replay tombstones. Attachment paths bind request and file content; completed receipts skip repeat upload.
- **Verification:** 56 application tests including a rendered form, 112 PostgreSQL checks, full type checking, lint and clean local security advisor passed. Tests cover concurrent requests, changed content, tenant mismatch, lost response, stable attachment paths and deletion.
- **Remaining:** Hosted capacity, retention and rollout acceptance remain open. Uploads are external to the transaction and interrupted uploads can leave unreferenced files. Other owner families and steps 5–10 remain open.

### Thirty-second-pass implementation — private feedback request notices

- **T16/T17/T19:** Completed-job private feedback now saves its internal timeline event, request receipt and owner notice atomically. Request IDs persist after uncertain responses; changed feedback/rating cannot reuse an ID. Failed saves return an error and deleted events retain replay tombstones.
- **Verification:** 24 application tests including the rendered retry form, 114 PostgreSQL checks, full type checking and clean local security advisor passed. Lint has no errors and three existing unused-import warnings in the shared action test. Database checks verify internal visibility and unchanged visibility for existing customer questions.
- **Remaining:** Public review links are unchanged. Review-request campaigns and other private-feedback entry points remain separate families. Other owner alerts, hosted acceptance and steps 5–10 remain open.

### Thirty-third-pass implementation — review-link private feedback

- **T16/T17/T19:** Review-link forms carry request IDs. A service-only transaction resolves the token, records the feedback receipt and invite update, appends an internal job event when applicable, and saves the owner notice. Concurrent retries reuse the source; changed content is rejected. Jobless notices link to the dashboard and deleted invites cancel pending sends.
- **Verification:** 59 application tests, 116 PostgreSQL checks, full type checking, changed production-file lint and clean local security advisor passed. The receipt registry covers account disposition. Confirmation copy reports saved feedback without claiming email arrival.
- **Remaining:** Old forms without request IDs must refresh. A newly rendered form represents a new request. Hosted delivery/retention/capacity acceptance, other owner families and steps 5–10 remain open. No live email or rollout occurred.

### Thirty-fourth-pass implementation — Quick Stop confirmation owner notices

- **T16/T17/T19:** The awaiting-payment to confirmed transition now commits its owner notice and validates a paid payment in the same account. Saved payment, arrival and customer details bind preparation; canceled/changed/refunded sources stop pending mail. Inline pickup uses the saved Quick Stop ID, with a fixed Quick Stops dashboard link.
- **Verification:** 19 application tests, 118 PostgreSQL checks, full type checking, changed-file lint and clean local security advisor passed. Database fixtures exercise the confirmation transition and payment binding, not a hosted payment-provider round trip.
- **Remaining:** Drain legacy confirmation email producers before applying the trigger. Refund/cancellation alerts must use actual refund outcomes: current cancellation code initially records intended refund cents before the provider result. Those alerts and other payment/owner families remain open. No live charge, refund, email or rollout occurred.

### Thirty-fifth-pass implementation — Quick Stop cancellation owner notices

- **T16/T17/T19:** Cancellation/no-show transitions now atomically save a private owner notice. Terminal requests return before refund execution or notification; the database rejects reclassification into another cancellation. Notice copy reports the cancellation and asks the owner to verify refund status rather than treating intended refund cents as completion.
- **Verification:** 26 application tests, 120 PostgreSQL checks, full type checking, lint and clean local security advisor passed. Tests cover competing cancellations, repeated terminal requests, corrected intended refund amounts and subsequent refund status.
- **Remaining:** Confirmed refund-outcome notifications need authoritative provider evidence; refund execution and customer SMS have not been migrated by this owner-email change. Drain legacy cancellation email producers at rollout. Other owner families and hosted acceptance remain open.

### Thirty-sixth-pass implementation — Quick Stop expired-offer notices

- **T16/T17/T19:** Payment-window expiration now commits its owner notice atomically. Saved deadline/payment/customer identity binds pending delivery; late paid/refunded evidence cancels it. An extended future deadline rejects a stale expiration. Copy does not claim that nothing was charged or that downstream cleanup completed.
- **Verification:** 15 application tests, 122 PostgreSQL checks, full type checking, production-file lint and clean local security advisor passed. Concurrent/repeated expiration produces one notice; response-only expiration stays silent as before.
- **Remaining:** Drain legacy expiry email producers before applying the trigger. New Quick Stop requests and authoritative refund outcomes remain open, along with other owner families and hosted acceptance. No live payment or email operation occurred.

### Thirty-seventh-pass implementation — new Quick Stop owner notices

- **T16/T17/T19:** New awaiting-contractor requests now commit their owner notice atomically. A database contact guard serializes matching email/phone submissions within an account; callers can no longer race the earlier read-only duplicate check. Answered, expired or changed source requests stop pending new-request mail.
- **Verification:** 36 application tests, 124 PostgreSQL checks, full type checking, lint and clean local security advisor passed. Concurrent requests sharing either contact channel create one request; another account and a later request after closure remain allowed.
- **Remaining:** A form request identity is still required for delayed retries after the earlier request closes. Active-contact protection alone is not a replay receipt. Drain legacy new-request email producers before deployment. Authoritative refund outcomes, remaining owner families and hosted acceptance stay open.

### Thirty-eighth-pass implementation — Quick Stop submission receipts

- **T16/T17:** Forms keep a request UUID across uncertain responses. A private account-scoped receipt commits with the request and owner notice; concurrent retries reuse the result and changed content is rejected. Closed/deleted requests retain replay receipts. Attachment paths bind account, request, index and file content; failed uploads prevent partial request submission while preserving the public-visitor storage allowance exemption.
- **Verification:** 43 application tests including a rendered retry form, 127 PostgreSQL checks, full type checking, changed-file lint and clean local security advisor passed. Tests cover concurrent submissions, closure/deletion replay, client tenancy, receipt failure rollback and stable attachments. Database checks use actual migrations with source fixtures.
- **Remaining:** Hosted delivery, capacity, retention and rollout acceptance remain open. Interrupted uploads may leave unreferenced files. Old forms require refresh. Authoritative refund outcomes, other owner families and steps 5–10 remain open; final push remains pending.

### Thirty-ninth-pass implementation — confirmed synchronous refund results

- **T16/T19:** The legacy refund function now requires a succeeded provider refund with matching payment intent, amount and USD currency before advancing payment totals or running completion side effects. Quick Stop cancellation writes zero completed refund cents initially, records cents only after confirmation, and uses neutral customer text when the provider or database outcome is uncertain. Concurrent cancellation losers no longer return the intended refund as completed. Customer cancellation/no-show confirmation pages also avoid unconditional refund-success claims.
- **Verification:** 61 application tests passed, covering pending/requires-action/failed/canceled/missing/unknown statuses, mismatched provider evidence, expanded payment intents, cancellation uncertainty and existing accounting/rail guards. Full application/test type checking and changed-file lint passed. No live refund or notification was sent.
- **Remaining:** This is the synchronous confirmation guard, not a complete durable refund workflow. Persisted refund attempts, signed outcome reconciliation (including legacy charge.refunded validation), late outcome notices and operator recovery remain open. Other owner families and steps 5–10 remain open; final push is pending.

### Fortieth-pass implementation — current provider refund evidence

- **T16/T19:** Legacy refund webhooks refetch the platform charge, bind its payment intent/amount/currency/mode to the saved payment, and paginate refunds to count only succeeded outcomes. Pending, failed and canceled refunds never trigger completion. Unknown/mismatched/incomplete evidence fails for retry; a lower provider total is flagged for review. Writes recheck account, payment intent, amount and payment rail. Later refund.created/updated/failed events reuse the same verification and do not create refunds.
- **Verification:** 93 application tests passed, including pagination, duplicate pages, scope mismatch, unavailable provider, pending aggregate, later completion and repeated-event notification guards. Full type checking and changed-file lint passed. The existing synthetic webhook exercise now expects fabricated refund evidence to be rejected; that environment-dependent script was not run.
- **Remaining:** Hosted subscription must include refund.created, refund.updated and refund.failed; no hosted endpoint was changed. Durable refund attempt records, late outcome owner notices, recovery after interrupted side effects and hosted receiver acceptance remain open. Steps 4–10 and final push remain open.

### Forty-first-pass implementation — durable refund owner notices

- **T16/T17/T19:** Verified synchronous and webhook refund accounting writes now rotate a notice event UUID. A database trigger saves the owner notice in the same transaction, freezing the refund increment and cumulative total. Concurrent/repeated accounting updates create one notice; later partial refunds get separate events. Changed payment identity, ownership, amount or incompatible state prevents pending delivery. Owner notices open the payments dashboard.
- **Verification:** 76 application tests, 130 actual PostgreSQL checks, full type checking, changed-file lint and clean local security advisor passed. Tests cover concurrent updates, later partial refunds, stale source cancellation, queue-write rollback, one-attempt sending and successful refund preservation when immediate pickup fails.
- **Remaining:** Apply the migration before deploying marker-writing callers; unmarked legacy writes are deliberately not backfilled. Durable pre-provider refund attempts and recovery after interrupted invoice/customer-message side effects remain open. Hosted provider subscription, receiver evidence, retention and rollout acceptance remain open. Other owner families and steps 5–10 remain open; final push is pending.

### Forty-second-pass implementation — saved Quick Stop cancellation refund attempts

- **T16/T17/T19:** Cancellation and its intended refund attempt now commit together before contacting the provider. Private attempts bind account, Quick Stop, payment intent, original payment amount, requested cents and prior refunded balance. One caller claims submission; its UUID fixes the provider key and metadata. Provider responses are saved before completion. Pending/failed/unknown outcomes remain reviewable without automatic resubmission; completion requires matching provider and accounting evidence and updates Quick Stop refunded cents atomically.
- **Verification:** 61 application tests, 135 PostgreSQL checks, full type checking, changed-file lint and clean local security advisor passed. Coverage includes concurrent claims, competing requests sharing a payment, changed/deleted sources, pending outcomes, amount mismatch, lost response, immutable identity and cancellation rollback when attempt storage fails.
- **Remaining:** Apply migration before deploying the new cancellation caller. No historical attempts are backfilled. Automatic reconciliation of saved attempts from later signed outcomes, operator closeout/recovery, non-Quick-Stop refund request identities and interrupted invoice/customer-message recovery remain open. Hosted acceptance and the full ten-step goal remain open; final push is pending.

### Forty-third-pass implementation — late Quick Stop refund reconciliation

- **T16/T17/T19:** Complete provider-verified refund lists now reconcile tagged saved attempts after accounting, including webhook retries where the payment was already updated. Matching late success closes the attempt and records Quick Stop refund cents without creating another refund or owner notice. Terminal failure/cancellation remains reviewable and clears the affected Quick Stop completion display; stale pending/success reads cannot override terminal negative evidence. SDK/webhook completion and timeout races preserve the accounted result.
- **Verification:** 78 application tests, 139 PostgreSQL checks, full type checking, changed-file lint and clean local security advisor passed. Tests cover late confirmation, duplicate callbacks, accounting-before-closeout failures, incomplete pagination, cross-account/amount rejection, deleted sources and concurrent completion. No hosted provider call or notification was sent.
- **Remaining:** Deploy the reconciliation migration before the caller and verify the required refund event subscription during hosted acceptance. Operator review/closeout, recovery for attempts with no delivered callback, non-Quick-Stop refund request identities, and interrupted invoice/customer-message recovery remain open. Other owner families and steps 5–10 remain open; final push is pending.

### Forty-fourth-pass implementation — connected-account payment setup notices

- **T16/T17/T19:** A working-to-inactive transfer transition commits its owner notice with the account update. Both webhook and onboarding-return checks snapshot the account before fetching the live Recipient capability, fence the write by account/provider identity and observation version, and retain the interruption ID through recovery. Even unchanged observations advance the version; competing updates request a fresh check. Unavailable status and database failures no longer return webhook success. Recovery/reconnection cancels pending obsolete alerts; copy describes payment setup without claiming bank payouts stopped.
- **Verification:** 106 application tests, 144 actual PostgreSQL checks, full type checking, changed production-file/test lint, 10 sender-registry tests and clean local security advisor passed. Coverage includes concurrent interruptions, repeated inactive status, unchanged-active versus delayed-inactive results, recovery cycles, replacement accounts, queue-write rollback, settings links and retryable webhook failures. No live provider request, email or rollout occurred.
- **Remaining:** Apply 20260914191924_connect_transfer_owner_notices.sql before deploying the new callers and drain legacy webhook/onboarding writers. Verify background pickup and real receiver delivery during hosted acceptance. Disputes, failed-payment alerts, remaining owner families, refund recovery and steps 5–10 remain open; final push is pending.

### Forty-fifth-pass implementation — provider-verified dispute owner notices

- **T16/T17/T19:** Dispute events retrieve the current platform dispute and bind its ID, PaymentIntent, mode, currency and full payment amount before a guarded update. Opening/lost notices commit with that update; won outcomes cancel pending opening instructions without a new email. Delayed opening events can apply a current closing outcome even when no opening was saved. Terminal outcomes cannot be reopened by stale evidence. Notices link to payments and do not claim bank settlement or invoice cleanup.
- **Verification:** 217 application tests across seven files, 149 actual PostgreSQL checks, full type checking, changed-file lint, 10 sender-registry tests and clean local security advisor passed. Coverage includes current-versus-event status, early closeout, duplicate/competing updates, evidence mismatch, scope/rail rejection, payment identity changes, queue rollback and pickup failure. The synthetic webhook script now expects fabricated disputes to fail without changing payment/invoice state; its syntax was checked, but the environment-dependent script was not run.
- **Remaining:** Apply 20260914192733_payment_dispute_owner_notices.sql before deploying the new caller and drain the old inline sender. Partial/currency-adjusted dispute amounts and incompatible payment states return a reviewable webhook error rather than refunding an entire payment. Inquiry/prevented statuses remain outside formal-chargeback accounting and need their own notification policy. Interrupted invoice/feed follow-up recovery, operator closeout, actual provider/receiver acceptance, failed-payment alerts, other owner families and steps 5–10 remain open; final push is pending.

### Forty-sixth-pass implementation — saved recurring-payment failure notices

- **T16/T17/T19:** Recording a recurring charge failure now binds account, plan, amount, lifetime charge counter, retry counter and dunning state. A persisted last-recorded attempt prevents competing or delayed handlers from repeating the transition or its follow-ups. The first failure and terminal retry failures save an owner notice atomically; intermediate retries remain silent. A later attempt, recovery or changed plan invalidates pending old notices. Copy asks for review without claiming provider decline, client receipt or successful retry.
- **Verification:** 104 application tests across seven files, 154 actual PostgreSQL checks, changed-file lint, 10 sender-registry tests and clean local security advisor passed. Full type checking passed. Lint has no errors and five existing unused-import warnings in the recurring engine test. Coverage includes concurrent failure saves, replay, newer payment outcomes, intermediate/terminal attempts, queue rollback, unavailable pickup and storage errors kept distinct from provider declines.
- **Remaining:** Apply 20260914193348_recurring_failure_owner_notices.sql before the new callers and drain the old inline sender. This protects recording and owner notification after an attempt; saved pre-provider attempts, authoritative reconciliation of unknown charge responses, terminal exits outside the recorder, and interrupted client/feed follow-ups remain open. Hosted rollout/receiver acceptance, remaining owner families and steps 5–10 stay open; final push is pending.

### Forty-seventh-pass implementation — saved quote-approval owner notices

- **T16/T17/T19:** New client-link approval feed entries commit their owner notice atomically. Repeated approvals reuse the saved source, and unique-insert races recover the same account/job-scoped winner. Other acceptance sources and historical entries remain silent. Pending notices validate original approval text, source identity and quote amount. Copy says approval was recorded rather than claiming job/lead/deposit completion. Job promotion now compares its current quote-stage status and cannot overwrite a concurrent later stage.
- **Verification:** 66 application tests across four files, 158 actual PostgreSQL checks, changed-file lint, 10 sender-registry tests and clean local security advisor passed. Full type checking passed. Coverage includes duplicate/concurrent source creation, historical approvals, edited evidence, changed amounts, failed notice rollback, pickup failure and competing job promotion.
- **Remaining:** Apply 20260914194033_quote_approval_owner_notices.sql before deploying the marked caller and drain the old inline approval sender. The approval feed/notice transaction does not encompass add-on choices, signature storage, job/lead updates or deposits. Those steps still need acceptance-revision/request binding and interrupted/concurrent follow-up recovery. Portal notes, quote-option changes, other owner families, hosted acceptance and steps 5–10 remain open; final push is pending.

### Forty-eighth-pass implementation — saved portal message requests

- **T16/T17/T19:** A private request receipt commits with the portal message, optional job/inbox copies and owner notice. Matching retries reuse the saved message ID; changed content and another client's job are rejected. Jobless/phoneless messages have durable history. Shared IDs remove duplicate copies from portal history. The form preserves text and request identity after uncertain responses and only appends confirmed saves; accepted retries bypass the new-message quota.
- **Verification:** 69 application tests across eight files, 163 actual PostgreSQL checks, full type checking, 10 sender-registry tests and clean local security advisor passed. Changed-file lint has no errors and one existing unused catch-variable warning. Coverage includes concurrent requests, rollback, deleted-source replay, jobless history, lost responses and saved client links. Form checks use rendered components; hosted browser/receiver acceptance remains open.
- **Remaining:** Apply 20260914194628_portal_message_request_receipts.sql before the new callers and drain old portal senders. Existing forms need refresh. Owner SMS retains a stable key but is not a durable recovery queue. Legacy history duplicates and timestamp pagination are not repaired by this migration. Quote-option changes, plan toggles and remaining owner families, hosted acceptance and steps 5–10 remain open; final push is pending.

### Forty-ninth-pass implementation — quote-option prerequisite read failures

- **T16/T19:** Customer option changes now stop on failed job/settings/payment-plan/payment-history reads. Missing payment results are not treated as zero paid. Invalid, negative or overflowing payment totals and invalid computed quote totals stop before any write or owner/feed notification.
- **Verification:** 54 quote-option application tests, full type checking and changed-file lint passed. Read-failure tests supply data alongside errors and assert no update or notification. Missing and malformed payment history and invalid new totals are covered. No schema change or live provider operation occurred.
- **Remaining:** This prerequisite guard does not make quote-option changes atomic. Concurrent quote/payment/plan changes, stable request/revision identity, atomic quote/history/owner-notice storage and recovery after interrupted follow-ups remain open. The owner alert still uses its existing inline sender. Steps 4–10 and final push remain pending.

### Fiftieth-pass implementation — atomic quote-option changes and owner notices

- **T16/T17/T19:** A service-only transaction locks the job, compares its saved quote/status/schedule snapshot, rechecks current owner settings, start date, payment-plan authorization and paid amount, then commits quote items/total, client-financial history and the owner notice together. A stale snapshot cannot overwrite a newer quote. Notice preparation binds saved history and current items/total; later edits cancel obsolete pending mail. Removed-work titles and invoice-review instructions are preserved. Immediate pickup failure preserves the completed save.
- **Verification:** 65 application tests across three files, 167 actual PostgreSQL checks, full type checking, changed-file lint, 10 sender-registry tests and clean local security advisor passed. Database checks cover competing changes, unchanged requests, stale source cancellation, current financial/window guards and quote/history rollback on notice-write failure. Obsolete source-text assertions were replaced by behavior checks and database verification.
- **Remaining:** Apply 20260914200123_quote_option_owner_notices.sql before deploying the RPC caller and drain legacy inline quote-option writers. Form request/revision identity is still required for delayed retries after an intervening change; the current snapshot protects one read/save attempt. Full review of concurrent payment/plan writer ordering, acceptance/deposit recovery, other owner families and hosted acceptance remain open. Steps 4–10 and final push remain pending.

### Fifty-first-pass implementation — quote-option request and displayed-version binding

- **T16/T17:** The options form carries a stable request UUID and hash of the displayed quote items/amount. The server binds choices, quote version and job to a private receipt; matching retries reuse its saved result before reading a later quote. New stale requests and changed content under a used ID are rejected. Receipt, quote revision and owner notice commit together. Deleted jobs retain replay receipts. Failed responses keep the form and request identity; successful actions refresh data without redirecting away.
- **Verification:** 127 application tests across seven files, 171 actual PostgreSQL checks, full type checking, 10 sender-registry tests and clean local security advisor passed. Changed-file lint has no errors and four existing unused-variable/import warnings in the client page and shared action test. Rendered component checks cover lost responses, retained version across rerender, explicit confirmation and a fresh ID after success. Action checks cover result return without redirect; database checks cover concurrent requests, intervening edits, deletion replay and receipt-failure rollback.
- **Remaining:** Apply 20260914200549_quote_option_request_receipts.sql after the atomic option migration and before updated callers/readers. Old open forms must refresh. Hosted browser/receiver acceptance, full payment/plan writer ordering review, acceptance/deposit recovery and remaining owner families stay open. Quote receipts cover option changes only; steps 4–10 and final push remain pending.

### Fifty-second-pass implementation — durable margin owner notices and cooldown

- **T16/T17/T19:** Margin evaluation saves internal history and an eligible owner notice in one service-only transaction. It rechecks job ownership, revenue, loaded labor/other costs and the current floor, then serializes the four-hour owner-notice cooldown per account/job. This replaces a cooldown read from the absent job_activity_feed table. Explicit zero floors remain zero, while actual losses still warn. Pending notices stop after margin recovery; copy identifies the recorded check and flags mostly estimated costs.
- **Verification:** 26 application tests, 175 actual PostgreSQL checks, full type checking, changed-file lint, 10 sender-registry tests and clean local security advisor passed. Tests cover competing evaluations, labor burden, stale totals, recovery, zero floor, cooldown expiry, rollback and preserved saves after pickup failure.
- **Remaining:** Apply 20260914201115_margin_owner_notices.sql before the updated evaluator and drain the legacy inline sender. Cost writes still precede evaluation; a stopped request before evaluation needs durable recovery. Repeated evaluations intentionally retain history while the four-hour cooldown suppresses additional owner notices, including after recovery inside the same window. Cost-writer concurrency review, hosted receiver/capacity acceptance, other owner families and steps 4–10 remain open; final push is pending.

### Fifty-third-pass implementation — recover interrupted margin evaluations

- **T16/T17/T19:** Cost inserts, relevant updates and deletions now atomically request a private per-job margin evaluation. New writes rotate its version without losing a worker lease. A bounded worker claims five jobs, retains failures, recovers expired leases and cannot clear newer work when finishing an older version. The existing owner cron evaluates first without sending, then runs its usual bounded sender; evaluation failures report unhealthy without suppressing owner pickup. Soft-deleted jobs stop pending margin notices.
- **Verification:** 23 application tests, 179 actual PostgreSQL checks, full type checking, changed-file lint, 10 sender-registry tests and clean local security advisor passed. Coverage includes concurrent cost writes/claims, new edits during evaluation, stale/expired leases, retryable failures, cost rollback on request-storage failure, public access denial, soft deletion and account cascade cleanup. The worker reports its remaining evaluation backlog.
- **Remaining:** Apply 20260914201537_margin_evaluation_requests.sql after the margin-notice migration and before enabling this cron code. No historical costs are backfilled. Inline and recovered evaluations may both leave history, while owner notices retain their four-hour cooldown and one-attempt delivery rules. Hosted capacity/receiver acceptance, cost-writer ordering review, other owner families and steps 4–10 remain open; final push is pending.


### Fifty-fourth-pass implementation — interrupted quote acceptance and deposit recovery

- **T16/T17:** Rebuilt quote acceptance to use an atomic RPC transaction. Quote approvals now record a request receipt and bind the final add-on choices, typed/drawn signature, job status promotion, lead status promotion and job feed history together. Interrupted deposits or offline conversion outbox dispatches can now safely retry without duplicating the feed row or owner notice, as they observe the `replayed` flag from the atomic transaction.
- **Verification:** 9 application tests (including updated `quote-acceptance.test.ts`), 180 actual PostgreSQL checks, full type checking, and changed-file lint pass. Tests explicitly cover that atomic approval receipts decouple side effects safely, and that deposit retries occur via the idempotent receipt identity.
- **Remaining:** Apply `20260914202500_quote_approval_request_receipts.sql` before updated callers. Remaining tasks include concurrent payment-plan changes, durable charge/refund attempts, authoritative reconciliation of uncertain provider outcomes and interrupted financial customer notifications (Stream 2), as well as Steps 5–10.

## September 14 - Platform Event Notices (Step 7)

Steps 5, 6, and 7 committed as 022768237. Mapped support cases, merchandise receipts, and magic link authentication to the platform_event_notices ledger queue. Replaced direct inline sends with enqueues, built a cron handler, and preserved existing suppression rules and token generation boundaries. Shared digests and crew magic links are left intact per Stream 4 instructions.

Observed local verification: 539 application tests passed via vitest, full TypeScript validation succeeded. Local security advisor passing.

## Audit repair and staging checkpoint

See the [repair evidence](evidence/customer-email-audit-repairs-2026-09-14.md) and [staging migration manifest](evidence/customer-email-staging-migration-manifest-2026-09-14.json). Staging has the repaired migration set and index follow-ups. Production is unchanged; the rollout and remaining integration gates above remain open.
