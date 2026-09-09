# Customer SMS launch acceptance — September 9, 2026

**Decision: customer carrier acceptance remains blocked on registration; full inbound dead-letter recovery also remains open.** The current provider inventory contains no campaign covering contractor-to-customer booking, missed-call or follow-up messages. This session completed the real-handset STOP/START-backed cross-workspace database checks and strengthened the deferred-delivery/recovery evidence. It did not send customer SMS, change a registration, expand a rollout allow-list, or enable the paused customer producer.

Runtime source tested: fetched `origin/main` **48dee526b6c25a020758e42f4684bd5698ef54e2**. The acceptance branch changes test tooling and documentation only. Production database project: `mfuvvtrkipkigwqqtcal`. Database routines were also exercised directly as described below; this report does not independently attest a Vercel deployment SHA.

## Registration finding

The [dated provider inventory](evidence/customer-sms-provider-2026-09-09.json) was obtained with GET requests only. All three numbers have SMS capability and the POST inbound webhook configured, but registration scope is the blocker:

| Sender | Active campaign | Registered scope | Customer acceptance |
| --- | --- | --- | --- |
| 8333 | `19e7c875-3611-4b40-8429-7dae3b5e6553` | LGQ crew/subcontractor dispatch; expressly excludes homeowner messaging | Not covered |
| 2687 | `638bad76-629d-4321-90e2-6fe533c09091` | LGQ account/support notifications; expressly excludes contractor-to-customer traffic | Not covered |
| 2323 | Same support campaign | Same LGQ account/support scope | Not covered |

Production has **zero `messaging_registration_applications` rows**. `customer_sms_sender_registered` returns **false** for the BrokePipes sender. Its `provisioning_application_id` is null. BrokePipes `post_call_sms_enabled=false`; Midwest has no assigned customer sender. An older legacy approved registration or a delivered text from 2687 is not acceptance evidence for this lane.

The next registration action needs SignalWire's answer about the genuine LGQ business identity and the use of BrokePipes/Midwest as internal test workspaces. The current campaigns cannot simply be relabeled customer-ready. For an actual customer business, registration must use the real business identity, the actual messaging use case, consent flow and message samples, followed by approved number assignment. SignalWire documents the brand → campaign → number-assignment sequence and requires registration before 10DLC sends: [registration guide](https://signalwire.com/docs/platform/messaging/campaign-registry/registration). Its broad `CUSTOMER_CARE` use-case label does not override a campaign description that excludes this traffic.

Provider clarification to resolve: **Which brand/campaign arrangement should LGQ use for internal booking, missed-call and customer-reply acceptance tests, where the workspaces are test companies and all messages go to our controlled opted-in handset? Does that arrangement permit multiple test workspaces, and what identity, consent disclosure and message samples must be submitted?** The question was requested from Brett; no provider answer was supplied in this session. Nothing was submitted to SignalWire.

## Live STOP and START evidence

Brett sent both keywords to **8333** and confirmed their handset acknowledgments. [Machine-readable evidence](evidence/customer-sms-hosted-2026-09-09.json):

- STOP received **15:42:18 UTC**, receipt `e3b753b0-d6be-4426-bea2-2d45611a85d4`, provider event `7feea0e5-b4cd-4249-8957-e958b1f2dfb2`. The dispatch campaign preference became `opted_out` from `inbound_stop`.
- Against that real STOP, the deployed dispatcher canceled otherwise-eligible fixtures for **both BrokePipes and Midwest**, specifically with `sms_sender_opted_out`. Neither reached the provider request boundary or reserved usage.
- START received **15:43:25 UTC**, receipt `82fc4c0f-23ba-4985-b93b-5d94c07b4b8a`, provider event `806eb3d0-3196-4b2f-8f86-659d897d6f89`. The dispatch campaign preference became `opted_in` from `inbound_start`.
- Against that real START, BrokePipes staged as `ready`; Midwest with a separate workspace opt-out remained canceled as `sms_consent_not_current`.
- Workspace eligibility and independent opt-out records were transaction-only fixtures. Real campaign keyword preferences were read, not overwritten. The separate cleanup query found **zero fixture events or consent-scope rows**. Brett's handset finished **opted in**.

This closes the production-database boundary check backed by real handset keywords. It does **not** claim a second-workspace carrier send, a second physical dispatch sender, customer-campaign STOP coverage, or a fresh post-START business-message handset delivery. The September 8 single-workspace dispatch results (nine messages / 22 reconciled segments) remain inherited evidence in `C:/dev/sms-live-test-evidence-20260908.md` and were not repeated.

## Deferred delivery and recovery

