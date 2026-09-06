# Phase 2/3 — the per-persona rail: implementation plan

**Written 2026-09-06.** How we get from the restructured rail (Phase 1) to the
third rail in the mockup: one that hides what your role cannot reach and demotes
what your trade and your usage say you do not need.

Strategy and phase ordering live in
[nav-cleanup-plan-2026-09-06.md](./nav-cleanup-plan-2026-09-06.md). This document
is the build.

**Scope.** Capability hiding (Phase 2) and trade/usage demotion (Phase 3).
Entitlement locks are Phase 4 and are explicitly **out of scope** — there is no
per-feature data model to read, and inventing one is a catalog change against
live checkout.

**No migration required.** Every signal this needs already exists and is already
resolved somewhere in the request. See "The one thing that would need a
migration" for the single exception, which is deliberately deferred.

---

## 0. Preconditions

This plan assumes Phase 0 and Phase 1 have shipped. Two of their outputs are
load-bearing here and are worth restating:

- **`demo-sidebar.tsx` has been collapsed into `NAV_GROUPS`.** Gating a
  structure that exists in three hand-maintained copies is how you ship a rail
  that disagrees with itself.
- **The rail is down to ~16 rows in 3 groups.** Gating is a multiplier on
  structure, not a substitute. Applying it to today's 25 rows would produce a
  shorter version of a rail that is still organised wrong.

If Phase 1 has not landed, this plan still works — the capability map keys off
hrefs, which survive regrouping — but you will do the mapping twice.

---

## 1. The trap that has to be understood first

**An owner's capability set cannot be enumerated, and iterating it silently
yields nothing.**

`loadHeldCapabilities` (src/lib/auth.ts:887) returns `ALL_CAPABILITIES_SENTINEL`
for any owner (auth.ts:1071):

```js
const ALL_CAPABILITIES_SENTINEL = Object.freeze({
  has: () => true,
  get size() { return Number.POSITIVE_INFINITY; },
  keys:    function* () {},
  values:  function* () {},
  entries: function* () {},
  forEach: () => {},
  [Symbol.iterator]: function* () {},
});
```

It answers `has()` for every key including keys that do not exist — which is
correct, and is why the catalog is not duplicated in TypeScript. But **every
enumeration path yields empty**. So all of these produce `[]` for an owner:

```js
[...capabilities]                    // []
Array.from(capabilities)             // []
JSON.stringify([...capabilities])    // "[]"
```

Ship any of those to the client and **the owner — the person who paid — sees an
empty rail**, while office users see a correct one. It typechecks. It passes
lint. It will not throw. It is exactly the shape of bug that reaches production.

**The rule for this entire plan: never serialize a capability set. Serialize the
_decision_.** The server resolves visibility while it still holds the live
`has()` function, and ships a plain `string[]` of hrefs. `role` travels
alongside it for display purposes only, never as an input the client re-derives
from.

---

## 2. The visibility model

One pure module, no React, no I/O — the only part of this work that can have
real behavioural tests, because the shell itself can only be tested as source
text (see the note at the top of test/nav-shape.test.ts).

```
src/lib/nav-visibility.ts

export type NavTreatment = 'show' | 'demote' | 'hide';   // 'lock' lands in Phase 4

export type NavSignals = {
  role: 'owner' | 'office';
  /** Live predicate. NEVER an array — see §1. */
  can: (capability: string) => boolean;
  /** From getAuthoritativeTrade. null means "unknown", which must read as 'show'. */
  trade: string | null;
  /** Sections with zero rows, ever. Absent key means "not measured", not "zero". */
  emptySections: ReadonlySet<string>;
};

export function navTreatment(href: string, signals: NavSignals): NavTreatment
export function resolveVisibleNav(signals: NavSignals): {
  visible: string[];      // hrefs, in rail order
  demoted: string[];      // hrefs for the "Less used" group
  hiddenCount: number;    // for the rail's footnote
}
```

### Precedence

`hide` → `demote` → `show`. Evaluated in that order, first match wins.

Capability wins over everything because it is security-shaped: it is the one
treatment where showing the row makes the product lie about what this person can
do. Demotion is a preference; hiding is a fact.

### Three defaults that must fail in the right direction

1. **Unknown href → `show`.** A new nav item that nobody added to the map must
   appear, not vanish. The alternative silently deletes features as they ship.
2. **`trade === null` → `show`.** `getAuthoritativeTrade` returns `null` on
   read failure *and* on genuinely-unset, and those are indistinguishable at the
   call site. Demoting on a failed read would reshuffle the rail during a
   Supabase blip.
