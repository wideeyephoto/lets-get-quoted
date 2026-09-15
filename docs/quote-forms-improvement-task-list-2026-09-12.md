# Quote forms — executable improvement task list

**Date:** 2026-09-12 · **Baseline:** `a0e6833` · **Scope:** the two public intake
forms that create leads on a contractor's own website, plus the server route
behind them.

**The three files this is about**
- [`src/lib/templates/HeroQuickForm.tsx`](../src/lib/templates/HeroQuickForm.tsx) — the
  **Smart / AI intake**. This is the default: `estimateRanges.enabled` is
  `quoteForm.enabled !== true`, so every site that has not opted into the classic form
  is running this one.
- [`src/components/quote-request-form.tsx`](../src/components/quote-request-form.tsx) —
  the **classic two-step form**. Opt-in, off by default, and — as the tasks below
  document — it has quietly fallen a long way behind its sibling.
- [`src/app/api/public/leads/route.ts`](../src/app/api/public/leads/route.ts) — the
  single POST both forms submit to, where triage, scoring, dedupe and owner alerts
  happen.

**Standing rules for every task below**
- Run `npm run lint` **unpiped** alongside `npm test` and `npm run build`. Piping a gate
  loses its exit code.
- Every behaviour change here ships with a test. **Prove the gate bites**: reintroduce
  the defect, watch the test fail, revert. A gate that has never failed is not a gate.
- Do not change what the two forms *are*. The classic form is deliberately the plain
  one. These tasks close gaps where it is plain **and also broken**, which is different.
- Anything that changes customer-facing copy about response times or outcomes goes
  through [`docs/ftc-substantiation-register.md`](./ftc-substantiation-register.md)
  first. See W2/T15.

---

## Wave 0 — Leads are being lost right now

These are not polish. Each one ends with a homeowner who tried to contact a contractor
and did not reach them.

