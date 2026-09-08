# Voice and dispatch production TODO — September 8, 2026

This checklist consolidates the September 8 reassessment. It is an execution plan, not a production sign-off. Refresh deployment and task status before starting each change: other SignalWire work is active.

An unchecked item is still open even when its implementation exists. Close it with dated evidence and the deployment tested. Label evidence as local, hosted fixture, or live provider/handset; one does not automatically substitute for another.

## Current baseline

- [x] Voice metering is operating: sampled recent calls settled for 1, 8, and 10 minutes, with committed reservations. The earlier claim that nothing is metered is obsolete.
- [x] The 10-minute cap and dispatch hardening are in the inspected production release. This proves deployment, not the strict live cutoff or acceptable audible latency.
- [x] Later voice work added provider retry handling, protection against forwarding callers to themselves, and fallback callback/identity fixes. Our core dispatch changes remain present.
- [x] The erroneous job total was corrected to $2,300 in the earlier work. Phone financial edits remain guarded pending a safe redesign.
- [x] The coordinated single-workspace SMS handset session passed normal crew welcome, assignment/schedule messaging, ordinary reply routing, HELP, STOP, queued/fresh suppression probes, START, and resumed delivery.
- [x] The later subcontractor offer link opened without sign-in, hid customer identity before acceptance, and accepted the offer. A staff session from another workspace received a 404 on its management page.
- [x] Observed SMS delivery callbacks are working: the sampled receipts were form-encoded. The initial JSON `status` compatibility gap is fixed in PR #35; working form callbacks remain supported.

Snapshot references: production commit `20057a4737f520bbe1e6a5415e22cab5beee6e2a`, deployment `dpl_BMTKYWW42vCsqiQ3Yk88YwTbDqQh`; fetched main `105715f80`; original dispatch hardening `f2562fb53`. Production and main differed at inspection. These are evidence references, not instructions to deploy an old revision.

## Execution update — September 8, 2026, 21:00 UTC

This update supersedes the initial snapshot above. Unchecked gates remain open.

- **Live application:** PR #35 merged as `e8fb99a0eddeac258313c83b14ed8da98f81cb96`;
  deployment `dpl_4irRt1RRVBUTGKHNHWTdbRcxJ7VT` was explicitly promoted.
  Both public app and apex hostnames were verified against that deployment.
  Notification queries, bounded recovery, the 598-second timer, and JSON status
  callback compatibility are live. Required CI and protected health check passed.
- **Receipt recovery complete:** the existing recovery cron processed the failed
  receipt on attempt 2 at 20:40 UTC. Its original one-minute debit remained
  committed once. One owner alert and one automatically generated caller follow-up
  were delivered once each. The matching failure was resolved after verification.
- **Customer sender defect contained:** the caller follow-up exposed a gap in the
  old dedicated-sender gate. BrokePipes post-call customer SMS is disabled; owner
  alerts and voice remain active. The registered-customer-sender guard migration
  is installed and rejects its ineligible sender. 23/23 PostgreSQL checks pass.
  Correct customer registration and a new eligible customer canary remain open.
- **Call history repaired:** provider logs/events proved the stale fallback call
  had ended and transferred. Supported forwarding reconciliation corrected the
  history without inventing AI duration or charging its released reservation.
  The failed-receipt call also retains its confirmed transfer through recovery.
- **Current handset session:** the first note attempt failed with SQL 42703 and
  committed nothing. A later lead migration had replaced the hardened private
  dispatch implementation with legacy writes to nonexistent columns/tables.
  The contract repair is now installed. Its 31/31 PostgreSQL upgrade-sequence
  checks and 52 focused application tests pass. The user retried by phone and
  confirmed success; production shows exactly one action and one job-feed entry
  for the intended job. The quote remains $2,300. This call's revised cutoff is
  still being measured; audible latency acceptance remains open.
- **Measurement/transfer:** both additive migrations are installed. PR #36 is
  awaiting final CI/merge/application promotion. 15 measurement, 9 transfer,
  23 dispatch-lookup/snapshot, and recording/observation PostgreSQL checks pass.
  New policy snapshot and absorbed-usage live evidence needs the app release.
