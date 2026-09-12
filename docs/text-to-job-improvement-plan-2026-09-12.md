# Text-to-Job Improvement Plan — 2026-09-12

Audit of the live Text-to-Job rail (owner/crew SMS + voice memo → job records) with a
prioritized backlog. Every item below cites the file and line that motivates it.

## How the rail works today

```
Carrier (SignalWire/Twilio)
  → POST /api/sms/inbound                       src/app/api/sms/inbound/route.ts
  → ingestSmsWebhook (receipt + sms_messages + durable task)
                                                src/lib/sms-webhook-ingress.ts
  → lgq_shared: returns empty TwiML, defers to cron  route.ts:451
    contractor_dedicated: processes inline          route.ts:456
  → claim_sms_inbound_action_batch (cron, * * * * *)  vercel.json:140
  → processOwnerFieldClaim                      src/lib/sms-owner-field-worker.ts:410
      · auth/consent/opt-out gates              :414-637
      · reserve 1 AI Intake credit              :766
      · load 25 jobs + 25 clients as context    :650-663
      · Gemini gemini-3.7-flash, forced single function call  :799-813
      · compose GSM-7 confirmation              :871-906
  → apply_authorized_sms_field_action (validates)  migrations/20260904123500
  → apply_owner_field_action (mutates + enqueues confirmation SMS)
                                                migrations/20260830120000:492
```

**Implemented intents (6 tools):** `append_internal_note`, `log_cost`, `add_job_task`,
`create_lead`, `report_ambiguity`, `no_action`.
`OWNER_FIELD_TOOLS_DECLARATION` — `src/lib/sms-owner-field-worker.ts:233`.

**Declared-but-unimplemented intents:** `reschedule_job`, `update_client`, `assign_crew`,
`add_quote_line_item`, `send_client_quote_link`, `complete_job_task`. The DB completes
these with an honest "can't do that by text yet" reply
(`migrations/20260830120000_crew_field_intake.sql:786-808`), but the worker no longer
offers them as tools at all, so the model can never reach that path.

---

## P0 — Silent failures and correctness

These are the bugs where the contractor texts their business line and gets either
nothing back or a wrong record. Fix before adding any new capability.

### T-01 · `no_action` sends zero reply — the owner gets total silence
`confirmationText` is initialized to `''` (`sms-owner-field-worker.ts:871`) and is only
assigned for the five mutating intents. For `no_action` it stays empty, and
`apply_owner_field_action` only enqueues a confirmation when the text is non-empty
(`migrations/20260830120000_crew_field_intake.sql:811`). On the `lgq_shared` lane the
webhook also returns bare TwiML with no courtesy notice (`route.ts:451`). Net effect:
an owner texts the line, the model classifies it `no_action`, and **nothing comes back** —
indistinguishable from an outage. Asserted as current behavior in
`test/sms-owner-field-intake.test.ts:583`.

- [ ] Add `formatFieldNoAction<Reason>Confirmation()` to `src/lib/sms-field-templates.ts`
      that names what was understood and what to do instead, plus the review link.
- [ ] Send it for every `no_action` outcome, including the no-credits and
      crew-unsupported paths (which already have bespoke copy — unify them).
- [ ] Update `test/sms-owner-field-intake.test.ts:549-583` to assert a non-empty reply.

### T-02 · Hallucinated or stale `job_id` dead-letters silently
`apply_owner_field_action` uses `select j.* into strict v_job`
(`migrations/20260830120000_crew_field_intake.sql:637`). A `job_id` the model invented,
or one archived between context load and apply, raises `NO_DATA_FOUND` (P0002). That is
an exception, so the task retries with exponential backoff up to 8 attempts and lands in
the dead-letter queue — the sender hears nothing the whole time, and the AI credit is
already committed (`sms-owner-field-worker.ts:818`).

- [ ] Validate `job_id` against the loaded `activeJobs` in the worker before calling the
      RPC; on a miss, fall back to `report_ambiguity` (or `no_action` with a clear reason)
      instead of letting Postgres throw.
- [ ] In the RPC, replace `into strict` with a non-strict select plus an explicit
      `v_unsupported`-style honest-reply branch so a bad ID ends the task once, with a
      reply, rather than 8 silent retries.
- [ ] Regression test: model returns a random UUID → one completed task, one reply, no
      dead-letter row.

### T-03 · Receipt photos are filed as "voice notes"
`v_feed_kind` is derived purely from `array_length(media_urls)` — *any* attachment makes
the row `field_voice_note` (`migrations/20260830120000_crew_field_intake.sql:615-623`).
A texted Home Depot receipt therefore shows in the job feed as a voice note, authored
"Owner (Field Voice)", and the dashboard renders it with a **hardcoded fake duration**
`audioDuration: '0:15'` (`src/app/dashboard/text-to-job/page.tsx:127`).

