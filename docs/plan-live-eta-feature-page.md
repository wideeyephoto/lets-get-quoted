# Plan — give CLM-012 its own page: `/features/live-eta`

**Status:** proposed, not started
**Written:** 2026-09-07
**Claim:** CLM-012 — *"Live technician ETA sharing — Give customers an expiring map link, updated arrival window, and delay notices."*

---

## 1. Why this page, and why now

CLM-012 is the only entry in `docs/ftc-substantiation-register.md` whose evidence column
names **two dedicated test files** (`test/arrival.test.ts`, 487 lines;
`test/live-technician-eta-sharing.test.ts`, 222 lines). Nothing else in the register is
proven that hard.

It is also the only rail in the product with a **homeowner-facing artifact**: `/track/[token]`
is a real, public, no-login page that a stranger opens on their phone. Every other feature
page has to draw a picture of a dashboard. This one can show the thing the customer
actually receives.

And it currently sells itself in **one FAQ answer, 96 words, on a page about payroll**
(`src/app/features/crew/page.tsx` lines 203-207) — inside `/features/crew`, a 331-line page
whose headline is *"Your crew gets the job. You get the real margin."* The word "margin"
appears nine times on that page. A homeowner-facing trust feature is buried in a page
arguing about labor cost.

The whole rail exists and runs. What is missing is a place to point at it.

---

## 2. The rail as it actually is (verified against code, 2026-09-07)

This is the evidence chain the page is allowed to draw on. Every link was read, not assumed.

| Stage | Where | What actually happens |
|---|---|---|
| Tech taps "on my way" | `src/lib/arrival-send.ts:113` `sendArrival` | Checks crew permission, account master switch, and `duplicateVerdict` double-tap protection before anything is sent. |
| Link is minted | `src/lib/job-tracking.ts` `newTrackingToken` | 24 random bytes to a 48-char hex token. **Only the SHA-256 is stored.** The raw token is unrecoverable server-side — which is why an update text carries no link (`arrival-send.ts:167-171`). |
| Window, not a minute | `src/lib/arrival.ts:265` `arrivalWindowTimes` | `ARRIVAL_MODE` is hard-fixed to `'window'`. A zero-width window was allowed once and removed on purpose (`arrival.ts:44-49`). Widths snap to 30/45/60/90. |
| Text goes out | `buildArrivalMessage` + `DEFAULT_ARRIVAL_TEMPLATE` | Owner's wording governs the first message; the tech edits words, never the link and never the promise. `Reply STOP to opt out.` appended (`arrival-send.ts:358`). |
| Pin moves | `src/components/arrival-tracker.tsx:62-91` | `watchPosition`, **foreground only** — backgrounding the app calls `clearWatch`. Throttled on both elapsed time and distance moved. |
| Position is blurred | `applyPrecision(point, 'street')` | `MAP_PRECISION` is hard-fixed to `'street'`; coordinates round to 3 dp (~100 m). Answers "are they close", not "are they outside number 42". |
| ETA recalculates | `src/lib/job-tracking.ts:299-330` `updateTechPosition` | Calls `calculateLiveEtaWithFallback` with `departure_time=now`, `traffic_model=best_guess` against Google Distance Matrix, then `recalculateLiveArrivalTimes`. Flips `en_route` to `delayed` when the new start passes the promised end + 2 min grace. |
| Traffic, honestly | `src/lib/drive-time.ts:203-233` | Returns `isTrafficAware: true` **only** when the Distance Matrix call answered. Otherwise it is a haversine at 28 mph and `isTrafficAware: false`. |
| Homeowner page | `src/app/track/[token]/page.tsx` | `robots: noindex, nofollow`. Carries the **contractor's** logo and accent color. Auto-refreshes every 30 s and **stops refreshing once the visit is closed** — "a page burning a stranger's battery". |
| Sharing ends | `locationVisible` + `LOCATION_SHARE_MINUTES = 90` | Drops on `arrived`/`done`/`cancelled`/`rescheduled`/`no_access`, with a 90-minute backstop for the trip nobody closed. |
| Link expires | `TRACKING_LINK_HOURS = 4` | Fixed. An expired link renders "This visit link has expired" and nothing else. |
| Delay notice | `/api/cron/arrival-late`, `*/15 * * * *` (`vercel.json:44`) | `runLateArrivalSweep` to `DEFAULT_DELAY_TEMPLATE`, which carries an apology and **no link**. |
| Geofence prompt | `ARRIVAL_GEOFENCE_METERS = 150` | Prompts the tech to mark arrived; marking arrived kills the share. |
| Homeowner can reply | `HOMEOWNER_REPLIES` + `homeownerReplyAction` | Tap-to-reply buttons; no account, no typing. |
| It is measured | `src/lib/arrival-analytics.ts` | `openRate`, `onTimeRate`, `etaBias`, `medianLateness`, `falloverRate`, per crew member. `recordTrackingView` is deliberately not fired by a reply tap. |
| Drive time can bill | `src/lib/arrival-clock.ts` | Opt-in per account (`arrival_clock_travel`): "on my way" to "arrived" opens and closes a `Travel` labor shift that lands in job margin. |

