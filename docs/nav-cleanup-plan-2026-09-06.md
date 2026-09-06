# Dashboard navigation: gating + cleanup plan

**Written 2026-09-06.** Answers two questions: should nav items be limited by
business size/needs, and what is the right cleanup. Everything in "What is
true today" was read out of the tree, not recalled.

---

## What is true today

| Fact | Where |
| --- | --- |
| 26 nav entries | `baseNavItems`, app-shell.tsx:58-85 |
| 22 of them bucketed into 4 groups | `NAV_GROUPS`, app-shell.tsx:121-166 |
| Dashboard, Website, Account render outside the groups | app-shell.tsx:1094-1125 |
| **No gating of any kind** — not role, plan, entitlement or trade | `renderSideLink`, app-shell.tsx:883 |
| `AppShell` is a **client** component in the **root** layout | src/app/layout.tsx:205 |
| Its data arrives from a client fetch, re-run on every dashboard navigation | app-shell.tsx:686, `/api/account/status` |
| `NAV_GROUPS` is rendered **twice** — signed-in rail and logged-out sales rail | app-shell.tsx:1115 and :1455 |
| `demo-sidebar.tsx` is a hand-duplicated **third** copy | pinned by test/nav-shape.test.ts |
| 11 dashboard routes already live off-rail | activity, forms, home, import, payroll, rebook, reports, stripe-merchant, stripe-return, trash, voice-assistant |
| 31 office capabilities exist, in 5 bands | `OFFICE_CAPABILITIES`, src/lib/office-permissions.ts:60 |
| The shell layout already resolves `role` + `capabilities` | src/app/dashboard/layout.tsx:46 |
| Plan allowances are **numeric quotas only** — no per-feature booleans | `BILLING_PLANS`, src/lib/billing/catalog.ts:91 |

### The two findings that shape everything below

**1. There is no entitlement data model to gate on.** `PlanAllowances` counts
seats, credits, GB and minutes. The only feature-shaped booleans in the whole
catalog are `voice.includedInBasePlan`, `sharedLgqTextingNumber` and
`quickBooksConnections`. Nothing anywhere says "this plan includes Insurance
Claims." `all-features-catalog.ts` is marketing copy with no plan mapping at
all. So a plan-driven rail is not a nav change — it is a catalog change, and
catalog changes are the most dangerous edit in this codebase. **That lever goes
last, and Phases 1-3 must not depend on it.**

**2. The rail cannot see who you are.** `AppShell` sits in the root layout, so
it is *above* the dashboard layout that knows your role. React context does not
flow upward. Today the rail learns everything from an async client fetch that
re-runs on every navigation — so naively filtering on that data makes nav rows
**appear and disappear on every page change**. Solving this is the real work of
Phase 2, and it is why Phase 1 is deliberately gating-free.

---

## Recommendation on "limit by business size"

**Do not gate on a declared business size.** It is a signup survey answer that
goes stale within weeks, users guess at it, and it cannot separate a 1-person
restoration shop (Insurance Claims is the whole product) from a 1-person lawn
crew (it is pure noise). Gate on signals you already hold, and use a
**different treatment per signal** — the treatments are not interchangeable:

| Signal | Treatment | Why |
| --- | --- | --- |
| **Role / capability** | **Hide** | The strongest case. An office user without `reports.read` who clicks Cash Flow gets a zero-row RLS read that looks identical to "no data." Hiding is the only honest answer. |
| **Entitlement** | **Show locked** | Hiding what you are selling loses the upsell; hiding what the plan *does* include creates a support ticket. A `sidenav-lock` treatment already exists at app-shell.tsx:1309. |
| **Trade relevance** | **Demote** | Insurance Claims is noise for lawn care and essential for restoration. Push it below the fold — never delete, or an unfamiliar user concludes the feature does not exist. |
| **Zero usage** | **Demote** | The honest "size" proxy. Zero crew members means Crew & Labor does not need top billing. It is behavior, not a form field, and it self-corrects. |

