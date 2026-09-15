# AI voice assistant improvement plan — September 12, 2026

A prioritized backlog for the AI receptionist and Contractor Dispatch assistant.
It is an engineering plan, not a sign-off. Every item is either an **open
acceptance gate** already tracked in a dated record, or a **new improvement**
identified by reading the current implementation on this branch.

Ground rules carried forward from the existing records:

1. An unchecked item is open even when its implementation exists. Close it with
   dated evidence and label that evidence local, hosted fixture, or live
   provider/handset. One does not substitute for another.
2. Owner policy stands: the meter and allowance worker are ON, and the
   **financial exhaustion gate stays OFF**. Nothing here authorizes enabling it.
3. Do not change a phone route, business setting, customer SMS eligibility or
   financial gate as a side effect of an improvement.

Related records: [Dispatch TODO](voice-dispatch-production-todo-2026-09-08.md),
[acceptance](voice-acceptance-2026-09-09.md),
[response delay](voice-response-delay.md),
[homeowner/staff behavior](voice-homeowner-and-staff-readiness.md),
[go-live runbook](ai-voice-go-live-runbook.md).

---

## P0 — Open acceptance gates (blocking release confidence)

These are carried from the September 9 acceptance record. They are listed here
for one prioritized view; that record remains the source of truth.

- [ ] **P0-1 Full Dispatch handset retest on the released revision.** Confirm
  pronunciation and post-speech delay, then verify the note, the receipt and
  settlement. The short 67-second speech diagnostic passed but did not exercise
  the full prompt or tool flow.
- [ ] **P0-2 Release and retest busy-admission handling.** The bounded
  three-retry claim path and the signed recording attribution path both need
  live validation. The `admission_unavailable` voicemail at 21:00 UTC on
  September 9 is the failure this fixes.
- [ ] **P0-3 Automatic termination and unused-hold recovery.** Both recoveries
  so far were manual. Automatic recovery is unproven.
- [ ] **P0-4 Automatic recording-callback recovery.** Native recording callbacks
  returned HTTP 401 on the fallback path; a numeric-query-parameter control also
  returned 401, so the encoded-parameter theory is ruled out. Root-cause the
  signature mismatch rather than widening what the verifier accepts.
- [ ] **P0-5 Voiced unanswered-transfer recovery.** Persisted voicemail,
  authorized playback and attribution, including an active recording at the
  call cap. `no_input` is branch execution, not voicemail capture.
- [ ] **P0-6 Silence and in-flight tool boundaries** plus homeowner, on-call and
  role-specific live behavior on PR #55 or later.
- [ ] **P0-7 Failed-receipt retry and provider deletion** as separate live cases.
- [ ] **P0-8 Real-contractor settings and approved customer SMS registration**
  before customer carrier acceptance. Test-workspace values are insufficient.
- [ ] **P0-9 Provider invoice-period reconciliation.** Exhaustion blocking stays
  OFF; this is measurement, not enforcement.

---

## P0 — Latency: make it measurable before tuning it

Audible delay is the top reported quality failure and the least instrumented
part of the system. The September 9 samples were 2,343 / 2,719 / 2,735 / 2,953 /
3,011 / 5,650 / 6,367 ms speech-to-first-audio, while backend tool requests took
708–926 ms. **The backend is not the bottleneck**, so guessing at application
code will not fix it. Everything in this section exists to replace guessing with
a percentile.

- [ ] **L-1 Persist provider timing instead of logging it.** `voice-provider-timing.ts`
  produces a clean numeric projection, but `src/app/api/voice/receipt/route.ts:173`
  writes it to `console.info('voice_provider_timing', …)` and nothing else. It
  cannot be aggregated, charted, alerted on, or compared across releases. Add a
  `voice_call_timings` table (account, call, release/route revision, one row per
  reported turn) written on first ingestion only, outside the immutable receipt
  payload so an old callback retried after deployment keeps its payload hash.
  **This is the single highest-leverage change in this document** — every other
  latency item depends on it.
- [ ] **L-2 Publish p50/p90/p95 speech-to-first-audio** per account and per route
  revision, over a rolling window. A median of a seven-sample call is not a
  production percentile and must not be described as one.
- [ ] **L-3 Set an explicit latency SLO and alert on breach.** Proposal: p50 ≤
  1,500 ms and p95 ≤ 3,000 ms speech-to-first-audio. Wire the breach into the
  existing operator-health surface rather than a new alert channel.
- [ ] **L-4 Add a latency panel to `/dashboard/voice-calls` and the call detail.**
  Per-turn timings on the detail page turn "it felt slow" into a specific turn.
- [ ] **L-5 Extend the fast-utility profile to homeowner calls.**
  `signalwire.ts:855-865` applies `utility_model: 'gpt-4.1-nano'`,
  `auto_correct`, `enable_text_normalization: 'off'`, `transparent_barge`,
  `barge_functions: false` and `interrupt_prompt` **only when `contractorMode`
  is true**. Homeowner calls run without the inline-redaction fast path and
  without any interruption handling. Decide deliberately per profile; today the
  asymmetry looks accidental. Measure before and after with L-1.
