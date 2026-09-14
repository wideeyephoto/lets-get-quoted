# Customer email implementation and rollout plan

Prepared September 14, 2026, from local baseline `d06a65468`. This plan covers the remaining work in [T01–T20](customer-email-handling-checklist-2026-09-14.md). It does not deploy code, schedule a live worker or send email.

Execution scope subsequently authorized: complete the [ten agreed steps](customer-email-ten-step-execution-2026-09-14.md), commit verified changes along the way, and push when finished. The hosted release and controlled canary are part of that objective and must be proved with current evidence; writing this plan alone does not perform them.

## Outcome and current position

Every intended email should have a clear recipient policy, a durable identity, bounded recovery and an accurate outcome. Operators should be able to distinguish an overdue send, uncertain acceptance and an actual delivery failure without creating a duplicate.

Already implemented locally: lifecycle and quote/invoice send ledgers, persisted document fallback phases, shared account-scoped suppression checks, signed callback reconciliation, recovery monitoring and an admin panel. The latest pass passed 510 regression tests and 14 database checks. These results establish the local baseline; hosted migration and receiver acceptance remain open.

## Delivery sequence

| Milestone | Priority | Work | Completion evidence | Proposed owner |
| --- | --- | --- | --- | --- |
| M1 | P0 | Automatic recovery for existing ledgers | Crash, overlap, expiry and pause tests pass; preview sends nothing | Engineering |
| M2 | P0 | Delivery policy for remaining transports | Every audited sender has an explicit scope and final check | Engineering; Operations verifies provider scope |
| M3 | P1 | Durable identities for remaining email families | Repeat business events and lost acknowledgements do not duplicate sends | Engineering |
| M4 | P1 | Operator recovery and deliberate resend workflow | Authorized, evidence-backed closeout and auditable resend behavior | Engineering; Operations rehearses |
| M5 | Release gate | Hosted migration and controlled acceptance | Required database, receiver, failure and isolation evidence retained | Engineering + Operations |
| M6 | Release gate | Canary and bounded expansion | Seven clean scheduled canary runs and remaining checklist gates satisfied | Brett/Operations, named backup |

Build and verify M1 first, then M2 and M3 in small changes by email family. M4 follows the durable identity work it exposes. M5 can validate a bounded release of completed milestones; it must not label uncompleted sender families protected. M6 follows successful acceptance for the proposed cohort and the existing go-live gates.

## M1 — Recover existing sends automatically

Checklist: T03, T16, T17, T19, T20.

Local worker implementation completed September 14; see the [worker runbook](runbooks/email-recovery-worker.md) for verified limits, cohort/enablement controls and evidence. Hosted scheduling/receipt and operational acceptance remain in M5. Cross-application capacity reservation and additional email families remain outside this worker's scope.

- [x] Add a separate authenticated recovery worker, with a proposed five-minute schedule, disabled by default and bounded by batch size, concurrency and execution time. Keep the existing operational scanner read-only.
- [x] Query due `retry_wait` records and recoverable expired leases directly from both ledgers. Do not use the dashboard's delayed attention queue as the retry eligibility source.
- [x] Refactor the existing send helpers to resume a saved intent by ID through their atomic claim/fencing rules. Reuse exact saved content, links, attachments, provider scope, phase and key. Never rerender a replacement payload during recovery.
- [x] Recheck current account, owner/recipient, document revision, suppression and send holds before submission. Stop obsolete lifecycle nudges and changed/deleted document sends. Respect existing backoff, the three-attempt maximum and the fixed original 23-hour cutoff.
- [x] Classify provider failures explicitly. Stop terminal recipient/configuration failures; defer eligible transient failures; honor retry timing where supplied. Do not burn the whole retry budget during known quota exhaustion. Preserve uncertainty after an ambiguous submission.
- [ ] Give transactional recovery priority over marketing. Add provider-aware request pacing and bounded deferral; verify actual quotas before choosing production budgets.
- [x] Reconcile accepted sends with their required business-state updates without submitting again. Cover a crash after acceptance but before invoice/status bookkeeping; fence any repair against the saved revision. Best-effort activity logs must not become duplicate-send triggers.
- [x] Add a read-only preview with due/deferred/review counts, worker run reporting and a tested pause control. Expired, exhausted or mismatched records remain visible for review.

