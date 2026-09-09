# Billing rehearsal noise: investigation and fix plan

Prepared September 9, 2026. Scope: work package B of the admin operations remediation plan. Status: investigation complete to the extent stated below; implementation and production changes have not been performed.

**Recommended outcome:** preserve all 185 failed test-mode receipts, separate them from actionable live-billing failures, retain an owned configuration/provenance case, and make the scanner, queue, admin counts, and future mode handling agree. Keep the single live failure visible. Do not purge or replay the cohort.

## 1. Verified findings

The latest production-target release reported by Vercel is `dpl_uLi2ZDS2BP6NY78hfwxd8gCasGwo`, source commit [`48dee526b6c25a020758e42f4684bd5698ef54e2`](https://github.com/wideeyephoto/lets-get-quoted/commit/48dee526b6c25a020758e42f4684bd5698ef54e2). Code was inspected at that revision, independently of the local checkout. Installed functions, constraints, and records were read from production Supabase project `mfuvvtrkipkigwqqtcal`. Observations began at 15:46 UTC / 11:46 a.m. Eastern.

| Observation | Verified result |
| --- | --- |
| Target cohort | Exactly 185 distinct platform-subscription event rows, all `livemode=false`. |
| Failure state | All `processing_status='failed'`, `last_error='billing_mode_configuration_invalid'`, `attempt_count=1`, `next_attempt_at IS NULL`. |
| Projection evidence | All have NULL `projection_applied`, `projection_result`, `projection_schema_version`, and `processed_at`. They have no applied projection recorded. NULL must not be rewritten as a successful/false projection result. |
| Local binding | All have NULL `account_id` and `billing_subscription_id`. None of the 13 distinct subscription IDs matches a current local `billing_subscriptions` row. |
| Object population | 68 subscription events covering 13 distinct subscriptions, plus 117 invoice events covering 23 distinct invoices. Events are not interchangeable with subscriptions, customers, invoices, or charges. |
| Receipt interval | September 7, 23:09:25.422825 UTC through September 8, 18:23:45.401037 UTC. |
| Source provenance | Minimized envelopes contain only the provider object's `id` and `object`; no customer or rehearsal metadata is retained. No test-mode subscription checkout operations were found created in the production database during September 7–8. This does not establish whether an external/manual rehearsal occurred. |
| Actionable billing findings | 186 open: this cohort of 185 plus one live-mode event. |
| Existing billing digest | Delivery `57a1fae5-e18a-4c44-9cec-721f395cb8e5` retains 186 linked findings and was observed delivered at 14:10:15.596 UTC on September 9. A separate completed drill digest has one resolved finding. |
| Current worker | Last recorded projector failure remains September 8 at 18:55:29.372 UTC; a successful run was observed September 9 at 15:45:29.377 UTC. The 185 rows are not an active retry storm. |
| Disposition support | No existing table with a disposition/triage/rehearsal name was found. Current billing readers query raw processing status. |

Event-type breakdown:

| Event type | Count |
| --- | ---: |
| `customer.subscription.created` | 13 |
| `customer.subscription.deleted` | 10 |
| `customer.subscription.updated` | 45 |
| `invoice.created` | 23 |
| `invoice.finalized` | 23 |
| `invoice.paid` | 23 |
| `invoice.payment_failed` | 5 |
| `invoice.payment_succeeded` | 23 |
| `invoice.updated` | 20 |
| **Total** | **185** |

The live event that must remain visible is `13eb0d53-2433-4cea-b7ae-0529d8878909`, provider event `evt_1U9nSQGqh5LFKuTCeXUjIBq7`: `customer.subscription.updated`, received August 29, `provider_object_contract_mismatch`, one attempt, no retry scheduled. Its business disposition remains unresolved and is outside this cleanup.

### What is established, and what is not

These records are conclusively non-live provider events, terminal in the application inbox, and not projected through this path. Their exact origin and whether every event belongs to an approved, completed rehearsal are **not established**. The error code also collapses several possible configuration failures; the database does not retain which configuration assertion failed at the time.

The likely origin is test activity reaching a database consumed by a production worker. Repository rehearsal documentation describes Preview webhook destinations, which is consistent with that explanation. It is not proof of the destination or environment that received these particular events. Stripe destination settings, event delivery history, and rehearsal records still need read-only inspection. No direct Stripe account inspection was performed in this investigation.

This distinction permits a useful immediate classification: **non-live configuration rejection, provenance review open**. It does not justify calling every row an obsolete rehearsal or marking the underlying event processed.

## 2. Root cause and related defects

The observed path is:

1. `handleStripeBillingWebhook` verifies and durably ingests a minimized, scope-checked event. It accepts an explicit boolean mode; it does not persist deployment-origin or rehearsal identity.
2. `claim_next_due_stripe_billing_subscription_event()` selects a received/due event without filtering by runtime mode. The claim preserves its identity, increments attempts, and fences processing with a lease.
3. The resolver calls `assertConfiguredStripeBillingMode(claim.livemode)` before its provider retrievals. That assertion requires an explicit `LGQ_STRIPE_BILLING_LIVEMODE`, a recognizable key mode, and agreement between configured, credential, and requested modes. Several failures become the same `billing_mode_configuration_invalid` code.
4. `projectStripeBillingSubscriptionEvent` records that failure as non-retryable. The installed queue selector correctly excludes failed rows with NULL `next_attempt_at`.
5. `scan_operational_failures()` independently selects **every** failed billing row. It has no mode/disposition distinction and recreates/reopens a finding whenever that source still matches.
6. `readEventLedger()` independently counts received/processing/failed rows as unresolved and failed rows without a retry as terminal. Removing an alert alone would leave these dashboard counts unchanged.

Two related hazards must be fixed with the classification:

- **Queue eligibility:** `queue_operational_alerts()` uses `delivery_id IS NULL` in its category selection, count, top-20 body, and membership update. It does not also require `resolved_at IS NULL`. There were no currently unqueued billing findings at inspection, so this is a race/recurrence defect, not evidence of another send. A resolved unqueued fixture could still be emailed.
- **Broad recovery action:** the subscription branch of `requeueBillingDeadLettersAction` attempts to change every terminal platform-subscription failure to `received`, without exact IDs or a mode filter. The installed audit trigger rejects `failed -> received`; deleting receipts is also forbidden. This action is neither a classification mechanism nor a safe targeted retry.

Changing only `resolved_at` would be undone by the next scan. Filtering only the UI would leave email alerts wrong. Filtering only `livemode=true` globally would hide unrelated failures and ignore the distinction between a correctly configured test environment and misrouted production traffic.

## 3. Chosen approach and boundaries

Use a **separate operational review ledger** while leaving historical `billing_events` rows unchanged. The processing ledger records what happened; operational review records how the event should be presented and investigated now.

For this exact cohort, move the individual records out of the live-billing failure queue into a linked non-live configuration case. Preserve the 185 records in a searchable historical view and keep the case open until origin/routing is verified. A later positive rehearsal verification is an additional review event, not a rewrite of the original failure.

Expected initial result, assuming no intervening arrivals or state changes:

| Surface | Before | After classification |
| --- | --- | --- |
| Actionable production billing findings | 186 mixed-mode rows | 1 live failure |
| Non-live configuration/provenance work | Mixed into billing failures | 1 owned case linked to 185 reviewed events |
| Original failed event rows | 185 test + 1 live | Unchanged |
| Historical terminal-failure metric | 186 | Still 186, explicitly labeled historical |
| Classified non-live metric | Absent | 185 |
| Current live failure | Open | Open, unchanged |
| Original delivered digest | Delivered | Immutable historical evidence |

Do not force the total operational workload to zero. One unresolved environment/provenance case is an honest result. If fewer than 185 records still meet the captured contract at execution time, classify only a freshly reviewed manifest; do not weaken validation to reach the old count.

Out of scope: recovering the live mismatch, replaying receipts, modifying subscriptions/credits/payments, purging data, changing other event scopes, implementing a general incident-management product, or fixing the other admin-plan packages.

## 4. Detailed implementation work

### B1. Preserve the exact baseline and inspect source routing

- [ ] Use the attached 185-row manifest as the baseline identity list. It contains event IDs, provider IDs, payload fingerprints, object IDs, and original processing/projection fields, without raw webhook bodies or customer details.
- [ ] Before applying a classification, re-read every exact ID and compare immutable identity, payload hash, error, attempt count, terminal state, NULL bindings/projection fields, and lease absence. Confirm the protected live event is absent from the manifest.
- [ ] Inspect newer matching events separately. A broad predicate may discover candidates but must never define a future write batch implicitly.
- [ ] Read the correct Stripe account/sandbox's event delivery history and endpoint configuration. Record destination URL/ID, live/test context, selected event types, secret identity by reference only, and relevant deployment/database project IDs. Do not print secret values.
- [ ] Inspect associated test objects and available rehearsal records. Group by provider object and timeline; link invoice objects to their subscription in the provider evidence. Record the actual origin or explicitly retain “unknown.” Do not infer ownership from an email address.
- [ ] Record whether the route/database wiring is still misconfigured. A historical Preview document is not an authoritative current setting.

**Exit:** a fixed, checksummed manifest; a protected live-event baseline; and an owned source-routing finding. Proven rehearsal origin is required to close that finding, but is not required to label an already verified event as non-live.

### B2. Add an append-only review ledger and one shared classification reader

Proposed names are design identifiers, not existing database objects.

Create `billing_event_operational_reviews` with:

- A monotonic review revision, `billing_event_id` foreign key, immutable source-state fingerprint, batch UUID, and idempotency key.
- Review kind: `non_live_configuration_rejection`, `verified_rehearsal`, or `reopened`. These describe review outcomes, not new billing processing statuses.
- Structured reason code, operator identity or named system policy/version, reviewed time, evidence reference, and shared case key.
- Original alert delivery reference/source key so cohort-to-digest history survives later finding recurrence or reclassification reversal.
- An index on `(billing_event_id, revision DESC)` and an appropriate batch/case lookup index. Add indexes based on actual reader plans, not speculative duplication of the existing billing queue indexes.

Provide an audited, service-only batch RPC. It must validate a bounded exact-ID manifest, lock source rows in stable order, recheck source fingerprints, append reviews, and append the administrative audit within a short transaction. A duplicate batch/key with identical input returns its original result; changed input is rejected. A stale or ineligible row aborts the batch. Do not hold a transaction open during provider/API investigation.

Use an append-only guard and privileges that prevent ordinary application clients from updating/deleting reviews. The admin endpoint derives the actor from authenticated staff, requires `ops.manage` and MFA for batch reclassification, and displays the exact batch summary before applying it. A server-supplied actor label is audit metadata, not a substitute for authorization.

Expose a shared, service-only SQL view or read RPC that joins the latest review to the original event and returns:

| Field | Meaning |
| --- | --- |
| `processing_status` | Original inbox outcome, unchanged. |
| `operational_class` | Actionable billing, non-live configuration review, verified rehearsal history, or other unchanged classification. |
| `requires_billing_action` | Whether this event belongs in the production billing action list. |
| `requires_configuration_review` | Whether origin/routing still needs an owned case. |
| `review_revision` / evidence reference | Why it was classified and how to reverse it. |

Default to actionable when no applicable review exists. A non-live review applies only to the exact matching scope, mode, failure state, source fingerprint, and lack of projection/binding required by its contract. State drift invalidates the review and restores visibility. Do not special-case the text of an error across modes.

Keep new tables under RLS and revoke client grants; use invoker-security readers with explicit server-role access. Views need their own privilege review because they can otherwise expose underlying protected data. [Supabase RLS and views documentation](https://supabase.com/docs/guides/database/postgres/row-level-security).

**Exit:** exact reviewed source states produce deterministic classifications; all other events retain existing visibility; audit history is immutable; source event rows are untouched.

### B3. Update scanning and queueing together

- [ ] Make the billing branch of `scan_operational_failures()` consume the shared classification reader. Preserve received-event age thresholds, expired-lease detection, other billing scopes, and all non-billing signals.
- [ ] Represent the reviewed cohort with a separate `billing_configuration` finding/case. Use a stable environment/scope identity and link its full member set through the review ledger. Its title must say non-live events were rejected and origin/routing needs review, rather than claiming 185 broken customer payments.
- [ ] Keep the configuration case active while any linked current review requires origin/routing investigation. Close it only after recorded evidence establishes the disposition and destination fix, or a reviewed explanation proves no fix is needed.
- [ ] Clear the 185 individual actionable findings through the scanner, recording a reclassification reason and review reference. Distinguish closure of an alert finding from successful recovery of its source event. Preserve the original `delivery_id` on classified findings and the immutable historical reference in the review ledger.
- [ ] Use the scanner/queue's existing transaction advisory-lock boundary for the classification cutover and compatible lock ordering. Capture the scan's observation timestamp after acquiring the lock so a waiting invocation cannot publish an older observation. Preserve the rule that a failed scan cannot partially clear findings. Do not invoke a scan with an empty cron configuration as a shortcut: it could clear unrelated cron findings.
- [ ] Change **all four** queue eligibility sites—category list, count, body selection, and membership update—to require an open, still-actionable finding as well as `delivery_id IS NULL`. Select and freeze one consistent membership set under the existing serialization boundary.
- [ ] Do not edit an already accepted/delivered payload or reuse its provider idempotency key for changed content. Existing delivered messages remain historical snapshots. If a pending digest can become stale, define a separately audited superseded state only before the first send; never mutate sending/accepted/unknown payloads.
- [ ] Preserve recurrence behavior: reversing a review or a new unexpected non-live arrival reopens/updates the appropriate case without re-queuing all historical events. Persist case/delivery membership needed for history. Coalesce ongoing arrivals; notification policy must distinguish a new episode from every scan.

**Exit:** live failures remain in the billing category; the reviewed cohort appears as one separate investigation case; resolved unqueued findings cannot produce a new digest; repeated scans are stable.

### B4. Align admin counts, history, and recovery controls

- [ ] Change subscription-event admin readers to use the same classification contract as the scanner. Do not add a UI-only `livemode` filter.
- [ ] Show separate counts for actionable billing failures, non-live configuration review, verified rehearsal history, retryable work, applied events, and total historical terminal failures. Define whether a metric counts events or cases in its label.
- [ ] Calculate actionable oldest-age from the actionable subset. Historical September 7 test rows must not determine the age of current live work.
- [ ] Provide filters for live/test mode, processing outcome, review disposition, batch, and evidence reference. Preserve the total receipt/applied metrics; classification does not create a projection.
- [ ] Display the open configuration case and its member count alongside the live failure. A missing view/migration or failed query must display unavailable, not zero.
- [ ] Disable the broad subscription-event requeue branch and explain that terminal event recovery needs a targeted supported mechanism. Keep the action from using the review operation as a way to schedule retries. Other ledgers should be handled separately without broadening this change.
- [ ] Update help/runbook text and relevant operator summaries so “terminal” no longer implies “retry pending,” and “classified” no longer implies “recovered.”

**Exit:** scanner, digest counts, and admin counts reconcile; history remains available; there is no bulk control that mixes this cohort and the live event.

### B5. Prevent new test traffic from rebuilding the same noise

The preferred preventive fix is correctly isolated test ingress and storage. Verify the selected test environment's database, webhook endpoint secret, Stripe account/sandbox, prices, credentials, and worker settings as one configuration. Do not point a test route at an arbitrary staging database without checking its intended use and data boundaries.

For defense in depth, refine the initial resolver mode check while preserving its current protection:

1. Validate the runtime configuration itself first: explicit configured mode and matching recognized credential mode. Missing/contradictory configuration remains an actionable environment failure.
2. Compare the verified event mode with that valid runtime mode. In a trusted production/live runtime, a false-mode event can receive a distinct, non-retryable mode-rejection result before provider lookup. A later provider/binding mismatch stays a genuine billing failure.
3. Persist the terminal failure and any automatic operational review atomically under the owned event claim. Store a fixed reason and trusted runtime policy/deployment reference. Do not mark the event processed, reuse `subscription_not_our_rail`, or relax projection constraints.
4. Update the subscription batch result/cron summary to report a separate non-live rejection count. Only a verified mode rejection with durable review evidence may be excluded from business-failure counts. Configuration failures, live failures, claim errors, and persistence errors still fail the job.
5. Keep the environment/configuration case visible and notify on a new episode. Continued traffic updates that case's counts/last-seen time instead of creating one page per event. Define any growth/reminder threshold explicitly before adding repeat notifications.
6. A correctly configured test runtime must still process its intended test fixtures. Do not add an unconditional database selector filter that strands received non-live rows or disables valid test projection.

Keep signature verification, minimized payload retention, immutable provider identity, and durable duplicate acknowledgement intact. Never return a successful webhook acknowledgement before a valid event is durably recorded or an explicitly designed durable rejection is recorded. Stripe documents the raw-body signature requirement and recommends acknowledging after appropriate event handling. [Stripe webhook documentation](https://docs.stripe.com/webhooks).

**Exit:** new misrouted test events cannot masquerade as live billing failures, cannot touch live subscription state, and cannot disappear without an observable configuration case. Proper test processing and genuine live error signaling still work.

## 5. Exact cleanup procedure for a later authorized execution

This is a procedure, not SQL already executed. Preparing this plan did not classify, replay, acknowledge, or send anything.

1. Verify the release/alias actually serving the application, installed function definitions, and current schema. The local checkout differs from the audited release; implement in an isolated checkout based on the current approved baseline.
2. Apply additive review schema/readers and deploy compatible scanner, queue, admin-reader, and action changes. Before any reviews exist, the current 186 findings must retain their existing visibility.
3. Run a dry-run batch using the attached exact manifest. Require 185 unique eligible rows, no live rows, no applied/bound rows, no active leases, and matching source fingerprints. Review any delta separately.
4. Take a fresh consistent snapshot immediately before applying. Preserve source rows, original delivery membership, the live sentinel, and baseline applied/grant/payment counts for the operation-level invariants under test.
5. Apply only the exact validated review batch in one short transaction. Record `non_live_configuration_rejection` with provenance still open unless positive evidence supports a stronger result. Assert that the returned set equals the manifest; rerunning the identical batch is a no-op.
6. Allow the normal monitor to run using the full deployed cron registry. Classification may create a configuration notification; use the established authorized operational recipient/policy. A new live notification drill requires its own explicit authorization.
7. Verify 185 classified records, one live billing finding, and the separate configuration case. Confirm every original event field in the manifest is unchanged, along with the sentinel's state and hash. Historical delivered payloads remain identical.
8. Verify at least three subsequent scheduled monitor/projector cycles, then inspect a full 24-hour observation window for new mode-rejected arrivals and actual live processing. Do not claim the 24-hour observation has passed before it has occurred.
9. Close the configuration case only with linked source/routing evidence. If origin remains unknown, leave a named owner and next investigative action; the live-billing noise reduction can still be marked complete separately.

## 6. Verification matrix

Use real PostgreSQL for state, privileges, and concurrent operations; mocks alone do not validate these boundaries.

| Test | Required result |
| --- | --- |
| Baseline has 185 target rows + one live sentinel | Only target rows can receive the non-live review; source rows and live visibility are unchanged. |
| Empty, duplicated, missing, extra, or stale IDs in a batch | Fail without partial classification or audit writes. A legitimate repeated batch is recognized idempotently. |
| Target's payload hash, attempt count, projection, binding, scope, or mode differs | Review rejected or becomes inapplicable; billing visibility remains. |
| Same generic error on a live event | Never excluded by this policy. |
| Non-live event with a different error / retry scheduled / active lease | No automatic historical-cohort classification. |
| Review RPC overlaps scanner/queue | One consistent transition; no mixed digest count/body/membership and no partial clearing. |
| Resolved finding has NULL `delivery_id` | Queue produces no alert for it. |
| Existing delivered/accepted/unknown alert at cutover | Payload/provider key stays immutable; history and membership remain recoverable. |
| Scan fails after an earlier read | No false closure and no healthy empty state. |
| Repeated scans after classification | 185 source events stay unchanged; live finding stays open; no duplicate historical-cohort notifications. |
| Review reversed or source state changes | Visibility returns with the correct recurrence behavior and preserved review/delivery history. |
| Invalid runtime/key configuration | Actionable environment error; no broad suppression under a mode-mismatch label. |
| Valid production runtime + test event | No provider retrieval/projection; terminal result and review are durable; configuration case updates. |
| Valid production runtime + valid live event | Projects once using existing bindings/leases and retains normal success behavior. |
| Valid test runtime + test event | Supported test projection remains functional. |
| Runtime/claim/review persistence failure | Cron reports failure; event remains recoverable under its existing lease rules. |
| Forged signature or mode flag from a client | No trusted operational review; existing signature/auth checks reject it. |
| Viewer/anonymous role accesses or writes reviews | Denied. Authorized server readers/writers work under explicit grants. |
| Admin view and monitor consume the same fixture | Counts, scope, oldest age, and classification agree; query errors remain visible. |

Extend the existing suites: `test/operational-monitor.test.ts`, `test/admin-billing-operations.test.ts`, `test/subscription-event-projector.test.ts`, `test/subscription-projection-worker.test.ts`, `test/subscription-projection-worker-migration.test.ts`, `test/stripe-event-inbox.test.ts`, `test/stripe-billing-webhook-route.test.ts`, and `test/billing-worker-cron-routes.test.ts`. Add focused review-RPC/privilege/concurrency tests and a disposable-Postgres verification script, following the existing `scripts/verify-operational-alerts.mjs` approach. Verify names against the implementation baseline before changing them.

Run targeted tests, typecheck, lint, production build, and the complete affected admin flow in preview. A full customer payment/rehearsal is not required merely to verify classification; use isolated fixtures for positive/negative projection behavior.

## 7. Release sequence, ownership, and rollback

| Change set | Contents | Gate |
| --- | --- | --- |
| 1 | Add review ledger/reader, scanner and queue eligibility, consistent admin counts, disable broad subscription requeue. | Database concurrency/privilege tests and preview reconciliation pass; no classifications applied yet. |
| 2 | Exact historical review batch and provenance/configuration case. | Fresh manifest validation, current deployment verification, and a concrete reviewed batch. |
| 3 | Isolated test routing and explicit mode-rejection handling, durable runtime evidence, and cron-summary distinction. | Environment mapping established; valid live/test and invalid-config cases pass. |
| 4 | Verification record and runbook closure. | Scheduled-cycle evidence, 24-hour observation, and separately documented provenance outcome. |

Assign one engineering owner for the reader/scanner/queue contract and one operational owner for source routing and disposition. Brett can own the operational decision; the implementing engineer should record who reviewed the batch. New work arriving during the cleanup must remain separately visible.

Planning estimate: approximately **3–5 engineering days** for the full code/schema/test/admin work and controlled rollout, plus source-routing investigation and the 24-hour observation window. The exact historical metadata classification is small; proving consistent readers and failure behavior is the larger task. This is an estimate, not a release commitment.

Rollback principles:

- Reverse operational classifications by appending `reopened` reviews. Never delete old reviews or source receipts. A reversed batch may legitimately recreate an alert; coordinate that with the existing notification policy.
- If a reader or queue change is faulty, restore a compatible version that errs toward visible failures. Keep additive review tables, original events, and sent-alert evidence.
- Contain mode-handling defects by reverting only that new code/routing change. Do not switch production to test credentials or relax the existing guard to process the backlog.
- A cleanup must not change `next_attempt_at`, reset attempts, claim a terminal event, create a subscription, issue a credit, collect a payment, or send a customer message.

## 8. Completion criteria

- [ ] Exact 185-row baseline retained, revalidated, and checksummed.
- [ ] Original failed receipts and delivered digest evidence are unchanged.
- [ ] Shared operational review logic is used by scanner, queue, and admin readers.
- [ ] The reviewed cohort no longer appears as 185 actionable live-billing failures.
- [ ] The single live mismatch remains visible with its original state and evidence.
- [ ] Unknown provenance/routing remains an owned configuration case, not a falsely resolved rehearsal.
- [ ] Manual clearing cannot be undone invisibly by a scan; resolved unqueued findings cannot send.
- [ ] Broad subscription-event requeue is disabled; exact review does not schedule processing.
- [ ] New foreign-mode traffic is either correctly isolated or durably distinguished with visible configuration reporting.
- [ ] Genuine live/configuration/claim failures remain failures; valid test processing still works.
- [ ] Concurrency, privileges, state-drift, failure-path, admin-flow, build, and scheduled-run checks are recorded against the released revision.
- [ ] Historical-noise cleanup and source-routing closure have separate, truthful completion states.

## 9. Evidence files and source references

The files below contain operational identifiers and minimized state, without credentials, raw webhook bodies, or customer names. They are local investigation artifacts; do not automatically publish them with a public pull request. Record evidence-retention/access decisions before moving them elsewhere.

- [Exact event manifest](</C:/dev/CLAUDE CODE FOLDER/docs/evidence/billing-rehearsal-noise-manifest-2026-09-09.json>): 185 unique rows. SHA-256: `77eae020aaab19405971748fdbd86d6fac2dbf31cb31d6aa2668492c9fbe2ecd`.
- [Database investigation and installed contracts](</C:/dev/CLAUDE CODE FOLDER/docs/evidence/billing-rehearsal-noise-investigation-2026-09-09.json>): source aggregates, original alert references, protected live event, constraints/indexes, and installed scanner/queue/guard definitions. SHA-256: `799b5a681ac175f76fae3fc0531d93ac17349ecc43b7ce47e537eb28f40f31df`.

These are multiple read-only observations, not a transaction-wide production snapshot. The implementation procedure therefore requires a fresh consistent pre-apply snapshot.

Pinned code references:

- [Webhook boundary](https://github.com/wideeyephoto/lets-get-quoted/blob/48dee526b6c25a020758e42f4684bd5698ef54e2/src/lib/billing/stripe-billing-webhook.ts) and [minimized inbox](https://github.com/wideeyephoto/lets-get-quoted/blob/48dee526b6c25a020758e42f4684bd5698ef54e2/src/lib/billing/stripe-event-inbox.ts).
- [Mode assertion](https://github.com/wideeyephoto/lets-get-quoted/blob/48dee526b6c25a020758e42f4684bd5698ef54e2/src/lib/billing/stripe-billing-subscription-checkout.ts#L300), [resolver](https://github.com/wideeyephoto/lets-get-quoted/blob/48dee526b6c25a020758e42f4684bd5698ef54e2/src/lib/billing/stripe-billing-subscription-events.ts#L536), and [projector failure handling](https://github.com/wideeyephoto/lets-get-quoted/blob/48dee526b6c25a020758e42f4684bd5698ef54e2/src/lib/billing/subscription-event-projector.ts#L597).
- [Operational scanner/queue migration](https://github.com/wideeyephoto/lets-get-quoted/blob/48dee526b6c25a020758e42f4684bd5698ef54e2/migrations/20260909133220_operational_alert_delivery.sql) and [monitor runner](https://github.com/wideeyephoto/lets-get-quoted/blob/48dee526b6c25a020758e42f4684bd5698ef54e2/src/lib/operational-monitor.mjs).
- [Billing admin readers](https://github.com/wideeyephoto/lets-get-quoted/blob/48dee526b6c25a020758e42f4684bd5698ef54e2/src/lib/admin-billing-operations.ts#L333), [broad requeue action](https://github.com/wideeyephoto/lets-get-quoted/blob/48dee526b6c25a020758e42f4684bd5698ef54e2/src/app/admin/billing-operations/actions.ts#L68), and [cron result summary](https://github.com/wideeyephoto/lets-get-quoted/blob/48dee526b6c25a020758e42f4684bd5698ef54e2/src/lib/billing/billing-worker-cron.ts#L154).

Related local plans: [overall admin remediation](</C:/dev/CLAUDE CODE FOLDER/docs/admin-operations-remediation-plan-2026-09-09.md>) and [historical failure triage](</C:/dev/CLAUDE CODE FOLDER/docs/historical-failure-backlog-triage-plan-2026-09-09.md>). This focused plan refines work package B; it does not mark the broader backlog or live-event recovery complete.
