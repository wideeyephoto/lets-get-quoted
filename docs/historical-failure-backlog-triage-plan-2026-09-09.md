# Historical failure backlog: triage and recovery checklist

> Execution update, September 9: all 221 baseline records now have individual reviewed dispositions. The live billing receipt is superseded, rehearsal routing is contained, SMS/provider usage is reconciled, and the false replay claims are removed from the operator paths. See [the execution report](operational-cleanup-2026-09-09.md) and its exact manifest/audit evidence. The original checklist below remains the planning baseline; production activation, reader classification follow-through and the full 24-hour observation are not yet a passed launch gate.

Prepared September 9, 2026. **Status: execution plan based on read-only investigation.** No production records were changed, webhooks replayed, messages sent, or charges/credits adjusted while preparing this document. The execution checkboxes below remain open.

The objective is to account for all **221 original source records: 31 webhook, 186 billing, and 4 SMS failures**. Each needs a defensible disposition and linked evidence. A smaller failure count alone does not prove recovery. Several records may describe the same incident; retain all source records while linking them to one incident.

## Verified starting point

Production database observations were collected on September 9 around **15:36–15:43 UTC / 11:36–11:43 a.m. Eastern**, in Supabase project `mfuvvtrkipkigwqqtcal`. These are dated observations, not ongoing monitoring. Provider message details and the live Stripe subscription have not yet been reconciled directly with their providers.

| Original group | Current evidence | Required next step |
| --- | --- | --- |
| 31 webhook failures | All 31 source records still exist, but now share `resolved_at = 2026-09-09T15:08:10.591Z`. There are 29 `ai_voice` records, including 4 `provider_status` events, and 2 `sms_registry` records (`pending` and `complete`). None has a test marker. | Audit the closure and review each underlying condition. Do not count them as verified recoveries yet. |
| 185 test-mode billing failures | `platform_subscription`, `livemode=false`, `processing_status='failed'`, `billing_mode_configuration_invalid`, and no scheduled next attempt. Receipt interval: September 7 at 23:09:25 UTC through September 8 at 18:23:45 UTC. | Establish exact rehearsal provenance and business effects before classifying individual records as obsolete test evidence. They are already terminal, rather than an active retry storm. |
| 1 live billing failure | August 29 `customer.subscription.updated`, `provider_object_contract_mismatch`, no bound application account, and no scheduled next attempt. | Investigate ownership and subscription/entitlement impact first. Its correct disposition is still unknown. |
| 4 SMS failures | All use SignalWire, error `30005`, have provider IDs and application idempotency keys, have acceptance timestamps followed by failure timestamps, and show `text_usage_state='committed'`. No delivery timestamp or directly linked operator-review item was found. | Reconcile the four provider messages, business need, and credit finalizations individually. Acceptance, delivery, and usage accounting require separate evidence. |