- [ ] **L-6 Cover non-tool turns with speech.** `fillers` are attached only to
  SWAIG functions (`signalwire.ts:833-838`), so a turn with no tool call — a
  quote readback, a clarifying answer — produces pure silence while the model
  generates. The September 9 report specifically noted gaps on readback turns
  without a tool call. Evaluate a short acknowledgement or a provider-supported
  thinking sound for model-only turns.
- [ ] **L-7 Treat endpointing as a measured experiment, not a constant.**
  `end_of_speech_timeout` is hard-coded 700 ms (staff) / 1,000 ms (homeowner)
  and `turn_detection_timeout` 250 ms. Make them per-profile configuration, then
  A/B them against L-2 percentiles. Lowering endpointing trades interruptions
  for speed; that trade needs data, not preference.
- [ ] **L-8 Measure the prompt's own cost.** The staff system prompt is roughly
  forty dense instruction lines built in `grounding.ts:206-260`, and every rule
  in it was added after a live failure. Measure its contribution to time-to-first
  token before trimming, then restructure the highest-cost sections without
  dropping a behavior that has a documented incident behind it.
- [ ] **L-9 Reduce admission critical-path work.** `planInboundCall` already
  parallelizes two fact groups (`admission.ts:122`, `admission.ts:324`). Record
  numeric startup timing per stage so the answer-path budget is visible, and
  confirm it stays well under the provider's document-fetch patience — the
  September 9 fallback showed four application HTTP 200s recorded by the
  provider as response code zero.

---

## P1 — Recognition and speech accuracy

- [ ] **A-1 Add ASR hints. There are currently none.** No `speech_hints` or
  equivalent appears anywhere in `src/lib/voice/` or `src/app/api/voice/`.
  Every job reference, street, service and surname is recognized cold. Build
  per-account hints at admission from data already loaded for grounding:
  active service names, service-area cities, registered staff names, recent
  client surnames, the job-reference alphabet, and trade vocabulary. This is
  likely the largest accuracy win available and it needs no provider change.
  It should directly reduce the "ask the caller to repeat or spell it" path.
- [ ] **A-2 Pin the AI conversational voice explicitly.** `say_voice:
  'rime.eyre:coda'` is set only on the opening `play` block
  (`signalwire.ts:285`); the AI turn that follows uses the provider default, so
  the caller can hear the voice change after the greeting. Pin the same
  engine-qualified voice for the AI turn and add a test asserting both are equal.
  Candidate contributor to the reported "dollars" glitch.
- [ ] **A-3 Resolve the Spanish promise.** Both prompts instruct the agent to
  converse in Spanish (`grounding.ts`, and the fallback prompt in
  `signalwire.ts:879`), but no language is configured on the AI block. Either
  configure real multilingual support — recognition, voice and prompt — or
  remove the promise from the prompt. Shipping an unbacked instruction is worse
  than not offering it.
- [ ] **A-4 Extend spoken normalization beyond money.** `spoken-money.ts` solved
  currency by writing the amount in words and refusing unsupported precision.
  The same class of bug applies to dates, phone numbers, street addresses,
  job references and time windows. Add spoken-form helpers and a table-driven
  test suite for each, following the existing rejection-over-rounding rule.
- [ ] **A-5 Add a DTMF escape hatch.** There is no keypad fallback anywhere in
  the answer plan. When recognition fails twice, or a caller has a heavy accent,
  a strong background, or a speech difference, offer "press zero" to reach the
  configured transfer number. This is also the accessibility answer for callers
  who cannot use speech reliably.
- [ ] **A-6 Verify redaction in audio, not just transcript.** The acceptance
  record notes that masked transcript text is not proof an amount was masked in
  the audio. Add a check that closes that gap.

---

## P1 — Conversation quality regression harness

This is the largest structural gap. Roughly thirty behavioral rules in
`buildVoiceSystemPrompt` — note versus scope, draft versus submitted versus
confirmed save, quote read-only, job-reference preservation, interruption
handling — were each added after a live failure, and **none of them has an
automated guard**. The next prompt edit can silently reintroduce any of them.

- [ ] **Q-1 Replace the simulator with a real evaluation.**
  `src/app/api/voice/simulate/route.ts` is keyword matching (`lower.includes(…)`)
  over canned scenarios. It never runs the model, so it cannot detect a prompt
  regression. Keep it as an operator sandbox, and build a separate offline
  evaluation that actually runs the assembled prompt.
- [ ] **Q-2 Build a golden-transcript suite.** Fixture conversations, each with
  scored assertions, one per documented rule. Minimum first set, all drawn from
  real incidents in the dated records:
  - a note request writes `append_job_caution_or_note`, never `update_job_details.scope`
  - a draft readback does not write
  - an unconfirmed save is reported as unconfirmed and is never retried
  - a price change is refused and routed to the dashboard quote editor
  - a recorded quote is read from `lookup_jobs` with `include_details`
  - the selected job reference survives follow-up turns
  - "stop" / "hold on" halts without restarting or summarizing
  - a job lookup with no match never becomes a lead
  - no verification code is ever requested