**Bottom line:** the claim is real and the page can be written entirely from code.

---

## 3. Two accuracy defects found while verifying — fix before shipping the page

Both are pre-existing. Neither blocks the page, but the page must not repeat them, and
shipping a page that points a spotlight at the rail is the right moment to close them.

### 3.1 `calculateLiveArrivalEta` fabricates the word "traffic", and has no production caller

`src/lib/client-rescheduling.ts:165-225` computes a haversine distance at a fixed speed and
then emits the headline `Running ~N mins behind due to traffic`. There is no traffic input
anywhere in that function. Grep confirms **zero production consumers** — the only importers
are `test/client-rescheduling.test.ts` and `test/live-technician-eta-sharing.test.ts:146`.

So the CLM-012 test file's "traffic" assertion proves a string in dead code, while the
*live* traffic path (`updateTechPosition` to Distance Matrix) is proven by nothing.

**Action:** either delete `calculateLiveArrivalEta` and re-point the test at the live path,
or strip "due to traffic" from its headline. Deleting is cleaner; it is dead.

### 3.2 `isTrafficAware` is computed and thrown away

`calculateLiveEtaWithFallback` returns `isTrafficAware`, and `job-tracking.ts:307-325` reads
`.minutes` and discards the flag. So a haversine fallback and a real traffic-routed ETA are
indistinguishable once stored, and nothing can ever report which one a customer was shown.

**Action:** persist it (`job_tracking.eta_traffic_aware boolean`) — a one-column additive
migration — or, if a migration is not wanted, state the qualification in copy and stop
saying "traffic-aware" unqualified. The catalog subBullet in
`src/lib/all-features-catalog.ts:795` currently says "Dynamically recalculates arrival
windows with traffic awareness" with no qualification.

**Copy rule for the new page either way:** never say "traffic-aware" as a flat property.
Say what is true — *"the ETA re-routes against live traffic; when the routing service
doesn't answer, it falls back to a straight-line estimate rather than freezing."* That
sentence is both more honest and a better sales line, because it says the feature does not
break.

---

## 4. Decisions