Acceptance: simultaneous workers, crash before/after provider submission, timeout after acceptance, callback/worker races, saved fallback recovery, changed credentials, changed recipient/document, suppression, paused account, 429/5xx/quota handling and cutoff boundaries all behave correctly. Preview makes zero provider requests and zero mutations. A stopped worker produces an actionable stale-run signal.

## M2 — Complete delivery policy coverage

Checklist: T12, T13, T14, T18, T19.

- [x] Turn the [sender inventory](runbooks/email-delivery-audit-and-recovery-monitoring.md) into a maintained registry of purpose, recipient scope, transport and suppression behavior. The [registry and CI drift check](runbooks/email-sender-registry.md) cover 21 reviewed source/script files with explicit scan limits and outstanding evidence.
- [x] Review formerly optional account tags in shared email paths. Eleven sender contracts now require workspace IDs; reviewed production callers already supplied them. Shared tenant tag creation and the transport reject missing scope. See the [caller map and checks](runbooks/shared-email-workspace-scope.md).
- [x] Review the operational monitor's independent recipient policy. Queued findings now verify the saved destination and platform delivery blocks without changing their payload/key. Emergency outage/recovery notifications retain a documented database-independent exception. See the [operational recipient policy](runbooks/operational-email-recipient-policy.md).
- [ ] Review indirect transports/external automations and reconcile operational callback/provider evidence before claiming complete enforcement. Verify the emergency responder channel separately.
  - Matched unscoped callbacks bind to the operational ledger's provider ID and exact saved recipient. [Durable early callback evidence](runbooks/operational-callback-evidence.md) now closes callback/acceptance ordering races. Unknown provider IDs, emergency messages without ledger rows and historical evidence remain unresolved; saved payloads and retry keys are unchanged.
  - A bounded [read-only evidence report](runbooks/operational-callback-evidence-review.md) is ready for the reviewed environment. It reports unmatched IDs, binding conflicts and current block status without repair, deletion or sending; hosted evidence collection remains open.
  - Raw HTTP and script scan added the previously omitted support auto-responder and independent deliverability seed script. Both now apply platform checks. The seed runner defaults to offline preview, requires explicit live recipients and reports acceptance separately from receiver evidence. Indirect/external transports and provider evidence remain open.
- [x] Protect the confirmed workspace paths: theme tests, account-specific crew invitations and customer merchandise receipts. Require provider acceptance IDs before reporting success. Platform operator/founder and merchandise staff alerts have a separate recipient scope, addressed below.
- [x] Apply an explicit platform-recipient policy to login, support/contact, founder alerts, digests, merchandise staff and public reports. Recorded platform delivery blocks stop submission; campaign-only opt-outs do not block transactional mail. New signed callbacks use the declared platform scope. See the [transactional policy](runbooks/platform-transactional-email-policy.md); provider inventory/history reconciliation remains below.
- [x] Repair platform campaign scope end to end: separate private platform preference storage, consistent footer/header tokens (including legacy test links), scoped audience checks and a final live/test check. Public confirmation and signed delivery callbacks use the same scope. See the [platform campaign policy](runbooks/platform-campaign-email-policy.md); hosted acceptance remains open.
- [x] Paginate the shared campaign/rebook suppression helper with an ordered UUID cursor, explicit empty-page completion and a fail-closed query budget. Verify lists beyond 1,000 and lower API caps.
- [x] Replace lifecycle sweep/approval suppression scans with bounded exact-recipient RPCs, including the read-only preview. Platform campaign suppression checks also use exact-recipient RPCs. Incomplete lookups stop the affected batch visibly; unrelated suppression rows no longer exhaust the response cap.
- [ ] Inventory the provider workspace/region and available suppression evidence. Prepare a reviewed reconciliation of historical delivery blocks, with provenance and reason precedence; do not infer missing evidence or overwrite stronger reasons.

