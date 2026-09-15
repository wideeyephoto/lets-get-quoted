# Plan: fix the dashboard orientation tour ("90-second tour")

**Date:** 2026-09-08
**Scope:** `DASHBOARD_ORIENTATION_TOUR` — the signed-in coachmark tour. Not the public
`/demo/tour/*` evaluation tour, and not the `/demo/reel/*` marketing reels.
**Status:** proposed, not started.

---

## Root cause

There is no orchestrator. `ProductTourRoot` is a reactive state machine whose most
important input — `pathname` — is owned by the Next router, not by the tour. Each step is
a race between a route transition, a streaming RSC page, and a `document.querySelector`,
and the coachmark is mounted and visible for the whole race.

Everything below is a consequence of that one shape, plus a persistence layer that is
written but never read back.

**Not a cause:** the database. `migrations/20260826120000_product_tours.sql` is applied
(confirmed via `npm run audit:applied`), RLS is on, and both tables exist. Progress is
being written correctly. The defects are all client-side, or in how results are ignored.

---

## Phase 1 — Stop the bleeding

These affect users who are *not* taking the tour, so they ship first and independently of
the architecture decision in Phase 2.

### 1.1 An unfinished tour hijacks navigation `[P0]`

`ProductTourRoot` is mounted in the dashboard **layout**. On mount, stored progress of
`active` sets phase `navigating` (`ProductTourRoot.tsx:55-66`), and the route-sync effect
(`:91-106`) immediately `router.push`es to that step's route. Any hard load of any
dashboard page while a tour is unfinished yanks the user somewhere else. The only exits
are Finish and Dismiss.

**Fix:** resume must be passive. On mount with `status === 'active'`, do not enter
`navigating`. Render a small "Resume tour (step 3 of 6)" pill and push only on click.
Auto-push is acceptable in exactly one case: the user is already on the step's route.

### 1.2 Resume silently dies when the stored step is not allowed `[P1]`

`:59` does `tourSteps.findIndex(s => s.id === progress.current_step_id)`. If the stored
step was filtered out — an office user whose `settings.write` was revoked, or a role
change — `idx` is `-1`, nothing happens, `hasInitializedRef` stays `false`, and the tour
is permanently stuck with no error surfaced anywhere.

**Fix:** fall back to the nearest allowed step at or before the stored index; if none,
step 0. Emit a telemetry event when this happens.

### 1.3 Back does not persist `[P1]`

`handleNext` (`:244-270`) awaits `advanceTourAction`. `handlePrev` (`:272-279`) only sets
local state. Go back twice, reload, and you resume at the furthest-forward step. Progress
is a high-water mark wearing a cursor's clothes.

**Fix:** `handlePrev` awaits `advanceTourAction` with the previous step id.

### 1.4 Every server action result is discarded `[P1]`

All five actions in `src/app/dashboard/tour-actions.ts` return `{ success, error }`.
Every call site (`:256`, `:264`, `:288`, `:301`, `:310`) drops it. A failed write leaves
local state and the database permanently disagreeing, silently.

**Fix:** check the result. On failure keep the local step — do not fight the user — but
emit `tour_exited` with the error in metadata so the divergence is visible.

### 1.5 "Maybe later" does not survive a new tab `[P2]`

`ChecklistTourInvitation` (`ProductTourLauncher.tsx:36-40`) stores dismissal in
`sessionStorage`. New tab, re-offered. Meanwhile `shouldOfferTour` in
`src/lib/product-tour/access.ts:36` implements the entire offer decision — audience,
dismissed/completed, at least two accessible steps — and **nothing calls it**.
`tour_offered` is a declared event type that is never emitted.

**Fix:** call `shouldOfferTour` server-side in the dashboard layout, pass an `offer`
boolean to the launcher, and persist "Maybe later" via `dismissTourAction`. Emit
`tour_offered` when the banner actually renders.

### 1.6 Duplicate anchor `[P2]`

`data-tour-id="dashboard:needs-attention"` is declared in both
`DashboardHomeScreen.tsx:149` and `dashboard/home/PriorityQueue.tsx:31`. `PriorityQueue`
is currently imported nowhere, so `querySelector` cannot pick the wrong one today — but
the day it is mounted the spotlight lands on the wrong panel with no error.

**Fix:** delete `PriorityQueue.tsx` (dead) or strip its `data-tour-id`. Add the uniqueness
invariant test in Phase 5.

---

## Phase 2 — Build the orchestrator

This is the flicker, the jump, and the stale rect. All of it is one missing abstraction.

### 2.1 The card renders while it is lost `[P0]`

`:331` returns `null` only for `idle` and `paused-by-modal`. So the coachmark renders
during `navigating` and `locating-target` with `targetRect === null`, which
`ProductTourCoachmark.tsx:179-188` styles as **centered in the viewport with a full-screen
backdrop**. Every step plays: centered modal → page swaps underneath → card teleports to
an anchored corner and a spotlight appears.

**Fix:** make the visual modes explicit and never accidental.