- **Owner policy:** meter and allowance worker ON, financial exhaustion gate OFF;
  absorb usage beyond credit. Invoice-period reconciliation and any later strict
  enforcement are deferred milestones under that decision. Do not enable the
  financial gate from the original checklist wording.
- **Latest operational baseline:** zero pending receipts, zero active voice
  reservations, and zero overdue active calls before this handset session.
  The last two days show 192 successful allowance runs, two successful retention
  runs, and two successful recovery runs with no failures in those workers.
  The prior 600.938-second call remains historical overrun evidence.
- **SMS workstream:** decline passed; cancellation awaits the user's confirmation
  in its existing browser flow. Do not duplicate that action or clean up fixtures
  before it finishes. Six business messages reconcile to 17 carrier segments;
  hosted duplicate/late callback checks pass. The dedicated registration question
  and customer approval remain unresolved.

Private evidence: `C:/dev/voice-live-test-evidence-20260908.md`,
`C:/dev/voice-closeout-provider-evidence-20260908.jsonl`,
`C:/dev/six-sku-execution-register-2026-09-08.md`, and
`C:/dev/voice-dispatch-contract-check-20260908.log`.
Release documents: PRs #35, #36, #37 (sender guard), and #38 (dispatch contract).
The latter three are not yet final production application evidence.

## Acceptance evidence — September 8, 2026, 21:15 UTC

- **Staff handset:** one authorized owner call looked up J-DEMO-1071 and saved
  the harmless note after repair. One applied action, one feed entry, correct
  account/job, and unchanged $2,300 quote were verified. User reports clear
  closing message and no long silence. Provider connected duration 593.807s;
  total setup-inclusive duration 599.130s; system-side hangup. Receipt processed
  once; 588 AI seconds rounded to 10 committed minutes. These are distinct bases.
- **Backend timing:** successful note request 759ms total; lookup 93ms, write
  234ms. The failed first request was 2080ms and PostgreSQL 42703. This is backend
  timing, not a measured speech-to-audio p95. No statistical audio claim is made.
- **Release:** #36, #37, and #38 passed full CI and merged. Measurement deployment
  dpl_7MfxqfkjUrzocAur2SAuTF8Zh1HU / 42399d1ff was promoted; both app and
  apex hostname checks matched it at 21:08 UTC. The later dispatch-readback
  application build and final health integration are pending. A parallel SMS
  inline-cancellation fix is present in current main and must be retained.
- **Configuration:** individual production variable reads confirmed meter=1,
  allowance worker=1, financial gate=0. Broad decrypted environment reads were
  rejected by automatic review; metadata plus three individual reads succeeded.
- **Database contract:** the production private dispatch body exactly matches
  the reviewed repair (normalized body MD5 435fe546ec50208f1016546e6ee41c80).
  The 31-case migration-sequence check covers staff lifecycle, assignment,
  cross-workspace denial, atomic feed rollback, note replay, current labor/draft
  schemas, private grants, optional-phone leads, and disabled quote writes.
- **Recovery/security:** receipt retry/lease and duplicate checks, signature and
  tenant-boundary tests passed in required CI. Existing signed voicemail/playback
  and PostgreSQL recording/deletion-outbox evidence is reused for unchanged paths.
- **Health:** new observer migration is installed and executed as service_role.
  Ten PostgreSQL scenarios and 40 focused application/recovery checks pass.
  The known historical duration alert was classified with both call references;
  the next production scan returned zero active failures. Scheduler integration
  still requires the final application release and an observed scheduled run.
- **Scope of checked boxes:** database/unit/provider evidence is not a substitute
  for the unchecked handset scenarios. Date ambiguity, interruption, late
  transfer/audio, and quantitative latency remain acceptance work. Customer
  registration and invoice-period milestones are still external dependencies.

Private provider retest evidence:
C:/dev/voice-cutoff-retest-provider-evidence-20260908.jsonl.

## Execution update — September 8, 2026, 21:27 UTC

