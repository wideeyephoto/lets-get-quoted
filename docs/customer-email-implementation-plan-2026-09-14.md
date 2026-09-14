# Customer email implementation and rollout plan

Prepared September 14, 2026, from local baseline `d06a65468`. This plan covers the remaining work in [T01–T20](customer-email-handling-checklist-2026-09-14.md). It does not deploy code, schedule a live worker or send email.

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
- [ ] Finish caller-by-caller review of optional/missing account tags in shared email paths, the operational monitor's independent recipient policy, indirect transports and external automations before claiming complete enforcement.
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

Implement a reusable notice ledger and worker contract for remaining business events, while retaining the existing lifecycle/document ledgers. Use database uniqueness, immutable payload snapshots, atomic leases, acceptance records and provider-scope checks. Avoid a simultaneous rewrite of all transports.

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
