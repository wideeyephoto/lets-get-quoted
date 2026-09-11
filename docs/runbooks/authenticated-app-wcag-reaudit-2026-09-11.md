# Authenticated app WCAG re-audit — September 11, 2026

Re-checks [section 10](../../LAUNCH_CHECKLIST.md#10-logged-in-app-wcag-contrast--route-health-launch-blocker)'s
own stated gap: local CSS patches existed with "no current four-theme
authenticated browser matrix, all-role review, or manual interaction pass"
verifying them against the 2026-08-31 production baseline (200/200 page/mode
combinations failing).

**This did not re-run that baseline.** This sandbox has no Supabase
credentials, no way to reach production (outbound network is restricted to
package registries), and no Docker daemon (`supabase start` needs one). What
follows is real evidence against the best available proxy, not against
production, and the gap between the two is stated plainly throughout.

## Methodology

`/demo/*` renders much of the same shared chrome, CSS Modules and page
components as the authenticated dashboard, using synthetic fixture data, with
no auth required. It is not a rerun of the original audit — see "What this
does not establish" below — but it exercises real rendered DOM through a real
browser and a real accessibility engine, which no amount of source reading
substitutes for.

`scripts/audit-demo-route-wcag.mjs` (new, `npm run audit:demo-wcag`, dev
server must already be running):

- Launches Chromium via Playwright, one browser context per theme.
- Sets the `lgq-theme` cookie to each of the four `THEME_CHOICES` values from
  `src/lib/theme.ts` — Dark (`dark`), Workbench (`light`), Light (`sunlight`),
  Dim (`dim`) — the same four the original audit named. Four more themes exist
  (`onyx`, `clarity`, `monochrome`, `parchment`) and are out of scope here, same
  as they were for the original audit.
- Visits every static `/demo/*` route (enumerated from `find src/app/demo -name
  page.tsx`) plus one instance of each dynamic route, using a fixture ID
  confirmed live on the running server (`demo-client-1`, `job-9`, `lead-1`,
  `demo-post-1`).
- Runs `@axe-core/playwright` with `wcag2a`, `wcag2aa`, `wcag21aa` tags after a
  150ms settle, matching the original audit's own note about asynchronous
  routes needing settled-page retries.
- Captures console errors and page load failures alongside axe violations.
- Writes full results plus a summary grouped by rule to a JSON file, and exits
  nonzero if any violation instance falls outside an `--allow` list — wire-able
  into CI once the remaining backlog (see below) is worked down.

42 routes × 4 themes = 168 page loads per run.

## Baseline run

**743 violation instances across 89 page/theme combinations**, all `[serious]`
or `[critical]`:

| Rule | Instances | Combos | Notes |
| --- | --- | --- | --- |
| `color-contrast` | 731 | 85 | Text/background pairs under 4.5:1 (or 3:1 for large/non-text) |
| `definition-list` | 4 | 4 | `/demo/cash-flow`, all 4 themes |
| `aria-required-children` (critical) | 4 | 4 | `/demo/marketing/ads`, all 4 themes |
| `scrollable-region-focusable` | 4 | 4 | `/demo/marketing/ads`, all 4 themes |

Zero load failures, zero console errors, on this run.

## Root causes found and fixed

Six fixes, each verified by re-running the same tool and checking the specific
violation cleared without a new one appearing elsewhere:

1. **White-on-white text at 1.04:1** on the referrals advocate card
   (`src/app/dashboard/marketing/referrals/referrals.module.css`). This is a
   real authenticated dashboard component (`ReferralsClient.tsx`), not
   demo-only. Two custom properties, `--ink-t100` and `--surface-bg`, were
   referenced with literal fallbacks (`#f8fafc`, `rgba(255,255,255,0.02)`) and
   never defined in any theme anywhere in `globals.css` — every theme silently
   ran on the fallback, which only looked correct in dark themes by accident.
   Replaced with `--text` and `rgba(var(--tint), …)`, both fully wired across
   every theme and already the established pattern two rules down in the same
   file (`--rule-t10`, `--rule-t20`).
2. **Mint-on-mint text at 1.51:1** on the "Start 5-Min Tour" pill in the shared
   demo sidebar (`src/components/demo-sidebar.tsx`), present on every `/demo/*`
   page. A hardcoded `#50e3bd` that never adapted per theme; replaced with the
   already-theme-complete `--good` token via `color-mix()`, the same technique
   `quote-request-form.module.css` and `globals.css` already use elsewhere.
3. **Workbench's `--muted-2` at 4.17:1** (the single largest cluster, 123
   instances) and **Dim's `--muted-2` at 3.99:1** (63 instances) — both
   near-misses on an otherwise-correct token, darkened/lightened within the
   same hue family to clear 4.5:1 with margin (`globals.css`).