- Production advanced to `030c4074f237625415c644e33fcbb4e70a2fc7dd` /
  `dpl_2uWiNGnQkJHSmjW2F3z75Ck3vfFE`, including the dispatch readback repair.
  The final health release passed all CI steps and merged as
  `2ec69b679aeb0a1f58f34498aa52dfa0dbc40357`; its production build is pending.
  Concurrent product-tour changes in main were retained.
- Two new production admissions captured `measure` mode and ten allowed minutes.
  The 12-second no-input call and 10-second AI transfer each measured one minute,
  committed one minute from their ten-minute hold, and absorbed zero. Historical
  admissions remain unchanged.
- The owner has one mobile. An authorized owned-number caller reproduced the
  earlier transfer test and used native echo. The owner confirmed hearing both
  the test speech and their echoed words. Transfer callbacks saved the answered
  outcome and 119 forwarding seconds; the receipt processed once without error.
- After the mobile hung up, the provider incorrectly entered voicemail for the
  remaining caller. The follow-up fix restricts voicemail to failed transfers;
  79 focused tests pass. Live termination retest remains open. See
  [transfer evidence](voice-transfer-end-2026-09-08.md).
- Automated duration-policy, rounding, and hold-release coverage below is local
  application/PostgreSQL evidence. It does not substitute for outstanding live
  boundary and speech-to-audio tests. Invoice reconciliation and strict financial
  enforcement remain deferred under the owner's measurement-mode decision.

## P0 — Fix failed post-call processing

**Finding:** `src/lib/voice/triage.ts` selects `accounts.company_name` and `accounts.phone`, which do not exist in the inspected production schema. Ordinary and emergency notification paths contain this query. The latest sampled call committed its minute usage, but its receipt failed with `Voice notification settings read failed`. This query predates the other SMS changes.

- [x] Rebase the proposed fix on current main in an isolated checkout and verify the deployed account/settings schema again.
- [x] Replace invalid column selections with the actual supported business-name and destination fields. Preserve the intended destination precedence and notification preferences.
- [x] Cover ordinary and emergency notifications, disabled notifications, missing settings/account, and no valid destination. Do not silently turn database failures into successful delivery outcomes.
- [x] Improve the error context enough to identify the failed read and database error code without logging phone numbers, message content, or credentials.
- [x] Add focused regression coverage using the real column contract; include a failure after minute settlement.
- [x] Verify notification queuing, lead/transcript processing where applicable, and receipt completion remain idempotent when the same receipt is retried.
- [x] Inspect the failed receipt's current retry state and whether an existing worker or provider retry will recover it. Address a missing recovery path if the receipt can otherwise remain stranded.
- [x] After the fix is deployed, recover the affected receipt through the supported replay path. Establish whether any notification was already queued before retrying. Treat any resulting message send as a separate execution step requiring existing recipient/send authorization.
- [x] Confirm the receipt reaches `processed`, its usage remains committed exactly once, and the matching failure record is resolved with evidence.

**Done when:** both notification paths use valid schema, focused checks pass, and the affected production receipt finishes without a duplicate minute debit, notification, or business record.

## P0 — Prove and enforce the strict 10-minute call maximum

**Finding:** a recent call recorded 596 AI seconds and approximately 605 seconds between application start/end timestamps. Those timestamps do not establish exactly how long the caller remained connected. The user requirement is 10 minutes maximum, not a 10-minute AI session followed by an unbounded transfer or recording.

- [x] Correlate that call with provider records: connection/answer time, AI start/end, transfer or recording segments, and actual hangup time.
- [x] Confirm the deployed duration controls and units against the current provider behavior. Cover reception, staff dispatch, forwarding, voicemail, and fallback branches; identify any branch outside the current cap.
- [ ] Ensure retries and new SWML/AI phases cannot reset the total allowed call time. Use the original connected-call deadline across phases where supported.
- [x] If a provider timer permits an overrun, reduce the configured budget or add an effective termination mechanism, then repeat the boundary test.
- [ ] Test a normal conversation at the boundary, caller silence at the boundary, and a tool operation in progress at the boundary.
- [ ] Test a late transfer, unanswered transfer, and fallback/voicemail against the same maximum. Ensure connected child legs cannot outlive the intended call deadline.
- [x] Verify a clear closing response where feasible and actual disconnection by 600 connected seconds. A prompt telling the agent to hang up is not sufficient evidence.
- [x] Confirm final status, reservation settlement/release, and the dashboard outcome after forced termination.
- [x] Check that measurement-mode low-balance admissions retain the normal call limit, while an explicitly enabled enforcement mode uses its reserved limit. No path may request more than 10 minutes. Local admission/ledger tests cover balances 0/1/2/9/10/15, mode-changing retries, and invalid persisted caps; the provider renderer clamps all plans to ten minutes. Live low-balance boundary testing remains covered by the separate live-path gates.