Acceptance: all audited paths have an explicit policy; transactional marketing opt-outs and hard delivery blocks behave differently; To/Cc/Bcc and fallback checks agree; failures and truncated reads do not permit sends; workspace A's preferences cannot suppress or authorize workspace B's mail incorrectly. Authentication tests preserve login security and token expiry semantics.

## M3 — Add durable identities to the remaining families

Checklist: T06, T07, T16, T17, T19.

Local domain failure progress: submissions require the existing incident UUID, stable provider key and immutable snapshot with a credential fingerprint. Signed callbacks now validate the saved workspace and single recipient before repairing acceptance, preserve stronger negative evidence and race safely with worker completion. Missing/unprepared callbacks are quarantined for review. Current recipient blocks are checked again after saving. Existing one-attempt/manual-review behavior remains in place. This does not complete M3: verified provider workspace/region scope, retention review, hosted acceptance and bounded recovery remain open. Restoration is now implemented locally; other owner notices remain open. See the [notice runbook](runbooks/email-domain-failure-notices.md) for migration order and limits; current launch gates are also recorded in [LAUNCH_CHECKLIST.md](../LAUNCH_CHECKLIST.md).

Implement a reusable notice ledger and worker contract for remaining business events, while retaining the existing lifecycle/document ledgers. Use database uniqueness, immutable payload snapshots, atomic leases, acceptance records and provider-scope checks. Avoid a simultaneous rewrite of all transports.

Website connection owner notices now have atomic source-event creation, one-time claiming, immutable message snapshots, credential fingerprints/provider keys, a saved recipient and acceptance ID, persistent review/backlog reporting and evidence-backed operator closeout. This existing notification is distinct from sending-domain restoration. Signed callback repair is locally verified; actual provider workspace/region and receiver evidence remain hosted gates. See the [website notice runbook](runbooks/website-domain-connection-notices.md) and [execution record](customer-email-ten-step-execution-2026-09-14.md). The subsequent restoration implementation is described in the [restoration runbook](runbooks/email-domain-restoration-notices.md).

| Order | Family | Intended identity and recovery rule |
| --- | --- | --- |
| 1 | Domain failure/restoration and owner notices | Workspace + durable failure episode or source event + notice kind; one notice per actual episode |
| 2 | Appointment/booking/selection reminders | Workspace + business event/revision + scheduled occurrence + recipient; cancel obsolete occurrences |
| 3 | Campaigns, review and rebook | Workspace/platform campaign or source event + recipient + explicit occurrence; an audience rerun reuses the same intent |
| 4 | Digests, support and merchandise | Workspace/platform scope + reporting period, support message ID or order event + recipient |
| 5 | Authentication links and public reports | Explicit request identity + recipient; retries preserve the original unexpired token/report, while a deliberate new request remains distinct |

- [ ] For each family, persist the intent before submission and define which source changes cancel recovery. Preserve a saved fallback phase only after a definitive rejection of the attempted sender domain.
- [ ] Add signed callback correlation and acceptance reconciliation for each migrated family. Reject cross-workspace identity changes and prevent older events from replacing terminal outcomes.
- [ ] Where a database business change creates a notice, save the intent in the same transaction where practical. Where that is impossible, add a reconciliation path for the gap between source commit and intent creation.
- [ ] Connect migrated families to recovery monitoring and the bounded worker; verify their deletion and retention rules preserve the required deduplication evidence.
- [ ] Treat lead/job/invoice creation and payment projection as a separate end-to-end consistency change. Do not claim the email ledger makes external payment effects transactional.

Acceptance for every migrated family: repeated trigger, concurrent trigger, crash/restart and lost acknowledgement yield at most one accepted submission per intent; genuinely new events can create new intents. Changed or expired authentication links are never resent as valid. Existing operational alert delivery retains its independent recovery protections.

## M4 — Make operator recovery concrete

Checklist: T16, T17, T19, T20.