**Precedence, when several apply:** `hide` > `lock` > `demote` > `show`.
Capability wins because it is security-shaped; and you must never show a locked
upsell for something the person's role could not use even after purchase.

---

## Phase 0 — Safety net (do first, ~half a day)

The rail has three silent failure modes. Pin them before touching anything.

1. **`renderSideLink` returns `null` on a `byHref` miss.** A `NAV_GROUPS` href
   with no `baseNavItems` entry renders an invisible row. No throw, no
   typecheck error. `test/nav-shape.test.ts` already documents this — extend it
   to assert *every* `NAV_GROUPS` href resolves.
2. **`NavIcon` returns `null` on an unknown href.** A bare word in a column
   where every other row has a glyph. Assert all 28 `NAV_ICON_PATHS` keys cover
   the rendered set.
3. **`demo-sidebar.tsx` drifts silently.** It promises to mirror `NAV_GROUPS`
   and is maintained by hand. Either add a test that diffs the two structures
   wholesale, or — better — **make the demo rail import `NAV_GROUPS`** and
   delete the duplicate. This is a prerequisite for every later phase; three
   copies of a structure you are about to restructure is the main source of
   avoidable rework.

Also note for every later phase: **`globals-lite.css` is generated** by
`scripts/build-css-subset.mjs`. Never hand-edit it. `test/nav-shape.test.ts`
asserts the four accent tokens in **both** sheets, so any CSS change means
re-running the generator.

---

## Phase 1 — Structural cleanup, no gating (the biggest win)

Even with perfect gating, a solo operator on the full plan still sees ~20 rows.
Row count is the problem; gating alone does not fix it. This phase is
independent of every data question above, which is why it goes first.

### 1a. Fold "Intake Channels" into Schedule — **−3 rows**

Text-to-Job, Quick Stops, Online Booking and 24/7 AI Receptionist are four rail
rows for four on/off switches that all feed one calendar. Schedule already has
`booking`, `plan`, `dispatch`, `requests`, `settings` and `waitlist`
subroutes — this is consistent with structure that exists rather than a new
idea.

- Make them tabs under Schedule (or one "Intake" page with four cards).
- **Preserve the ON/OFF/PAUSED pills on the Schedule parent row.** They are the
  most valuable ornament in the rail — `paused` in particular says "your switch
  says on but nothing is actually on offer," which is a truth nothing else
  surfaces. Roll them up; do not drop them.
- `/dashboard/schedule/booking` is already a Schedule child, so `isActiveNav`'s
  longest-match logic (app-shell.tsx:94-101) already handles the nesting.

### 1b. Merge the money group — **−2 rows**

Reports & Insights, Revenue & Payments, Cash Flow and Expenses Ledger are one
financial surface behind four doors. Insights and Cash Flow especially: one is
"what happened," the other "what is about to happen." Merge to **Money** with
tabs, keeping Payments as the default view.

### 1c. Demote reference data — **−2 rows**

- **Price Book** is a catalog you edit occasionally → under Jobs or Settings.
- **Cards & Stationery** is a store, not a workspace section → Settings, or a
  "More" affordance.

### 1d. Fix the accidental splits

**Payroll is off-rail while Crew & Labor is on it.** That split looks
accidental rather than designed — Payroll is a destination people go looking
for. Same question for Reports (off-rail) versus Reports & Insights (on-rail);
those two names describing different things is a smell worth resolving.

### 1e. Reconsider the groups themselves

Four group labels are four non-clickable rows eating vertical space. At ~20
items they earn it. At ~12 they probably do not — and the four accent hues are
carrying real weight in `globals.css` for a grouping that may not survive.
Decide this *after* 1a-1d, with the actual final count in front of you.

**Net after Phase 1: 26 → ~17 rail entries, with zero data dependencies.**

---

## Phase 2 — Capability gating (hide)

The highest-value gating lever and the only one whose data model already
exists in full.

### The architecture problem, and the fix

The rail cannot read `role`/`capabilities` because it lives above the dashboard
layout. Three options, in order of preference:

1. **Two-tier: cookie seed + API correction (recommended).** The dashboard
   layout writes a compact capability set to a cookie; the shell reads it
   **synchronously** at first paint, so nothing pops. `/api/account/status`
   returns the authoritative set and corrects any staleness. This is exactly
   the pattern `src/lib/nav-customization.ts` already uses for the logo
   position (localStorage + cookie + a change event), so it is a shape the
   codebase already understands. Must handle the permission-change case: when
   `team.manage` edits someone's capabilities the cookie is stale until the
   next layout render — acceptable, because RLS is the actual boundary and a
   stale rail row leads to a page that still refuses.
2. **Move the rail into the dashboard layout.** Architecturally cleanest —
   server-rendered, no flicker, no cookie. But it is a large refactor and the
   shell also draws the marketing chrome. Worth doing eventually; not worth
   blocking this on.
3. **Resolve membership in the root layout.** Rejected — it forces a membership
   read onto every marketing page.

### Build it as a pure module

```
src/lib/nav-visibility.ts
  export type NavVisibility = 'show' | 'lock' | 'demote' | 'hide';
  export function navVisibility(href: string, ctx: NavContext): NavVisibility
```

`ctx = { role, capabilities, planCode, trade, usage }`. Pure and fully unit
testable without a DOM — which matters, because `test/nav-shape.test.ts` notes
the test environment is node with no DOM and the shell sits behind a Supabase
session, so today the rail can only be tested as source text. A pure module is
the one part of this that can have real behavioral tests.

### Two traps

- **Filter the rendered list, never `baseNavItems`.** `isActiveNav` iterates
  `baseNavItems` to resolve longest-match. Filter that array and active-state
  resolution silently changes for paths you did not touch.
- **The sales rail must stay complete.** `NAV_GROUPS` renders again at
  app-shell.tsx:1455 as "Preview everything included" for logged-out visitors.
  Apply any filter at the signed-in call site only — filtering the module-level
  array would quietly gut the sales pitch.

### Mapping

Most rows map cleanly onto existing capability keys: Leads→`leads.read`,
Messages→`messages.read`, Jobs→`jobs.read`, Crew→`crew.read`,
Inventory→`inventory.read`, Marketing→`marketing.read`,
Payments→`payments.read`, Insights/Cash Flow→`reports.read`,
Account→`settings.write`/`billing.read`. **Rows with no obvious capability**
(Claims, Quick Stops, Text-to-Job, Merchandise, Automations, Services,
Expenses) need a decision: either add capability keys, or default them to
owner-only. **Default to owner-only** — that is the direction this has to fail,
and it matches how `requireOfficeContext` is documented to work (nothing
becomes reachable by being left alone).

---

## Phase 3 — Relevance ranking (demote)

Cheap, reversible, no new schema.

- **Trade.** `WorkspaceTradeContext` exists but the shell never reads it, and
  the shell is above it in the tree — same injection problem as Phase 2, same
  fix, so ride on Phase 2's plumbing rather than building a second channel.
  Ship a small `TRADE_RELEVANCE` map (which rows are core / neutral / niche per
  trade cluster). Start with Insurance Claims, which is the clearest case.
- **Zero usage.** `/api/account/status` already computes counts for several
  sections. Extend it with cheap `head: true` counts for crew, inventory and
  recurring, and demote rows that have never had a row. Watch the cost — that
  route already runs `expireStaleLeads`, `listJobs` and 8 parallel reads on
  **every dashboard navigation**. Adding to it is not free; consider splitting
  the rarely-changing structural data onto its own cached endpoint.

---

## Phase 4 — Entitlement gating (lock) — last, and it is a catalog change

Only start this once Phases 1-3 have shipped. It requires inventing a
per-feature entitlement concept the catalog does not have.

Two options:

- **A nav-local feature map (recommended first step).** A static
  `href → minimum plan` table living in nav code, read alongside the workspace's
  `plan_code` from `workspace_entitlements`. It is a presentation concern, it
  touches no billing projector, and it is fully reversible. It is **not** an
  enforcement boundary and must be commented as such.
