# Plan — make first-run contractor intake feel alive

**Date:** 2026-09-08
**Scope:** four changes to `/welcome` and what follows it — (1) surface the trade guess, (2) echo the ZIP back as a real place, (4) a preview card that accrues while they type, (5) replace the redirect-into-a-settings-page with an actual reveal.
**Not in scope:** item 3 from the original list (narrating the ~10s site build honestly). That needs `generateSiteTextAction` split into stages or streamed, and is planned separately.

---

## The principle these four share

Alive does not mean animated. It means **the page answers back with things it can prove**, and nothing it says before the build may be contradicted by the build. Every claim below is sourced from something already computed — an existing pure function, or the exact geocode call the site generator itself makes. Where a claim would need a second source that could disagree with the finished site (neighbouring town names, review counts, stats), the plan deliberately does not make it.

---

## What is true today (verified, not assumed)

| Fact | Where |
|---|---|
| The intake is three fields + two checkboxes, entirely static; nothing reacts to input | [WelcomeForm.tsx](src/app/welcome/WelcomeForm.tsx) |
| `inferTradeFromBusinessName` already turns "Brookhaven Plumbing" into Plumbers | [trade-search-select.tsx:39](src/components/trade-search-select.tsx#L39) |
| …but it only enters the item list when the query is empty, so it renders **only if the dropdown is opened** | [trade-search-select.tsx:152](src/components/trade-search-select.tsx#L152) |
| The ZIP hint promises copy about "the actual towns you serve"; nothing happens on input | [WelcomeForm.tsx:141](src/app/welcome/WelcomeForm.tsx#L141) |
| The site generator resolves the ZIP through `geocodeArea(zip).place` and feeds the city to the model as a fact | [dashboard/sites/actions.ts:346](src/app/dashboard/sites/actions.ts#L346) |
| `placeNameFor` returns exactly "Royal Oak, MI" | [geocode.ts:126](src/lib/geocode.ts#L126) |
| Neighbouring towns are produced by the **model**, during the build (12 asked for), and by a separate model call for radius areas | [actions.ts:375](src/app/dashboard/sites/actions.ts#L375), [actions.ts:1459](src/app/dashboard/sites/actions.ts#L1459) |
| New sites are inserted as `template: 'carbon'`, which `getTemplate` maps to **Forge** (Anton + Barlow) | [sites.ts:97](src/lib/sites.ts#L97), [templates/index.ts:14](src/lib/templates/index.ts#L14) |
| After the build, the contractor lands on the website **builder** with a long success string in the message slot | [WebsiteBuilder.tsx:368](src/app/dashboard/sites/WebsiteBuilder.tsx#L368) |
| A full-page render of the owner's real site already exists, server-side | [dashboard/sites/preview/page.tsx](src/app/dashboard/sites/preview/page.tsx) |
| It escapes the dashboard shell only because middleware tags that one exact pathname | [middleware.ts:112](src/middleware.ts#L112) |
| `TradeSearchSelect` has exactly one caller today — `WelcomeForm` | grep, `src/**/*.tsx` |

---

## Shared foundations (do these first — all four depend on them)

### F1. Where the CSS goes, and the second step everyone forgets

`/welcome` is **not** under `/dashboard`, `/admin` or `/demo`, so it loads `globals-lite.css` and not `globals.css`. `globals-lite.css` is **generated**:

```
edit src/app/globals.css   (append near the existing .welcome-* block, ~line 13969)
node scripts/build-css-subset.mjs
```

The header of the lite file pins `source-sha256`, and `test/css-subset.test.ts` fails if it is hand-edited or stale. Adding a rule to `globals.css` and stopping there means **the new styles never load on the signup page** — the page this whole plan is about.

Second trap: this file has a documented history of rules that read correctly and have never once applied. Every new selector must be checked in the browser, not just written — particularly anything nested under `.auth-form`, which already carries descendant rules for `label`, `input` and `.welcome-accept`.

### F2. One place for the lookups

New file `src/app/welcome/lookup-actions.ts` (`'use server'`), holding the ZIP resolver and anything else items 2 and 4 need.

- Every action calls `requireOwnerContext({ skipFirstRunGate: true })` — the same gate [welcome/page.tsx:26](src/app/welcome/page.tsx#L26) uses. A server action is a public endpoint; without this, an unauthenticated caller can spend Google Geocoding quota at will.
- Plus `checkRateLimit(admin, 'welcome-zip:' + accountId, 30, 300)` from [rate-limit.ts:21](src/lib/rate-limit.ts#L21). It fails open by design, which is right here: the worst case is a few extra geocodes, and a broken limiter must never block signup.
- Every failure mode is **silent**. These are decorations on a form. Nothing they do may block, gate or delay the submit.

### F3. Fonts — and a real cost to avoid

Anything rendering the contractor's own type outside a template must carry `templateFontVars` and join `SURFACES` in [test/template-fonts.test.ts:71](test/template-fonts.test.ts#L71).

But `templateFontVars` is **all sixteen families** ([fonts.ts:79](src/lib/templates/fonts.ts#L79)). Importing it into `/welcome` pulls all sixteen into the signup route's CSS chunk — the exact 51KB cost the fonts module was written to eliminate. The preview card (item 4) needs only Forge.

**Action:** export a narrow `firstRunFontVars` (Forge display + body only) alongside `templateFontVars` in `fonts.ts`, use that on the card, and add an assertion to `template-fonts.test.ts` that `/welcome` carries a font-vars class and that it is the narrow one. Item 5's reveal needs no change — it renders a real `<Template>`, and each template file already carries the vars itself.

### F4. Tests that read these files as text

[test/signup-continuity.test.ts](test/signup-continuity.test.ts) and [test/public-pages-fixes.test.ts:52](test/public-pages-fixes.test.ts#L52) `readFileSync` the welcome page, form and actions and assert on substrings (`searchParams.trade`, `initialTrade`, …). They are brittle to exactly the refactors below. Keep the substrings or update those tests deliberately — never by loosening an assertion until it passes.

---

## Item 1 — Surface the trade guess

**Goal:** typing "Brookhaven Plumbing" fills the trade field with Plumbers, visibly and reversibly, before the contractor reaches it.

### Mechanism

Keep the matching inside `TradeSearchSelect` — it owns `inferTradeFromBusinessName`, the input text, and the blur-resolve path, and splitting that across two components is how the two disagree later. Add an effect that calls `onChange(inferred.slug)` and sets the input text, under **all** of these conditions:

1. `value === ''` — never overwrite a chosen trade.
2. The user has not touched the trade field. Track a `userTouchedRef` set on first input/select/clear in that box, and never auto-fill again once set. A fill that fights the user is worse than no fill at all.
3. `initialTrade` was empty — a trade from `?trade=` or the account row is already an explicit answer ([welcome/page.tsx:41](src/app/welcome/page.tsx#L41) resolves it from the URL, and marketing links carry it).
4. `inferTradeFromBusinessName` returned non-null. It already returns null when unsure; confirm against a name with no trade word ("Smith & Sons") that it does not fall through to a catch-all — if it does, add the guard here rather than changing the shared matcher, which other trade surfaces depend on.

Re-run on business-name change, debounced ~250ms — not for cost (it is pure and synchronous) but so "Brookhaven P" doesn't flash *Painters* before *Plumbers*.

Clearing the business name clears an **auto-filled** trade — it was derived, and leaving it strands a guess whose source is gone — and never clears a manually chosen one. So the auto-fill flag has to be remembered, not recomputed.

### The visible affordance

Under the trade field, a `.welcome-guess` line, only while the value is auto-filled:

> Guessed from your business name. Not right? Pick your trade above.

with an inline control that clears the field and focuses it. Two accessibility requirements, both easy to miss:

- The line is `aria-live="polite"` and names the trade ("Set to Plumbers…"). A control whose value changes on its own without announcement is a WCAG 4.1.3 failure.
- Never move focus. The contractor is mid-word in the business-name field.

### Files

`src/components/trade-search-select.tsx` · `src/app/welcome/WelcomeForm.tsx` · `src/app/globals.css` (+ regenerate lite)

### Tests

Extend [test/trade-search-select.test.ts](test/trade-search-select.test.ts): fills on name typing; does not fill after the trade box is touched; does not fill over a URL-supplied trade; clearing the name clears an auto-fill but not a manual pick. Existing cases stay green — the component has one caller, so the blast radius is `/welcome` only.

**Effort:** small. Half a day including tests.

---

## Item 2 — Echo the ZIP back as a place

**Goal:** the fifth digit produces "Detroit, MI", from the same lookup the generator will use.

### Mechanism

`resolveFirstRunPlaceAction(zip)` in `lookup-actions.ts`:

```
requireOwnerContext({ skipFirstRunGate: true })  →  rate limit  →  geocodeArea(zip)
  ok        → { place }      // placeNameFor: "Detroit, MI"
  otherwise → { reason }     // 'unconfigured' | 'not-found' | 'too-large'
```

This is deliberately the same call and the same field as [actions.ts:346](src/app/dashboard/sites/actions.ts#L346), so **what the contractor reads on the form is what the model is told during the build.** Two different sources here would eventually disagree on the page — which is the failure mode the ZIP-resolution comment in that file exists to prevent.

Client side, in `WelcomeForm`: fire on exactly 5 digits, debounced 400ms.

### What it may and may not say

Replace the static ZIP hint, on success, with:

> **Detroit, MI.** We'll write your site about Detroit and the towns around it.

**It must not name the neighbouring towns.** Those are invented by the model during the build ([actions.ts:375](src/app/dashboard/sites/actions.ts#L375) asks for twelve). Naming Dearborn and Hamtramck here, then shipping a site that lists different towns, makes the intake a liar about the one thing it was trying to prove. Getting real names would mean the separate model call at [actions.ts:1459](src/app/dashboard/sites/actions.ts#L1459) — too slow for a keystroke, and a second source that can contradict the finished site. The verified city is enough; the rest is phrased as what happens next.

### Failure modes — all silent, none blocking

| Outcome | Behaviour |
|---|---|
| `unconfigured` (no `GOOGLE_MAPS_API_KEY`) | keep today's static hint; no error, no spinner |
| `not-found` | keep the static hint. **Do not** say the ZIP is invalid — Google misses, and the ZIP still submits fine |
| `too-large` | treat as not-found |
| timeout | already bounded at 8s inside `geocodeArea`; treat as not-found |
| in flight | the submit button is never disabled by it |

### Two bugs to write the code against

- **Stale responses.** Typing 48226 then 48227 can resolve out of order and paint Detroit under the second ZIP. Keep a monotonic request id and drop any answer that is not the newest.
- **Re-charging on backspace.** Cache resolved ZIPs in a component-level `Map` so editing back and forth spends one geocode per distinct ZIP.

### What not to do

Do not pass the resolved place into `completeFirstRunAction` to save the generator a lookup. It is client-supplied input on a public endpoint — it would let a caller name their own city and have the site written about it. The server re-resolves; the duplicate call is the cheap half of that trade.

### Files

`src/app/welcome/lookup-actions.ts` (new) · `src/app/welcome/WelcomeForm.tsx` · `src/app/globals.css` (+ regenerate lite)

### Tests

New `test/welcome-zip-echo.test.ts` over a pure helper that maps an `AreaGeocodeResult` to the sentence — all four outcomes, plus the stale-response guard tested at helper level. No network in the suite; `geocodeArea` itself is already covered by [test/area-geocode.test.ts](test/area-geocode.test.ts).

**Effort:** small-to-medium. One day with the race and the cache handled properly.

---

## Item 4 — The preview card

**Goal:** a card beside the fields that assembles as they type, so "we can build your whole website from them" is shown rather than asserted.

### What it renders, and from what

| Element | Source | Notes |
|---|---|---|
| Company name | typed | in the **Forge display face** (Anton) — the face the seeded site will actually use, because new sites are `carbon` → Forge |
| Trade mark | `getTradeGlyph(trade.name)` → `ServiceIcon` | [site-content.ts:2792](src/lib/site-content.ts#L2792); already the fallback logo mark and favicon glyph, so the card shows the real one |
| Trade line | `trade.work` | the lowercase noun the copy uses — "landscaping in…" |
| City line | item 2's resolved place | the only element that is not a mirror of typing |

**Nothing else.** No rating, no review count, no stats, no photos. The seeded site's reviews and stats are AI examples and ship switched **off** ([WebsiteBuilder.tsx:368](src/app/dashboard/sites/WebsiteBuilder.tsx#L368)); a preview card showing 4.9★ would be fabricated data presented as real, which is a pattern this codebase has already been burned by. Label the card **Preview** and keep it to what is true.

### Layout

`WelcomeForm` returns `<div class="welcome-split">` wrapping its existing `<form>` plus a new `<aside>` — the form keeps ownership of all state, so no lifted state or prop plumbing is needed. Grid, two columns at ≥900px, single column below with the card **after** the form (a card above the fields pushes the first input off a phone screen). `page.tsx`'s `.hero-card.auth-card` needs a wider `max-width` when the split is present.

### Behaviour

- Neutral skeleton before any input — field-shaped placeholders, so nothing pops in and reflows the form as they type.
- Each element fades in once, on first value only. Wrap in `@media (prefers-reduced-motion: no-preference)`, matching the convention already in `globals.css`.
- On mobile, render it — but static, not sticky, and never over the keyboard.

### Accessibility

The mirrored name/trade elements get `aria-hidden="true"`: they duplicate content the user just typed, and a live region echoing every keystroke is noise. The city line is different — it is **new information the page discovered** — so it stays announced, via item 2's single `aria-live="polite"` status. One announcement, for the one thing worth announcing.

### Files

`src/app/welcome/WelcomeForm.tsx` (plus a small `WelcomePreviewCard.tsx` beside it) · `src/lib/templates/fonts.ts` (`firstRunFontVars`, see F3) · `src/app/globals.css` (+ regenerate lite) · `test/template-fonts.test.ts` (new surface)

### Tests

Add the card to `SURFACES` in `template-fonts.test.ts`, plus an assertion that `/welcome` uses the **narrow** font vars and not all sixteen. A small render test that the card shows the glyph for a chosen trade, and nothing that looks like a review or a statistic.

**Effort:** medium. One to two days, mostly layout and the two themes.

---

## Item 5 — Fix the reveal

**Goal:** the moment of "here is your website, written about your town" happens in front of the website, not inside a settings form.

### Today

`router.replace('/dashboard/sites?built=1')` → the builder opens with a long success string in its message slot. The payoff is a paragraph on a form.

### Proposal

New server route `src/app/welcome/site/page.tsx`: the contractor's real site, full-bleed, with one bar over it —

> **This is your website.** Written from your business name, your trade and your ZIP. The reviews and stats are AI examples, so they're switched off until you replace them.
> **[ Make it yours → ]** · *Skip to dashboard*

Render exactly as [dashboard/sites/preview/page.tsx](src/app/dashboard/sites/preview/page.tsx) does: `getOrCreateSite` → `getTemplate(site.template)` → `<Template site={withPublicContact(site)} galleryImages={getSiteGallery(site.content)} />`.

**Why a `/welcome` child and not a `/dashboard` route:** the dashboard layout wraps children in shell chrome, and the existing bare preview escapes it only because middleware sets `x-lgq-bare-preview` for that one exact pathname ([middleware.ts:112](src/middleware.ts#L112)). A `/welcome` child route needs none of that. Templates are safe under `globals-lite.css` — the public `/site/[subdomain]` route already runs that way — and each template file carries its own fonts.

### Routing rules — the part that costs money if it is wrong

`WelcomeForm.submit` currently picks: `planCheckoutPath` → `destinationPath` → `/dashboard/sites?built=1`. The reveal replaces **only the last one**, and only when `seeded.built === true`.

- A contractor who chose a paid plan has a `planCheckoutPath`. A reveal that intercepts that is a reveal that intercepts a purchase.
- `goal=feature` / `goal=choose_plan` produce a `destinationPath` — they asked to go somewhere specific ([signup-intent.ts](src/lib/signup-intent.ts), via [welcome/actions.ts](src/app/welcome/actions.ts)).
- Seed failed (`ok: false`, or `built: false`) → straight to the builder with today's error copy. There is nothing to reveal.

### Page rules

- `requireOwnerContext` — but **not** the first-run gate; first run is complete by the time this renders.
- If `siteIsUnwritten(site)` ([site-seed.ts:217](src/lib/site-seed.ts#L217)) → redirect to the builder. Never reveal an empty template.
- Idempotent and re-enterable: refreshing shows the same page and performs no writes. It is never a gate — the skip link always works, and nothing about it can trap someone out of the dashboard.
- **Leave the conversion tracking where it is.** `trackSignupConversion` fires in the form before the redirect; a contractor who closes the tab on the reveal must still count.

### One decision to make

"Publish" is tempting as a second button, but a brand-new site has `subdomain: null` and `published: false`, so publishing needs the web-address step first. Options: one CTA into the builder (recommended for v1), or a secondary "Choose your web address" deep-linking the builder's domain card through the existing `?open=` mechanism.

### Files

`src/app/welcome/site/page.tsx` (new) · `src/app/welcome/WelcomeForm.tsx` (destination logic) · `src/app/globals.css` for the overlay bar (+ regenerate lite)

### Tests

- Guard test: unwritten site → redirects to the builder.
- Source-level test in the `signup-continuity` style: plan checkout and feature destinations still take precedence over the reveal. This is the regression that matters most and the cheapest one to pin.

**Effort:** medium. One to two days including the routing edge cases.

---

## Sequencing

Each ships independently, and each is visible on its own.

1. **F1–F4 foundations** (half a day) — the CSS regeneration step and the narrow font export unblock everything else.
2. **Item 1** — no new data, no network, smallest surface. Ship it first and see whether the auto-fill annoys anyone before building on top of it.
3. **Item 2** — first server round trip; the resolved city it produces is an input to item 4.
4. **Item 4** — needs items 1 and 2 to have anything interesting to show.
5. **Item 5** — independent of the other three; can be built in parallel.

Total: roughly a week, including tests and both-theme checks.

---

## Verification (repo-specific, learned the hard way)

- `npx vitest run test/trade-search-select.test.ts test/welcome-zip-echo.test.ts test/signup-continuity.test.ts test/public-pages-fixes.test.ts test/template-fonts.test.ts test/css-subset.test.ts`
- `node scripts/build-css-subset.mjs` after **every** `globals.css` edit, then re-run `css-subset`.
- `npm run lint` **and** `npm run build`. Typecheck plus green tests have passed on code `next build` rejected. Do not pipe the gate — piping loses its exit code and reports a pass over a failure. Delete `.next/types` before trusting a typecheck verdict.
- `next build` clobbers a running dev server: every page renders unstyled with a "MIME type text/plain" console error and no code change. Do not build while checking the page in a browser.
- Visual check on **port 3010**, in all four themes, light and dark. `/welcome` only renders for an account that has not completed first run — either sign up fresh or clear `terms_accepted_at` on a test account, since `needsFirstRun` redirects everyone else straight out ([welcome/page.tsx:50](src/app/welcome/page.tsx#L50)).
- US English throughout, including code comments — "colour" fails the suite.

---

## Open decisions

1. **Reveal CTA count** — one button into the builder, or add "Choose your web address"? Recommendation: one.
2. **Neighbour towns in the ZIP echo** — recommendation above is no, on truthfulness grounds. Overridable, but it costs a model call per keystroke burst and introduces a second source that can contradict the finished site.
3. **Preview card on mobile** — render below the form, or hide under 900px? Recommendation: render, static.