- [ ] Add an authorized recovery detail view with source event, saved phase, timestamps, provider IDs and outcome history. Limit access to private payloads and log operator actions.
- [ ] Expose evidence-backed closeout using the existing resolution rules. Missing callbacks alone are not proof that a send failed.
- [ ] Separate recovery of an existing attempt from an intentional resend of an unchanged quote/invoice. An explicit resend creates a new audited occurrence linked to the original document and send; it does not reset revisions or overwrite old keys.
- [ ] Stop intentional resend while the original outcome is unresolved. Revalidate the current document and recipient, apply rate limits and deduplicate repeated submission of the same resend request.
- [ ] Distinguish pending, accepted, delivered, delayed, bounced, complained, failed and suppressed outcomes consistently. Do not infer inbox placement or a delivery rate from acceptance or an empty failure list.

Acceptance: unauthorized users cannot inspect or resolve another workspace's sends; duplicate operator submissions are safe; stale views cannot overwrite newer outcomes; closeout and deliberate resend retain actor, reason and linked evidence.

## M5 — Validate the release in the intended environment

Checklist: T02–T15, T18–T20. Maintain an evidence record with release ID, environment, workspace, send/provider IDs, timestamps, expected/actual result and reviewer. Keep private message content out of ordinary tickets.

- [ ] Identify the exact release, environment, approved internal recipients and cohort. Reconcile historical uncertain sends and pause/drain affected producers before migration.
- [ ] Apply prerequisite migrations in order: lifecycle `20260914133327`, document `20260914135714`, recovery monitoring `20260914142641`, then subsequent milestone migrations. Verify existing operational/billing dependencies, permissions, row-level security and API schema refresh before enabling application paths.
- [ ] Start with recovery disabled, run the read-only preview, then enable only the controlled cohort. Verify actual scanner/worker schedules, provider capacity and alert destination receipt.
- [ ] Capture Gmail and Outlook authentication, inbox/spam observations, actual replies and classic/modern Outlook rendering. Exercise a 25+ item invoice PDF failure and verify usable HTML and accurate attachment claims.
- [ ] Verify exact domain-rejection fallback, confirmed domain loss/restoration, no downgrade on transient checks, Reply-To validation and accurate mailbox-alias guidance.
- [ ] Verify received unsubscribe headers/DKIM coverage, one-click POST behavior and GET scanner safety. Rehearse signed callback duplicates, ordering, failed persistence and cross-tenant attempts.
- [ ] Exercise customer links while logged out, including tampered, expired and revoked tokens. Rehearse pause, recovery, alert handling and release rollback while retaining ledgers and callback evidence.

Acceptance: all applicable checklist evidence is reviewed. Production quotas, provider behavior, receiver screenshots and delivery receipt are verified rather than inferred from local tests. Any incomplete family or acceptance item remains explicitly open.

## M6 — Canary and expansion

Checklist: T01, T02, T20; preserve existing go-live I04/J04/J05 requirements.

- [ ] Name the responder and backup, approved workspace IDs, provider reserve, cohort cap, review time and escalation route before enabling the cohort.
- [ ] Reconcile historical canary dates with retained run evidence. Observe seven consecutive clean scheduled domain-canary runs; retain actual delivery/reply evidence alongside run IDs and timestamps.
- [ ] Demonstrate enrollment pause separately from an actual sending hold, including how transactional messages and in-flight work behave.
- [ ] Stop expansion for identity leakage, failed authentication, unexplained loss/duplication, failed holds, exhausted capacity or failed recovery monitoring. Investigate every complaint/material canary failure.
- [ ] Expand only after the evidence review approves the next bounded cohort. Do not discard ledgers, reset keys or enable old unguarded senders during rollback.

## First implementation slice

Completed locally: a disabled-by-default recovery worker for the two existing ledgers; final workspace checks for crew/theme/merchandise sends; complete shared suppression scans; platform campaign preference storage and unsubscribe flow; bounded lifecycle recipient checks; and platform transactional gates for login, reports, support and staff messages. Next finish the provider-scope/history and external-sender inventory, then continue durable identities and capacity work. M2 remains open until its inventory/evidence requirements are met. Keep scheduling/enabling in the hosted environment within M5 acceptance.