- [ ] Derive the kind from the media MIME types the worker already classified
      (`mediaPart.kind`, `sms-owner-field-worker.ts:746-747`) — pass `p_media_kind` into
      the RPC rather than re-deriving it from a bare URL array.
- [ ] Add a `field_photo_update` feed kind; include it in the Text-to-Job feed filters
      (`page.tsx:63`, `src/lib/field-intake-leads.ts:117`).
- [ ] Delete the fake `audioDuration`; store real duration from the audio part, or omit.

### T-04 · Voice-memo transcripts are probably empty
`transcript` is `response.text || rawBody` (`sms-owner-field-worker.ts:822`), but the
call forces `FunctionCallingConfigMode.ANY` (`:807`), under which Gemini typically
returns no text part. For a voice memo `rawBody` is `''`, so the stored transcript is
empty — the feed falls back to "Field update logged" (`page.tsx:112`) and the review page
shows a blank body (`src/app/field/intake/[id]/page.tsx:216`). The unit tests all stub
`text`, so they never catch this.

- [ ] Add an explicit `transcript` string parameter to every mutating tool declaration,
      required, documented as "verbatim transcription of the sender's words".
- [ ] Persist `actionParams.transcript` as `p_transcript`; keep `rawBody` as the fallback.
- [ ] Test with a mocked response that has `functionCalls` and **no** `text`.

### T-05 · Ambiguity is a dead end that loses the original message
`report_ambiguity` replies "Please reply with address or job ref"
(`src/lib/sms-field-templates.ts:192`) but nothing is persisted: the RPC sets
`v_target_id := null` and completes the task
(`migrations/20260830120000_crew_field_intake.sql:783-784`). The owner's reply arrives as
a brand-new stateless message with no scope, so the note/cost they dictated is gone and
they must retype the whole thing.

- [ ] Add a `sms_field_intake_pending_clarifications` table: task id, account, sender,
      candidate job ids, original intent + params, `expires_at` (~30 min).
- [ ] On `report_ambiguity`, write the pending row instead of discarding the action.
- [ ] In the worker, look up an unexpired pending clarification for
      (account, sender) *before* the model call and pass it as context; on a resolving
      reply, apply the **stored** intent and params against the chosen job.
- [ ] Number the candidates in the reply ("Reply 1 for J-101 / 2 for J-104") so a
      one-character answer resolves it.

---

## P1 — Capability gaps the product already promises

`/features/text-to-job` sells behavior the rail does not have. Each item is either
"build it" or "stop claiming it" — pick one per row, but do not leave them as-is.

| Marketing claim | Source | Reality |
|---|---|---|
| "add a change order or extra line item via text, your quote totals, invoice drafts, and client portal balance update in real time" | `src/app/features/text-to-job/page.tsx:63` | `add_quote_line_item` unimplemented; not even offered as a tool |
| "Remove backsplash from Miller" / "Deduct $200" → negative line item | `page.tsx:75` | Costs are hard-capped `amount > 0` (`sms-owner-field-worker.ts:81`, RPC `20260904123500:308-315`) |
| "3 punch list tasks created and scheduled for Mike tomorrow at 8:00 AM" | `page.tsx:197` | One action per message; no crew assignment; no scheduling |
| "dispatch punch lists… notifies your field crew automatically" | `page.tsx:98,190` | No crew notification on `add_job_task` |
| "Crew members can log milestone notes, punch list items, and upload material receipts" | `page.tsx:83` | Crew commands are **fully disabled** (`sms-owner-field-worker.ts:588-619`, RPC `20260904123500:255-257`) |
| "schedule adjustments hands-free" | `page.tsx:172` | `reschedule_job` unimplemented |

### T-06 · Support multiple actions per message
Only `functionCalls[0]` is ever read (`sms-owner-field-worker.ts:825`); the rest are
dropped with no notice. "Gate code is 4821 and I spent $75 on cement" silently loses half.

- [ ] Iterate all `functionCalls`, applying them in order.
- [ ] Extend `apply_authorized_sms_field_action` to accept an ordered action array and
      apply them in one transaction (all-or-nothing), or add a batch wrapper RPC.
- [ ] Cap at ~5 actions per message; charge one AI Intake credit per message, not per action.
- [ ] Compose one combined confirmation SMS; keep it inside the segment budget
      (`src/lib/sms-segments.ts`).

