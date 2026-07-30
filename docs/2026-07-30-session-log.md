# Session log — 2026-07-30

What shipped, what was tested, and what's deliberately still open. Written so the
next session doesn't re-test ground already covered.

---

## Features

### "Plan my day" route optimization — `176f849`
New page at `/dashboard/schedule/plan`, linked from the Schedule header. Orders a
day's stops into the shortest sensible route, proposes arrival times, and applies
them in one tap.

- Engine in `src/lib/route-plan.ts` — nearest-neighbour seed then 2-opt; arrival
  times walked forward from `workday_start` stacking travel + `estimated_hours` +
  `job_buffer_minutes`. Pure and I/O-free.
- Distance source is swappable per leg: real Google Distance Matrix legs when the
  account opted in (`driveMatrix()`, one request, capped at 10 points), otherwise
  straight-line haversine at ~30 mph.
- **A confirmed appointment never moves.** Locked stops are pinned to their agreed
  time and free stops route around them. The apply action re-checks this
  server-side and refuses regardless of what the form says.
- Surfaced rather than hidden: un-geocodable stops, days running past
  `workday_end`, a confirmed stop that can't be reached in time, idle gaps, other
  crew's jobs, and which distance source was used.
- Opt-in "text them the new time" step after applying; never automatic.

Later fixes: locked stops no longer render as "moving" (`037e745`), drive-matrix
downgrade now explains itself, planner warns on days blocked off.

### Automation switches — `d5b5590`, `30eabc9`, `7822cdc`, `0c72ce4`
The Automations tab was read-only status pills. Now real switches with an audit
trail.

- 44px targets, `role="switch"`, keyboard focusable, click doesn't unfold the
  card, optimistic with snap-back on failure.
- `toggleAutomationAction` writes only that automation's own column, so flipping
  from the list can't clobber the rest of the card's settings.
- **Intake AI was labelled "Always on" and wasn't** — enabling the classic quote
  form in the website builder switches it off. It now reads the truth and is
  flippable; `quoteForm.enabled` is the source of truth and `estimateRanges` its
  strict inverse.
- Online booking got a real switch via a new `booking_enabled` column, so turning
  it off no longer means destroying the weekday configuration.

### Confirmation emails to the contractor — `7822cdc`, `0c72ce4`
**The invoice email was going to the contractor, not the customer.** It's written
for the customer (subject "Invoice X from …", their name, a public no-login
sign/pay link) but `recipientEmail` was `user.email`. Nothing anywhere emailed an
invoice to `client_email`. The link that gets you paid never reached the person
who'd use it.

Now the customer gets the document and the contractor gets a receipt of the fact.
Extended to quotes, payment requests, review asks and appointment reminders, each
a preference under Settings → Automations → "Confirmations to you":

| Preference | Default | Shape |
| --- | --- | --- |
| `quote_confirmation_email` | on | per send |
| `payment_confirmation_email` | on | per send |
| `review_confirmation_email` | on | per send |
| `reminder_confirmation_email` | **off** | **one summary per nightly run** |

Reminders fire for every job booked the next day, so a per-customer confirmation
would be a stack of mail at 10pm. `runAppointmentReminders` tallies per account
and sends one summary, only on nights when reminders actually went out.

All four read through `lib/confirmation-prefs`, which falls back to each column's
default when the column is missing and never lets a failed read stop the thing
the contractor actually asked for.

---

## Security & correctness