| Decision | Choice | Why |
|---|---|---|
| **Route** | `/features/live-eta` | The internal name is "arrival" (`arrival.ts`, `/api/cron/arrival-late`), but the buyer searches for "ETA" and "technician tracking". `/features/arrival` reads like a settings screen. No redirect needed — new route, no history. |
| **Shell** | `SuiteFeaturePage` | Same shell as the other suite pages. It reads the capability list out of `lib/features.ts` rather than restating it, which is the rule this codebase already enforces in `test/suite-feature-pages.test.ts`. |
| **`catalog` prop** | `['jobs']` | Must name an existing `FEATURE_CATEGORIES` slug or `CapabilitySection` **throws at render** (`suite-feature-page.tsx:110`). |
| **New feature category?** | **No** | Adding one breaks `test/suite-feature-pages.test.ts:465`, which pins the exact list of uncovered categories to `['clients','getting-found','leads','website']`. Add a *feature entry* to the existing `jobs` category instead. |
| **Homepage suite card?** | **No** | `SUITE` in `test/suite-feature-pages.test.ts:28-35` is exactly seven and the test asserts the homepage cards "are exactly these seven, in order". This is a **13th feature detail page**, not an 8th suite card. Reachable from `/features`, the sitemap, and a cross-link on `/features/crew`. |
| **The demo** | Self-contained client component, **driven by the real `@/lib/arrival` pure functions** | See section 5. This is the differentiator and the reason the page is worth building. |
| **A real Google Map?** | **No** | `PinMap` bills per map load and a marketing page takes crawler and bot traffic. An inline SVG street illustration costs nothing, survives a missing API key, and dodges the Map-ID/CSP trap entirely. Label it as an illustration. |
| **`/demo/live-eta` route?** | **No** | `/track/[token]` needs a real `job_tracking` row and its own token; the demo fixture client would have to answer a whole new builder (`test/demo-pages.test.ts` enforces that). The on-page component *is* the demo, and it is faster than a route change. The `primary` CTA points at the on-page anchor. |
| **Migration** | None required for the page | Only 3.2 would add a column, and only if that fix is taken. |

---

## 5. The demo — what makes this page different from the other twelve

**Every existing marketing sandbox is hand-written fiction.** `LiveSmsSandbox`,
`AiIntakeSandbox`, `InteractiveQuoteUpsellDemo` — none of them imports a single product
module. They hardcode their outputs.

`src/lib/arrival.ts` is explicitly written to be pure and shared: *"Everything here is pure
so it can be tested without a database and reused on both sides of the wire: the field app
renders the preview from these functions and the server re-derives the message from the
same ones."*

So build `src/components/marketing/LiveEtaDemo.tsx` as a client component that imports and
calls:

- `arrivalWindowTimes(now, eta, settings)` — the promise
- `formatArrivalWindow(times, tz)` — exactly what the customer reads
- `recalculateLiveArrivalTimes(now, newEta, settings, originalEnd)` — the delay detection, including the 2-minute grace
- `minutesLate(times, now)` — how late, in whole minutes
- `buildArrivalMessage({ template: DEFAULT_ARRIVAL_TEMPLATE | DEFAULT_DELAY_TEMPLATE, ... })` — the literal SMS text
- `applyPrecision({lat,lng}, 'street')` — showing the raw coordinate next to the blurred one
- `locationVisible(row, now)` — the share dying on `arrived`
- `LOCATION_SHARE_MINUTES`, `TRACKING_LINK_HOURS`, `ARRIVAL_GEOFENCE_METERS`, `ARRIVAL_WINDOW_CHOICES` — as displayed constants, never retyped

**The interaction, five seconds end to end.** Three buttons over one static scene:

1. **"On my way, 15 minutes"** — the SMS bubble renders from `buildArrivalMessage`, and the
   mock homeowner page shows the window `formatArrivalWindow` returns.
2. **"Hit traffic"** — `recalculateLiveArrivalTimes(now + 10min, 40, ..., originalEnd)` fires;
   the window moves, the status pill flips to *delayed*, and the delay SMS renders from
   `DEFAULT_DELAY_TEMPLATE` — visibly **carrying no link**, which is the detail worth
   showing.
3. **"Arrived"** — `locationVisible` returns false, the pin vanishes, the auto-refresh
   stops, and the link is dead.

A privacy strip underneath shows `40.7128456, -74.0059731` becoming `40.713, -74.006`,
computed by the real `applyPrecision`, with the caption naming the ~100 m rounding.