- `anchored` — spotlight, masks, positioned card. Requires a measured rect.
- `unanchored` — deliberate centered card. Only for a genuinely target-less step or a
  confirmed `target-unavailable` fallback.
- `settling` — a small, low-chrome "Loading <step title>…" chip. Not a full backdrop, not
  a centered modal. This is what shows during navigate + measure.

Root must never hand the anchored component a null rect.

### 2.2 The card is positioned against a guessed height `[P0]`

`cardHeight` initialises to `240` (`ProductTourCoachmark.tsx:31`) and is used in the
top/bottom flip math at `:150-161`. It is corrected in a `useEffect` *after* paint
(`:46-53`), which triggers a re-render at a different position. Every step therefore has
a two-frame position jump, independent of everything else on this list.

**Fix:** measure in `useLayoutEffect` before paint, or render the card invisible for one
frame, measure, then reveal. Drop the `cardHeight` self-dependency in the effect deps.

### 2.3 3.5 seconds of `requestAnimationFrame` polling on a miss `[P1]`

`:170-206` polls `document.querySelector` every frame for up to 3500ms — roughly 210
queries — before giving up.

**Fix:** `MutationObserver` scoped to the page container (not `document.body`), resolving
the first time the node appears, with the same 3500ms deadline as a hard cap. Zero polling
in the common case where the node is already present.

### 2.4 The scroll settle is a race `[P1]`

`:146-166` fires `scrollIntoView({ behavior: 'smooth' })` then measures on `scrollend`
**listened for on `window`**, with a 400–500ms timer fallback. If the app shell scrolls an
inner container rather than the document, `scrollend` never arrives and the timer measures
mid-animation. Smooth scroll over a long dashboard page routinely exceeds 500ms.

**Fix:** resolve the actual scrolling ancestor from the element and listen there. Prefer
an `IntersectionObserver` settle — target stable in the viewport for two consecutive
frames — over any timer. Keep a hard cap so a never-settling page cannot hang the step.

### 2.5 The rect is measured once against a page that is still arriving `[P0]`

`targetRect` is a `DOMRect` captured at one instant. The only correctors are `resize` and
`scroll` listeners (`:80-88`). Nothing observes the element. When streamed RSC data lands
and grows the content above the target, the spotlight stays on stale coordinates until the
user happens to scroll.

**Fix:** `ResizeObserver` on the located element plus a `MutationObserver` on its subtree,
both re-running `updateTargetRect`, throttled to one measurement per animation frame.

### 2.6 The modal observer is unscoped and half-armed `[P1]`

`:219-241` observes `document.body` with `subtree: true, childList: true` and runs two
`querySelector`s on **every mutation**, during a tour over live streaming dashboard pages.
It also early-returns for `navigating` and `locating-target`, so a modal opening during
navigation is never detected.

**Fix:** debounce through `requestAnimationFrame`, scope the observer, and arm it for all
non-idle phases.

### 2.7 Pause means vanish `[P2]`

`paused-by-modal` returns `null` at `:331`. The tour disappears completely with no trace
and silently reappears when the modal closes.

**Fix:** keep a minimal "Tour paused — close this dialog to continue" chip.

### 2.8 Late measurements can paint over the wrong step `[P1]`

The `locating-target` effect uses a `cancelled` flag, which covers unmount but not the
case where a slow measurement for step N resolves after the user has advanced to N+1.

**Fix:** a monotonic generation counter. Every `setTargetRect` / `setPhase` reached from
an async path checks its generation against the current one before writing.

### 2.9 `isMobile` is computed once during render `[P2]`

`ProductTourCoachmark.tsx:110` reads `window.innerWidth < 640` inline with no resize
listener. Rotate the device mid-tour and the layout mode never updates.

**Fix:** `matchMedia` with a change listener.

---

## Phase 3 — Make "90 seconds" true, or stop saying it

### 3.1 The number is a typed-in constant `[P1]`

`estimatedMinutes: 1.5` (`catalog.ts:65`) is the only place 90 seconds exists. Nothing
paces or measures the tour. The steps sit on six different heavy routes — `/dashboard`,
`/leads`, `/jobs`, `/schedule`, `/sites`, `/automations` — each a full RSC navigation on
top of the ~830ms auth floor. Most of the wall clock is navigation.

**Fix:** `router.prefetch(nextStep.route)` the moment the current step reaches
`showing-step`. Single highest-leverage change for perceived duration.

### 3.2 The copy over-promises for office users `[P1]`

Step 1 is `ownerOnly`; `sites` and `automations` require `settings.write`. An office user
without it gets 3 of 6 steps, while `ProductTourLauncher.tsx:48` still promises a
"90-second orientation tour" of "leads, jobs, scheduling, website builder and automations"
— two of the five named surfaces are filtered out of their tour.

**Fix:** derive both the duration and the surface list from the user's filtered step list;
thread `allowedStepIds` down to the launcher. "90-second" is hardcoded in three places
(`:48`, `:59`, `:87`) — replace all three with the derived value, or drop the number and
say "quick tour".

