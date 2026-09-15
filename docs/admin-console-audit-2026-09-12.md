# Staff console (/admin) — audit, 2026-09-12

Scope: the 30 pages, 81 files and ~17k lines under `src/app/admin`, plus the
`src/lib/admin-*` and `src/lib/staff*` modules behind them.

This audit deliberately does **not** re-cover the ground in
`docs/admin-command-center-outstanding-2026-09-09.md`,
`docs/admin-command-center-task-list-2026-09-09.md` or
`docs/admin-operations-remediation-plan-2026-09-09.md`. Those are about backend
honesty, observability and cron correctness, and they are still the right list
for that half. This one is about the console as a **thing staff sit in front of**:
its front end, its read-side access model, how it behaves as the tables grow, and
what it is like to use.

**What is already good, and should not be disturbed.** The authorization model is
genuinely well built: two independent gates (`ADMIN_EMAILS` for entry, the `staff`
row for authority), a real permission matrix in `src/lib/staff.ts`, page guards
that match what the nav hides, `requireMfaPermission` on the high-impact
mutations, `requestId` correlation, and `before`/`after` diffs on every audit row.
`src/lib/postgrest-filter.ts` is the right answer to `.or()` injection and the
call sites use it. Signal fetchers degrade per-signal instead of blanking the
page, and empty states say what a check does *not* cover rather than implying an
all-clear. Twenty-eight test files cover this area. None of the findings below
are about the parts that were thought through.

---

## A. Defects — wrong today, in the code as written

### A1. The mobile layout was written and never connected — three times over

`src/app/admin/admin.module.css:782-802` contains a full narrow-viewport
treatment: a `.mobileMenuButton`, `.sidebarContents { display: none }`, and a
`.sidebarContentsOpen { display: flex }` to reopen it. All three are dead:

- `AdminChrome.tsx` never renders a menu button and never applies
  `sidebarContentsOpen` — nothing in `src/` references either class.
- `.sidebarContents { display: none }` at line 798 is inside the media query, but
  `.sidebarContents { display: flex }` at line **837** is unconditional and
  *later in the file*. Media queries add no specificity, so the later rule wins
  at every width. The `display: none` has never once applied.

Net effect on a phone or a narrow window: the sidebar goes full-width and sticky,
and the search box, all 22 nav links (capped to a 52vh scroller) and the user card
sit above the actual page content on every route, with no way to collapse them.

**Fix:** render a `<button>` in `.sidebarTop` that toggles `sidebarContentsOpen`,
and move the base `.sidebarContents` rule above the media query (or scope the
media-query rule tighter). Both halves are needed — either one alone still leaves
it broken.

### A2. Every timestamp in the console is in the server's timezone, unlabelled

Twenty server components call `toLocaleString('en-US', …)` /
`toLocaleDateString(…)` with no `timeZone` option. `grep -rn "timeZone" src/app/admin`
returns nothing. In a server component that resolves against the *server's* zone —
UTC on Vercel — so staff in New York read every audit row, incident start, SLA
deadline and payment date 4–5 hours off, with nothing on screen saying so.

This matters most exactly where it is least forgiving: `/admin/audit` (the
accountability record), `/admin/incidents` (a timeline reconstructed after the
fact), and the privacy-request 30-day statutory clock.

**Fix:** one shared formatter that pins an explicit zone and prints the
abbreviation (`Sep 12, 3:14 PM ET`), or render timestamps in a small client
component that uses the viewer's zone. See F2 — the same change currently has to
be made in 21 places.

### A3. `metricHref`'s doc comment contradicts its own code

`src/app/admin/page.tsx:64-72` documents at length why "Payments processed"
returns `null` — "there is no payments ledger in the console yet". Four lines
later the code returns `/admin/payments?range=${range}`. The ledger shipped; the
comment did not get the memo. Given how much of this codebase's reasoning lives in
comments, a stale one is worth more than a typo.

---

## B. Access and accountability gaps

### B1. There is no way to sign out of the staff console

`AdminChrome.tsx:45-56` renders the user card as static display: initials, email,
role pill. No link, no form, no logout. `/auth/signout` exists
(`src/app/auth/signout/route.ts`) and is POST-only, so there is not even a URL a
staffer can type. The only exits are clearing cookies or waiting out the session.

For a console that reaches every customer's PII and can suspend a business, "end
my session on this machine" should be one click from anywhere in it.

**Fix:** a form posting to `/auth/signout` in `.sidebarFoot`. Small change; it is
listed here because of what it guards, not its size.

### B2. The audit log records what staff *changed*, never what they *read*

`logAdminAction` is called from every mutation, and from the bulk export route
(`accounts/[id]/export/route.ts:246`). Nothing logs a **view**. Opening
`/admin/accounts/[id]` — which renders profile and contact details, payment
history, message contents, login history and attachments — leaves no trace.

So the question "who looked at this customer's record" is unanswerable, while
"who changed it" is answered well. For a product that runs a DSAR queue with a
statutory clock, that asymmetry is the wrong way round.