### T1. A video attachment makes the Smart intake unsubmittable
- **Where:** [`HeroQuickForm.tsx:407`](../src/lib/templates/HeroQuickForm.tsx#L407),
  [`:847`](../src/lib/templates/HeroQuickForm.tsx#L847),
  [`:1188`](../src/lib/templates/HeroQuickForm.tsx#L1188) ·
  [`client-images.ts:8`](../src/lib/client-images.ts#L8)
- **What happens:** the file input advertises `video/mp4,video/quicktime,video/webm`,
  `addPhotos` accepts anything `video/*`, the oversize hint literally says *"Short 10–20
  second video clips work best!"*, and `uploadLeadPhoto` allows all three MIME types on
  the server. Then submit runs every selected file through `compressImage`, whose first
  line is `if (!file.type.startsWith('image/')) throw new Error('Choose an image file.')`.
  The throw is caught by the submit handler's `catch` and rendered as the form's error
  message.
- **Result:** a homeowner who films their leaking water heater — exactly what the copy
  asked them to do — gets *"Choose an image file."* and **cannot submit at all** until
  they work out that the video is the problem and remove it. There is no lead.
- **Do:** partition `selectedPhotos` at submit. Images go through `compressImage`;
  videos append **as-is** (they are already size-capped at 35 MB by `MAX_MEDIA_BYTES`
  and type-checked server-side). Same partition in the QA-step follow-up photo path.
- **Verify:** new test — submit with one `video/mp4` File in state, assert the POST body
  carries it and no error status is set.
- **Effort:** 1 h · **Severity:** highest. This is the default intake on every site.

### T2. One undecodable photo discards the entire lead
- **Where:** [`HeroQuickForm.tsx:847`](../src/lib/templates/HeroQuickForm.tsx#L847) ·
  [`quote-request-form.tsx:178`](../src/components/quote-request-form.tsx#L178)
- **What happens:** both forms do `for (const photo of photos) data.append('photos',
  await compressImage(photo, 1600, 0.8))`. `compressImage` calls `createImageBitmap`,
  which **throws** on a format the browser cannot decode (HEIC outside Safari, a
  progressive-JPEG edge case, a truncated file from a flaky mobile upload). One throw
  aborts the loop, the whole submit fails, and the message, the contact details and the
  other five photos go with it.
- **Do:** per-file `try/catch`. On failure, fall back to appending the original file when
  its type is in `ALLOWED_TYPES`; otherwise drop **that file only**, keep going, and
  surface a non-blocking note (*"We couldn't attach kitchen.heic — your request was
  still sent."*). **A photo is never worth the lead.**
- **Verify:** test with a stubbed `compressImage` that throws on the second of three
  files; assert the POST still fires with two photos and a success status.
- **Effort:** 1.5 h · **Depends on:** none (do alongside T1).

### T3. Classic-form leads silently bypass three owner-configured protections
- **Where:** [`leads/route.ts:225`](../src/app/api/public/leads/route.ts#L225),
  [`:251`](../src/app/api/public/leads/route.ts#L251),
  [`:277`](../src/app/api/public/leads/route.ts#L277),
  [`:308`](../src/app/api/public/leads/route.ts#L308)
- **What happens:** three gates are keyed on `wizard === '1'`, which only the Smart
  intake sets:
  1. `serviceAreaGate` — classic leads never get an `out_of_area` flag.
  2. `phoneVerification` — an owner who turned this **on** is not protected on the
     classic form at all. The setting reads as global in the UI.
  3. `estimate` is wizard-only, and `isHighValue` requires `estimate != null` — so a
     classic lead can **never** be `high_value` and can never be scored `hot`. Every
     classic lead is `warm` or `low`, which means the high-value owner SMS and the
     louder email never fire for those sites.
- **Do:** split the gates by what they actually depend on. The service-area check needs
  a town, not a wizard — add a location capture to the classic form (see W2/T12) and run
  the check whenever a location is present. Phone verification should follow
  `filters.phoneVerification`, not the form variant; if the classic form cannot carry a
  verification round-trip, say so in the settings UI rather than silently no-op'ing.
  Scoring needs a price signal for classic leads — either run `classify-estimate`
  server-side on the description, or make the settings copy honest that high-value
  alerts are a Smart-intake feature.
- **Decision needed from the owner:** which of the three. Do not guess; the settings copy
  changes either way.
- **Effort:** 4 h once the decision is made · **Severity:** high — a safety setting that
  is on and not running is worse than one that is off.

### T4. Permit triage hard-codes Michigan and roofing for every lead
- **Where:** [`leads/route.ts:286`](../src/app/api/public/leads/route.ts#L286),
  [`:291`](../src/app/api/public/leads/route.ts#L291)
- **What happens:**
  ```js
  resolveJurisdiction({ raw: location, city: location, state: 'MI', ... });
  evaluatePermitRequirement(jurisdiction.authorityId, {
    trade: 'roofing', scope: 'replacement', estimatedCost: estimate?.max || 8500,
  });
  ```
  A plumber in Ohio gets a Michigan roofing-replacement permit verdict, an authority
  name and a dollar fee estimate attached to their lead's triage — and it renders in the
  dashboard as fact.
- **Do:** derive `state` from the site's service area / configured cities (fall back to
  *no permit triage* rather than a guess), and `trade` from `siteContent.trade`. When
  either is unknown, **omit `permitTriage` entirely**. A missing verdict is honest; a
  confidently wrong one is a claim the contractor may repeat to a customer.
- **Verify:** test that a non-MI location with an unmappable jurisdiction produces
  `triage.permit === undefined`, and that `siteContent.trade` reaches
  `evaluatePermitRequirement`.
- **Effort:** 2 h · **Severity:** high — this one ships wrong data into a regulated topic.

### T5. Duplicate merge only looks at the 25 most recent open leads
- **Where:** [`leads/route.ts:328`](../src/app/api/public/leads/route.ts#L328)
- **What happens:** the repeat-submitter merge fetches `.limit(25)` open leads from the
  last 30 days, newest first, then scans for a phone/email match. A contractor with more
  than 25 open leads in a month — the ones we most want to keep — silently loses the
  merge, so repeat requests stack as duplicate cards and the `repeat` flag (which
  bypasses the low-quality mute, i.e. *this person is hot*) never gets set.
- **Do:** replace the fetch-and-scan with two targeted equality queries on
  `normalizedPhone` and `email` (matching the blocklist pattern directly above it at
  [`:196`](../src/app/api/public/leads/route.ts#L196), and for the same reason — never
  build a PostgREST `.or()` from user input). Add a normalized-phone index if the query
  plan needs one.
- **Verify:** seed 40 open leads, submit a repeat matching the oldest, assert the merge
  fired and no new row was created.
- **Effort:** 2 h.

---

## Wave 1 — You cannot see the funnel you are trying to improve

Everything in Wave 2 is guesswork until this wave lands. Do this wave first if you only
have time for one.

### T6. The classic form emits no funnel events at all — including ad conversions
- **Where:** [`quote-request-form.tsx`](../src/components/quote-request-form.tsx) (no
  import of `@/lib/analytics`) vs.
  [`HeroQuickForm.tsx:252,266,501,859`](../src/lib/templates/HeroQuickForm.tsx#L252)
- **What happens:** `trackQuoteFunnelStep` fires `form_impression`, `form_started`,
  `first_step_completed` and `contact_submitted` — and, on submit, the **Google Ads
  conversion** ([`analytics.ts:279`](../src/lib/analytics.ts#L279)). The classic form
  fires none of them. A contractor running paid traffic to a classic-form site reports
  **zero conversions** to Google Ads, so Smart Bidding optimises against nothing.
- **Do:** add the same four calls to the classic form: impression on mount, `form_started`
  on first input, `first_step_completed` in `goToNextStep`, `contact_submitted` after the
  XHR resolves. Extend
  [`test/quote-form-styles.test.ts`](../test/quote-form-styles.test.ts) — it already
  imports `trackQuoteFunnelStep` and reads form source — to assert **both** components
  emit all four steps.
- **Effort:** 2 h · **Severity:** high and invisible. Nobody reports this as a bug; the
  numbers are just quietly wrong.

### T7. Funnel measurement is consent-gated, so the numbers under-report by design
- **Where:** [`analytics.ts:1-18`](../src/lib/analytics.ts#L1) — nothing loads until the
  visitor accepts cookies, which is the right call and is documented as such.
- **The consequence:** every funnel number we have is *"visitors who accepted cookies"*.
  For tuning a form that is somewhere between useless and misleading — the drop-off you
  most want to see (bounce before interaction) correlates with declining consent.
- **Do:** add a **first-party, consent-independent, non-identifying** step counter:
  `POST /api/public/quote-funnel` writing `(site_id, step, form_variant, device,
  day)` counts only — no IP, no fingerprint, no visitor id, nothing that is personal
  data. New table ships with RLS enabled **and** `REVOKE ALL ... FROM anon,
  authenticated` in the same migration, plus a test asserting the revoke.
- **Verify:** a migration test for the revoke; a route test that the payload cannot carry
  a free-text field.
- **Effort:** 6 h · **Blocks:** T8, T9, T22, T23.

### T8. No draft persistence — a backgrounded phone wipes the whole form
- **Where:** neither form touches `sessionStorage`/`localStorage` (verified by grep).
- **What happens:** the Smart intake is 3–4 screens including free text and an AI Q&A
  round trip. On mobile, backgrounding the browser to check a photo, or an OS memory
  reclaim, remounts the page and everything is gone. The homeowner starts over or leaves.
- **Do:** mirror `description`, `chatTurn`/`chatResponseId`, `name`, `contact`, `email`,
  `location`, `timeline` into `sessionStorage` keyed by `site.id`, restore on mount,
  clear on success. **Never persist photos** (size) and never use `localStorage` (a
  shared family iPad must not show the last person's answers).
- **Verify:** test that a remount restores state and that a successful submit clears it.
- **Effort:** 3 h · **Depends on:** nothing, but pointless to measure without T7.

### T9. No abandonment capture — we learn nothing from the 90% who leave
- **What is missing:** the Smart intake collects a full project description, an AI Q&A
  and often a town **before** it asks for contact details. Every one of those abandons is
  a thrown-away signal about which questions cost conversions.
- **Do (measurement only, in this task):** on unload/step-change, post the *shape* of the
  abandon to T7's counter — which step, how many AI turns, whether photos were attached.
  No content, no contact details.
- **Do NOT** capture a partial lead with contact details and surface it to the contractor
  as a lead. A homeowner who deliberately stopped before giving a phone number has not
  consented to be called, the TCPA consent record at
  [`leads/route.ts:405-411`](../src/app/api/public/leads/route.ts#L405) would be a
  fabrication, and the `intake_v1_2026` disclosure version would be attached to a consent
  that was never given. If the business wants abandoned-cart follow-up, it needs its own
  consent design and its own legal review — a separate project, not a task on this list.
- **Effort:** 3 h · **Depends on:** T7.

---

## Wave 2 — The form itself

### T10. The Smart intake never captures a street address
- **Where:** no `address` field exists anywhere in
  [`HeroQuickForm.tsx`](../src/lib/templates/HeroQuickForm.tsx) (verified by grep); the
  server's `text(data, 'address', 240)` is therefore **always empty** for the default
  intake. The classic form has had `AddressAutocomplete` all along
  ([`quote-request-form.tsx:232`](../src/components/quote-request-form.tsx#L232)).
- **Consequence:** the contractor's first job on every Smart-intake lead is to phone and
  ask where the work is — the exact phone-tag this product exists to remove. It also
  degrades `resolveRecipientTimeZone` (which takes `address`) for TCPA quiet hours, and
  leaves route planning and the permit lookup with a bare town name.
- **Do:** add an optional `AddressAutocomplete` to the contact step, below the phone
  number, clearly optional and clearly framed (*"Helps us quote accurately — we only
  visit if you ask us to."*). Keep the town field as the service-area gate's input.
- **Watch:** measure it. An address field on the contact step is the single most likely
  thing on this list to *cost* conversions. Ship it behind T7 measurement and be willing
  to pull it.
- **Effort:** 3 h · **Depends on:** T7 to judge it.

### T11. `projectType` is never set by either form
- **Where:** neither form writes it (verified by grep); the server reads it at
  [`leads/route.ts:427`](../src/app/api/public/leads/route.ts#L427) and passes it to
  `createLead`, `dispatchSpeedToLeadSms` and `sendIntakeConfirmationSms`.
- **Consequence:** [`sms-templates.ts:618`](../src/lib/sms-templates.ts#L618) falls back
  to `'estimate request'`, so every confirmation text a homeowner gets says the generic
  phrase when the AI has *already classified the job*. "Thanks for your water heater
  replacement request" converts better than "thanks for your estimate request", and we
  have the data sitting in the classify response.
- **Do:** return a short service label from `classify-estimate` alongside `basis`, carry
  it in form state, and `data.set('projectType', …)` at submit. Cap and sanitise it like
  every other free-text field.
- **Effort:** 2.5 h.

### T12. Classic-form parity: the input-quality helpers it never got
- **Where:** [`quote-request-form.tsx:271-294`](../src/components/quote-request-form.tsx#L271)
- **Missing, all of which already exist and are used by the Smart intake:**
  - `suggestEmailFix` / `classifyEmail` from [`email-quality.ts`](../src/lib/email-quality.ts)
    — the "did you mean gmail.com?" inline fix. Without it the typo reaches the server,
    passes `classifyEmail` as *deliverable*, and gets flagged `junk_email` after the fact.
  - `normalizeUsPhone` feedback — the classic form accepts any 40 characters and only
    finds out server-side, where the reply is a flat *"Enter a valid phone number."*
  - A town/city field — which is what T3's service-area gate needs.
  - `inputMode` / `enterKeyHint` on the mobile keyboard path.
- **Do:** port each one. This is mechanical; the helpers are all pure functions with
  existing tests.
- **Effort:** 3 h.

### T13. The classic form ignores every appearance setting the owner configured
- **Where:** `quoteFormStyle`, `quoteFormFieldBg`, `quoteFormRadius`, `quoteFormStepper`,
  `quoteFormBadge`, `quoteFormBadgeText`, `quoteFormWidth`, `quoteFormSubtitle`,
  `quoteFormButtonText`, `quoteFormTrust`/`quoteFormTrustItems` are all read by
  [`HeroQuickForm.tsx:139-150`](../src/lib/templates/HeroQuickForm.tsx#L139) and **none**
  by the classic form, which renders no `data-form-style` attributes and no trust cues at
  all.
- **Consequence:** a contractor picks a form style, a badge and three trust cues in the
  builder, switches on the full quote form, and every one of those choices vanishes with
  no explanation. The builder still shows the controls.
- **Do:** either (a) apply the same `data-*` attributes and trust-cue block to the classic
  form — the CSS already exists — or (b) hide the controls that do not apply when
  `quoteForm.enabled` is true. **(a) is the better product**; (b) is the honest
  30-minute version if (a) is not scheduled.
- **Effort:** 5 h for (a), 0.5 h for (b).

### T14. Both forms block submission inside an iframe
- **Where:** [`quote-request-form.tsx:160`](../src/components/quote-request-form.tsx#L160)
  · [`HeroQuickForm.tsx:784`](../src/lib/templates/HeroQuickForm.tsx#L784) —
  `if (!site.published || window.self !== window.top)`.
- **What it is for:** stopping the builder's live preview from creating real leads. That
  is correct and must stay.
- **What it also does:** breaks any legitimate embed of a contractor's quote form in
  another page, and produces a misleading message — *"requests become active when this
  website is published"* — when the site **is** published and the iframe is the real
  reason.
- **Do:** gate the preview on the explicit `demo` prop (HeroQuickForm already has one)
  rather than on frame position, and give the classic form the same prop. Then decide
  embedding on its own merits. At minimum, fix the message so it names the actual cause.
- **Effort:** 2 h.

### T15. Unearned response-time claims in the classic form
- **Where:** [`quote-request-form.tsx:205`](../src/components/quote-request-form.tsx#L205)
  — *"we'll call you back within about an hour"* · and
  [`:313`](../src/components/quote-request-form.tsx#L313) — *"we reply within about an
  hour"*, shown **before** submitting.
- **Why this matters:** the Smart intake goes to real lengths to avoid exactly this. It
  takes `site.avg_response_ms`, rounds **up**, and only makes a claim at all when one is
  earned (≥3 real responses, average under 4 h — see
  [`HeroQuickForm.tsx:34-42`](../src/lib/templates/HeroQuickForm.tsx#L34) and
  `withResponseStat` in `lib/sites`). The classic form asserts one hour on behalf of a
  contractor who may have never answered a lead in their life. That is a claim we are
  making about someone else's business, on their own domain, to their customer — and the
  repo already maintains [`docs/ftc-substantiation-register.md`](./ftc-substantiation-register.md)
  and [`docs/claims-substantiation.md`](./claims-substantiation.md) for precisely this
  class of statement.
- **Do:** add `avg_response_ms` to `QuoteRequestFormProps`
  ([`:21`](../src/components/quote-request-form.tsx#L21) — it is not even in the `Pick`
  today), reuse `formatReplyTime`, and fall back to *"we'll follow up as soon as
  possible"* when there is no earned stat. Extract the shared helper so there is one
  implementation.
- **Verify:** test that a site with no response history renders no time claim in **either**
  form.
- **Effort:** 2 h · **Severity:** treat as compliance, not copy.

### T16. The 1800 ms anti-bot guard rejects fast, legitimate humans
- **Where:** [`leads/route.ts:99`](../src/app/api/public/leads/route.ts#L99) — submits
  arriving under 1.8 s after mount are rejected with *"Please take a moment to complete
  the form."*
- **Who this hits:** password-manager and browser autofill (which can populate and submit
  in well under a second), and the duplicate-form-on-one-page case where a second form
  mounted late. The message reads as an accusation and gives no recovery path.
- **Do:** keep the guard — it is cheap and it works — but (1) re-stamp `startedAt` on
  first interaction rather than on mount, so the window measures *engagement*, not
  *page age*, and (2) reword to a retryable message. Consider dropping the floor to
  ~800 ms and leaning on the honeypot and the per-IP limiter, which are the load-bearing
  defences.
- **Effort:** 1.5 h.

### T17. Drag-and-drop bypasses the `accept` filter
- **Where:** [`quote-request-form.tsx:86`](../src/components/quote-request-form.tsx#L86)
  filters only `image/*`, while the input advertises
  [`accept="image/jpeg,image/png,image/webp,image/avif"`](../src/components/quote-request-form.tsx#L246).
  A dropped HEIC, TIFF or GIF passes the client filter, then fails `compressImage` or
  `uploadLeadPhoto`'s `ALLOWED_TYPES` — which does **not** include `image/avif` either,
  despite the input asking for it.
- **Do:** validate dropped files against one shared allow-list constant, exported from
  `lead-photo-storage.ts` so client and server cannot drift again, and reject at pick
  time with a readable message instead of at submit time. Resolve the AVIF mismatch in
  whichever direction you want — but pick one.
- **Effort:** 1.5 h · **Note:** T2 makes this survivable; this makes it not happen.

---

## Wave 3 — Accessibility and trust

### T18. Audit both forms against the repo's own accessibility bar
- **Where:** [`test/form-control-labels.test.ts`](../test/form-control-labels.test.ts)
  already enforces labelled selects across `src/app`, `src/components` and
  `src/lib/templates`, with a genuinely careful JSX parser.
- **Do:** extend the same harness to cover, for both quote forms:
  - every `input`/`textarea` has an accessible name (not just selects);
  - error text is programmatically associated (`aria-describedby`) — the Smart intake does
    this for the describe box ([`:1065`](../src/lib/templates/HeroQuickForm.tsx#L1065))
    and the town field ([`:1326`](../src/lib/templates/HeroQuickForm.tsx#L1326)), and
    nowhere else;
  - the step containers' `aria-live` announcements fire on step change, not just on mount;
  - the classic form's `role="alert"` error path is reachable by keyboard from the field
    that caused it.
- **Effort:** 4 h.

### T19. Photo-removal and file-list semantics
- **Where:** [`quote-request-form.tsx:253-265`](../src/components/quote-request-form.tsx#L253)
- **Do:** the selected-photos list is a `div` with `aria-label`; make it a real list, and
  announce removals (`aria-live="polite"`) so a screen-reader user gets confirmation that
  the file went. Return focus to the "Choose photos" button after the last removal.
- **Effort:** 1.5 h.

### T20. Consent copy is not versioned with the disclosure it records
- **Where:** the form renders the consent sentence at
  [`quote-request-form.tsx:317`](../src/components/quote-request-form.tsx#L317) while the
  server records `disclosureVersion: 'intake_v1_2026'` as a **string literal** at
  [`leads/route.ts:409`](../src/app/api/public/leads/route.ts#L409).
- **Risk:** the day someone edits that sentence, every stored consent record claims a
  version whose text no longer exists. The record becomes unusable as evidence, which is
  the only reason to keep it.
- **Do:** move the disclosure text to a single exported constant keyed by version, render
  **from** it, and record the key. Add a test that fails when the text changes without the
  key changing.
- **Effort:** 2 h · **Severity:** treat as compliance.

---

## Wave 4 — Measurement that pays for the next round

### T21. Make the two intakes comparable
- **Do:** with T6 and T7 landed, report `form_impression → contact_submitted` per variant,
  per device, per template. We currently have **no idea** whether the AI intake
  out-converts the classic form, on any site, on any device — and the whole product bets
  that it does.
- **Effort:** 3 h · **Depends on:** T6, T7.

### T22. An owner-facing funnel card
- **Where:** alongside [`QuotesFollowUpCard`](../src/app/dashboard/insights/QuotesFollowUpCard.tsx)
- **Do:** show the contractor their own drop-off: impressions, starts, step-1 completions,
  submissions, and the abandon shape from T9. This is the screen that makes the settings
  in the builder worth touching.
- **Effort:** 6 h · **Depends on:** T7, T9.

### T23. An A/B harness, or an explicit decision not to have one
- **Where:** nothing exists today (verified by grep).
- **The case for:** ~12 owner-configurable form knobs already ship (style, field
  background, radius, stepper, badge, width, subtitle, button text, placeholder, trust
  cues, step-1 photos, email requirement) and **not one of them has evidence behind its
  default**.
- **The case against:** per-site traffic is low; most contractors will never reach
  significance alone. The honest version is a **platform-wide** test across sites that opt
  in, not a per-site one.
- **Do:** decide. If yes, the smallest useful version is a sticky variant assignment in the
  attribution cookie plus a variant dimension on T7's counter.
- **Effort:** 1 h to decide · 8 h to build.

---

## Suggested order

1. **T1, T2** — this week. Leads are failing to arrive today.
2. **T4, T5** — same week; both are small and both ship wrong data.
3. **T6, T7** — the instrumentation. Everything after this is measurable.
4. **T3** — needs the owner decision first.
5. **T15, T20** — compliance-flavoured, cheap, and they age badly.
6. **T8, T11, T12, T16, T17** — the conversion batch.
7. **T10, T13, T14, T18, T19** — the larger product changes.
8. **T21, T22, T23** — once there is data to look at.

**T1 through T7 is roughly 18 hours and covers every task on this list that is currently
losing a lead or reporting a wrong number.**
