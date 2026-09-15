# Implementation list — welcome intake liveness

**Date:** 2026-09-09
**Read with:** [plan-welcome-intake-liveness-2026-09-08.md](plan-welcome-intake-liveness-2026-09-08.md) — that document carries the reasoning; this one is the order of work.

Every task below states its files, its change, and how you know it is done. Tasks are dependency-ordered and each phase is independently committable and independently shippable. Phase 5 (the reveal) does not depend on phases 2–4 and can be built in parallel by someone else.

Three corrections from the 2026-09-09 review are folded in where they belong: **the returning-terms path** (P0.4, 3.4), **the `?city=` conflict rule** (2.4), and **instrumentation** (phase 6).

---

## Phase 0 — Foundations

### 0.1 Establish a green baseline before touching anything
Another agent edits this tree, and inheriting someone else's red suite mid-task wastes a day.

**Run:** `npm run lint`, then `npx vitest run`, then `npm run build`. Record what is already failing.
**Done when:** you can name the pre-existing failures, or confirm there are none.
**Do not** pipe any of these through another command — piping loses the exit code and reports a pass over a failure.

### 0.2 Narrow font export
**Files:** `src/lib/templates/fonts.ts`
**Change:** export `firstRunFontVars` — the Forge display + body variables only (`forgeDisplayFont.variable`, `forgeBodyFont.variable`), beside the existing `templateFontVars`. Comment it with why: `/welcome` needs one face pair, and `templateFontVars` is sixteen families whose whole point was not to load them where they cannot be used. Forge because new sites are created as `carbon`, which `getTemplate` maps to Forge.
**Done when:** `npx vitest run test/template-fonts.test.ts` is green and the new export is used nowhere yet.

### 0.3 CSS scaffold and the regeneration habit
**Files:** `src/app/globals.css`, then `src/app/globals-lite.css` via script
**Change:** append an empty, commented block near the existing `.welcome-*` rules (~line 13969) reserving the five new classes: `.welcome-guess`, `.welcome-place`, `.welcome-split`, `.welcome-preview`, `.welcome-reveal-bar`.
**Then run:** `node scripts/build-css-subset.mjs`
**Done when:** `npx vitest run test/css-subset.test.ts` is green **and** you have confirmed the block appears in `globals-lite.css`. Repeat the regeneration after *every* subsequent `globals.css` edit in this project — `/welcome` loads only the lite sheet, so skipping it means the styles never load on the page this work is about.
**Do not** hand-edit `globals-lite.css`. It is generated and its source hash is pinned.

### 0.4 Thread `returning` into the form — CORRECTION
`/welcome` doubles as the updated-terms screen: `needsFirstRun` is true whenever `terms_version` goes stale, so an existing contractor with a live website sees the same three prefilled fields. Everything built below must be able to switch itself off there.

**Files:** `src/app/welcome/page.tsx`, `src/app/welcome/WelcomeForm.tsx`
**Change:** `returning` is already computed on the page for copy purposes. Pass it as a prop. Nothing consumes it yet.
**Done when:** typecheck passes and `npx vitest run test/signup-continuity.test.ts test/public-pages-fixes.test.ts` is green — both read these files as text and assert on substrings.

### 0.5 Lookup action skeleton
**Files:** `src/app/welcome/lookup-actions.ts` (new)
**Change:** `'use server'` file with one exported action that, for now, only does the gating: `requireOwnerContext({ skipFirstRunGate: true })`, then `checkRateLimit(admin, 'welcome-zip:' + accountId, 30, 300)`, then returns `{ ok: false, reason: 'not-found' }`. A server action is a public endpoint; without the owner gate an unauthenticated caller can spend Google Geocoding quota at will.
**Done when:** the file typechecks and an unauthenticated call redirects rather than executing.

---

## Phase 1 — Item 1: surface the trade guess

### 1.1 Auto-fill effect
**Files:** `src/components/trade-search-select.tsx`
**Change:** new optional prop `autoFillFromBusinessName?: boolean`. When true, an effect calls `onChange(inferred.slug)` and sets the input text, only when **all** hold:
1. `value === ''`
2. a new `userTouchedRef` is unset (set it on first input, select, or clear inside the trade box)
3. `inferTradeFromBusinessName(businessName)` returned non-null

Debounce ~250ms so "Brookhaven P" does not flash *Painters* before *Plumbers*.
**Done when:** typing a business name in `/welcome` fills the trade field, and typing in the trade box first permanently stops it.

### 1.2 Caller guards
**Files:** `src/app/welcome/WelcomeForm.tsx`
**Change:** pass `autoFillFromBusinessName={!initialTrade && !returning}`. A trade from `?trade=` or the account row is already an explicit answer, and a returning contractor re-accepting terms already has one.
**Done when:** `/welcome?trade=plumbers` never overwrites, and the updated-terms screen never auto-fills.