- [ ] **Q-3 Gate prompt changes on the suite in CI.** `.github/workflows/ci.yml`
  runs the unit tests; add the evaluation as a required job for any diff
  touching `grounding.ts` or the SWML prompt blocks, with a score threshold
  rather than an exact-match assertion.
- [ ] **Q-4 Score real calls against the same rubric.** Sample completed calls
  weekly, score the stored transcript offline, and track the trend next to the
  latency percentiles. Live drift and prompt drift are different problems.
- [ ] **Q-5 Use the route revision for staged prompt rollout.**
  `ai_voice_route_revision` already exists on the number inventory and is read
  by `number-readiness.ts` and `operator-health.ts`. Extend it so a prompt
  change can be released to a canary workspace, measured with L-2 and Q-4, and
  rolled back without a deployment.
- [ ] **Q-6 Test interruption on the homeowner profile.** Per L-5 it currently
  has no `interrupt_prompt` and no barge configuration at all.

---

## P2 — Capability gaps worth building

- [ ] **C-1 Missed-call auto-callback.** There is no outbound calling anywhere in
  the voice module. For a contractor, the highest-value single feature here is
  calling back a caller who abandoned or hit voicemail, within a minute, while
  intent is still live. `outcome` already records `abandoned` and `voicemail`,
  so the trigger data exists. Scope it carefully: outbound is a different
  consent, registration and abuse posture than inbound, and it must not reuse
  the inbound admission path unexamined.
- [ ] **C-2 Transcribe voicemail.** Recordings persist with status, duration,
  size and storage path, but nothing transcribes them, so the owner has to
  listen to every one. Transcribe, summarize into the existing call summary
  field, and push the summary through the notification path that already exists.
- [ ] **C-3 Extend the analytics funnel.** `VoiceInsightsCard` already reports
  calls, answered, missed, leads created, conversion rate, minutes and estimated
  revenue. Extend to booked and won so the assistant's value is measured in jobs
  rather than leads, and add cost per call and cost per booked job.
- [ ] **C-4 Per-account persona beyond tone and greeting.** `voice_settings`
  offers three tones and a greeting string. Add controlled fields — banned
  phrases, escalation preferences, named FAQ overrides, preferred call length —
  as structured settings. Do not expose raw prompt editing: every rule in the
  current prompt exists because a free-form instruction went wrong.
- [ ] **C-5 Richer escalation than keyword triage.** `triage.ts` detects
  emergencies from keywords. Add frustration and repeat-caller detection so a
  caller going in circles reaches a human before hanging up.
- [ ] **C-6 Vacation and one-off closures.** `business-hours.ts` handles weekday
  windows and US federal holidays well. It has no one-off override, so a
  contractor closing for a week has to edit weekday hours and remember to undo
  it. Add dated overrides with an explicit end.
- [ ] **C-7 Post-call summary quality.** The structured post-prompt JSON is
  well specified. Add a confidence floor below which the call is flagged for
  operator review instead of being trusted into lead fields.

---

## P2 — Operability and cost

- [ ] **O-1 Pin the main conversation model.** Only `utility_model:
  'gpt-4.1-nano'` is pinned; the primary model is the provider default and can
  change under the product without a deployment. Pin it, record it on the call
  row, and include it in the timing rows from L-1 so a latency or quality shift
  can be attributed to a model change.
- [ ] **O-2 Track absorbed minutes as a first-class cost line.** With the
  exhaustion gate OFF by policy, absorbed usage is a real and growing cost.
  Report it per account and in aggregate so the policy is a decision that is
  reviewed with numbers, not a default nobody revisits.
- [ ] **O-3 Alert on the admission failure reasons.** `no_allowance`,
  `number_not_ready` and `admission_unavailable` are the three ways a caller
  gets nothing. Count them per account per day and alert on any nonzero
  `admission_unavailable`, which is the class that produced the September 9
  voicemail.
- [ ] **O-4 Close the loop on interruption fade.** The prepared provider support
  question about a supported fade control is still unsent and no fade is
  implemented. Send it or drop the item; leaving it open costs attention.
- [ ] **O-5 Document the SWML surface.** The answer plan in `signalwire.ts` is
  just over a thousand lines and is the highest-risk file in the module. A short
  map of which block controls what, next to the existing decision record, would
  make the next change safer.

---

## Suggested sequence

1. **This week.** L-1 and L-2. Nothing else in the latency section can be
   evaluated honestly without stored percentiles, and P0-1 will otherwise
   produce another subjective pass/fail.
2. **Alongside the P0 retests.** A-1 and A-2. Both are small, both plausibly
   affect the exact symptoms under retest, and both are measurable once L-1 is in.
3. **Before the next prompt change.** Q-1 through Q-3. Every prompt edit until
   then is unguarded against thirty rules that each cost a live incident.
4. **Then.** L-5 through L-8 as measured experiments, followed by the P2 items
   in whatever order the contractor feedback supports.

## Verification standard for anything in this document

1. Local tests and a hosted fixture do not close a live gate.
2. A single handset sample is a sample, not a percentile.
3. A transcript is not audio; a masked transcript does not prove masked audio.
4. State what a piece of evidence does not cover, not only what it shows.