### 3.3 Decision required: six routes, or one?

Anchoring all six steps on `/dashboard` against the sidebar items —
`data-tour-id="nav:${href}"` already exists at `app-shell.tsx:963` — makes 90 seconds
trivially honest and removes route-transition dead time entirely. **But it changes the
product:** it becomes a tour of the navigation rather than a tour of the work.

**Recommendation:** keep six routes and fix the orchestration (3.1). Revisit only if
measured time-to-anchor after prefetch still exceeds ~2s per step.

---

## Phase 4 — Telemetry that can prove any of this

### 4.1 The tour's own alarm is unattributable `[P1]`

`ProductTourRoot.tsx:187-202` beacons `step_target_missing` to `/api/demo-tour/events`.
That route is unauthenticated, uses `createAdminClient()`, and `sanitizeTourEventPayload`
(`src/lib/product-tour/events.ts`) **does not carry `account_id` or `user_id` at all** —
the route hardcodes `source: 'demo_public'`. So the one signal that tells you the
signed-in tour is broken lands with no workspace, no user, and a label claiming it came
from the public demo.

**Fix:** route signed-in tour events through a server action. `tour-actions.ts` already
attaches `accountId`, `userId` and `role` correctly for its own events — add a
`recordTourEventAction` and call it from `ProductTourRoot`.

### 4.2 Nothing measures time-to-anchor `[P1]`

**Fix:** emit `step_viewed` with `metadata.anchor_ms` (navigate-start → `showing-step`)
and `metadata.settle_path` (`immediate` | `scrolled` | `fallback`). This turns "is it 90
seconds?" from an argument into a query. Both keys are safe against the
`FORBIDDEN_METADATA_KEYS` list in `events.ts`.

---

## Phase 5 — Tests that bite

The existing suite is `readFileSync` + `toContain` source-text assertions
(`test/product-tour-integration.test.ts`, 98 lines; `test/product-tour-domain.test.ts`,
190 lines). **Every defect in this document passes that suite today.** It asserts that
strings exist in files, not that anything behaves.

New tests, in `test/product-tour-orchestration.test.ts`:

1. **No hijack.** Render `ProductTourRoot` with `initialProgress.status === 'active'` and
   a mocked router; assert `router.push` is not called on mount. *(fails today)*
2. **Never anchored without a rect.** Assert the spotlight/mask elements are absent
   whenever `targetRect` is null. *(fails today)*
3. **Prev persists.** Assert `handlePrev` calls `advanceTourAction`. *(fails today)*
4. **Resume degrades.** `current_step_id` not in `allowedStepIds` resumes at a valid step
   rather than doing nothing. *(fails today)*
5. **Anchor uniqueness.** For every `targetId` in the catalog, exactly one
   `data-tour-id="<id>"` declaration across `src/`. *(fails today — see 1.6)*
6. **Copy matches reality.** The duration and surface list rendered by the launcher are
   derived from the filtered step list, not literals. *(fails today)*
7. **Card measured before positioned.** No position change between first and second paint
   for a fixed target rect. *(fails today)*

Write 1–7 as failing tests **first**, then fix. That is the only way to know Phase 2
landed rather than moved the flicker somewhere else.

---

## Sequencing

| Phase | Ships | Independent? | Risk |
|---|---|---|---|
| 5 (tests 1,3,4,5) | first, red | yes | none — no production code |
| 1 | next | yes | low; touches resume + persistence only |
| 2 | after 1 | needs 1.1 | medium — the rewrite; rehearse behind the existing flag |
| 3.1 | with 2 | needs 2 | low |
| 3.2 | any time | yes | low — copy + prop threading |
| 4 | any time | yes | low — additive |
| 3.3 | decide after 4 measures | — | product decision, not a fix |

The tour already has a server-side kill switch: `LGQ_DASHBOARD_ORIENTATION_ENABLED`
(`src/app/dashboard/layout.tsx:61-62`), which defaults to **on** when unset. Phase 2 can
be rehearsed with it off in Production. Note that Vercel env is baked at build, so
flipping it requires a redeploy.

## Out of scope

- The public `/demo/tour/*` evaluation tour (`PUBLIC_DEMO_TOUR`, `estimatedMinutes: 5`).
  It shares `catalog.ts`, `access.ts` and the events route, so Phase 4 touches it — but its
  steps are full pages, not coachmarks, and it has none of the anchoring problems.
- The `/demo/reel/*` marketing reels. `FlagshipProductTourReel` has its own separate
  defects — a `typedText` state that is never written, so scene 0 shows an empty input with
  a blinking cursor; a 50s runtime; an infinite loop with no end card; nothing links to it.
  Tracked separately.

## Verification before declaring done

`npm run typecheck`, `npm run test`, `npm run lint`, `npm run build` — each run separately,
not piped, so exit codes survive. Delete `.next/types` before trusting a typecheck verdict.
Manual pass: run the tour end to end as an owner and as an office user without
`settings.write`, on a workspace with real data, and read the emitted `anchor_ms` values
back out of `product_tour_events`.