### 1.3 Derived-value semantics
**Files:** `src/components/trade-search-select.tsx`
**Change:** remember *that* the current value was auto-filled (a ref/state flag, not a recomputation). Clearing the business name clears an auto-filled trade — it was derived and its source is gone — and never clears a manually chosen one.
**Done when:** clear the name after an auto-fill → trade empties; clear the name after picking a trade by hand → trade stays.

### 1.4 The visible affordance
**Files:** `src/app/welcome/WelcomeForm.tsx` (or the select), `src/app/globals.css` (+ regenerate)
**Change:** a `.welcome-guess` line under the trade field, rendered only while the value is auto-filled: *"Guessed from your business name. Not right? Pick your trade above."* with an inline control that clears the field and focuses it. `aria-live="polite"`, and the announced text names the trade ("Set to Plumbers…").
**Done when:** a screen reader announces the change, and focus never leaves the business-name field while typing.
**Do not** move focus. The contractor is mid-word.

### 1.5 Confidence check
**Files:** none, unless it fails
**Change:** verify `inferTradeFromBusinessName('Smith & Sons')` returns null rather than falling through to a catch-all. If it does not, add the guard at the call site here — not in the shared matcher, which other trade surfaces depend on.
**Done when:** a business name containing no trade word produces no fill.

### 1.6 Tests
**Files:** `test/trade-search-select.test.ts`
**Cases:** fills on name typing; does not fill after the trade box is touched; does not fill over a URL-supplied trade; does not fill when `returning`; clearing the name clears an auto-fill but not a manual pick; a name with no trade word fills nothing.
**Done when:** new cases pass and every existing case in that file is still green.

---

## Phase 2 — Item 2: echo the ZIP back as a place

### 2.1 Pure helper first, with its tests
**Files:** `src/lib/first-run-place.ts` (new), `test/welcome-zip-echo.test.ts` (new)
**Change:** a pure function mapping an `AreaGeocodeResult` (plus the optional `?city=` param) to what the hint should say. Four outcomes: resolved, `unconfigured`, `not-found`, `too-large`. No network, no React.
**Done when:** the test file covers all four plus the conflict case from 2.4, and passes.