**Fix:** log a `account.view` row on the detail page and on `/admin/search` hits,
deduped per staff member per account per session so the table does not become
noise. Volume is the real design question here, not feasibility.

### B3. The permission matrix has no read dimension

Roles gate mutations precisely. Reads are all-or-nothing: any active staff row —
including `read_only`, whose stated purpose is "can look at everything and change
nothing", and `support`, which explicitly "cannot move money" — can open
`/admin/money`, `/admin/payments`, `/admin/billing-operations` and every
account's full PII page. Only `/admin/staff` and `/admin/operator` gate reads.

`account.export` gates the bulk download, but a support staffer can page through
the same data by hand.

This may well be the intended trade-off, and it is defensible for a small team.
It should be a **recorded** decision rather than an implicit one, because the
`ROLE_HELP` copy on `/admin/staff` reads as though it is narrower than it is.
If it is revisited, `money.view` and `pii.view` are the two that would carry
their weight.

---

## C. Scale — where this breaks as the tables grow

### C1. `/admin/accounts` has no pagination at all

`PAGE_LIMIT = 50` (line 35) with no `page` search param. Past 50 accounts the page
prints "showing the 50 newest. Search to narrow it." (line 230) and that is the
whole story — there is no page 2. Every other list page (`payments`, `cases`,
`quick-stops`, `risk`, `audit`, `privacy-requests`) already has working
pagination, so this is the odd one out, and it is the most-visited list in the
console.

**Fix:** the same `page`/`pageCount` treatment used in `cases/page.tsx`. The
count query already exists (`countAccountsForAdmin`); note the deliberate `null`
for searched slices, which should keep showing "showing N" rather than a page
count it cannot compute.

### C2. `/admin/risk` pulls up to 15,000 rows to render 50

`src/lib/admin-risk.ts` fetches three tables at `ROW_CAP = 5000` each, then
`risk/page.tsx:63` does `filteredRows.slice(from, from + PAGE_SIZE)` in memory.
It is honest about the cap — `truncated` is computed from it (lines 178-183) and
surfaced — but the cost is paid on every page view including page 1, and the
queue silently stops being complete at 5,000.

**Fix:** push the scoring into a SQL view or an RPC and paginate at the database.

### C3. `/admin/accounts/closures` has no pagination either

`loadPendingIrreversibleWork` takes a `limit` and the page never passes one or
offers a second page. Low urgency while closures are rare; it is on the list
because it is the same shape as C1 and will arrive the same way.

### C4. Search is leading-wildcard `ILIKE` with no trigram index

`src/lib/admin-search.ts` and `listAccountsForAdmin` both do `.ilike(col, '%term%')`
across accounts, sites, clients, quick stops and payments. A leading `%` cannot use
a btree index, so each of these is a sequential scan; the file's own header notes
"no pg_trgm/full-text search is enabled". It is fine at today's row counts and
degrades steadily — and the Cmd+K box fires one on every 200ms debounce tick.