**Done when:** provider connection/hangup evidence shows every supported call path ends within 600 connected seconds, and boundary termination does not lose or duplicate saved work or usage.

## P0 — Finish measurement-mode acceptance; track later reconciliation

Metering has live evidence. The approved launch uses measurement mode with absorbed usage. Full-period reconciliation remains required before any later decision to enable strict financial enforcement.

- [x] Record the deployed allowance-worker, meter, and financial-gate configuration without exposing secrets. Verify actual worker execution and grants, not only configured flags.
- [ ] Trace representative calls through admission → reservation → measured duration → final committed units → remaining allowance. Preserve historical intentionally unmetered calls as historical evidence.
- [x] Test minute rounding around boundaries, very short AI calls, calls with no AI conversation, transfers, and voicemail. Local tests cover 0/1/59/60/61/119 AI seconds and missing evidence. Live AI transfer billed one minute for ten AI seconds while tracking 119 forwarding seconds separately; the earlier voicemail-only call remains unmetered. Provider connected time includes greeting and forwarding and is not the AI billing basis.
- [x] Test remaining balances of 0, less than 10, exactly 10, and more than 10 minutes. Verify reservation size, effective duration, and the intended exhausted-balance behavior.
- [ ] Test overlapping calls near exhaustion and simultaneous retries. Reservations must prevent overspending without treating a retry of the same provider call as a new caller.
- [x] Test duplicate, delayed, and out-of-order terminal callbacks; worker interruption; and receipt replay after usage was already committed. Each call must finalize usage once.
- [x] Verify failed admission, fallback-only calls, and calls that never connect release any applicable holds through the intended policy. Application tests cover failed attribution/release, terminal tombstones, and non-admitted calls never reaching the ledger. The reconciled fallback-only provider call retains its released hold without fabricated AI time. Unchanged inbox PostgreSQL tests cover abandoned pre-answer claims and delayed receipts.
- [x] Verify monthly grants, period boundaries, and rerun/idempotency behavior using controlled fixtures before relying on a live renewal.
- [ ] Reconcile one full billing period against the SignalWire invoice. Explain differences due to rounding and provider-billed segments; investigate every unexplained difference.
- [ ] Record the reconciliation period, totals, exceptions, evidence, and reviewer in the runbook.
- [ ] **Deferred under the owner’s measurement-mode launch decision:** enable the financial gate only after a later enforcement decision and after the worker, meter, reconciliation, and exhaustion checks pass; verify the effective production release and repeat a targeted exhausted-balance canary.

**Measurement release done when:** minutes are accounted for exactly once, holds clear, low balances retain the bounded call limit, and absorbed usage is explicit. Full-period reconciliation and strict enforcement remain separate deferred milestones.

## P1 — Measure and reduce audible response gaps