### T-07 · Implement `reschedule_job`
- [ ] Tool declaration with `jobId`, `date` (ISO), optional `time`, optional arrival window.
- [ ] Resolve relative dates ("tomorrow", "Friday") in the **account time zone** —
      `accountTimeZone` is already threaded into the dashboard (`page.tsx:27`) but the
      worker only knows `new Date().toISOString()` UTC (`sms-owner-field-worker.ts:698`).
- [ ] RPC branch: update `jobs.scheduled_for`/`scheduled_time`, write a `job_feed` row,
      respect existing calendar-conflict rules.
- [ ] Confirmation via the existing `formatFieldScheduleConfirmation`
      (`sms-field-templates.ts:165`) — already written, currently unreachable.
- [ ] Decide and document whether the customer is notified (default: no, owner confirms).

### T-08 · Implement `add_quote_line_item` / change orders (incl. negative)
- [ ] Tool with `jobId`, `description`, `amount` (signed), `quantity`, `reason`.
- [ ] Reuse `src/lib/change-order-ai.ts` rather than a second extraction prompt.
- [ ] Allow negative amounts on the quote path while keeping `costs.amount > 0`; the
      existing guard conflates "cost" and "line item".
- [ ] Never auto-send to the client — stage as a draft change order and put the send
      behind the review link (`formatFieldQuoteWithSendPrompt`, `sms-field-templates.ts:195`,
      already written and unreachable).

### T-09 · Implement `assign_crew` + crew notification
- [ ] Crew roster is deliberately excluded from model context
      (`sms-owner-field-worker.ts:648-649`). Load it for **owner** senders only.
- [ ] Tool with `jobId` + `crewName`; resolve to `crew.id` server-side, `report_ambiguity`
      on duplicate names.
- [ ] Notify the assigned crew member through the existing dispatch path
      (`src/lib/dashboard-sms-dispatch.ts`), gated on their verified phone + consent
      (`src/lib/crew-verification.ts`).

### T-10 · Re-enable crew field intake (notes / tasks / receipts only)
Both the worker (`:588-619`) and the RPC (`20260904123500:255-257`) hard-block crew. The stated blocker is that
crew job context is not assignment-scoped.

- [ ] Load crew context scoped to jobs where that crew member is assigned.
- [ ] Allow `append_internal_note`, `add_job_task`, `log_cost` for crew; keep
      `create_lead`, quote, schedule and client mutations owner-only.
- [ ] Reuse the crew confirmation templates already written
      (`formatCrewNoteConfirmation`, `formatCrewCostConfirmation`,
      `formatCrewTaskConfirmation` — `sms-field-templates.ts:35,84,129`).
- [ ] Enforce per-crew-member daily caps to bound credit burn.

### T-11 · Attach site photos to the job
The MMS image is OCR'd for a cost total and then discarded; `media_urls` stay on
`sms_messages` pointing at carrier-hosted URLs that expire. `src/lib/job-photo-storage.ts`
already exists and is unused by this rail.

- [ ] After a successful action, copy image parts into job photo storage via
      `job-photo-storage.ts` and link them to the job (and to the cost row for receipts).
- [ ] Add an `attach_job_photo` tool for "here's a photo of the panel" with no other intent.
- [ ] Cap per message and per account per day; strip EXIF GPS before storing.

### T-12 · Implement `complete_job_task`
Currently rejected outright — "requires an exact task ID"
(`migrations/20260904123500_unify_dedicated_voice_and_sms.sql:300-302`).

- [ ] Load open `job_tasks` for candidate jobs into context so the model can name a real ID.
- [ ] Fuzzy-match the title server-side; `report_ambiguity` on multiple matches.
- [ ] `formatFieldTaskCompletedConfirmation` (`sms-field-templates.ts:144`) already exists.

---

## P2 — Accuracy of matching and extraction

### T-13 · Fix the confidence scorer — it hardcodes surnames
`CLIENT_OR_JOB_REGEX` in `src/lib/field-intake-quality.ts:31` literally matches
`Miller|Johnson|Smith|Davis|Wilson|Taylor|Clark|Jenkins|Adams|Vance|White|Scott|Parker`
— the demo cast. Every real contractor whose clients are not named Smith gets
"Unlinked client or job identity" and a depressed score; a note mentioning an unrelated
"Miller" gets a false boost. `TRADE_ACTION_REGEX` (`:30`) is a similarly closed
hand-written trade vocabulary.

- [ ] Score identity from the **actual** loaded client/job names and the resolved
      `target_id`, not from a name list.
- [ ] Drive the trade vocabulary from `src/lib/trade-intake-presets.ts` keyed on
      `accounts.trade`, instead of one hardcoded union.
