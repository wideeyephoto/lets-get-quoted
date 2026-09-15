# Roadmap to SMS ready — September 8, 2026

## Extended-session update

Latest closeout (21:22 UTC): production permission repair, secure-link acceptance, decline, cancellation after decline, and cancellation of an unanswered offer are complete. PR #39 merged as `c6937034b`; CI passed and the production domain serves the inline-confirmation fix. The cancellation text delivered in one attempt, and Brett confirmed the original offer link is closed with no Accept button. Test job and subcontractor were archived through the UI; all six extended-session delivery tasks completed once. Nine business messages match actual carrier segments to committed application units (22 total). Hosted rollback-only duplicate/late-status checks passed and left no synthetic receipts. Broader cross-workspace, recovery, and customer gates remain open.

The live acceptance URL opened on the phone without sign-in and hid customer identity before acceptance. A Midwest-only staff session could not open the BrokePipes request management page (404). That staff denial does not close eligible second-workspace carrier suppression.

The send action exposed a delivery-evidence permission defect despite successful handset delivery. The service-role-only fix was applied to production as migration `20260908201549`. Repair reused the original delivered event without resending and preserved accepted/claimed state; a fresh offer verified automatic projection. The accepted request remains as audit evidence on the archived test job.

Customer messaging: fresh production reads found no registration application for BrokePipes or Midwest, and pilot 2687 remains on the support campaign. Booking/post-call/intake/timezone tests and 23 registration/readiness checks passed locally; no live customer send or carrier approval is claimed. Brett clarified that LUX HD ART was proposed only for LGQ testing, not as an operating installation business. No website or registration was created for it. The next registration step is provider confirmation of an accurately described LGQ internal-test setup; a support question was drafted, but submission and response are not confirmed. A genuine downstream business remains the alternative path. Neither path authorizes sending before correct approval and individual number assignment.

**Next milestone: remaining operational acceptance before dispatch expansion.** Complete eligible cross-workspace/sender suppression and the outstanding recovery/accounting cases. Customer messaging follows its own registration gate.