- [ ] Capture an authorized live audio baseline on the current deployment. Measure from the end of the caller's speech to the first audible response, then to the useful answer/save confirmation.
- [ ] Separate speech endpointing, provider/model response time, tool execution, and audio playback delay. Transcript timestamps alone do not measure silence.
- [ ] Exercise simple conversation, one-result lookup, ambiguous lookup, job detail, job update, and a slow/unavailable dependency. Include realistic pauses, background noise, spelling, corrections, and interruptions.
- [ ] Record sample counts and p50/p95 latency by scenario. Set explicit acceptance budgets before tuning. Suggested initial targets for review: p95 first audible acknowledgment within 1.5 seconds and a simple lookup answer within 3 seconds; these are proposed targets, not measured results or approved guarantees.
- [ ] Verify the deployed speech/turn-detection settings reduce delay without cutting off a caller who pauses or spells a name/address.
- [ ] Verify asynchronous fillers are audible during genuinely slow operations, brief, and interrupted appropriately. A filler must not claim a save succeeded before confirmation.
- [x] Confirm bounded lookup and write deadlines return useful responses; an uncertain write must retain the deployed read-only status check and must not be repeated automatically.
- [ ] Test interruption while the agent is speaking and while a tool is running. Prevent overlapping responses and duplicate actions from an interrupted turn.
- [ ] Retest only affected scenarios after tuning and attach an audio/timing comparison to the release evidence.

**Done when:** representative live calls meet the selected latency budgets without increased cutoffs, wrong interpretation, false success statements, or repeated writes.

## P1 — Complete dispatch behavior acceptance

- [ ] Verify registered staff, owner/admin/staff roles, unrecognized callers, revoked staff, and callers associated with more than one workspace. Preserve the agreed phone workflow; this checklist does not introduce an OTP requirement.
- [x] Verify provider-authenticated callback context and server-side workspace/role checks on every tool. Caller speech and supplied identifiers must not grant access to another workspace.
- [x] Test job selection by reference, customer name, address, spelling variants, and accents. Confirm ambiguous matches offer brief choices and never silently choose a job.
- [ ] Verify follow-up phrases such as “that job,” corrections, and “actually the other one” keep or replace context correctly.
- [ ] Test relative dates, business timezone, AM/PM, and daylight-saving boundaries. Confirm ambiguous dates/times before saving.
- [ ] Confirm each success response repeats the values actually saved by the backend. A timeout or ambiguous result must not become a success claim.
- [ ] Test cancellation or correction before and during a save. Confirm the resulting state and explain any already-completed action accurately.
- [x] Verify repeat utterances, callback retries, and interrupted tool turns do not duplicate notes, schedule changes, leads, or other mutations.
- [x] Recheck the corrected $2,300 job total and its history without introducing another financial edit. Verify the phone financial-write guard is still deployed.
- [x] Keep broader phone price editing as a separate design/release item: distinguish replacing a total from adding a line item, read back the intended final total, and require an explicit confirmed operation before enabling it.
- [ ] Run an end-to-end authorized staff call from lookup through one harmless update and verify the dashboard, audit history, spoken readback, and usage agree.

**Done when:** dispatch selects the intended workspace/job, applies each authorized action once, reports saved values truthfully, and handles ambiguity without guessing.

## P1 — Complete fallback, callback, and recovery acceptance

- [x] Verify audio in both directions through a live answered transfer. The September 8 controlled caller plus native echo passed on the owner's single mobile. This is audio-path evidence, not a ten-minute boundary test.
- [ ] Verify an answered transfer ends the remaining caller leg without an unavailable prompt or voicemail. The first live echo test exposed the unconditional fallback defect; the fix and targeted retest are tracked separately.

- [ ] Recheck the actual production number and agent configuration: voice entrypoint, post-call receipt, status/recording callbacks, methods, and stable URLs.
- [ ] Prove a retry of the same call does not hit the concurrency fallback; prove a genuinely separate call follows the configured concurrency policy.
- [ ] Prove a caller cannot be forwarded back to their own number and that invalid/unreachable destinations reach a bounded fallback.
- [ ] Exercise declined/unanswered transfer, provider failure, unavailable application dependency, paused workspace, and applicable quota exhaustion.
- [x] Verify fallback identity survives callback delivery so the recording, workspace, caller, and call history remain linked correctly.
- [x] Validate genuine signed provider callbacks, invalid signatures, missing signatures, raw-body variations, and duplicate callbacks. Keep diagnostic signature recognition separate from authorization.
- [ ] Test recording completion, failed/missing recording, playback access, and cross-workspace access denial. Check configured disclosure and retention behavior where recording is enabled.
- [x] Verify a partial failure after settlement preserves durable evidence and has a bounded retry/recovery route with visible exhaustion.
- [x] Reconcile the older controlled fallback test still shown as `in_progress/unsettled`: its admission is terminal and reservation already released. Correct the stale display/state through supported reconciliation without inventing AI duration or charging it.
- [ ] Recheck the live failure queue after acceptance; classify controlled signature probes separately from genuine provider failures.

