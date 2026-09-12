# AI Intake improvement plan — September 12, 2026

A review of every AI intake surface in the repository, and the work it implies.
Each item names the file and line that motivated it, so an item can be judged
without re-reading the whole pipeline. Nothing here is a sign-off: an unchecked
box is open work, and an item is closed only with the evidence named in its
**Done when** line.

## The surfaces in scope

| Surface | Entry point | Engine |
| --- | --- | --- |
| Web Smart Intake (homeowner, 3 questions) | `src/lib/templates/HeroQuickForm.tsx` | `src/app/api/public/leads/classify-estimate/route.ts` |
| Instant Booking (homeowner, up to 6 questions) | `src/app/book/[subdomain]/InstantBookFlow.tsx` | same route |
| Lead creation and triage | `src/app/api/public/leads/route.ts` | `src/lib/leads.ts`, `src/lib/estimate-guardrails.ts` |
| Text-to-Job field intake (owner/crew SMS + voice memo) | `src/lib/sms-owner-field-worker.ts` | `src/lib/field-intake-quality.ts` |
| Owner tuning | `src/app/dashboard/settings/IntakeContentSection.tsx` | `src/lib/intake-quality.ts`, `src/lib/estimate-posture.ts` |
| Metering | — | `src/lib/billing/ai-intake-usage.ts` |

Two things are true of the whole pipeline and shape most of what follows.
First, **the intake asks good questions and then throws the answers away** — the
only thing that survives to the lead is a one-line summary. Second, **nothing
measures it**: no server-side event, no estimate-versus-actual comparison, no
behavioral test. Both are fixable without touching the model.

---

## P0 — Wrong data reaching contractors

- [ ] **Stop stamping every lead with a Michigan roofing permit verdict.**
  `src/app/api/public/leads/route.ts:283-297` calls `resolveJurisdiction` with
  `state: 'MI'` hardcoded and `evaluatePermitRequirement` with
  `trade: 'roofing', scope: 'replacement'` hardcoded, then writes the result
  into `triage.permit` for **every** lead with a location of three characters
  or more. A Texas electrician's lead gets a Michigan roofing-replacement permit
  requirement and fee, presented in the dashboard as fact. Derive the state from
  the site's service area, the trade from `siteContent.trade`, and the scope
  from the description or the matched trade preset; when any of the three is
  unknown, omit `triage.permit` rather than guessing.
  **Done when:** a lead from a non-MI site, and a lead from a non-roofing trade,
  each carry either a correct authority or no `permit` block, covered by a test
  that asserts the absence rather than a Michigan value.

- [ ] **Close the client/server timeout gap.** The browser aborts at
  `CLASSIFY_TIMEOUT_MS = 8000` (`src/lib/templates/HeroQuickForm.tsx:606`); the
  route's provider call runs to `AbortSignal.timeout(20000)`
  (`src/app/api/public/leads/classify-estimate/route.ts:177`). Every response
  between 8s and 20s is paid for, committed against the contractor's thread
  credit by `substantiveResponse`, and delivered to a closed connection — while
  the homeowner is dropped to the classic form as though the estimator were
  down. Bring the server budget under the client's, or hold the client open
  with visible progress (see the streaming item in P1), but the two numbers must
  be chosen together and asserted in one place.
  **Done when:** a test fixes the provider at 9s and proves the visitor either
  receives the answer or the credit is released, never the current pairing.

- [ ] **Persist the intake conversation on the lead.** The AI asks up to three
  scoping questions and the homeowner answers them; `submitLead`
  (`src/lib/templates/HeroQuickForm.tsx:758`) sends only the original
  description plus a summary line assembled at
  `src/lib/templates/HeroQuickForm.tsx:816` ("AI estimate shown to the customer: …").
  The questions, the answers, and `visualObservation` — the model's read of the
  uploaded photos — exist only inside the encrypted continuation token and are
  gone when the wizard finishes. The contractor then calls and re-asks what the
  homeowner already answered, which is the phone tag this product exists to
  remove. Add a transcript field to the lead (structured turns, not a prose
  blob) and render it on the lead detail screen.
  **Done when:** a completed Smart Intake lead shows each question and answer in
  the dashboard, and the transcript is included in the owner's lead email.