**Production containment: five checks passed.** [Repeatable rollback SQL](../scripts/verify-hosted-customer-sms-blocked-rollback.sql) uses a reserved 555 database fixture and never calls a provider or globally claims the delivery queue. It proves atomic future enqueue, ten successive registration-blocked stage/defer cycles, preserved retry budget and append-only history, expiry cancellation, and zero provider-request/usage evidence. All fixture writes roll back inside the DO block. A separate query confirmed zero leftover events/consent and **zero queued or leased delivery tasks**. Execute the file as one transaction/query; it intentionally refuses to run once customer registration becomes ready.

**Disposable PostgreSQL: 122 checks passed.** [Automated evidence and log hashes](evidence/customer-sms-automated-2026-09-09.json):

| Harness | Passed | Scope |
| --- | ---: | --- |
| Delivery foundation, including nine added acceptance checks | 34 | Atomic future enqueue, no early claim, replay preservation, ten deferrals without spending provider retries, one-winner due claim, bounded retries and expiry; also definitive rejection, ambiguous outcome, usage finalization and concurrent workers |
| Customer registration guard | 23 | Exact registration/brand/campaign/number/inbound matching; support/dispatch campaign exclusion; customer/payment/verification gating; STOP and browser-role denial |
| Campaign-wide STOP | 7 | Same-campaign sender suppression, valid/ambiguous START, reassignment boundary, role protection |
| Webhook and operator recovery | 24 | Duplicate/out-of-order status, early unmatched status, one-winner operator reconciliation, terminal delivery protection and no resend |
| Inbound action recovery, including four added acceptance checks | 34 | Tenant/purpose routing, duplicate receipt ownership, lost apply response and failed-after-effect retry without duplicate booking/assignment; eight-failure dead-letter containment preserves one booking and the saved outcome, rejects receipt replay, and is excluded from background claims |

**Application regression: 177 tests passed across 13 files.** Covers booking/post-call/intake producers, missed-call paths, inbound keywords/actions, delivery worker/routing/cron, usage and provider behavior. Provider responses and clocks are mocked in this layer. These tests do not establish handset arrival or successful production scheduling under a registered customer campaign.

The added queue cases run the actual later migration contracts for delayed enqueue, replay hardening, lease sequence/deferral budget, TTL and inbound retry exhaustion, rather than only the original foundation schema. Local queue timestamps are deliberately advanced to test release; this is not a natural quiet-hours scheduler observation. Definite provider rejection and uncertain response recovery are simulated inputs, not induced carrier failures. Historical production failures remain owned by the separate backlog-triage task and were not replayed here.

**Recovery limitation found:** the current [admin messaging actions](../src/app/admin/messaging/actions.ts) support review resolution and exact unmatched-status reconciliation. The page directs operators to investigate inbound dead letters, and the production function catalog has claim/apply/complete/fail operations but no inbound dead-letter retry operation. Preserving a dead letter is proven; restoring it through an audited operator process is not. Do not reset its attempt counter manually and call that a passed recovery drill. Define and verify that recovery process before closing this gate.

## Remaining acceptance, in execution order

| Gate | Required proof | Status |
| --- | --- | --- |
| Correct customer registration | Provider-confirmed business/test arrangement; approved matching brand/campaign, completed individual number assignment, app registration evidence and readiness predicate true | Blocked; no qualifying campaign/application |
| Booking and missed-call/post-call SMS | Normal application trigger → one durable event → one provider ID → delivered callback → handset text and working link; exact recipient, workspace and usage | Customer carrier test open |
| Customer replies and keywords | Ordinary reply visible in the correct workspace; no other-workspace disclosure; actual customer-sender HELP/STOP/START acknowledgments and queued/future-send suppression | Customer carrier test open |
| Customer deferred delivery | Normal producer in quiet hours remains queued, releases on the natural scheduler after the window, arrives once, and reconciles usage | Queue/containment mechanics passed; carrier/scheduler test open |
| Customer rejection and uncertain recovery | Controlled provider rejection/backoff and terminal path; recover a stored carrier fact after an uncertain outcome without sending again; reconcile failed/uncertain usage | Component recovery passed; carrier drill open |
| Inbound dead-letter recovery | Exhaust the production-equivalent inbound retry budget, retain the original domain outcome, recover through a defined audited operator path, and prove zero duplicate effects | Exhaustion and saved outcome passed; audited resume/recovery process still needs implementation or definition and a drill |
| Customer cross-workspace STOP | Repeat the real keyword-backed check on the approved customer campaign and any approved shared-workspace arrangement | Dispatch boundary passed; customer campaign unavailable |

No customer-launch checkbox should be marked complete until the remaining provider/handset/scheduler evidence exists. Keep the existing registration guard and BrokePipes post-call pause in place while preparing the correct registration.