SignalWire defines `30005` as an attempted message whose destination handset is unknown. That code alone does not establish whether a particular number was a test destination, whether the number needs correction, or whether a replacement message is appropriate. [SignalWire error reference](https://signalwire.com/docs/compatibility-api/rest/error-codes).

### Two recovery hazards already identified

1. **The webhook closure claims more than the code performs.** Audit record `108e8081-c110-4483-be5d-0f304db69d2e`, created at 15:08:10.824 UTC, records `operator.webhooks_replayed` with 31 replayed and 31 resolved. It contains aggregate counts, with no exact source-ID list or before/after values. The corresponding `replay_failed_webhooks` branch only updates resolution fields; it makes no provider replay and does not check the database update result. The matching counts and timestamps strongly associate this audit action with the closures, but do not prove underlying recovery. The separate autonomous webhook healer also simulates replay.
2. **The billing requeue control is too broad for this task.** Its subscription branch selects every terminal failed platform-subscription event, without an exact-ID or mode filter. That would target the 185 test events and the live event together if accepted. It also attempts `failed -> received`, which the checked-in audit guard rejects. Inspect the installed state contract before building a supported targeted retry; do not bypass the guard.

These paths were inspected at local commit `6cf9c6a3542e854c5b47a04602837ac19a85ea98`; the relevant operator, billing-action, and text-credit files are unchanged from monitoring release `48dee526b6c25a020758e42f4684bd5698ef54e2`. Reverify the release serving production before execution.

## 1. Establish the exact review population

- [ ] **B01 — Assign accountability.** Name a triage owner and a reviewer for financial/usage conclusions. Give every unresolved incident a named owner, next action, and due date. Use the existing operational inbox, `hello@letsgetquoted.com`, for the established alert path.
- [ ] **B02 — Capture an exact baseline manifest.** Read all original source IDs using the alert deliveries below. Do not select only currently unresolved rows: that would omit all 31 webhooks. Verify pagination, unique source IDs, source existence, and the 31/186/4 totals.
- [ ] **B03 — Record a consistent snapshot.** Save capture time, database/project, deployed revision, relevant installed function definitions, source states, and a manifest checksum. Preserve the original manifest when recording later observations.
- [ ] **B04 — Separate new arrivals.** Maintain a second list for failures arriving after this baseline. Do not let new failures disappear into the historical-cleanup count.
- [ ] **B05 — Correlate incidents.** Link provider events, application accounts, subscriptions, calls, messages, receipts, and tasks. Record repeated deliveries separately from distinct business operations. Never merge across provider accounts, tenants, or live/test modes just because errors match.
- [ ] **B06 — Establish business-effect baselines.** For the affected operation IDs, capture existing charges/refunds, subscription state, credit grants/debits, reservations, overages, provider messages, and downstream notifications. Whole-account totals are supporting evidence; operation-level identities are the primary comparison.

| Category | Original alert delivery ID |
| --- | --- |
| Webhook | `63a716ae-2c9f-4172-b506-e3144eebcb2b` |
| Billing | `57a1fae5-e18a-4c44-9cec-721f395cb8e5` |
| SMS | `fd5c8849-504d-4c0f-a5a2-1bde9cc02559` |

Use `operational_alert_findings.delivery_id` and `category`; its `reference` identifies the source record. Preserve the original delivered alert payload as historical evidence even if a later scan clears a finding.

## 2. Use evidence-based dispositions

The labels below are proposed review outcomes, not assertions that matching database enum values already exist. Store one current disposition per source record, with an append-only history of changes.

| Disposition | Evidence required | Recovery decision |
| --- | --- | --- |
| Verified obsolete test | Exact fixture/rehearsal reference, intended environment and account, explained failure, and reconciled effects | Retain the failure and exclude only this reviewed record from actionable views. No production replay. |
| Verified recovered | Actual handler/reconciler result, authoritative final state, and operation-level effect reconciliation | Record the recovery evidence and clear its actionable finding through the supported path. |
| Superseded or duplicate | Link to the original/successor event, prove the same intended business outcome, and verify current state | Do not reapply the stale event. Preserve both source records. |
| Terminal failure, business response complete | Provider outcome plus evidence that the original operation is no longer needed or has an appropriate documented resolution | Keep the original failed outcome; do not relabel it delivered/processed. |
| Actionable after a fix | Specific unresolved defect, affected business outcome, tested remedy, and expected effect delta | Recover only the selected operation after prerequisites pass. |
| Manual review required | Missing ownership, ambiguous provider outcome, conflicting evidence, or unverified closure | Keep visible with an owner and deadline. No automatic replay. |

- [ ] **D01 — Require positive test provenance.** `livemode=false` proves provider mode, not that a failure was an authorized, obsolete rehearsal. A missing test marker proves neither production intent nor test intent.
- [ ] **D02 — Explain each closure.** Avoid reasons such as “old,” “cleanup,” or “fixed” without a linked cause and evidence. A batch rationale is acceptable only when every exact member satisfies it.
- [ ] **D03 — Preserve uncertainty.** Missing evidence becomes an open review item. A successful recent cron run or a different successful customer transaction does not resolve an older event by itself.

## 3. Investigate the live billing event first

Target source record: `13eb0d53-2433-4cea-b7ae-0529d8878909`; provider event: `evt_1U9nSQGqh5LFKuTCeXUjIBq7`; received August 29 at 14:42:11 UTC.

- [ ] **L01 — Inspect the original immutable envelope.** Check provider account, live mode, API version, event time, object ID, payload hash, subscription items, prices, and metadata. Preserve the original payload rather than editing it to satisfy a validator.
- [ ] **L02 — Verify authoritative ownership.** Retrieve the Stripe event and current subscription using the correct provider account and mode. Match the customer/subscription to the application's billing binding. A null application account must not be filled by guessing from an email or similar name.
- [ ] **L03 — Explain the contract mismatch.** Identify the exact missing or incompatible field and compare it with the historical contract/version, not just today's expected shape. Determine whether this is an application bug, an unrelated subscription, invalid binding, or an event superseded by later valid evidence.
- [ ] **L04 — Trace subsequent events.** Compare the event timeline with current subscription status, effective plan, billing period, invoice/payment state, entitlements, allowances, and pending changes. Guard against an older event reverting a newer plan or cancellation.
- [ ] **L05 — Determine actual impact.** State precisely whether the account is missing access/credits, has incorrect access, or already reflects the correct provider state. If ownership remains unknown, keep it in manual review.
- [ ] **L06 — Define the smallest remedy.** Prefer authoritative reconciliation of an existing subscription when supported. An inbound subscription-event recovery must not create a new subscription, charge, refund, or manual credit as a shortcut.
- [ ] **L07 — Write expected deltas before recovery.** Name the specific subscription fields or missing ledger entry that should change once. State zero expected new charges and messages unless the reviewed operation explicitly requires otherwise.
- [ ] **L08 — Verify once-only application.** After the supported recovery, compare provider objects and local records. A repeat of the same event must create no additional business effects and must not roll state backward.

## 4. Audit and classify all 31 webhook closures

- [ ] **W01 — Reconstruct the closure.** Link the exact 31 source IDs and their shared resolution time to the aggregate operator audit. Preserve the original audit claim and append a corrective review explaining that it lacks replay evidence; do not rewrite the old audit entry.
- [ ] **W02 — Prevent further false recovery claims.** Before operational cleanup, retire or correct both the operator replay branch and the simulated autonomous healer. Diagnosis and administrative classification must be distinguished from execution of a real source-specific recovery.
- [ ] **W03 — Review all 29 voice records.** Read each error and linked provider call/event/receipt. Distinguish callback ingestion failure, receipt projection failure, historical operational observation, unsupported payload, and downstream failure. A voice health observation may need classification or state reconciliation rather than callback replay.
- [ ] **W04 — Verify voice side effects.** Check call history, terminal provider timestamps, reservation/finalization identities, minute debits, lead/job creation, and any post-call notifications. Confirm historical unmetered/test policy before inferring a missing debit or creating an adjustment.
- [ ] **W05 — Review both SMS-registry records.** Reconcile `pending` and `complete` against the correct current registration object and callback timeline. Check whether they refer to the same registration. Do not project an old pending event over a later valid complete state or resubmit a registration just to clear an alert.
- [ ] **W06 — Choose a source-specific recovery.** Use authenticated stored receipts and the real bounded reconciliation worker where available. Retain event identity, tenant binding, ordering rules, and deduplication. Do not post arbitrary saved JSON into a public callback or invent a signature.
- [ ] **W07 — Handle unsupported recovery honestly.** If the provider cannot supply the original event or the source has no safe replayer, keep an owned review item and implement a tested reconciler if needed. Do not mark it recovered from an admin success banner.
- [ ] **W08 — Restore visibility where justified.** For a closed record whose underlying issue remains actionable, create a linked visible incident or use an audited reopening mechanism that preserves the prior closure. Do not reopen every historical record indiscriminately.
- [ ] **W09 — Finish 31 individual dispositions.** Each must cite test provenance, a verified current outcome, a superseding event, or an owned unresolved problem. All 31 source rows and the original closure audit must remain retrievable.

## 5. Reconcile the four SMS failures individually

| SMS event ID | Original purpose | Observed provider acceptance, UTC |
| --- | --- | --- |
| `8d80be23-750b-4b42-a130-243e2012611e` | Client job dashboard | September 3, 13:33:53 |
| `e254fbc6-ebf1-4f7a-8a03-cf5c3603660c` | Client job dashboard | September 4, 13:05:19 |
| `25809e0e-e2d9-4580-b77b-8177c5e14244` | Quote follow-up | September 4, 13:40:22 |
| `36cba7e8-52a5-46a9-8c79-557f2160c0c0` | Speed to lead | September 4, 13:36:20 |

- [ ] **S01 — Retrieve each existing provider message.** Match its provider ID, project, sender, destination, submission time, segments, final status, and error with the stored callback. Keep phone numbers and message bodies in restricted evidence, not the general report.
- [ ] **S02 — Reconcile callback ordering.** Inspect authenticated receipts and any unmatched/duplicate events. Apply an existing receipt to the correct SMS event through the supported reconciliation path if needed. Provider acceptance alone is not delivery.
- [ ] **S03 — Check task state and duplicate intent.** Inspect all delivery tasks and application message mirrors for the same business operation. Verify that no queued retry, active lease, or separately keyed copy can send the historical message again.
- [ ] **S04 — Establish destination provenance.** Determine whether each was an approved test and whether the destination is still valid. Verify the exact SignalWire response before choosing a contact-data correction. Do not assume all four share one recipient or root cause merely because the error matches.
- [ ] **S05 — Reassess present business need.** Check the job/quote/lead state and whether another communication already served the purpose. A late speed-to-lead or quote-follow-up message can be obsolete even when its original send was legitimate.
- [ ] **S06 — Reconcile committed usage.** Match each text reservation, finalization key, segment count, debit, and any overage to the existing provider message. The inspected application code commits text usage on a real provider ID. A subsequent delivery failure therefore does not, by itself, prove the committed usage is wrong.
- [ ] **S07 — Separate accounting corrections from delivery.** If the applicable billing policy and evidence require an adjustment, use a uniquely identified compensating operation linked to the original finalization. Do not release or credit an already committed send merely to make the failure disappear. Repeating the correction must add no credit.
- [ ] **S08 — Reconcile uncertainty before sending.** If provider outcome is ambiguous, retain review status until authoritative evidence resolves it. An application idempotency key does not automatically establish provider-side deduplication, especially for these old messages.
- [ ] **S09 — Treat a necessary replacement as a distinct decision.** A genuinely new replacement requires current recipient/sender eligibility, consent/suppression checks, timing checks, an appropriate current body, explicit send authorization, and a link to the original failed message. Give that new intent its own stable identity; retries of that same intent reuse it. Do not reset the old accepted SMS to unsent.
- [ ] **S10 — Close each review with evidence.** Record whether the old message was a test, terminal/obsolete, superseded, reconciled, or needs follow-up. Dismissing a messaging review item is administrative bookkeeping; it is not proof of delivery or of an accounting repair.

## 6. Classify the 185 terminal test-mode billing events

- [ ] **T01 — Group for investigation, retain individual accountability.** Group by event type, provider subscription/customer, receipt interval, error, and rehearsal run. List every source ID underneath its group.
- [ ] **T02 — Correlate approved rehearsal evidence.** Match test-account/subscription objects, script or drill references, timestamps, and expected failures. Check whether every event belongs to the same exercise; split unexplained members into manual review.
- [ ] **T03 — Reconcile effects.** Verify that each test event produced no live charge, live subscription mutation, improper entitlement change, credit grant/debit, or real customer message. Also document intended test-provider effects where they exist; do not report “zero effects” if a test-mode operation actually occurred.
- [ ] **T04 — Record precise dispositions.** Only positively verified obsolete tests leave the production actionable view. Preserve immutable event identity, original failure, payload hash, mode, received time, and attempt history.
- [ ] **T05 — Avoid changing source truth to silence monitoring.** Do not delete events, set them to processed without projection, disable audit triggers, alter `livemode`, reset attempts, or repurpose an unrelated ignored reason.
- [ ] **T06 — Keep future mistakes visible.** Excluding this exact reviewed cohort must not suppress all future test-mode events or all mode-configuration errors. New unexpected test traffic reaching production should remain a bounded configuration finding.
- [ ] **T07 — Verify routing separately.** Confirm rehearsal endpoints and trusted server mode settings, retaining signature and account binding checks. Keep approved future rehearsals isolated from live business effects.
- [ ] **T08 — Reconcile the final membership.** The obsolete-test count is an evidence-based result, at most 185 for this cohort. Do not force all 185 into that outcome if some remain unexplained.

## 7. Preserve a durable audit trail and consistent action queues

- [ ] **A01 — Use an existing adequate disposition store or add one.** Prefer a service-owned record with a unique source reference and append-only decision history. Coordinate this with work package B in the [admin operations remediation plan](admin-operations-remediation-plan-2026-09-09.md), rather than implementing a second conflicting classification system.
- [ ] **A02 — Make each record reviewable.** Record source/category/ID, baseline batch, incident ID, provider/account/mode, original state and error, relevant payload hash, disposition, rationale, evidence references, actor, timestamp, owner/deadline where open, and any superseding decision.
- [ ] **A03 — Record recovery intent and result.** Include exact targets, preconditions, expected changes, original operation/idempotency identities, code revision, attempt/lease identity, provider request/result references, before/after snapshots, and verification outcome. Never store credentials or raw authorization headers.
- [ ] **A04 — Make audit persistence dependable.** The current general admin logger is best-effort. A new triage mutation should persist its disposition and audit atomically, or durably persist recovery intent before external work and reconcile the result afterward. A missing audit row must not be represented as a successful audited closure.
- [ ] **A05 — Preserve access controls.** Use authenticated, appropriately permitted operator actions and applicable MFA. Verify cross-account denial and database permissions for any new helper. Store sensitive payloads privately with existing retention/access controls; general documentation should contain references and redacted summaries.
- [ ] **A06 — Apply one classification policy everywhere.** Align scanner selection, admin counts, filters, digests, and history. Show actionable failures separately from reviewed historical records. Preserve already delivered alert payloads and provider IDs.
- [ ] **A07 — Clear findings from verified source/disposition state.** Let a successful complete monitor scan reconcile covered findings. A failed, stale, or truncated query must not clear unseen records or report healthy empty results.
- [ ] **A08 — Support correction without erasure.** Reclassifying a mistaken test disposition creates a new audit decision and restores actionability. Stopping a recovery does not undo a provider charge/message; any actual reversal needs its own documented operation.

## 8. Prove recovery cannot duplicate effects

Before any real retry, write the expected first-application delta and the expected repeat delta. **A repeated attempt may add diagnostic/audit entries, but must add zero business effects.** A simple unchanged account balance is insufficient: an extra debit and an extra credit could cancel out.

| Effect | Before/after evidence | Repeat acceptance criterion |
| --- | --- | --- |
| Charges and refunds | Provider payment/charge/refund IDs, amounts and currencies; local operation IDs, request fingerprints, settlement rows | No extra provider object, duplicate settlement, or repeated monetary operation |
| Subscription and access | Bound customer/subscription, event ordering, effective plan/period/status, entitlement records | Same intended final state; no rollback from an older event or cross-account mutation |
| Credits and usage | Grant/debit identities, originating invoice/event/call/message, reservations, finalization keys, units, overage records | No second grant, debit, release, refund, or overage for the same operation |
| SMS and other customer messages | Provider message IDs, business intent, tasks, receipts, sent/accepted state, application message mirrors | No new send for a previously submitted intent and no duplicate customer-visible message |
| Voice downstream work | Provider call/receipt identity, call history, job/lead creation, minute finalization, post-call messages | One intended projection and at most one of each authorized downstream effect |
| Operational notifications | Finding identity, immutable delivery request, provider ID, resolved/reopened history | Repeating the same notification request creates no duplicate send; a real new incident follows the documented alert policy |

- [ ] **V01 — Verify the installed recovery contract.** Confirm legal state transitions, immutable fields, ownership/lease fencing, attempt history, and provider idempotency behavior. Implement an exact-ID, expected-state, mode/account-scoped recovery action if the existing control cannot express the reviewed selection.
- [ ] **V02 — Exercise the real database boundary in isolation.** Test the affected operation using isolated fixtures and the actual constraints/RPCs. Do not rely only on mocked success returns.
- [ ] **V03 — Repeat the same event and receipt.** Cover duplicate ingress, duplicate callback, sequential retry, and stale events arriving after newer ones. Verify the effect matrix, including downstream notifications.
- [ ] **V04 — Exercise concurrency and crashes.** Cover competing claims, failure before provider submission, provider acceptance followed by local persistence failure, expired lease, and a late result from a former lease owner. Exactly one worker may apply the intended effect.
- [ ] **V05 — Exercise ambiguous provider results.** Reconcile an existing provider operation before considering a repeat request. When provider deduplication support or its time window cannot protect the request, keep it in manual review rather than assuming a local key prevents an external duplicate.
- [ ] **V06 — Test exclusions.** A known obsolete test does no live business work; a new unexpected test event remains detectable; a real failed live event remains visible. Cross-tenant and wrong-mode attempts fail without effects.
- [ ] **V07 — Start with one eligible production operation.** Recheck the exact manifest membership and current state immediately before execution. Stop on any new provider ID for an already submitted intent, unexpected amount/credit delta, ownership mismatch, or concurrent state change. Expand only after the first outcome is fully reconciled.
- [ ] **V08 — Repeat only the supported idempotent recovery boundary.** Demonstrate the repeat behavior using the original identity; do not bypass application guards to force a second live charge or message as a test.

## 9. Observe, reconcile, and close the prelaunch item

- [ ] **C01 — Observe three consecutive scheduled worker/monitor cycles after any changes.** Confirm expected queue state, no concealed live failure, no unexpected new effects, and correct historical/actionable counts. Follow with a 24-hour observation for delayed callbacks or retry reappearance. These are future execution steps; no new schedule was created for this plan.
- [ ] **C02 — Preserve the existing alert acceptance gate.** If triage changes scanner/disposition behavior, verify a controlled actionable failure still reaches `hello@letsgetquoted.com` automatically within 60 minutes, with exact record references and a supported recovery action. Record failure, detection, provider-delivery, and mailbox evidence timestamps. Provider acceptance alone does not pass delivery.
- [ ] **C03 — Reconcile all 221 dispositions.** Sum mutually exclusive current dispositions back to 31 webhook, 186 billing, and 4 SMS source records. Report incident counts separately. Account for every source record, including those already closed before this review.
- [ ] **C04 — Publish a redacted closeout.** Include counts by disposition, actual root causes, linked fixes, any recoveries and measured deltas, repeat/concurrency results, remaining owners/deadlines, and links to restricted evidence. Describe provider evidence that could not be obtained.
- [ ] **C05 — Apply the launch decision honestly.** Complete accounting for all records can coexist with owned unresolved work. Do not mark the broader recovery/prelaunch gate passed while material billing, entitlement, messaging, or audit uncertainty remains. Any explicit accepted risk must be recorded with its owner and rationale.

### Final acceptance checklist

- [ ] All 221 baseline source records remain available and have individual documented dispositions.
- [ ] The 31 webhook closures are independently reviewed; the aggregate “replayed” claim is not used as proof.
- [ ] The one live billing event has a verified outcome or a clearly visible unresolved launch decision.
- [ ] Only positively identified obsolete test records leave the actionable view; new and live failures remain detectable.
- [ ] All four SMS provider outcomes and their committed usage are reconciled separately.
- [ ] Every executed recovery matches its planned first-application delta and has zero duplicate effects on repetition.
- [ ] No audit history, immutable provider identity, payload, or attempt history was erased to clear the queue.
- [ ] Scheduled observation and any required alert regression checks have recorded evidence.

## Implementation references

- [Prelaunch checklist](../LAUNCH_CHECKLIST.md) — current historical-backlog gate remains open.
- [Operational alert verification](operational-alerts-verification-2026-09-09.md) and [release runbook](https://github.com/wideeyephoto/lets-get-quoted/blob/48dee526b6c25a020758e42f4684bd5698ef54e2/docs/runbooks/operational-alerts.md) — prior monitoring proof; it does not classify this backlog.
- [Operator tool](../src/lib/ai-operator/tools.ts), [operator actions](../src/app/admin/operator/actions.ts), and [autonomous healer](../src/lib/ai-operator/webhook-healer.ts) — false replay/resolution claims to correct.
- [Webhook admin actions](../src/app/admin/failures/actions.ts) — reasoned administrative closure, distinct from replay.
- [Billing operations action](../src/app/admin/billing-operations/actions.ts) and [billing audit guards](../migrations/20260815222334_billing_audit_guards.sql) — bulk selection and state-transition constraints.
- [Messaging review actions](../src/app/admin/messaging/actions.ts), [SMS reconciliation](../src/lib/sms-usage-reconciliation.ts), and [text-credit accounting](../src/lib/billing/text-credit-usage.ts) — status reconciliation and usage finalization boundaries.
- [Voice operational health procedure](voice-operational-health-2026-09-08.md) — historical observations, receipt scope, and voice accounting checks.
- [Admin audit helper](../src/lib/admin.ts) — existing best-effort logging; insufficient by itself for atomic disposition history.