**Why this matters:** the demo cannot drift from the product, because if `arrival.ts` changes
the marketing page changes with it. That is the same rule `SuiteFeaturePage` already applies
to the capability list, extended to the demo itself. It is also a claim the page can make
out loud — *"the numbers on this page were computed by the code that runs the feature"* —
and it is true.

**Constraints:** must run with `Date` seeded from a fixed base (no `Date.now()` drift
between server render and hydration, so no hydration mismatch); reduced-motion respected;
no network calls; keyboard reachable; both themes.

---

## 6. Copy skeleton

Written for the homeowner's experience, because that is what the contractor is buying.
The `/features/crew` page keeps the margin argument; this one takes the trust argument.

- **Eyebrow:** `Live ETA sharing`
- **Title:** *"Your customer stops wondering where you are."*
- **Lede:** One text, one link, one page that updates itself. They see a window, a first
  name, and an approximate pin that stops the moment you arrive.
- **heroNote:** *The link expires in four hours and the location stops when the visit
  ends — 90 minutes at the outside if nobody taps Arrived. This is a delivery-style
  tracker for one journey, not a record of anybody's day.*
- **primary:** `See it run` pointing at `#live-eta-demo` (on-page anchor)

**Proof strip (four, each read out of code):**

1. *A window, never a minute* — 30/45/60/90; a zero-width window was removed on purpose.
2. *An approximate pin* — rounded to ~100 m, street level, always.
3. *A link that dies* — four hours, or the moment the visit closes.
4. *An apology that sends itself* — checked every 15 minutes.

**Story:** *"'They'll be there between 8 and 12' is why people hate booking trades."*
The cost of a vague window is not the customer's afternoon; it is the three calls to your
office asking where the van is, and the review that mentions waiting.

**Benefits (three):**

- **The text your customer actually wanted.** Their name, your business name, your crew
  member's first name, one link.
- **It updates itself, including the bad news.** The window recalculates against live
  traffic; when routing doesn't answer it falls back to a straight-line estimate rather
  than freezing. Running past the promise sends the apology without anyone remembering to.
- **Nobody is being tracked.** Foreground only, per trip, opt-in per crew member, rounded,
  expiring. The switch that turns it off is a real switch, enforced at send time and not by
  hiding a button.

**Steps (four):** Tap. They get a text. The page keeps itself current. Arrived, and it all
switches off.

**FAQ (eight; every answer already verified in section 2):**

1. Does my crew get tracked all day? — No. Foreground only; backgrounding stops the watch.
2. How exact is the pin? — ~100 m, always, not configurable.
3. How long does the link live? — 4 hours, and it dies at `arrived`/`done`/`cancelled`.
4. What if they never tap Arrived? — 90-minute backstop.
5. Can a crew member be blocked from sharing location? — Yes, per person; the employer's
   policy and the person's permission must **both** allow it.
6. Does the customer need an app or an account? — No. One page, no login, `noindex`.
7. Does it say my company or yours? — Yours: your logo, your accent color, your name.
8. Does it cost extra? — `FEATURE_PRICING_NOTE`; the texts draw on the plan's SMS
   allowance like every other message. *(Verify against `src/lib/pricing.ts` before
   writing this one.)*

**Cross-links:** `/features/crew` (the field app), `/features/dispatch` (morning routing),
`/features/scheduling` (how the window got promised).

**Reverse link:** `/features/crew`'s "Does it track where my crew are?" answer gains
*"Live ETA sharing has its own page."* This is what unburies the claim.

---

## 7. File-by-file change list

**New**

1. `src/app/features/live-eta/page.tsx` — the page.
2. `src/components/marketing/LiveEtaDemo.tsx` — the client demo (section 5).
3. `src/components/marketing/live-eta-demo.module.css` — its styles, both themes.
4. `public/features/og-live-eta.jpg` — generated, 1200x630, under 1 MB.
5. `test/live-eta-feature-page.test.ts` — the substantiation gate (section 8.2).

**Edited**