- [ ] Have the worker persist its own structured signals (matched job, fields extracted,
      model confidence) into the outcome, and render those instead of re-deriving a score
      from raw text in the page (`page.tsx:115`, `:154`).
- [ ] Update `test/field-intake-quality.test.ts` to use non-demo names.

### T-14 · Improve the job-matching context window
`sms-owner-field-worker.ts:650-663` loads 25 jobs ordered by `created_at desc` with **no
status filter** — archived and long-closed jobs crowd out today's active work, and an
account with more than 25 jobs can have the right job simply absent from context.

- [ ] Rank context by relevance: scheduled today/this week first, then `in_progress`,
      then recent; exclude `archived`/`completed` unless referenced by name.
- [ ] Raise the cap and trim per-job payload (drop `scope` to a truncated summary) to keep
      tokens flat.
- [ ] Pre-filter by tokens in the message (street number, surname, `J-###`) so a
      500-job account still gets the right candidates.
- [ ] Normalize addresses on both sides with `src/lib/location-context/normalize-address.ts`
      so "124 Main" matches "124 N Main St".
- [ ] The 25 clients loaded at `:655` are only reachable by `create_lead`; either give the
      model a client-directed tool or drop them from the prompt.

### T-15 · Build a golden-set eval for intent routing
There are unit tests for plumbing but no accuracy measurement — no way to tell whether a
prompt change makes routing better or worse.

- [ ] Fixture set of ~100 real-shaped messages per trade (notes, costs, tasks, leads,
      ambiguous, chatter) with expected intent + target.
- [ ] `npm run eval:text-to-job` scoring intent accuracy, target accuracy, and
      false-mutation rate; record a baseline in this doc.
- [ ] Wire into CI as a non-blocking report first, then gate on regression.
- [ ] Include multi-action and negative-amount cases so T-06/T-08 are measurable.

### T-16 · Give the model real per-trade vocabulary
`src/lib/trade-intake-presets.ts` (349 lines of trade-specific intake language) is not
referenced by the worker's system instruction at all (`:707-730`).

- [ ] Inject the account's trade preset into the system instruction.
- [ ] Add trade-specific cost-type hints (e.g. "freon" → material, "dump fee" → other).

---

## P3 — Reliability, latency, cost

### T-17 · No timeout or retry on the model call
The worker instantiates `GoogleGenAI` directly (`:697`) and calls `generateContent`
(`:799`) with **no timeout**, while 14 other libs go through `src/lib/ai-model-call.ts`
which centralizes timeout, key resolution and error typing. A hung provider call burns
the whole 5-minute lease and produces zero reply.

- [ ] Route the call through `callModel` (or add function-calling support there) so
      timeout/retry/telemetry are shared.
- [ ] Wrap in `AbortSignal.timeout` (~30s) with one retry on 5xx/timeout.
- [ ] Centralize the model id — `gemini-3.7-flash` is hardcoded at `:800` and repeated in
      5 places across the repo.
- [ ] On exhausted retries, send an honest "couldn't process, try again" reply instead of
      silently retrying to dead-letter.

### T-18 · Cut shared-lane latency (currently up to ~60s+)
`lgq_shared` defers to a cron that runs `* * * * *` (`vercel.json:140-141`), so p50 ≈ 30s
and p95 ≈ 60-90s before the model even starts. Marketing promises "instant confirmation
in seconds" (`features/text-to-job/page.tsx:98`).

- [ ] Kick off processing from the webhook with `after()`/`waitUntil` so the carrier gets
      its 200 immediately *and* work starts now; keep cron as the safety net.
- [ ] Instrument received → confirmation-sent latency; publish p50/p95.
- [ ] Either hit "seconds" or reword the claim.

### T-19 · Bound the inline `contractor_dedicated` path
Dedicated numbers process **inline** in the carrier callback (`route.ts:456`) — Gemini
plus up to 10 authenticated media downloads at 10s each
(`sms-owner-field-worker.ts:268-271`). That risks carrier webhook timeout and redelivery.

- [ ] Set an explicit `maxDuration` on the route (only `runtime = 'nodejs'` is declared,
      `route.ts:28`).
- [ ] Move dedicated-lane intake onto the same deferred path as `lgq_shared` once T-18
      lands, so both lanes behave identically.

### T-20 · Operator visibility for the intake rail
Dead-lettered intake tasks are invisible to the owner and thinly visible to admins
(`src/app/admin/failures/page.tsx`).

- [ ] Surface failed/dead-lettered intake tasks in `/dashboard/text-to-job` with a
      "resend this message" action.
- [ ] Admin panel: intake volume, intent mix, `no_action` rate, ambiguity rate,
      dead-letter count, median latency, credits consumed — per account.