### Content Security Policy — `371b1f3`, `44737ff`
Nonce + `strict-dynamic`, applied on every middleware exit including tenant-site
rewrites. **Still report-only.** `/api/csp-report` receives violations (logs,
never persists — it's unauthenticated and browser-driven).

Report-only earned its keep immediately: it caught that the Google Maps SDK pulls
stylesheets from `fonts.googleapis.com` and fonts from `fonts.gstatic.com`.
Enforcing without those would have **broken every map in the app**.

A `script-src <- eval` violation in dev turned out to be webpack's eval source
maps and does **not** occur in production — so the policy does not need
`'unsafe-eval'`, which would have been a real weakening had it been adopted on
dev evidence.

To enforce: flip `CSP_REPORT_ONLY` in `src/lib/csp.ts`. A test asserts it's still
`false` so the rollout state stays deliberate.

### Atomic route apply — `bd22188`
`applyDayPlanAction` looped with no transaction: a failure on stop 3 of 6 left a
half-applied route with stops overlapping at times nobody chose, reported as
success. Now all-or-nothing — rules resolved up front in a pure
`buildScheduleChangeset`, writes rolled back on failure, and the page
distinguishes "nothing changed" from "N stops could not be put back". Feed events
write only after every move sticks.

### The test suite wasn't typechecked — `bd22188`
`tsconfig.json` includes only `src`, so tsc saw **zero** test files. That's how
six tests sat broken on `main`. Added `tsconfig.test.json` behind
`npm run typecheck` (src + test). Run it, not bare `tsc`.

### Geocoding moved off the render path — `c2ef080`
`getMapPins` and the route planner each ran a coordinate backfill inside a GET
render — up to 24 geocode lookups per page view, billed, in front of first paint.
Now `/api/cron/geocode-backfill` at 07:00 daily, plus an on-demand button on the
planner. Known wart: rows with permanently un-geocodable addresses are retried
every run.

### Settings audit trail — `c2ef080`
`account_events` records what changed, when, and who. Append-only: owners can
read but RLS grants **select only**, so the subject of the record can't rewrite
it. Recording is best-effort and can never fail the change it describes.

---

## UI / UX fixes

- **Every sparse page inflated itself** (`037e745`). `.wide-shell` sets
  `min-height:100vh` and `.workspace-shell` is a grid, so rows stretched to fill
  the viewport — measured 506px and 444px panels holding 335px and 277px of
  content. `align-content: start` fixed it everywhere at once.
- **Leads scrolled sideways at 1440px** (`19368b7`). Grid items default to
  `min-width:auto`, so the 1151px pipeline refused to shrink and dragged the map
  with it. `min-width: 0` on shell children. Columns narrowed 220→180px so all
  five stages fit.
- **Mobile labels truncated to nothing** (`0626f33`). "11 scheduled jobs need
  crew" → "11 schedul…". Short labels now wrap below 640px. Desktop unchanged.
- **Undersized tap targets** (`19368b7`): public-site nav links were 350×16, the
  lead-alert dismiss 27×27 and overlapping "View lead".
- **Five pages had no `<h1>`** (`3b6a416`) — Dashboard, Leads, Jobs, Extra Stops,
  Crew all opened at `<h2>`.
- **Booking forms enforced an unstated rule** (`3b6a416`): the server requires a
  phone or email, two of four forms said nothing, two mentioned it below the
  address field.
- **`{}` on failed email linking** (`33d30f1`) — supabase-js stringifies an empty
  error body. Now an actionable sentence, raw error to console.
- **Jobs view menu opened into the panels below it** (`591e477`) — moved to the
  map legend row, matching leads.

---

## Tested — don't re-cover

Verified against the running app with Playwright, not assumed:

- **Automation switches**: flip persists across reload, card does not unfold on
  click, audit line appears with the right actor. All 12 switches render with
  correct defaults.
- **Plan my day, live data**: 44.6 mi → 26.2 mi, "Saves 18.4 mi and 37 min".
  Applying changed exactly 5 start times with 5 job-feed entries — page claim
  matched the database. Re-planning then reported "already optimal".
- **Blocked day** → planner warns.
- **CSP**: 13 production surfaces, **zero violations** — dashboard + Maps, the
  builder with its preview iframes, settings, planner, contact + Turnstile,
  login, pricing, and three published tenant sites with their booking pages.
- **Audit trail append-only**: anon insert rejected (`42501`), update and delete
  matched zero rows.
- **Invoice send**: logs both "Invoice email sent" and "Contractor alert email
  sent".
- **Layout audit**: 15 pages × desktop/mobile — every page has a heading and
  something to act on, none scroll sideways, no console errors.
- **Crawl**: 19 pages, all 200, no dead ends.

False positives confirmed as such, so they don't get re-investigated: Google's
map canvas and the site honeypot clip by design; native inputs "clip" but scroll;
`.sr-only` headings are 1px on purpose; calendar chips carry `text-overflow:
ellipsis`.

---

## Database changes applied to production

Each with a targeted `ALTER`, **not** `scripts/deploy-schema.mjs` — that replays
every policy across the live database for what is usually one additive column.

- `accounts.booking_enabled` (bool, default true)
- `account_events` table + owner-read-only RLS policy
- `accounts.quote_confirmation_email` (bool, default true)
- `accounts.payment_confirmation_email` (bool, default true)
- `accounts.review_confirmation_email` (bool, default true)
- `accounts.reminder_confirmation_email` (bool, default **false**)

---

## Seeded demo data — BrokePipes (`thisisit`)

A realistic working week, kept deliberately: 24 clients, 20 jobs, 10 leads across
every pipeline stage, 4 invoices, 5 payments, 2 crew, 1 blocked day. Detroit-metro
addresses matching the existing service area; five stops today in deliberately
non-geographic order so the planner has something to solve.

**Every phone is `555-01xx` (reserved for fiction) and every email is
`@example.com` (RFC 2606).** If a cron ever fires against this data it cannot
reach a real person. Swap one to a real address before testing SMS or email.

Also set `service_center_lat/lng` (2075 E Lincoln Ave, Royal Oak) so the planner
has a home base to anchor on.

---

## Still open

- **CSP is observing, not enforcing.** Watch `[csp-report]` in the logs across
  real traffic — especially token-gated surfaces (pay, invoice, track, client
  dashboard, field app), which were never exercised. Then flip
  `CSP_REPORT_ONLY`.
- **DMARC** was added (`p=none`) and resolves. It needs
  `dmarc@letsgetquoted.com` to actually receive mail or the reports bounce.
  Tighten to `quarantine` after a couple of weeks of clean reports.
- **Supabase auth SMTP username** had to be `resend`, not an email address. Worth
  confirming magic-link login works for a contractor who isn't a project member.
- **Untested write flows**: converting a lead to a quote (gated on Stripe
  Connect, which BrokePipes doesn't have), and the customer-side booking
  submission.
- **Job `J-1002` on Lawn & Order** has its client email pointed at
  `hdartguy@gmail.com` from an email test. Change it back if that job matters.
- **Primary actions hide inside collapsed `<details>`** — the add-crew form and
  "Build itemized invoice" both need a click that isn't obviously there. The crew
  form auto-expands only while you have zero crew, so adding your *second* crew
  member is harder than your first.