### 2.2 The server action
**Files:** `src/app/welcome/lookup-actions.ts`
**Change:** fill in the 0.5 skeleton — `geocodeArea(zip)`, return `{ ok: true, place }` from `placeNameFor`, else `{ ok: false, reason }`. This is deliberately the same call and same field the site generator uses ([actions.ts:346](../src/app/dashboard/sites/actions.ts#L346)), so what the contractor reads is what the model will be told.
**Done when:** a real ZIP returns "Detroit, MI" locally with `GOOGLE_MAPS_API_KEY` set, and an unset key returns `unconfigured` without throwing.
**Do not** accept a client-supplied place anywhere in `completeFirstRunAction`. It would let a caller name their own city and have the site written about it. The server re-resolves.

### 2.3 Client wiring
**Files:** `src/app/welcome/WelcomeForm.tsx`
**Change:** fire on exactly 5 digits, debounced 400ms, gated on `!returning`. Three mechanics that are the whole difficulty:
- **Sequence id.** Typing 48226 then 48227 can resolve out of order and paint the wrong city under the newer ZIP. Keep a monotonic counter and drop any answer that is not the newest.
- **Cache.** A component-level `Map` keyed by ZIP, so backspacing spends one geocode per distinct value.
- **Never blocking.** The submit button is never disabled by an in-flight lookup, and no failure produces an error state.
**Done when:** typing a ZIP shows the city; typing a second ZIP fast never shows the first one's answer; backspacing and retyping issues no second request.

### 2.4 The `?city=` conflict rule — CORRECTION
**Files:** `src/lib/first-run-place.ts`, `src/app/welcome/WelcomeForm.tsx`
**Change:** marketing links carry a city and the hint already changes shape when one is present. If the resolved ZIP names a different place, **the ZIP wins and the city claim is dropped** — the same rule the generator states explicitly ([actions.ts:364](../src/app/dashboard/sites/actions.ts#L364)). Otherwise the form and the finished site contradict each other on the one fact the echo exists to prove.
**Done when:** `/welcome?city=Austin,%20TX` plus a Detroit ZIP shows Detroit only, with no mention of Austin.

### 2.5 Copy, styling and the live region
**Files:** `src/app/globals.css` (+ regenerate), `src/app/welcome/WelcomeForm.tsx`
**Change:** on success replace the static hint with **"Detroit, MI."** followed by *"We'll write your site about Detroit and the towns around it."* One `aria-live="polite"` region — this is the only genuinely new information on the page. On every failure, keep today's static hint and say nothing.
**Done when:** all four outcomes render correctly in both themes, and an invalid ZIP produces no error text.
**Do not** name the neighbouring towns. They are invented by the model during the build; naming them here and shipping a site that lists different ones makes the intake a liar about exactly what it was trying to prove.

---

## Phase 3 — Item 4: the preview card

### 3.1 The component
**Files:** `src/app/welcome/WelcomePreviewCard.tsx` (new)
**Change:** renders company name in the Forge display face, the trade mark from `getTradeGlyph(trade.name)` through `ServiceIcon`, the trade's `work` noun, and the resolved city line from phase 2. Labelled **Preview**.
**Done when:** each element appears as its field gains a value.
**Do not** render a rating, review count, stat, or photo. The seeded site's reviews and stats are AI examples that ship switched **off**; a card showing 4.9★ is fabricated data presented as real.

### 3.2 Layout
**Files:** `src/app/welcome/WelcomeForm.tsx`, `src/app/globals.css` (+ regenerate), `src/app/welcome/page.tsx`
**Change:** `WelcomeForm` returns a `.welcome-split` wrapper around its existing `<form>` plus the new `<aside>`, so the form keeps ownership of all state and nothing is lifted. Grid, two columns at ≥900px, single column below with the card **after** the form. Widen `.hero-card.auth-card`'s `max-width` when the split is present.
**Done when:** no horizontal scroll at 320px, and the first input is still above the fold on a phone.

### 3.3 Fonts
**Files:** `src/app/welcome/WelcomePreviewCard.tsx`, `test/template-fonts.test.ts`
**Change:** carry `firstRunFontVars` from 0.2 on the card's root element. Add the card to `SURFACES`, plus an assertion that the welcome route uses the **narrow** vars and not all sixteen.
**Done when:** `npx vitest run test/template-fonts.test.ts` is green and the name renders in Anton, not a system font.

### 3.4 Returning gate — CORRECTION
**Files:** `src/app/welcome/WelcomeForm.tsx`
**Change:** render nothing when `returning`. A contractor re-accepting updated terms already has a website; showing them a "Preview" of one is a regression, not a delight.
**Done when:** the updated-terms screen renders exactly as it does today.

### 3.5 Motion, empty state, accessibility
**Files:** `src/app/welcome/WelcomePreviewCard.tsx`, `src/app/globals.css` (+ regenerate)
**Change:** neutral field-shaped skeleton before any input so nothing reflows the form. Each element fades in once, on first value, inside `@media (prefers-reduced-motion: no-preference)`. The mirrored name and trade get `aria-hidden="true"` — they duplicate what was just typed, and a live region echoing keystrokes is noise. The city line stays announced through phase 2's single region.
**Done when:** reduced-motion produces no animation, and a screen reader pass announces the city once and the mirrored text never.

---

## Phase 4 — Item 5: fix the reveal

### 4.1 The route
**Files:** `src/app/welcome/site/page.tsx` (new)
**Change:** server component. `requireOwnerContext({ skipFirstRunGate: true })` — the acceptance write may race the revalidate, and being bounced mid-reveal would be absurd. Then `getOrCreateSite` → `getTemplate(site.template)` → `<Template site={withPublicContact(site)} galleryImages={getSiteGallery(site.content)} />`, exactly as [dashboard/sites/preview/page.tsx](../src/app/dashboard/sites/preview/page.tsx) does. A `/welcome` child needs no middleware tagging, unlike the bare builder preview.
**Done when:** the route renders the real site full-bleed with no dashboard chrome, in the correct template fonts.

### 4.2 Guards
**Files:** `src/app/welcome/site/page.tsx`
**Change:** if `siteIsUnwritten(site)` → redirect to `/dashboard/sites`. Never reveal an empty template. The page performs no writes, so refreshing is safe and repeatable.
**Done when:** an account with an unwritten site lands in the builder instead.

### 4.3 The overlay bar
**Files:** `src/app/welcome/site/page.tsx`, `src/app/globals.css` (+ regenerate)
**Change:** `.welcome-reveal-bar` over the site — *"This is your website."* plus the honest sentence about AI example reviews being switched off, one primary CTA **Make it yours →** to `/dashboard/sites?built=1`, and a plain *Skip to dashboard* link. One CTA, per the open decision: a new site has `subdomain: null` and `published: false`, so a Publish button would need the web-address step first.
**Done when:** the bar is legible over every template, in both themes, and both exits work.

### 4.4 Destination logic — the part that costs money if it is wrong
**Files:** `src/app/welcome/WelcomeForm.tsx`
**Change:** the submit currently picks `planCheckoutPath` → `destinationPath` → `/dashboard/sites?built=1`. Replace **only the third**, and only when `seeded.built === true`. A contractor who chose a paid plan has a `planCheckoutPath`; a reveal that intercepts that is a reveal that intercepts a purchase. A failed or skipped seed goes straight to the builder — there is nothing to reveal.
**Done when:** the source test in 4.6 pins it.
**Do not** move `trackSignupConversion`. It fires before the redirect, and a contractor who closes the tab on the reveal must still count.

### 4.5 Failure copy pass
**Files:** `src/app/welcome/seed-actions.ts`
**Change:** reread the two failure strings now that the flow raises expectations with a preview card. They land someone in the builder after a promise; they should read as "here is what to do next", not as an apology.
**Done when:** both strings name the next action.

### 4.6 Tests
**Files:** `test/signup-continuity.test.ts` (extend), or a new `test/welcome-reveal.test.ts`
**Cases:** plan checkout wins over the reveal; a feature/goal destination wins over the reveal; the default path with a successful build goes to the reveal; a failed build does not; an unwritten site redirects to the builder.
**Done when:** green, and the plan-checkout case fails if you deliberately reorder the destination picks.

---

## Phase 5 — Instrumentation

Whether the trade guess is any good is an empirical question, and right now the funnel is unmeasured.

### 5.1 One new event kind
**Files:** `src/lib/account-events.ts`
**Change:** add `first_run_completed` to `AccountEventKind`, with a comment in the style of the existing entries saying what it is for. The union is the only thing keeping that vocabulary closed.
**Done when:** typecheck passes.

### 5.2 Record it
**Files:** `src/app/welcome/actions.ts`
**Change:** after the acceptance update — best-effort, and deliberately after, matching the existing `plan_intent_recorded` call at line 188 — record `first_run_completed` with meta `{ trade_source: 'guessed' | 'typed' | 'url', zip_resolved: boolean }`. The form knows which of the three produced the trade; pass it through the action's input and re-derive nothing you cannot trust.
**Done when:** a local first run writes exactly one row, and a failure to write it does not affect the result the form receives.

### 5.3 Test
**Files:** `test/welcome-signup-conversion.test.ts` (extend) or a new file
**Cases:** the event is written on success; a thrown recorder does not break first run.
**Done when:** green.

### 5.4 The question it answers
Write down the query now, while the schema is in hand: the share of completed first runs where `trade_source = 'guessed'` and the trade was not subsequently changed in the builder. Check it a week after ship. If the guess is usually wrong, phase 1 comes back out — that is the point of measuring rather than arguing.

---

## Phase 6 — Verification and ship

### 6.1 Gates, unpiped
```
npx vitest run test/trade-search-select.test.ts test/welcome-zip-echo.test.ts \
  test/signup-continuity.test.ts test/public-pages-fixes.test.ts \
  test/template-fonts.test.ts test/css-subset.test.ts test/welcome-signup-conversion.test.ts
npm run lint
npm run build
```
Delete `.next/types` before trusting a typecheck verdict. Typecheck plus green tests have passed here on code `next build` then rejected, so the build is not optional.

### 6.2 CSS regeneration, one last time
`node scripts/build-css-subset.mjs`, then re-run `test/css-subset.test.ts`. Confirm each new class actually appears in `globals-lite.css` — this file has a history of rules that read correctly and have never once applied.

### 6.3 Visual matrix
Port 3010. All four themes, light and dark, at 320px / 768px / 1280px. `/welcome` only renders for an account that has not completed first run — sign up fresh, or clear `terms_accepted_at` on a test account, since `needsFirstRun` redirects everyone else straight out.
Check specifically: the guess line, the resolved city, the card at each width, the reveal bar over every template, and the updated-terms screen showing **neither** card nor echo.
**Do not** run `next build` while the dev server is serving the page you are looking at — it clobbers it, and every page renders unstyled with a "MIME type text/plain" console error and no code change.

### 6.4 End-to-end walkthrough on a fresh account
Sign up → type a business name → watch the trade fill → type a ZIP → watch the city resolve → submit → wait out the build → land on the reveal → "Make it yours" → confirm the builder still shows its explanatory banner. Then repeat with `?plan=growth` and confirm you land in **checkout**, not the reveal.

### 6.5 Ship
Commit per phase, push. The push is the deploy.

---

## The traps, collected

1. Editing `globals.css` without running `scripts/build-css-subset.mjs` — the styles never load on `/welcome`.
2. Importing `templateFontVars` into the signup route — sixteen font families on a conversion page.
3. Forgetting the returning-terms path — a "Preview" of a website that has existed for months.
4. Letting the reveal intercept `planCheckoutPath` — a purchase that never happens.
5. Naming neighbouring towns before the model has chosen them.
6. Trusting a client-supplied city in `completeFirstRunAction`.
7. Out-of-order geocode responses painting the wrong city.
8. Piping a gate and reading the wrong exit code.
9. British spellings anywhere, including code comments — "colour" fails the suite.