**Done when:** supported failures reach a bounded, correctly attributed outcome, callback validation remains strict, and no test leaves unexplained active calls, held reservations, or stranded receipts.

## P1 — Finish SMS dispatch in its existing workstream

Use the September 8 extended-session update in `docs/sms-ready-roadmap-2026-09-08.md` as the latest SMS evidence. It supersedes older unchecked statements in that document. Coordinate completion with the existing SMS task instead of starting a duplicate handset session.

- [x] Recheck whether delivery-evidence permission fix `bd151870c` on `fix/sms-dispatch-help-20260908` has since reached production; review/apply its required changes if still pending.
- [x] Verify the fix records delivery evidence with appropriate service-role access and tenant boundaries. Repair the already-delivered offer's evidence through the supported path; do not resend it to reconstruct a missing link.
- [ ] Complete separate subcontractor decline and cancel branches, including repeated actions, saved state, recipient selection, and expected notification behavior.
- [ ] Clean up the extended-session test crew/job and unsent decline draft after their remaining checks. Preserve delivery and consent evidence. The earlier session's fixtures were already cleaned up.
- [ ] Complete eligible second-workspace and same-campaign sender STOP-suppression checks. A rejection for missing consent, registration, or allow-list eligibility does not prove STOP enforcement.
- [ ] Complete quiet-hours, retryable rejection, unknown provider outcome, terminal failure, duplicate/out-of-order callback, and worker-recovery checks without duplicate business sends.
- [x] Reconcile SMS segments and reservations/commits/releases. Verify STOP-blocked sends have no provider submission or committed business-message debit.
- [x] Add compatibility coverage for signed JSON status payloads using the `status` alias if that payload variant is part of the supported provider contract. Preserve working form payloads and signature verification.
- [ ] Check the messaging handler screenshot settings against current configuration: primary inbound `/api/sms/inbound` POST; status `/api/sms/status` POST where applicable. Verify existing per-message status callbacks before adding another callback source and test deduplication if both are used.
- [ ] Leave the optional messaging fallback blank until a real fallback handler is designed and tested. Do not enter a voice route or invent a URL. If fallback handling is required, define durable capture, loop prevention, and duplicate suppression first.
- [ ] Record dispatch rollout scope, observation window, failure criteria, and the current allow-list before expanding to additional eligible accounts.

**Done when:** the remaining workflow, evidence, suppression, recovery, and usage checks pass. Reuse the completed single-workspace handset and accepted-offer results unless a relevant change invalidates them.

## P1 — Close customer messaging gates separately

- [ ] Resolve the correct registration path: provider-confirmed, accurately described LGQ internal testing, or a genuine downstream business. BrokePipes and Midwest are test companies; LUX HD ART was proposed only for LGQ testing, not as an operating contractor.
- [ ] Confirm the drafted provider question's actual submission and response through the existing SMS task. Do not treat an unsent draft as provider approval.
- [ ] Verify approved use case/campaign, consent/disclosures, and the individual number's assignment and readiness before a customer-message canary. Support/crew-dispatch evidence does not establish customer-message approval.
- [ ] With correct registration and an authorized recipient, test released booking confirmation and missed-call/post-call producers, mobile links, customer replies, intended inbox routing, and HELP/STOP/START.
- [x] Verify post-call notification fixes cannot send customer content through an ineligible lane or inappropriate sender.
- [ ] Reuse the billing task's dedicated-number entitlement, provisioning, renewal, failure/refund, and cancellation evidence for commercial launch. Do not create duplicate purchases or charges in this workstream.

**Done when:** the customer lane has its own approved sender context and live producer/reply/suppression evidence. Dispatch acceptance alone does not close this section.

## P1 — Operational visibility and release control