3. **Section not measured → `show`.** `emptySections` is a set of things proven
   empty, never the inverse. A count that failed to load must not read as zero —
   that is the difference between "you have no crew" and "we could not ask".

### Owners are never hidden from

`role === 'owner'` short-circuits to `can: () => true`. An owner sees every row
their trade and usage permit. Phase 2 changes nothing for the persona that
represents every workspace today, which is what makes it safe to ship.

---

## 3. Getting the signals to the rail

This is the real engineering. The rail cannot currently see any of this.

### The problem, precisely

`AppShell` is a **client component** mounted in the **root** layout
(src/app/layout.tsx:205). The layout that knows who you are —
`requireDashboardShellContext` at src/app/dashboard/layout.tsx:46 — is *below*
it. React context does not flow upward, so the dashboard layout cannot feed the
shell.

Today the rail learns everything from a client `fetch('/api/account/status')`
(app-shell.tsx:686) that re-runs **on every dashboard navigation**. Filtering on
that data naively means rows appear and disappear every time you change page.

**Server Components cannot set cookies**, so the dashboard layout cannot seed
one either. Only Route Handlers, Server Actions and middleware can.
`src/middleware.ts` exists and already does Supabase SSR cookie work — but it
runs on *every* request including all marketing traffic, so resolving
capabilities there is a per-request database tax on pages that have no rail.

### Recommended: move the signed-in rail into the dashboard layout

The obstacle I expected here turns out not to exist. `AppShellProvider`
(src/components/app-shell-provider.tsx) already holds the open/close state in a
context mounted at the root — **above** the dashboard layout. So a rail rendered
inside the dashboard layout can still call `useAppShell()` for `isNavOpen`,
`closeNav` and the rest. Nothing about the drawer behaviour has to be rebuilt.

That makes the split viable:

- **`src/app/dashboard/DashboardRail.tsx`** — rendered by the dashboard layout,
  which already holds `role`, `capabilities`, `accountId` and `account`. It
  resolves visibility server-side and passes a plain `string[]` to a thin client
  component that owns interaction and badges.
- **`AppShell` keeps the marketing chrome and the logged-out sales rail**,
  untouched.

Three things fall out of this for free:

1. **No flicker.** Visibility is server-rendered in the first response. No
   cookie, no seed, no correction pass, no popping rows.
2. **No sentinel serialization.** The decision crosses the boundary, not the
   set. §1's trap is structurally impossible rather than merely avoided.
3. **The sales-rail trap disappears.** The strategy doc warns that filtering
   `NAV_GROUPS` would gut the logged-out "Preview everything included" rail at
   app-shell.tsx:1455, because both rails share a render path. After the split
   they do not share one. The refactor *is* the fix.

The cost is real: the rail markup is interwoven with the mobile bar, the scrim,
the topbar and the badge cluster. Budget for it honestly (see §8) and do it as
a pure extraction with **no behaviour change**, on its own commit, before any
gating is added. A move and a feature in one diff is a diff nobody can review.

### Fallback, if the extraction proves too large

Extend `/api/account/status` to return a resolved `nav: { visible, demoted,
hiddenCount }` — server-resolved, so §1 is still respected — and seed first paint
from a cookie written by that same route handler, following the localStorage +
cookie + change-event pattern `src/lib/nav-customization.ts` already uses for
the logo position.

This accepts a one-frame reshuffle on the very first load of a new session, and
staleness for one navigation after a permission change. Both are tolerable
because **RLS is the actual boundary** — `office_can(account_id, capability)`
refuses the rows regardless, so a stale rail row leads to a page that still
refuses. It is worse than the extraction, and it is not wrong.

Do not take the fallback as a shortcut to avoid the extraction. Take it only if
the extraction is genuinely blocked.

### Watch the cost of `/api/account/status`

Whichever route you take, that endpoint already runs `expireStaleLeads`,
`listJobs` and eight parallel reads **on every dashboard navigation**. Phase 3's
usage counts must not simply be appended to it. Put slow-changing structural
data (trade, empty-section counts) on its own cached endpoint, or resolve it in
the layout where it is naturally per-render rather than per-navigation.

---

## 4. The capability map

31 keys exist in `OFFICE_CAPABILITIES` (src/lib/office-permissions.ts:60) across
five bands. Most rows map cleanly onto a **read** capability — the right choice,
because the rail is about reaching a page, not about acting on it:

| Row | Capability |
| --- | --- |
| Leads | `leads.read` |
| Messages | `messages.read` |
| Jobs | `jobs.read` |
| Schedule | `jobs.read` |
| Crew & Labor | `crew.read` |
| Clients | `clients.read` |
| Inventory & Fleet | `inventory.read` |
| Money (Payments · Cash Flow · Expenses · Insights) | `payments.read` |
| Recurring Jobs | `invoices.read` |
| Marketing | `marketing.read` |
| Reviews | `marketing.read` |
| Website | `settings.write` |
| Account | always visible — it is where sign-out lives |

### The seven rows with no natural key

Insurance Claims, Quick Stops, Text-to-Job, Cards & Stationery, Automations,
Price Book, Expenses Ledger. After Phase 1 several of these are tabs rather than
rows, which shrinks the problem — but the parent still needs a verdict.

**Default them to owner-only.** That is the direction this has to fail, and it
matches how the surrounding system is documented to work:
`requireOfficeContext`'s own comment states that nothing becomes reachable by
being left alone, and that a page opens to an office user only by being changed
deliberately. A rail that showed these rows to office users would be promising
access the page itself refuses.

### The one thing that would need a migration

Giving those seven rows real capability keys means adding to the capability
catalog — and **that catalog lives in SQL as well as TypeScript**. The
`ALL_CAPABILITIES_SENTINEL` comment is explicit that not duplicating it is
deliberate, and that a migration test exists to prevent the two copies drifting.
`loadHeldCapabilities` reads the `office_capabilities` table filtered on
`enabled`, so a TypeScript-only addition grants nothing to anybody.

So: adding keys = a migration + both copies + the drift test. **Deliberately out
of scope.** Ship Phase 2 with owner-only defaults, learn which rows office users
actually ask for, then add keys for those in a follow-up with evidence rather
than guesses.

### Do not filter `baseNavItems`

`isActiveNav` (app-shell.tsx:94-101) iterates `baseNavItems` to resolve
longest-match highlighting. Filter that array and active-state resolution
silently changes for paths you never touched — a hidden child causes its parent
to light up on routes where it previously did not. **Filter the rendered list.
Leave `baseNavItems` whole.**

---

## 5. Phase 3 — demotion

Only start once Phase 2 is live and quiet. It rides entirely on Phase 2's
plumbing; it needs no new channel.

### Trade

`getAuthoritativeTrade(admin, accountId)` (src/lib/workspace-trade.ts) already
exists and resolves site content → `accounts.trade` → `null`. Two reads, and it
**requires an admin client** because `sites` and `accounts` are owner-only under
session RLS. It is already called per-page on Jobs and Leads, so the dashboard
layout calling it once per render is not a new class of cost — but it is a new
call, so measure it.

Ship a small `TRADE_RELEVANCE` map: `core` / `neutral` / `niche` per trade
cluster, defaulting to `neutral`. **Start with Insurance Claims only.** It is
the clearest case in the product — the whole job for restoration, pure noise for
lawn care — and one row is enough to validate that demotion reads correctly
before committing to a full matrix.

`WorkspaceTradeContext` exists but the shell never reads it, and it is mounted
per-page below the shell. Do not try to route through it; resolve trade in the
dashboard layout alongside capabilities.

### Zero usage

Cheap `head: true` counts for crew, inventory and recurring. Demote a section
that has **never** had a row.

Two rules:

- **Never-had-a-row, not currently-zero.** A contractor between jobs has zero
  active jobs; that is not a reason to demote Jobs. If distinguishing the two is
  expensive, demote nothing rather than demote wrongly.
- **A failed count is not zero.** Per §2, `emptySections` holds only what was
  proven empty.

### The "Less used" group

Demoted rows collapse into one group below the others, as drawn in the mockup —
dimmed, still labelled, still one click. They are never removed. A contractor
who has not hired yet must still be able to find Crew on the day they do.

---

## 6. Testing

The shell is only testable as source text (node env, no DOM, Supabase session).
So the testable surface has to be pulled out of it — which §2 does deliberately.

**Unit — `nav-visibility.ts`, real behavioural tests:**

- An owner sees every row. **Assert this against the real sentinel from
  `loadHeldCapabilities('owner')`, not a hand-built `new Set()`.** A test that
  builds its own set proves nothing about §1 — it tests a fixture that behaves
  differently from production, which is exactly how the bug survives.