- [ ] Alert via `src/lib/founder-alerts.ts` when an account's `no_action` or failure rate
      crosses a threshold (an early signal of prompt or matching regressions).

### T-21 · Credit-burn fairness
One credit is committed as soon as the provider answers, before any mutation
(`sms-owner-field-worker.ts:818`), so `no_action` on pure chatter ("thanks!") costs the
contractor a credit.

- [ ] Cheap pre-filter (length/keyword/greeting) that short-circuits obvious chatter
      before the model call, with a friendly reply.
- [ ] Decide policy for `no_action`: refund, or don't reserve until an action is selected.
      Document it in the pricing copy either way.
- [ ] Per-account hourly ceiling on intake messages to bound a runaway loop.

---

## P4 — UI, copy, and product truth

### T-22 · Remove remaining placeholder data from the dashboard
- [ ] `audioDuration: '0:15'` — fake (`src/app/dashboard/text-to-job/page.tsx:127`); see T-03.
- [ ] `SIGNALWIRE_FROM_NUMBER || '+19479412323'` — a hardcoded production number as a
      silent fallback (`page.tsx:201`). Fail loudly in prod instead of showing a number
      that may not route.
- [ ] `SAMPLE_INBOUND_MESSAGES` (`TextToJobWorkspace.tsx:326`) renders whenever there are
      no real messages (`page.tsx:245`). Make the empty state clearly an example, or
      replace it with a real "send your first text" walkthrough.
- [ ] `senderRole="Owner / Crew Field Intake"` is hardcoded on the review page
      (`src/app/field/intake/[id]/page.tsx:229`) though the actual role is already
      resolved at `:232`.

### T-23 · Make the review page an actual approval surface
It is named `IntakeApprovalWorkspace` but the mutation has already been applied by the
time the link is opened; there are no approve/undo controls (136 lines, display-only).

- [ ] Add "undo this action" for `log_cost`, `add_job_task`, `append_internal_note`.
- [ ] Add "edit and re-apply" for a wrong job match — the highest-value repair, since
      today the only fix is to go find the record manually.
- [ ] Add "this was wrong" feedback capture to feed the T-15 eval set.
- [ ] Render the transcript and the extracted fields side by side (needs T-04).

### T-24 · Reconcile marketing with the shipped rail
The feature page (`src/app/features/text-to-job/page.tsx`) and the FAQ claim quote math,
negative change orders, crew permissions, and scheduling that the rail does not do. The
dashboard hints were already honestly de-scoped in
`src/components/field-intake-hint.tsx` (per `LAUNCH_CHECKLIST.md:753`) — the public page
was not.

- [ ] Rewrite `page.tsx:47,63,71,75,83,98,139,172,190,197,273` to match shipped behavior,
      or ship P1 first and keep the copy.
- [ ] Same pass over `src/app/how-it-works/hero-job-simulator.tsx` and
      `src/components/marketing/TextToJobDataBeams.tsx`.
- [ ] Add a "what works by text today / what's in the dashboard" table to the feature page.

### T-25 · Extend confirmation copy
- [ ] Include the matched job ref **and** client name in every confirmation so a wrong
      match is obvious from the lock screen (partly there — `sms-field-templates.ts:28`).
- [ ] Add `STOP`/`HELP` handling coverage for the field lane specifically.
- [ ] Add a `HELP`-style reply listing supported commands for that sender's role.

---

## Suggested sequencing

| Phase | Items | Why first |
|---|---|---|
| 1 | T-01, T-02, T-03, T-04, T-05 | Silent failures and wrong records. No new surface until a text always gets an honest answer. |
| 2 | T-13, T-14, T-15, T-17 | Make accuracy measurable and matching real before expanding the tool surface. |
| 3 | T-06, T-07, T-12, T-11 | Highest-value capability adds, now measurable against the eval. |
| 4 | T-08, T-09, T-10 | Money- and permission-sensitive; needs the review/undo surface from T-23. |
| 5 | T-18, T-19, T-20, T-21 | Latency and operability once behavior is settled. |
| 6 | T-22, T-23, T-24, T-25 | Truth and polish; T-24 can ship earlier as pure copy. |

## Open questions

1. Should `reschedule_job` ever notify the customer automatically, or always stage for
   owner confirmation?
2. Is one AI Intake credit per *message* or per *action* once T-06 lands?
3. Does crew re-enablement (T-10) need a per-crew opt-in in settings, or is verified
   phone + consent sufficient?
4. Is the `contractor_dedicated` inline path (T-19) load-bearing for any current
   customer's latency expectation, or can it move behind the queue?