Production-specific inputs needed before M5/M6: environment identity, internal recipient addresses, cohort IDs, current provider capacity, responder and backup. Local implementation can proceed before those inputs are finalized.

### Twenty-fourth-pass implementation — signed website callback recovery

- **T16/T17/T19:** Signed website callbacks now bind saved notice/workspace/recipient/provider evidence before delivery history or suppression. Early delivery repairs missing acceptance without resending; delayed completion cannot erase stronger outcomes. Unknown or unprepared callbacks are quarantined for review.
- **Verification:** 97 application tests and 57 PostgreSQL checks passed, plus changed-file lint, full type checking and a clean local security advisor. See the [ten-step execution record](customer-email-ten-step-execution-2026-09-14.md).
- **Remaining:** Continue remaining domain/owner notice coverage and restoration behavior, then scheduled and other message families. Hosted acceptance and canary gates remain open; no live change occurred.

### Twenty-fifth-pass implementation — sending-domain restoration

- **T16/T17/T19:** A previously attempted domain failure can now produce one durable restoration notice per verified recovery. The source update and notice commit together; current owner, message, provider identity/key and signed outcomes are retained. Changed connections stop unsent notices. No automatic resend is enabled.
- **Verification:** 153 application tests and 75 PostgreSQL checks passed, plus lint, sender-registry checks and a clean local security advisor. See the [restoration runbook](runbooks/email-domain-restoration-notices.md) and [ten-step record](customer-email-ten-step-execution-2026-09-14.md).
- **Remaining:** Step 4 still includes generic contractor alerts, owner confirmations, lead notices and messaging application notices. Steps 5–10 and hosted acceptance remain open. No live change occurred.

### Twenty-sixth-pass implementation — owner-event queue and customer requests

- **T16/T17/T19:** Marked client question, follow-up and more-work feed events atomically create a private owner notice. Inline dispatch uses the saved source ID; a disabled-by-default background pickup can recover pending events after request interruption. Saved messages/provider keys and signed callbacks protect an attempted event from duplicate dispatch.
- **Verification:** 192 application tests and 93 PostgreSQL checks passed, plus lint, ten registry tests and a clean local security advisor. See the [owner-event runbook](runbooks/owner-event-notices.md).
- **Remaining:** Explicit request IDs are still needed to deduplicate repeated submissions that create different feed rows. Other contractor/owner alert families, operator controls, hosted acceptance and canary evidence remain open.

### Twenty-seventh-pass implementation — client request identities

- **T16/T17:** Questions and follow-up/more-work submissions now carry explicit request IDs. A scoped immutable receipt commits with the feed event and owner notice, deduplicates concurrent retries, rejects changed content and retains a deletion tombstone. Attachment paths and question SMS keys stay stable on retry.
- **Verification:** 50 application tests, 99 PostgreSQL checks, full type checking and a clean local security advisor; lint has no errors with existing unused-variable/import warnings. The rendered form test covers lost response, retained input/request identity and deliberate new request.
- **Remaining:** Continue other owner alerts and confirmations, lead notices and messaging application events. Hosted acceptance, storage capacity/retention, remaining email families and canary evidence stay open.

### Twenty-eighth-pass implementation — messaging owner notices

- **T16/T17/T19:** Submission, review and activation events atomically enqueue owner notices. Application revision/contact and current review status fence stale sends. Identical review decisions and repeated activation checks stay silent; changed notes and new transitions retain distinct identities.
- **Verification:** 85 application tests, 103 combined email PostgreSQL checks, 45 real provisioning PostgreSQL checks, full type checking, lint and 10 registry tests passed. The local security advisor reported no issues. The provisioning suite applies the owner migrations and exercises source availability with production service privileges.
- **Remaining:** Other owner alerts/confirmations and leads remain in step 4. Staff/founder alerts remain in step 7. Legacy inline producers must be drained before the messaging trigger is deployed. Hosted delivery, release and canary requirements remain open.

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