The coordinated single-workspace handset session is complete. September 8 live results: normal Add Crew welcome, job assignment with correct schedule, ordinary reply routing, HELP after an approved production fix, STOP acknowledgment, blocked pre-STOP queued and post-STOP fresh probes, START acknowledgment, and resumed schedule delivery passed. The temporary job and crew were archived, no test tasks remain pending, and the final keyword preference is START. The dated [launch checklist](../LAUNCH_CHECKLIST.md#signalwire-completion-and-remaining-launch-gates--2026-09-06) remains the earlier baseline.

## What is already proven

| Lane | Recorded evidence | Remaining gate |
| --- | --- | --- |
| Shared support, ending 2323 | Delivery, ordinary inbound routing, keyword processing, STOP blocking, and resumed delivery are recorded in the checklist and [September 5 evidence](texting-release-readiness-2026-09-05.md). | Reuse that evidence. Its report distinguishes application acknowledgment records from handset confirmation; do not turn it into proof of every acknowledgment or another lane. |
| Crew dispatch, ending 8333 | Approved dispatch campaign, active individual number assignment, released welcome fix, and one delivered welcome through the durable queue. | That welcome was a controlled recovery. Normal Add Crew, business producers, links, dispatch replies/keywords, and campaign-wide suppression still need acceptance. |
| Contractor-to-customer | Booking/post-call producers and dedicated-number infrastructure exist. | Correct business/campaign coverage and sender readiness must precede customer sends. Earlier support-campaign pilot traffic does not close this gate. |

BrokePipes is the recorded dispatch canary. **Midwest Glass remains a test company**, as does BrokePipes; neither is evidence of a vetted independent downstream business. Midwest is not automatically an eligible SMS workspace. Keep voice acceptance and paid billing work in their existing workstream.

## Milestones and ownership

| Order | Work | Brett's phone | Operator / Codex | Exit condition |
| --- | --- | --- | --- | --- |
| 1 | Prepare the dispatch session | Available for the agreed session; authorize the test handset. | Check current readiness, select consented crew/job fixtures, prepare evidence and STOP probes. | Preflight below passes. |
| 2 | Coordinated dispatch session | Receive two normal messages, open links, send a plain reply and keywords when prompted. | Trigger released producers, correlate delivery/routing, run suppression probes before START. | Every applicable handset step has a dated result. Allow roughly 30–45 minutes after preparation; this is a planning estimate. |
| 3 | Close dispatch operational gaps | Only a targeted retest if a fix needs carrier/handset proof. | Complete workflow branches, dedupe, tenant boundaries, retry/quiet-hours checks, and SMS usage reconciliation. | No unresolved dispatch release blocker; evidence reviewed. |
| 4 | Expand dispatch in stages | No routine repeat of the shared-number tests. | Record the approved account cohort, observe it, and expand only after acceptance. | Each cohort passes the observation and rollback criteria below. |
| 5 | Register and prove customer messaging | Later, receive booking/post-call messages and reply. | Complete real-business registration and sender checks, then run customer producer and inbox acceptance. | Customer gate passes independently of dispatch. Carrier timing determines this milestone's date. |

## 1. Preparation before the phone session

- [ ] Record production deployment/commit, SMS provider, outbound/worker/lane settings, current canary list, and queue/reconciliation/webhook health. Compare the baseline with the end of the session.
- [ ] Recheck dispatch sender `+18103208333`, individual assignment, campaign `19e7c875-3611-4b40-8429-7dae3b5e6553`, inbound readiness, and production SMS callbacks. Preserve the existing voice routing.
- [ ] Record the authorized handset privately, recipient consent, disclosure version/evidence, active crew scope, and current suppression state. Use one unambiguous crew identity for the initial reply test. If already opted out, only a real handset START with valid consent can restore eligibility.
- [ ] Select a fresh authorized crew fixture and a harmless test job with a clear company, schedule, and expected link destination. Identify the actual released UI action for each message. Exercise Add Crew itself; manually enqueueing another recovery welcome cannot pass that step.
- [ ] Prepare a dispatch message that will remain queued until after STOP is processed, plus a future-send probe. If the normal product cannot stage this safely, prepare an isolated controlled fixture and record its evidence scope. Do not pause unrelated production work to create the test.
- [ ] Prepare cross-workspace and same-campaign sender suppression probes. Confirm all eligibility checks other than opt-out would permit each probe: an allow-list, missing consent, or unregistered sender rejection is not proof of STOP. If an eligible fixture is unavailable, keep that check open and retain the rollout restriction.
- [ ] Start a private evidence log. All business sends use the application producer/queue path and authorized recipients; keyword acknowledgments use the existing compliance response path. Session execution begins after Brett confirms the handset and readiness; creating this roadmap does not start messages or change rollout settings.

## 2. Coordinated dispatch session

The operator announces each step and checks its records before advancing. **Wait after STOP: Brett sends START only after the queued, future, and cross-workspace/sender blocking checks finish.** An ordinary reply uses neutral text such as “Dispatch test received”; it is not a request to enable crew field commands.

| ID | Operator action | Brett's phone action | Required pass evidence |
| --- | --- | --- | --- |
| D1 — Automatic welcome | Add the consented test crew member through production UI. Save the same member/phone again without changing consent. | Confirm one automatic welcome from **8333** and open each included link. | Disclosure/evidence saved; one welcome event and provider send; delivered callback plus handset confirmation; correct company/link content; repeat save creates no second welcome. |
| D2 — Real work notification | Assign/schedule the test job using its released producer. | Confirm the job/schedule text from **8333**; open its job link and check the company, job, date/time, and permitted actions. | Durable producer result, delivery, correct workspace/crew/job, working mobile destination, and no duplicate from repeating the same action. Each legitimately distinct schedule change may produce its own notification. |
| D3 — Ordinary reply | Inspect routing and the intended crew-message/review surface. | Send “Dispatch test received.” | One inbound receipt and routed result in the expected workspace; no other-workspace/customer-inbox exposure or unintended job mutation. A review caused by ambiguous identity does not pass this unambiguous routing case. |
| D4 — HELP | Correlate the compliance response and consent state. | Send **HELP** and confirm its acknowledgment. | One expected response, correct dispatch/support identification, no duplicate ordinary-message action, and consent unchanged. A webhook success alone does not prove handset receipt. |
| D5 — STOP | Wait for the STOP receipt and campaign preference to be applied. | Send **STOP**, confirm its acknowledgment, then wait. | Campaign opt-out recorded; acknowledgment seen; queued/future dispatch suppressed. Preserve that state throughout D6. |
| D6 — Blocked delivery | Release the pre-STOP queued probe; attempt a fresh send and the eligible other-workspace/same-campaign sender probes. | Confirm no business texts arrive during the agreed observation window. | Each probe blocked specifically by suppression; no new provider submission or committed application text usage. Observe at least one full delivery-worker interval. Handset silence alone is insufficient. An already submitted pre-STOP message is outside the queued probe and must be identified separately. |
| D7 — START and recovery | After D6 is recorded, check re-opt-in scope and trigger one fresh valid job/schedule notification. | Send **START**, confirm its acknowledgment, then confirm resumed delivery from **8333**. | Carrier/application preference updated; current consent and crew authority rechecked; new message delivered once; unrelated consent scopes preserved. Suppressed or canceled test messages are not replayed to manufacture recovery. |
| D8 — Close the session | Check final queue, receipts, usage, and fixture state. | Confirm the recorded handset results and final opt-in preference. | All session IDs correlated; no unexplained pending work or duplicate usage. Record the recipient's chosen final preference and restore it only through the normal consent/keyword flow. |

If a link fails for an SMS-only crew member, capture that exact access path and keep the link check open. Testing it only while signed in as an owner cannot establish crew usability.

## 3. Operator checks and targeted retests

These checks can be prepared without Brett's phone. Label each result **local**, **controlled hosted fixture**, or **live carrier/handset** so a simulation never closes a missing live check.

- [ ] **Business workflow coverage:** exercise applicable offer, accept, decline, cancel, and schedule-change producers. Use separate test offers for mutually exclusive branches. Verify saved state, correct notification/recipient, working links, and idempotent repeated actions. A passed welcome and assignment do not close untested branches. An excluded workflow requires an explicit documented scope decision.
- [ ] **Tenant and campaign boundaries:** prove ambiguous/wrong/revoked identities cannot select or mutate another account, linked reply actions apply once, STOP covers the eligible second workspace and same-campaign sender fixture, and START restores only valid scope. If only one carrier number exists, the fixture proves application suppression for another sender; do not describe it as a second number's handset result.
- [ ] **Queue and callback recovery:** prove quiet-hours deferral/release, known retryable rejection, terminal failure/dead-letter visibility, duplicate and out-of-order callbacks, and worker recovery without duplicate sends or actions. Reconcile an indeterminate provider outcome before any resend; a callback replay must not regress delivered state.
- [ ] **SMS usage:** correlate event, attempt/task, provider message, receipt, segment count, and reservation/commit/release/reconciliation outcome. Eligible sends account exactly once; STOP-blocked sends have no provider egress or committed text debit; failed/indeterminate cases follow the actual policy. Audit keyword acknowledgments separately from business-message events. This is SMS usage acceptance, not the separate paid subscription lifecycle.
- [ ] **Evidence review:** resolve every new failure/review item or record an owner and disposition. Attach a specific retest to each fix. Retain existing shared-lane evidence unless the fix changes that behavior.

Useful existing checks, selected according to the change: `test/crew-welcome-and-vcard.test.ts`, `test/crew-sms-consent.test.ts`, `test/subcontractor-dispatch.test.ts`, `test/subcontractor-acceptance.test.ts`, `test/sms-inbound-compliance-route.test.ts`, `test/sms-delivery-worker.test.ts`, and `test/sms-usage-reconciliation.test.ts`. The existing `test:pg17:sms-campaign-stop`, `test:pg17:sms-dispatch-sender`, and `test:pg17:sms-purpose-boundary` scripts support controlled database verification; review their environment before execution. These are tools for the future session/fixes, not checks run by this roadmap.

## 4. Dispatch launch gate and staged expansion

**Dispatch ready for expansion** requires D1–D8, all applicable dispatch workflow branches, campaign-wide suppression, and the dispatch operational checks above to pass with dated evidence. Any unavailable fixture, missing handset acknowledgment, unresolved duplicate, wrong workspace, or unproven STOP block keeps its checklist item open.

1. Record explicit approval of the first additional eligible account cohort, its owner, current carrier-approved limits, monitoring window, and baseline. A narrow test-fixture allowance is not general customer expansion. Keep Midwest's test status explicit.
2. Observe each cohort for at least one full automation interval and one agreed operational review window before adding the next. Track oldest due queue age, failed/indeterminate/review work, webhook failures, duplicate events, and usage reconciliation. Compare new exceptions with the recorded historical baseline. Keep the allow-list explicit; an empty list means all accounts are eligible.
3. Stop expansion immediately for a suppression bypass, wrong-account delivery, duplicate business send, unexplained usage, or unresolved new delivery/reconciliation failures. Pause the affected dispatch cohort/lane; use the global SMS stop only if containment requires it. Keep inbound/status callbacks available, preserve consent/evidence, and reconcile unknown outcomes before retrying. The [cutover runbook](signalwire-messaging-cutover-runbook.md#rollback) documents the broader emergency stop.
4. Close only the supported dispatch checklist items, recording dates, evidence references, rollout scope, and remaining exceptions. “Dispatch ready” does not close customer registration or commercial dedicated-number acceptance.

## 5. Customer messaging later

- [ ] Obtain the correct genuine downstream business identity, approved use case/campaign, consent collection, disclosures, and samples. Midwest and BrokePipes test data must not be submitted as an invented independent business. The support and dispatch campaigns do not substitute for customer-message coverage.
- [ ] Verify the individual dedicated-number assignment, SMS capability, intended tenant, and exact production SMS callbacks while preserving voice routing. Track the checklist's CSP submission/status/rejection/reconciliation integration as a separate requirement; externally supplied IDs do not establish automated onboarding.
- [ ] With correct registration and an authorized handset, trigger the released booking confirmation and missed-call/post-call flows included in launch scope. Confirm sender/company identity, handset delivery, permitted links, one saved booking/lead outcome, and no duplicate. Receiving one producer's message does not pass the other producer.
- [ ] Reply and confirm the intended customer inbox/account. Verify contractor-branded HELP/STOP/START, blocked/resumed sends, and customer-lane recovery/segment reconciliation; use the shared evidence only for the behavior it actually proves.
- [ ] Link to the existing paid dedicated-number lifecycle evidence for any commercial launch: entitlement, reviewed purchase, provisioning/recovery, recurring billing, rejection/refund, and cancellation/release. Coordinate with the billing workstream instead of creating a second paid test here.

## Evidence and completion record

Keep the handset number, private message content, token-bearing links, screenshots, and detailed identifiers in a local operator record outside this public repository, for example `C:\dev\sms-live-test-evidence-20260908.md` (created during the coordinated session). The public checklist receives a redacted dated result and evidence reference.

For each D-step and operator check record: test ID; UTC timestamp; deployment; workspace/crew/job and sender/campaign references; expected result; producer/event/task/attempt/provider/receipt references; observed delivery or blocking reason; handset/link confirmation where required; usage outcome; evidence type; pass/fail/blocked; defect/retest owner; and cleanup/final consent state. Use “not run” until execution, never an empty cell interpreted as a pass.

Current status: **single-workspace dispatch handset and recorded subcontractor accept/decline/cancel tests complete; broader operational acceptance and expansion pending; customer session gated on registration.** Employee welcome/assignment/schedule messages contain no links. Subcontractor mobile privacy and cancelled-link behavior passed. The calendar's explicit **Notify** action sends the crew schedule message; **Move this job** alone changed the schedule without queuing a crew text. Cross-workspace evidence is a suppression-helper check and staff read denial; second-sender campaign evidence is local testing. Neither closes an eligible second live-workspace/carrier test. Private evidence is recorded at `C:\dev\sms-live-test-evidence-20260908.md`.