Separately, and cheaper to fix: **LIKE metacharacters are not escaped.**
`src/lib/auth.ts` does this correctly for staff email lookup
(`.replace(/[%_\\]/g, '\\$&')`), but neither search module does. A staffer
searching for `john_smith@…` silently matches `johnXsmith@…` too, and a bare `%`
matches every row. `postgrest-filter.ts` escapes PostgREST *grammar* (`"`, `\`) —
correctly, and it is the right module — but `%` and `_` are SQL LIKE grammar and
pass straight through.

**Fix:** escape `%`/`_`/`\` in the term before building the pattern (one helper,
next to `filterValue`). Enable `pg_trgm` and add GIN indexes when search latency
starts showing up.

---

## D. Operational usability

### D1. No auto-refresh, and nothing says how old the numbers are

Every page is `force-dynamic`, so a reload is always fresh — but nothing reloads.
`grep` finds no `setInterval` or `router.refresh()` anywhere in `/admin` outside
the manual. There is also no "as of HH:MM" anywhere, including the Command Center
and `/admin/health`.

An exceptions console is a thing you leave open. Today a tab open since this
morning shows this morning's incident counts, this morning's cron health and this
morning's dispute deadlines, and looks exactly like a tab opened ten seconds ago.

**Fix:** a "Data as of {time}" line in `pageHead` (which also gives A2 a natural
home), plus opt-in polling — a 60s `router.refresh()` on the Command Center and
Service Health, pausable, off elsewhere.

### D2. Nothing in the console exports

No CSV, no download, on any list. The only two exports are the per-account JSON
bundle and the manual's markdown. The gap that will be felt first is
`/admin/audit`: filters and pagination are there, but producing "every
`money.refund` in Q3" for a reviewer means screenshotting 50 rows at a time.
`/admin/payments` and `/admin/money` have the same problem for reconciliation.

**Fix:** a `?format=csv` route handler per list, reusing each page's existing
query and filters, and logged via `logAdminAction` the way the account export
already is.

### D3. No bulk actions anywhere

Two checkboxes exist in the whole console and both are settings, not selection.
Every queue is one-at-a-time: `/admin/failures` groups webhook failures for
*reading* and then resolves them singly; `/admin/risk` dispositions one row at a
time. `resolveWebhookGroupAction(ids: string[], …)` already takes an array —
the server side of this is partly built.

**Fix:** row selection plus a "resolve selected" on `/admin/failures` first, since
its action signature is already plural.

### D4. Twenty-two flat nav links, no grouping, no counts

`ITEMS` in `AdminNav.tsx` is a single undifferentiated list from "Command Center"
to "Security". There are clear clusters in it — people (accounts, closures,
privacy, cases), money (money, payments, billing ops), platform (health,
messaging, voice, campaigns, failures, incidents) — and no headings. Nothing
carries a badge, so "are there open disputes" needs a click even though the
Command Center already computed the number.

**Fix:** section headings in the nav, and counts on the four or five queues where
the Command Center has the number in hand already.

### D5. Card layout is stored per-browser, not per-staffer

`CommandCenterBoard.tsx:19` keys the saved order to
`admin_command_center_order:{role}:{email}` in `localStorage`. The email is in the
key but the storage is not — so the arrangement does not follow a staffer to a
second machine, and clearing site data loses it. Worth a `staff` column if anyone
is actually customising; worth deleting the feature if nobody is.

---

## E. Accessibility

### E1. No `prefers-reduced-motion` anywhere in the console

19 `transition`/`animation` declarations in `admin.module.css`, including the
`skeletonPulse` loading shimmer and the `pulseDot` on every non-empty alert card —
which is to say, motion concentrated exactly on the page staff stare at longest.
No reduced-motion query exists in the file.

**Fix:** one `@media (prefers-reduced-motion: reduce)` block neutralising
animation and transition duration.

### E2. Post-action result banners are mostly not announced

`/admin/money`, `/admin/billing-operations`, `/admin/search` and `/admin/failures`
set `role="status"` on their banners. The `?done=` / `?error=` banners on
`/admin/accounts`, `/admin/risk`, `/admin/staff`, `/admin/cases`,
`/admin/quick-stops`, `/admin/incidents`, `/admin/audit`, `/admin/messaging`,
`/admin/health`, `/admin/payments` and `/admin/voice/numbers` do not. Those are
the pages where a server action redirects back with the outcome, so a screen
reader user suspends an account and gets no confirmation that anything happened.

**Fix:** `role="status"` on the success banners and `role="alert"` on the error
ones. It is a one-line change per page, and the four pages that already do it show
the pattern.

---

## F. Maintainability

### F1. `/admin/accounts/[id]` is a single 1,540-line component

`AdminAccountDetailPage` runs from line 135 to the end of a 1,679-line file and
renders twelve panels — profile, pipeline, plan authority, payments, API
credentials, webhooks, messages, login history, notes, attachments, privacy, staff
actions. It is the most-edited page in the console and the hardest to edit safely.

**Fix:** extract each panel into `_components/`, the way `/admin/manual` and
`/admin/operator` already do. Mechanical, and it makes F2 tractable.

### F2. Twenty-one copies of the same four formatters

`fmtDate`, `fmtDateTime`, `usd`, `fmt`, `ago` are redefined 21 times across 13
admin page files. They are not identical — `/admin/accounts/closures` uses
`dateStyle: 'short', timeStyle: 'short'` where `/admin/staff` uses
`'medium'`/`'short'` — so the console is already visibly inconsistent about dates.

This is also what makes A2 expensive: fixing the timezone bug properly means
touching 21 definitions, which is exactly why it has not been fixed.

**Fix:** `src/lib/admin-format.ts` with one of each, timezone-pinned, and delete
the copies.

### F3. `/admin/health` runs live probes on every render

`runSyntheticUptimeProbe` executes on each page view with a 2.5s timeout per
subsystem. Reasonable for an ops page and honest about what it measures, but it
makes the page slow and gets slower as subsystems are added — and it means every
stray page view probes production. Worth a short cache (30–60s) with the probe
time displayed, which D1 would surface anyway.

---

## Suggested order

Cheap and clearly worth it, in this order:

1. **A3** (stale comment), **B1** (sign-out) — minutes each.
2. **E1**, **E2** — one CSS block and one attribute per page.
3. **F2** then **A2** — the shared formatter, then pin the timezone once.
4. **C1** (accounts pagination) — copy the pattern from `cases/page.tsx`.
5. **C4**'s escaping half — one helper next to `filterValue`.
6. **A1** (mobile) — needs both the component change and the CSS reorder.
7. **D1** ("as of" + opt-in polling) — the biggest day-to-day improvement here.

Then decide, rather than build: **B2** (view logging — volume is the question),
**B3** (read permissions — may already be the right trade-off, just unrecorded),
**D5** (keep and persist, or delete).

Leave **C2**, **C3**, **D2**, **D3**, **F1**, **F3** until the row counts or the
review cycle make them hurt — each is real, none is urgent at today's scale.