- An office user with N capabilities sees exactly the mapped rows.
- Every one of the seven unmapped rows is owner-only.
- An unknown href shows.
- `trade: null` shows.
- An unmeasured section shows.
- Precedence: a row that is both hidden and demoted is hidden.

**Source-as-text — extend test/nav-shape.test.ts:**

- Every rendered href resolves in `baseNavItems` (`renderSideLink` returns
  `null` on a miss — silent).
- Every rendered href has a `NAV_ICON_PATHS` entry (`NavIcon` returns `null` —
  also silent).
- **The logged-out sales rail still renders the complete `NAV_GROUPS`.** This is
  the regression test for the trap in §3, and it must exist even after the
  split makes the trap structurally unlikely.
- `baseNavItems` is not filtered anywhere (§4).

**Manual, per persona:** sign in as owner and as an office user with a partial
grant, on both a fresh session and a mid-session permission change. Watch
specifically for rows reshuffling on navigation — the failure mode this
architecture exists to prevent.

**Gates:** `npm run typecheck`, `npm run lint`, `npm run test`, and
`npm run build`. Run the build — typecheck and green tests have passed on code
`next build` rejected. Do not pipe the gates; a pipe loses the exit code.

---

## 7. Rollout

Gate on a server-read env flag, default **off**.

Because `role === 'owner'` short-circuits to "show everything", the flag is
close to a no-op for every workspace that exists today. That is the safety
property worth leaning on: turn it on, and nothing visibly changes until the
first office user signs in.

Two operational notes from prior flag work:

- **Vercel bakes env at build.** Setting a Production flag does nothing until a
  redeploy. Plan the redeploy as part of the rollout, not as an afterthought.
- **Adding a Production flag is an ADD, not an edit**, and the ADD is the step
  that fails. Expect it to need the operator agent.

Order: ship dark → verify on a real office account in Preview → enable → watch
for "where did X go" in support before touching Phase 3.

---

## 8. Work breakdown

| # | Work | Depends on | Risk | Size |
| --- | --- | --- | --- | --- |
| 1 | `nav-visibility.ts` + unit tests (incl. the real-sentinel test) | — | none | 1 day |
| 2 | Extract the signed-in rail into `DashboardRail`, **no behaviour change** | Phase 1 | medium | 2-3 days |
| 3 | Wire `role` + `can` from the dashboard layout; hide rows | 1, 2 | low | 1 day |
| 4 | Extend test/nav-shape.test.ts, incl. the sales-rail regression | 3 | none | half a day |
| 5 | Flag, dark deploy, Preview verification on a real office account | 3, 4 | low | half a day |
| 6 | Trade demotion — Claims only | 5 live and quiet | low | 1 day |
| 7 | Usage demotion + the "Less used" group | 6 | low | 1-1.5 days |

**≈ 7-8 working days**, of which item 2 is the only genuine unknown. If the
extraction turns out larger than three days, stop and take the §3 fallback
rather than letting a refactor swallow the feature.

### Sequencing rule

Item 2 ships **alone**, as a pure move with no gating in the diff. If the rail
breaks, everyone needs to know whether it was the move or the filter, and a
combined diff makes that unanswerable.

---

## 9. Risks

| Risk | Mitigation |
| --- | --- |
| **Owner sees an empty rail** (§1) | Never serialize the set; test against the real sentinel, not a fixture |
| Rows pop in/out on navigation | Server-render the decision (§3); the fallback's cookie seed if not |
| Sales rail loses rows | The split separates the render paths; regression test anyway |
| Active highlight shifts on unrelated routes | Filter the rendered list, never `baseNavItems` (§4) |
| Office user cannot reach something they need | Owner-only defaults are conservative *and* reversible; the flag is the undo |
| Demotion fires on a failed read | `emptySections` is proven-empty only; `trade: null` shows |
| `/api/account/status` gets slower | Phase 3 signals go on their own cached path, not appended (§3) |
| The extraction overruns | Hard stop at 3 days, fall back to §3's alternative |

---

## What this plan does not do

- **No entitlement locks.** No data model exists; Phase 4.
- **No new capability keys.** That is a SQL + TypeScript migration with a drift
  test; deferred until real evidence says which rows office users want.
- **No mobile bar changes.** It draws its own item set and does not follow
  `NAV_GROUPS`. It needs its own pass, and pretending otherwise would ship a
  gated desktop rail beside an ungated phone one.
- **No migration of any kind**, which is the main reason this is a 7-8 day piece
  of work rather than a month.