- **A real entitlement model in `BILLING_PLANS`.** Correct long-term, and the
  expensive one. With checkout live, a catalog change has no safe ordering: the
  projector recomputes `feature_limits` from its own table and refuses the
  whole projection when the two disagree, so a TypeScript-only change
  dead-letters live activations. Requires a SQL migration and a catalog version
  bump — and a version bump has two halves (widen the evidence readers, then
  *move* the currentness rows), where skipping the second half strands paid
  subscriptions.

**Do not conflate the lock treatment with the sales rail.** The logged-out rail
already draws every row locked. Reusing that CSS for signed-in entitlement locks
is right; reusing the *copy* ("Free to unlock — no card required") is not.

---

## Beyond gating and regrouping: seven more levers

Row count is only half of what makes a rail feel cluttered.

**1. A command palette is the highest-leverage single change.** Cmd-K search
over every destination lets the rail become "the places you actually work"
instead of "the index of everything that exists." It is the thing that makes
aggressive trimming *safe*, because nothing is ever more than a keystroke away.
If you do one thing beyond Phase 1, do this.

**2. Cap the ornaments.** The rail currently carries seven distinct ornament
types: "New" badges, count badges, attention digits, ON/OFF/PAUSED state pills,
the Stripe status pill, the low-credit alert, and the website signal. A 20-row
rail with 2 ornament types reads calmer than a 14-row rail with 7. Pick a
budget — **at most one ornament per row** — and write down the precedence
(state pill > attention count > new badge). This is probably the single
cheapest perceived-clutter win in the whole document.

**3. Places, not actions.** The `NEW_MENU_ITEMS` menu already lifted creation
out of the rail — that principle is established and worth applying
consistently. Any row that exists to *do* something rather than to *be
somewhere* is a candidate for a menu.

**4. Let users pin.** `nav-customization.ts` already has the whole
localStorage + cookie + change-event pattern for a user nav preference. Pinning
and "Show all" can reuse it almost verbatim. A pinned set plus a collapsed
remainder gets you a short default rail while keeping every destination
reachable — which sidesteps the hardest part of the gating question entirely,
and is far cheaper than Phase 4.

**5. Unify the second level.** There are currently three sub-nav idioms:
`SettingsTabs`, `MarketingNav` and `PlanSubnav`, plus Schedule's subroutes with
no shared subnav at all. Every "fold X into Y" in Phase 1 is bespoke work until
one pattern exists. **Building that shared subnav component is a prerequisite
for 1a and 1b, not a follow-up.**

**6. Shorten the labels.** Seven of 26 are compound: Crew & Labor, Inventory &
Fleet, Revenue & Payments, Reports & Insights, Cards & Stationery, Expenses
Ledger, 24/7 AI Receptionist. "X & Y" labels are usually a symptom of two
concepts sharing a row, and they widen the rail for everybody. Single words
where the meaning survives.

**7. Audit the mobile bar separately.** It draws its own item set (the Plan
link, the New menu, the contractor mark) and does not follow `NAV_GROUPS`.
Whatever the rail decides, the phone surface needs its own pass — it is the
narrower constraint and currently the less considered one.

---

## Sequencing

| Phase | Depends on | Risk | Rough size |
| --- | --- | --- | --- |
| 0 — safety net + de-duplicate the demo rail | — | none | half a day |
| 1 — structural cleanup (+ shared subnav) | 0 | low, all reversible | 3-5 days |
| 2 — capability gating | 0, 1 | medium (injection plumbing) | 2-3 days |
| 3 — trade + usage demotion | 2 | low | 1-2 days |
| 4 — entitlement locks | 2, catalog work | **high** — touches live billing | 1 week+ |
| Command palette | 0 | low | 2-3 days, parallel to 1 |
| Ornament budget | — | low | 1 day, any time |

**If you only do three things:** Phase 0, Phase 1a, and the command palette.
That is most of the perceived clutter gone with no billing exposure and no
new data model.