6. `src/app/sitemap.ts` — add `'live-eta'` to `FEATURE_SLUGS`; bump `MARKETING_REVISED`.
7. `scripts/build-feature-og.mjs` — add a `CARDS` entry with `slug: 'live-eta'` (the test greps for that literal).
8. `src/lib/features.ts` — add to the `jobs` category:
   `{ id: 'live-eta', name: 'Live ETA sharing', desc: 'An expiring map link, a live arrival window, and an automatic delay notice.' }`
   Raises `FEATURE_COUNT` — verified safe, no test pins the number.
9. `test/feature-social-cards.test.ts` — add `'live-eta'` to `SLUGS`.
10. `src/app/features/crew/page.tsx` — cross-link from the location FAQ answer.
11. `src/app/features/page.tsx` / `FeaturesCatalogExplorer.tsx` — surface the new route where the other twelve are surfaced.
12. `docs/ftc-substantiation-register.md` — CLM-012 Surface column gains `/features/live-eta`.
13. `LAUNCH_PAGE_INVENTORY.md` and `LAUNCH_CHECKLIST.md` — a row, per `npm run audit:pages`.
14. `src/lib/all-features-catalog.ts` — qualify the traffic subBullet (section 3.2).
15. `src/lib/client-rescheduling.ts` and `test/live-technician-eta-sharing.test.ts` — section 3.1.

**Not touched, verified:** `src/lib/marketing-chrome.ts` — `/features` claims its whole
subtree via `isOwnChromeRoute`, so the new page gets the site header and footer for free
(`marketing-chrome.ts:62-68`).

---

## 8. Gates

### 8.1 Existing gates the page must pass

`test/feature-social-cards.test.ts` is the strict one. Once `'live-eta'` is in `SLUGS` the
page must satisfy, exactly:

- `canonical: 'https://letsgetquoted.com/features/live-eta'` **and** `url: '.../live-eta'`
- `card: 'summary_large_image'`
- `/features/og-live-eta.jpg`, with `width: 1200` and `height: 630` in the metadata
- `public/features/og-live-eta.jpg` **exists on disk** and is **under 1,000,000 bytes**
- no `/template-previews/` anywhere in the metadata block
- **at least 3** `title: '...'` strings (page, og, twitter), each **over 8 chars**
- **at least 3** quoted strings of **60+ chars** ending `',` (the descriptions)
- the page `title:` must **not** contain the brand — the root layout appends it
- `scripts/build-feature-og.mjs` must contain the literal `slug: 'live-eta'`
- the `CARDS` block must not match the banned claim patterns (counts of contractors/users, "trusted by", "award-winning", star ratings)

Also:

- `test/suite-feature-pages.test.ts` — `catalog: ['jobs']` must name a real category; do **not** add a category (line 465 pins the uncovered list); do **not** touch the seven homepage cards.
- `test/marketing-us-english.test.ts` — scans the **whole app including code comments**. No "colour", "customise", "prioritise", "behaviour", "centre", "favourite", "enquiry", "instalment". Note `arrival.ts` already contains "honoured" in a comment — check whether that file is in scope before importing it somewhere new.
- `test/claims-substantiation.test.ts` — recursive scan of `src/` for prohibited claim shapes.
- `test/marketing-seo.test.ts` — title and description length budgets.
- `test/marketing-chrome.test.ts` — no `layout.tsx` needed; adding one would be the bug.
- `test/client-server-boundary.test.ts` — `LiveEtaDemo` is `'use client'` and `arrival.ts` must stay free of server-only imports. Verify this explicitly; it is the one way the demo idea can fail.

### 8.2 The new gate — `test/live-eta-feature-page.test.ts`

This is what makes the page worth the register entry rather than just another marketing
page. It asserts the page's claims **against the code**, not against itself:

1. Every duration the page states matches its constant: 4 h from `TRACKING_LINK_HOURS`, 90 min from `LOCATION_SHARE_MINUTES`, 150 m from `ARRIVAL_GEOFENCE_METERS`, the window widths from `ARRIVAL_WINDOW_CHOICES`.
2. The demo component **imports from `@/lib/arrival`** and does not hardcode a window label, an SMS body, or a rounded coordinate. (Grep the source for those literal strings — if any appear as literals, the demo has drifted into fiction.)
3. The page never says "traffic-aware" without the fallback qualification.
4. The page never claims background tracking, all-day location, or an exact address pin.
5. Every `/features/...` and `/track` href on the page resolves to a route on disk.
6. `/features/live-eta` appears in the CLM-012 Surface column of the register.
7. The `/features/crew` FAQ answer links here — so the burial cannot silently come back.

---

## 9. Sequence

Each phase ends green before the next starts. Phases 1 and 2 are independently shippable.

| # | Phase | Deliverable | Verify |
|---|---|---|---|
| **0** | Close the two accuracy defects (section 3) | `calculateLiveArrivalEta` deleted or de-"traffic"-ed; catalog subBullet qualified; `isTrafficAware` persisted **or** explicitly deferred with a note | `npm run typecheck` and `vitest run test/live-technician-eta-sharing.test.ts test/client-rescheduling.test.ts test/arrival.test.ts` |
| **1** | The demo component | `LiveEtaDemo.tsx` and CSS, computing every displayed value from `@/lib/arrival` | Renders in both themes; no hydration warning; `test/client-server-boundary.test.ts` |
| **2** | The page | `page.tsx` with full metadata; `jobs` category entry; sitemap; crew cross-link | `vitest run test/suite-feature-pages.test.ts test/features-index.test.ts` |
| **3** | The social card | `CARDS` entry, run `node scripts/build-feature-og.mjs`, commit the JPG | `vitest run test/feature-social-cards.test.ts` — all ten assertions |
| **4** | The substantiation gate | `test/live-eta-feature-page.test.ts`; register and inventory rows | `vitest run test/live-eta-feature-page.test.ts test/claims-substantiation.test.ts` |
| **5** | Full gates | — | `npm run typecheck`, `npm run test`, **`npm run lint`**, **`npm run build`** — all four, **unpiped** |
| **6** | Visual check | Page at 390x844 and desktop, both themes; the three demo buttons | Dev server on **port 3010**. Do not run `next build` against a live dev server. |

---

## 10. Risks

| Risk | Handling |
|---|---|
| **`arrival.ts` turns out to import something server-only**, killing the demo idea | Check first, before writing the component. If it does, extract the pure subset into `arrival-pure.ts` and have both sides import that — do **not** fork the constants. |
| **Hydration mismatch** from `new Date()` in a demo about time | Seed from a fixed base date in state, advance only on click. Never call `Date.now()` during render. |
| `next build` clobbers a running dev server | Known. Stop the dev server first; if pages render unstyled afterward, that is the symptom, not a code change. |
| CRLF breaks a multi-line test assertion | Every `read()` in this repo's tests does `.replace(/\r\n/g,'\n')`. The new test must too. Fix the read site, never the assertion. |
| `.next/types` staleness makes typecheck lie | Delete `.next/types` before trusting a typecheck verdict. |
| Another agent is editing this tree | Test HEAD in a detached worktree rather than disturbing the working tree. |
| **A page pointing a spotlight at a rail nobody has run in production** | Before launch, check whether any real `job_tracking` row has ever reached `arrived` with `share_location` true. If the answer is zero, the page is still accurate — the code runs — but say so internally rather than discovering it from a customer. |

---

## 11. Explicitly out of scope

- A `/demo/live-eta` route or a demo `job_tracking` fixture.
- Any change to `/track/[token]` itself.
- A real embedded Google Map on a marketing page.
- Promoting this to an 8th homepage suite card.
- A new `FEATURE_CATEGORIES` entry.
- Anything about the crew time clock, payroll, or job margin — that stays on `/features/crew`.