- [x] Establish a baseline for failed/deferred receipts, oldest pending age, attempt counts, overdue active calls, stale reservations, notification failures, and SMS delivery/reconciliation exceptions.
- [ ] Make actionable failures visible to the operator with a call/receipt reference, failure stage, retry state, and supported recovery action. Avoid PII in logs.
- [ ] Add or verify alerts for stranded receipts, calls exceeding the hard maximum, reservations that outlive completed calls, and unexpected unmetered AI calls while the meter is enabled. Preserve expected fallback-only and historical unmetered cases.
- [ ] Add or verify latency measurements for speech-to-audio and backend tool execution; keep them separate so slow audio is not misdiagnosed as a database problem.
- [x] Verify retention and authorized access for transcripts, recordings, and callback evidence; test deletion behavior using controlled fixtures.
- [x] Before each release, identify the current production SHA, main SHA, migrations, and unrelated pending work. Review only the intended changes and their dependencies.
- [ ] Run focused regression checks plus required repository validation. Do not repeat the full earlier handset matrix for an unrelated change.
- [ ] Commit the coherent fix, push it, verify CI, and confirm the actual production deployment and applicable migrations. “Pushed” and “live” require separate evidence.
- [x] Verify a rollback or lane-specific containment procedure preserves inbound/status callbacks and durable evidence while stopping the affected behavior.
- [ ] Update the existing launch checklist/runbook with dated results. Remove or qualify stale claims such as “nothing is metered” and distinguish partial live evidence from a completed gate.

**Done when:** an operator can detect and recover the relevant failures, identify exactly what is deployed, and trace every closed launch gate to evidence.

## Execution order and final release gates

1. Refresh the baseline and coordinate ownership with the existing SMS and billing tasks.
2. Fix notification queries, validate the retry path, deploy, and recover affected receipts without duplicate side effects.
3. Resolve the measured call-duration discrepancy and prove the strict 600-second connected-call maximum.
4. Run the focused voice behavior, latency, fallback, recording, callback, and stale-state acceptance session.
5. Deploy and verify measurement-mode accounting while keeping the financial gate off. Complete full-period invoice reconciliation when that period is available; strict enforcement requires a later owner decision and its own acceptance checks.
6. Close remaining SMS dispatch items in its existing task; handle customer registration and paid lifecycle work in their established tasks.
7. Review evidence, update the runbooks, and expand only the lanes whose release gates are complete.

- [ ] **Voice correctness gate:** notification/receipt failure fixed; strict duration limit proven; dispatch authorization, saved-state readback, and mutation idempotency pass.
- [ ] **Voice experience gate:** measured live latency, interruption handling, and fallback acceptance pass against recorded criteria.
- [ ] **Voice measurement release gate:** worker/meter behavior, bounded debits, explicit absorbed usage, and usage finalization pass with exhaustion blocking off. Full-period reconciliation and enforced exhaustion remain a separate deferred milestone.
- [ ] **SMS dispatch gate:** remaining evidence fix, branches, campaign suppression, cleanup, recovery, and usage checks pass for the stated rollout scope.
- [ ] **Customer messaging gate:** correct registration and number readiness plus live customer-flow acceptance pass independently.
- [ ] **Operations gate:** deployment/migration evidence, failure visibility, recovery, retention, and rollback are verified for the final release.

## Evidence record for each completed item

Record: checklist section/item, date/time, owner/task, environment and deployment, test case and expected result, evidence type, observed result, relevant private call/event/reservation references, defect/retest reference, and cleanup outcome. Keep phone numbers, message content, recordings, tokens, and invoice details in the private evidence record rather than this checklist.

Related plans: [voice go-live runbook](ai-voice-go-live-runbook.md), [dispatch latency acceptance](voice-dispatch-latency-2026-09-06.md), [duration fix](voice-duration-fix-2026-09-06.md), and [phone financial-write guard](voice-quote-write-guard-2026-09-06.md). The SMS roadmap was inspected in the separate `sku-readiness-fix-20260908` worktree; its newest edits were local at reassessment, so confirm their current committed location before consolidating documents.