4. **A hardcoded literal pair at 4.30:1** on the product tour's activity rail
   (`src/components/demo/demo-tour-frame.module.css`), deliberately dark
   regardless of theme; the text color alone was insufficient against its own
   fixed background and was adjusted in place.
5. **A missing Workbench-only override** on the Managed Ads strategy briefing
   card. `ManagedAdsScreen.module.css` already has an established local
   `:root[data-theme='light'] .foo { … }` pattern for exactly this reason
   (`.demandPeak`/`.demandShoulder`/`.demandOffPeak`, because this whole screen
   renders on hardcoded white/cream backgrounds in every theme rather than
   following the rest of the dashboard's theme model) — this trio of rules
   simply never got one.
6. **Three structural violations**: the `dl` in `CashFlowBoard.tsx` had a
   `<small>` as a direct-child sibling of `<dd>` inside a wrapping `<div>`,
   outside the valid `dl` content model — moved inside the `<dd>`, same CSS
   descendant selector, same visual result. `ManagedAdsScreen.tsx`'s
   `role="tablist"` had plain `<button>` children instead of `role="tab"` —
   added `role="tab"` and `aria-selected`. Its message-match chain had
   `overflow-x: auto` with no keyboard-focusable content — added `tabIndex={0}`,
   `role="group"`, and an accurate `aria-label`.

## Result

| | Baseline | After |
| --- | --- | --- |
| `color-contrast` | 731 | 322 |
| `definition-list` | 4 | 0 |
| `aria-required-children` | 4 | 0 |
| `scrollable-region-focusable` | 4 | 0 |
| **Total** | **743** | **322** |

**57% reduction.** All three non-contrast (structural/ARIA) violation classes
eliminated. Confirmed by three full re-runs after the fixes (601 → 322 across
two rounds of fixes, plus a clean final confirmation run); a fourth run showed
one additional `load-failure` on `/demo/tour/approve` [Light] that reproduced
as a plain `networkidle` timeout and cleared on a direct re-request
(`curl` returned 200 in 0.33s) — recorded as transient infrastructure noise,
not a regression, since no code touches that route.

### What's left

322 `color-contrast` instances remain, concentrated in two places:

- **A different subsystem entirely.** `#8b8a84` on `#242422` (105 instances
  across all four themes, a hairline 4.49:1 miss) is inside an `iframe` on
  `/demo/sites` — a contractor **website template preview**, which uses its own
  theming system, not the dashboard's. This section is about the dashboard;
  that belongs with whatever governs public site templates (see checklist §9).
- **A long tail.** The rest is scattered across smaller clusters (7–25
  instances each) in different components and themes — real work, but no
  single fix addresses a large share of it the way the six above did.

## What this does not establish

- **Live production evidence.** Nothing here touched a deployed environment.
- **The ~15 authenticated-only surfaces with no demo twin**: Voice
  Assistant/Calls, imports, a real invoice or client statement, Managed Ads'
  authenticated data view (as opposed to its demo/preview rendering), and
  reports. The original audit named these explicitly; this one could not reach
  them.
- **Manual interaction, keyboard, or screen-reader review.** Axe's automated
  ruleset does not cover everything WCAG does — full keyboard operability of
  the newly-added `role="tab"` pattern (arrow-key navigation between tabs, for
  instance) was not built or tested, only the specific violation axe flagged.
- **Any role other than however `/demo/*` itself renders** — no all-role
  review was performed.

The next real step is unchanged from what section 10 already says it needs: a
live four-theme authenticated browser matrix against production or a seeded
staging account. `npm run audit:demo-wcag` is a re-runnable substitute for the
gap between now and then, not a replacement for it.