- [ ] **Remove the demo surnames from the field-intake confidence scorer.**
  `src/lib/field-intake-quality.ts:31` scores an inbound field note partly on a
  regex of literal names — `Miller|Johnson|Smith|Davis|Wilson|Taylor|Clark|
  Jenkins|Adams|Vance|White|Scott|Parker`. A real client named anything else
  scores lower for no reason, and the scorer silently favors the seed data.
  Replace with a check against the account's own client and job records.
  **Done when:** confidence for an identical note is unchanged when the client
  name is swapped, and rises when the name matches a real client row.

---

## P1 — Estimate accuracy

- [ ] **Build the feedback loop.** `triage.estimate` is written at intake and
  read in thirteen places, none of which compare it to what the contractor
  actually quoted or invoiced. There is therefore no answer to the only question
  that matters about this feature — *is the number right?* Record the AI range
  alongside the accepted quote total on the same job, and surface the delta per
  account and per trade.
  **Done when:** an internal report shows median signed-quote-to-AI-range error
  by trade, over at least 30 closed jobs.

- [ ] **Use the trade presets' mandatory questions.** Every trade family in
  `src/lib/trade-intake-presets.ts` carries a `mandatoryQuestions` array written
  by someone who knows the trade ("How many stories is the home and what is the
  current roof material?"). The estimator imports the preset for
  `photoGuidance`, `equipmentSpecs` and `siteVisitTriggers`
  (`classify-estimate/route.ts:182-224`) and never reads `mandatoryQuestions` —
  the model freestyles its three questions instead. Seed the question plan from
  the preset and let the model deviate only when the description has already
  answered one.
  **Done when:** a roofing description with no story count produces the story
  question on turn one, in a test that runs against a stubbed provider.

- [ ] **Wire up or delete `recommendIntakeGoals`.** `src/lib/intake-goals-ai.ts`
  is a 168-line engine computing mandatory-field goals, a completion score, a
  recommended outcome and `isReadyForBooking` — and it is imported by nothing
  except `test/ai-goal-recommendations.test.ts`. It is the completeness model
  the live intake lacks. Either route the estimator's turns through it so the
  intake knows when it has enough, or remove it so it stops reading as shipped.
  **Done when:** `grep -rl intake-goals-ai src/` returns either a production
  caller or nothing at all.

- [ ] **Switch to a strict response schema.** The route asks for
  `text: { format: { type: 'json_object' } }` and then hand-parses six optional
  fields with per-field type guards
  (`classify-estimate/route.ts:267-290, 311-377`). When the shape comes back
  wrong it spends a **second** paid provider call as a "forced retry"
  (lines 320-353). A strict JSON schema removes most of that class of failure
  and the retry with it.
  **Done when:** the forced-retry branch is removed and no estimate response is
  parsed with an inline `typeof` guard.

- [ ] **Make the model an explicit, reviewable choice.** `gpt-4o-mini` is
  hardcoded twice in the estimator (`classify-estimate/route.ts:258, 336`) and
  a model id is hardcoded in roughly twenty-five modules across the codebase;
  only `src/lib/insurance-ai.ts:22` reads an environment override. Pricing is
  the task most sensitive to model capability and the one where the cheapest
  model is least obviously right. Introduce a small model registry with a
  per-task default, an environment override, and a documented fallback.
  **Done when:** the intake model can be changed in one place, and an A/B on
  the estimate task is possible without a deploy.

- [ ] **Harden the safety guardrails.** `SAFETY_INSPECTION_TRIGGERS`
  (`src/lib/estimate-guardrails.ts:15-33`) is a flat list of English substrings
  matched with `includes`. "No mold anywhere" triggers the mold hold; "moldings"
  triggers it too; a Spanish description triggers nothing at all. Move to
  word-boundary matching with simple negation handling, and add the Spanish
  terms alongside the English ones.
  **Done when:** a negation case and a substring-collision case are both
  covered by tests and neither withholds a price.

- [ ] **Reconcile the three lifetimes.** A continuation token lives 30 minutes
  (`src/lib/estimate-continuation-token.ts`, default `ttlMs`), a usage
  reservation 15 minutes (`RESERVATION_TTL_MS`,
  `src/lib/billing/ai-intake-usage.ts:18`), and a browser thread 24 hours
  (`AI_INTAKE_THREAD_TTL_MS`). A homeowner who pauses for sixteen minutes holds
  a valid token against a dead reservation and is silently dropped to the
  classic form. Pick one intake lifetime and derive the others from it.
  **Done when:** a paused-then-resumed intake either continues or explains
  itself, and the three constants have one source.

---

## P1 — Measurement

- [ ] **Instrument the AI journey.** `QuoteFunnelStep`
  (`src/lib/analytics.ts:242`) has exactly four values — `form_impression`,
  `form_started`, `first_step_completed`, `contact_submitted`. Nothing fires
  when a question is shown, when it is answered, when the visitor taps skip,
  when a price is shown, when a price is withheld, when the estimator falls back
  to the classic form, or when it times out. The drop-off inside the AI section
  — the part being sold — is invisible. Add those events.
  **Done when:** per-question drop-off for a live site can be read without
  adding code.

- [ ] **Record intake sessions server-side.** `trackQuoteFunnelStep` dispatches
  a DOM event and calls gtag/fbq/ttq (`src/lib/analytics.ts:253-322`); it never
  calls our own API, and there is no intake or estimate table in `schema.sql`.
  Consequences: analytics dies with an ad blocker, contractors get no intake
  report, and the accuracy work above has no data to sit on. Persist one row
  per intake thread with outcome, turn count, latency and withheld reason.
  **Done when:** a contractor can see, for their own site, how many intakes
  started, how many reached a price, and where the rest stopped.

- [ ] **Replace the source-grep tests with behavioral ones.**
  `test/smart-intake-flow.test.ts` and `test/ai-intake-improvements.test.ts`
  read the source files as strings and assert they contain particular text
  (`expect(HERO).toContain('const MAX_INTAKE_QUESTIONS = 3')`). These break on
  any refactor that changes nothing and pass through any behavior change that
  keeps the text. Drive the route with a stubbed provider and assert responses.
  **Done when:** renaming a constant does not fail a test, and changing the
  question cap does.

- [ ] **Add an estimate eval harness.** There is no golden set: no fixed list of
  descriptions with expected ranges, so no prompt or model change can be judged
  except by impression. Build 50-100 cases across the trade families with
  accepted bands, and run them before any prompt edit.
  **Done when:** a prompt change reports pass rate and median band error against
  the golden set in CI.

---

## P1 — Homeowner experience

- [ ] **Stream the turns, or show real progress.** Each turn is a blocking
  `fetch` behind a "Thinking…" state, up to three times, against an 8s abort. A
  streamed first token, or a progress state driven by elapsed time, keeps a
  homeowner on the step they are on. This is the same item as the timeout gap in
  P0 and should be designed with it.
  **Done when:** median time-to-first-visible-token on the question step is
  under 1.5s.

- [ ] **Let an abandoned intake be resumed.** The browser thread lives 24 hours
  (`src/lib/ai-intake-thread.ts:1`) but nothing uses that window: a visitor who
  leaves at question two and returns starts over. If a phone number was already
  captured, an opt-in text with a resume link recovers the lead.
  **Done when:** returning to a site within the thread window resumes at the
  question the visitor left.

- [ ] **Cap the image payload server-side.** The client compresses to 1400px
  WebP and sends up to four base64 data URLs in the JSON body
  (`src/lib/client-media-frames.ts:106-137`); the route accepts anything
  matching `startsWith('data:image/')` with no byte limit
  (`classify-estimate/route.ts:201-204`). Four large frames can approach the
  platform body limit, and nothing stops a crafted post from trying. Enforce a
  per-image and total byte cap, and reject rather than truncate.
  **Done when:** an oversized payload returns a clear 413 and no provider call
  is made.

- [ ] **Accessibility pass on the wizard.** Focus moves between steps
  (`HeroQuickForm.tsx:306-321`) but the question step re-renders new content
  into the same region on each turn; confirm the announcement order with a
  screen reader, and that the "skip to estimate" control is reachable and
  labelled at every turn.
  **Done when:** a keyboard-and-screen-reader run of all three turns is recorded
  with no lost focus or silent update.

- [ ] **Bilingual intake.** Nothing in the intake path selects a language; the
  prompt, the questions, the guardrail triggers and the UI copy are English
  only. For most of these trades in most markets that is a real share of the
  leads.
  **Done when:** a Spanish description produces Spanish questions and a Spanish
  result screen, with the guardrails applying in both languages.

---

## P2 — Architecture

- [ ] **Route the estimator through the shared model boundary.**
  `src/lib/ai-model-call.ts` documents itself as "the one egress point for model
  calls" and exists precisely so nothing calls the provider directly; the
  estimator calls `fetch('https://api.openai.com/v1/responses', …)` itself
  (`classify-estimate/route.ts:175-179, 332`). It has its own reasons — the
  AI-intake meter is not the AI-writing meter — but the exception should be a
  parameter of the shared boundary, not a second copy of it.
  **Done when:** no route outside `ai-model-call.ts` constructs a provider URL.

- [ ] **Version the prompt.** The instruction string is assembled from about
  twenty concatenated fragments across `classify-estimate/route.ts:195-231`,
  with conditional clauses spliced mid-sentence. It cannot be diffed, tested in
  isolation, or attributed to an outcome. Move it to a module with a version
  identifier, and record that identifier on the intake session row.
  **Done when:** an estimate can be traced to the exact prompt version that
  produced it.

- [ ] **Unify the three intake brains.** Web intake
  (`classify-estimate/route.ts`), voice intake (`src/lib/voice/`,
  `src/app/api/voice/swaig`) and SMS field intake
  (`src/lib/sms-owner-field-worker.ts`) each carry their own idea of what to ask
  and when enough has been collected. `recommendIntakeGoals` was evidently
  written to be that shared brain. One engine, three transports.
  **Done when:** the mandatory-question set for a trade is defined once.

- [ ] **Shrink the continuation token.** The token carries the entire Responses
  API history, encrypted, on every round trip
  (`src/lib/estimate-continuation-token.ts`), growing with each turn — and with
  image turns it carries the image items too. Store the history server-side
  keyed by thread and send an opaque reference.
  **Done when:** request size is flat across turns.

---

## P3 — Product

- [ ] **Per-account price calibration.** `estimate-posture.ts` offers five
  presets that shade the whole range; a contractor with a real price book cannot
  say "my drain clears start at $180". Let an owner set a handful of anchor
  prices and bias the estimate toward them.

- [ ] **Show the owner what the AI is saying.** There is no screen where a
  contractor can read recent intake conversations and correct them. The
  simulator (`src/lib/intake-simulator.ts`) plays a fixed marketing transcript;
  it is not a tool for the owner.

- [ ] **After-hours and emergency parity.** The estimator prices emergency
  dispatch fees into a range (`classify-estimate/route.ts:226`) but the intake
  does not know the business is closed; the voice side does. Share the state.

- [ ] **Decide what `instant_booking` is.** `AI_INTAKE_FLOW_KINDS` carries two
  kinds with different question caps and different entitlement checks
  (`classify-estimate/route.ts:114-121`), sharing one prompt that knows about
  neither. Either the two journeys differ enough to justify separate prompts, or
  the distinction is only a cap and should be expressed as one.

---

## Suggested order

1. The three P0 data items, which are wrong output rather than missing features.
2. Measurement — server-side sessions and the AI-journey events — because every
   accuracy item after this needs data to be judged by.
3. The eval harness and behavioral tests, before any prompt or model change.
4. Accuracy: mandatory questions, strict schema, model registry, calibration.
5. Architecture and product, which are safe to do once the above can be measured.
