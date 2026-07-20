# Project History — Let's Get Quoted

> Onboarding context for AI agents and new contributors. Everything here is
> derived from the repo as of **2026-07-20** (HEAD `4a28a32`, 249 commits,
> repo started 2026-07-15). Where something is inferred rather than confirmed
> in code, it is marked _(inferred)_. The authoritative sources are the code
> itself, `schema.sql`, `TEST_PLAN.md`, and the dated `logs/` entries — this
> file summarizes them; it does not replace them.

---

## 1. What this is

A Next.js 14 (App Router) SaaS that takes a contractor from **lead → quote →
scheduled job → invoice → payment**, plus a hosted marketing website for each
contractor. Three audiences:

- **Contractor (owner/crew)** — the authenticated `/dashboard` workspace.
- **Homeowner (client)** — unauthenticated, token-/id-scoped pages: pay an
  invoice, sign an invoice, view a live job dashboard, submit a quote request.
- **Public** — the contractor's own marketing site (served by subdomain /
  custom domain) and the product's own marketing homepage + `/demo`.

Runs locally on **port 3010** (`npm run dev`). Stack: Next.js 14.2 App Router,
React 18, TypeScript, Supabase (Postgres + Auth + Storage, RLS-enforced),
Stripe (Connect + Billing + Checkout), Twilio (SMS auth + payment texts),
Resend (transactional email), `pdfkit` (invoice PDFs), Google Places
(address autocomplete). No test framework — verification is via standalone
`scripts/*.mjs` and `npm run build` / `npm run lint`.

---

## 2. Core lifecycle (plain terms)

1. **Lead** comes in (website quote form, manual entry, referral, or
   missed-call _(placeholder source)_) → `leads` table, status
   `new → contacted → quoted → won/lost`.
2. Contractor works the lead, proposes visit/quote dates, and **converts** it
   to a **Job** (`leads.converted_job` links the two).
3. **Job** (`jobs`) is the central object: client info, scope, schedule,
   estimated hours, assigned **crew**, and a running **job feed** (activity
   timeline). Jobs move `new_lead → in_progress → complete → archived`.
4. **Costs** (material/labor/sub/receipt/other) are itemized per job; a
   `job_margins` SQL view computes revenue − cost = profit/margin on the fly.
5. **Invoices** (+ line items) are sent to the homeowner, who **e-signs** at a
   public `/invoice/[id]` link. Status `draft → sent → signed → paid → void`.
6. **Payments** (deposit / stage / final / plan installment) run through
   **Stripe Checkout**; the homeowner pays at `/pay/[id]`. A **platform fee**
   (contractor's revenue model) is computed from the account's trailing-12-month
   volume bracket and recorded per payment, never retroactively re-rated.
7. **Client job dashboard** — a revocable tokenized `/client/jobs/[token]` link
   lets the homeowner watch progress: client-visible feed items, documents
   (sent/signed/paid invoices), and payment requests.

---

## 3. Architecture & data model

### Routing (`src/app`)
- `/dashboard/*` — authenticated workspace: `jobs`, `leads`, `crew`,
  `schedule`, `settings`, `sites`. Every page enforces
  `requireOwnerContext()` (see `src/lib/auth.ts`).
- **Public, no-auth, id/token-scoped:** `/pay/[id]`, `/invoice/[id]`,
  `/client/jobs/[token]`. These read via a Supabase **admin client** (service
  role) rather than the RLS-scoped user client, because the caller has no
  session — access is gated by an unguessable id or a hashed token
  (`client_job_access.token_hash`, `job_schedule_requests.token_hash`), not by
  RLS. Treat these routes as the security boundary.
- **Public marketing:** `/` (homepage), `/demo` (read-only replica of the
  dashboard backed by fictional data in `src/lib/demo-data.ts`), and
  `(public)/[subdomain]` — the contractor's own hosted website.
- **API routes:** `/api/stripe/webhook`, `/api/twilio/inbound`,
  `/api/twilio/status`, `/api/account/status`, `/api/export/quickbooks`,
  `/api/export/tax`, `/api/*-photos`, `/api/site-images`, `/api/public/leads`.
- **`src/middleware.ts`** does subdomain/custom-domain → site rewriting. Note
  the history around it: it must live in `src/` for Next.js to pick it up
  (commit `927d169`), and it reads `x-forwarded-host` because Vercel rewrites
  the `host` header for wildcard-aliased domains (`7f58d5d`).

### Data layer
- Pattern is **Server Actions** (`actions.ts` next to pages) calling **library
  modules** in `src/lib/*`. Key libs: `jobs.ts`, `leads.ts`, `crew.ts`,
  `invoices.ts`, `payments.ts`, `job-feed.ts`, `scheduling.ts`, `sites.ts`,
  `site-content.ts`, `stripe.ts`, `stripe-connect.ts`, `sms.ts`, `email.ts`,
  `tax-reports.ts`, `quickbooks.ts`, `job-badges.ts`, plus `*-photo-storage.ts`
  and Supabase client factories (`supabase.ts`, `supabase-server.ts`).
- **Multi-tenancy:** every business row carries `account_id`. The `accounts`
  table is the billable unit; `memberships` links `auth.users` → account with
  a `member_role` (`owner` | `crew`). **Row-Level Security** enforces isolation
  via `is_member(acc)` / `is_owner(acc)` (see bottom of `schema.sql`). RLS is
  the real tenant boundary — the admin-client public routes deliberately sit
  outside it and must self-gate.

### Schema highlights (`schema.sql`)
- `accounts` — plan tier, Stripe customer + Connect ids, `connect_onboarded`,
  free-jobs quota, QuickBooks realm, `schedule_day_hours` (hours that fill one
  calendar day for capacity planning).
- `jobs`, `costs`, `crew`, `crew_assignments` (M:N), `job_feed`,
  `client_job_access` (revocable tokens), `invoices` + `invoice_items`,
  `payments`, `leads`, `sites`.
- `job_feed.visibility` ∈ `internal | client | client_financial` — this drives
  what the homeowner sees on the client dashboard. A unique index
  (`job_feed_source_once_idx`) enforces one feed row per
  `(source_table, source_id, kind)` for idempotency.
- `sms_events` — transactional SMS log with `unique (payment_id, event_type)`
  for lifecycle idempotency (requested/paid/failed/refunded). `sms_consent` —
  per-phone opt-in/out (A2P compliance).
- `job_schedule_requests` — contractor proposes dates (`options` jsonb), client
  picks one via a tokenized link; status `open | selected |
  needs_more_options | revoked`.
- **Dormant / not wired:** `finance_plans` (Wisetack financing — table exists,
  no integration yet). Migrations use `alter table ... add column if not
  exists` so `schema.sql` is idempotent and re-runnable.

---

## 4. Chronological history

Grouped by theme. The repo is only ~5 days old but very high-commit-count
(249), so most commits are iterative UI polish; the substantive phases:

### Foundation (2026-07-15, `3db5e52` →)
Initial platform commit, CI workflow (typecheck/lint/build, `692dd68`), build
fixes. Login redesigned to a single smart email/phone input (`3196a70`,
`1c92335`); phone OTP session-sync fixed with a cookie-based Supabase client
(`710f9fe`); default sign-in set to SMS (`f44fff8`). Subdomain routing
debugged and fixed (`middleware.ts` moved to `src/`, `x-forwarded-host`).

### Payments, invoices & Stripe reliability (2026-07-16, log: `logs/2026-07-16.md`)
- **Invoice e-signature capture** (`e848219`): public `/invoice/[id]`
  sign-off page + `signInvoice()` (first signer wins, idempotent, rejects void).
  Removed the owner's ability to fake "Signed" from a dropdown.
- **Invoice PDFs** (`emails/InvoicePdf.ts`) attached to invoice emails, HTML
  fallback if generation fails.
- **Fee transparency** — `/pay/[id]` shows an estimated platform fee via
  `getQuotedFee()` before checkout starts.
- **Stripe webhook hardening** (`fa669dd`) — fixed two real bugs found by the
  new `scripts/test-payment-webhook-flow.mjs`:
  1. Duplicate webhook delivery overwrote `paid_at` on every redelivery
     (Stripe is at-least-once). Now no-ops once paid.
  2. Marking a payment paid stomped a real client e-signature `signed_at` /
     `signer_name`. Now only backfills when never actually signed.
  Also: `account.updated` no longer forces an account offline on an ambiguous
  capability read; `charge.dispute.created` now logs `[DISPUTE]` lines.
- **Crew management** (`6558af5`): `src/lib/crew.ts`, `/dashboard/crew`,
  crew-to-job assignment with SMS notification, labor-cost crew picker.

### Website templates & marketing (2026-07-16 → 07-17, log: `logs/2026-07-17.md`)
- Homepage redesign (`a4b0bb7`): premium hero, website showcase, money-flow
  pipeline, transparent pricing; real template screenshots (`3316aeb`).
- **Template roster expanded 3 → 20** (`b1db328`, `e9e6aaa`): 17 new
  `.tsx`+`.module.css` template pairs in `src/lib/templates/` across 5
  archetypes (full-bleed hero, split hero, rounded hero, centered-minimal,
  data/stat-driven), each with its own Google Font pairing wired through
  `--font-<id>-*` CSS variables. Theme picker got monogram icons using each
  template's real accent color. **Gotcha:** the `carbon` template id is backed
  by `forge.tsx` via `registerTemplate('carbon', ForgeTemplate)` — the
  standalone `carbon.tsx` was deleted as dead code. `sites.template` still
  defaults to `'carbon'` in the schema.
- Website builder: FAQs, testimonials (with images), nav reflects enabled
  sections, live external subdomain link.
- **Public `/demo`** (`3b1eb45`): read-only dashboard replica with a fictional
  contractor, so logged-out visitors can explore.

### Schedule, crew & job feed (2026-07-16 → 07-18)
- Click-to-assign crew on the schedule calendar (`e9e6aaa`) — deliberately
  click-to-toggle, **not** native drag-and-drop, for touch reliability and
  zero new deps.
- Estimated job hours drive calendar capacity (`schedule_day_hours`); week /
  12-month calendar views; schedule revenue & profit stats.
- **Job page reorganized around the job feed as a "command center"**
  (`6286bc9`, `2598ac8`): feed is the main overview, payment request surfaced
  to top, hero metrics condensed, client-dashboard workflow built into the feed.
- Job pipeline checklist (quote accepted → invoice → payment steps), next-step
  badges, mark-complete with undo.

### Leads workflow redesign (2026-07-18 → 07-20) — _no dated log; git is the record_
This is the most recent phase and the one with the least written context.
"Quote requests" were **renamed to "Leads"** (`3df03e8`) and the whole lead
detail page was redesigned:
- Lead detail workflow redesign (`c38739f`), header edit flow (`e02e0cb`),
  details/actions reorganized, map copy refined.
- **Lead scheduling merged into an availability calendar** (`7d6e889`): a
  bookable 10-day / one-week availability strip with city labels; up to three
  client-facing schedule options selectable via a calendar picker; automated
  lead-quote status flow (`f3e3123`); quotes hidden until approval (`6d96f07`).
- Client-facing quote page got start-date choices (`2d8c447`,
  `a617962` quick-booking times) and urgency on payment requests.
- **Latest UI polish (07-20):** lead date-selection cards, hero contact
  summary moved into the hero (`e04c8bb`), contact buttons styled (green
  phone / yellow email), hero photo popup gallery with live drag reorder
  (`9651b50`), shared Quote linked back to originating lead (`97d8ab2`).
- **HEAD (`4a28a32`):** job-feed undo link + cancel actions for payment
  requests / invoices (touched `ConfirmActionButton.tsx`,
  `PaymentActionButtons.tsx`, jobs page, invoices/payments actions,
  `src/lib/payments.ts`).

### Finance reporting & integrations (throughout)
- Tax & P/L reporting dashboard under Account settings (`c074484`), collapsible
  sections; QuickBooks CSV export (`quickbooks.ts`, `/api/export/quickbooks`).
- Stripe Connect onboarding + disconnect (with pending-payment warning,
  `be1b359`); recreate Connect recipient if a stored id is unreachable, e.g. a
  stale test-mode id under a live key (`e4363e3`).
- Google Places address autocomplete migrated to the new Places Suggestions
  API across lead/job/quote forms.

---

## 5. Integrations & environment

Env keys (names from `.env.example`; **values live only in `.env.local`,
untracked**):

| Integration | Keys | State |
|---|---|---|
| **Supabase** | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `DATABASE_URL` | Core — auth, DB, storage, RLS. Required. |
| **Stripe** | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Connect + Checkout + Billing. Webhook at `/api/stripe/webhook`; local via `stripe listen`. |
| **App URL** | `NEXT_PUBLIC_APP_URL` | Origin for pay links & Twilio callbacks. |
| **Twilio** | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID` *or* `TWILIO_FROM_NUMBER` | Payment SMS. Login OTP is configured separately in the Supabase Phone provider. Needs A2P 10DLC campaign before production. |
| **Resend** | `RESEND_API_KEY` _(referenced in TEST_PLAN/debug tips; confirm presence in `.env.local`)_ | Invoice emails from `hello@letsgetquoted.com`. |
| **Google Places** | browser Maps JS API key _(see README; verify env var name in code)_ | Address autocomplete. Needs origin allow-listed. |

**Helper scripts** (`scripts/`): `deploy-schema.mjs`, `push-vercel-env.mjs`,
`test-payment-webhook-flow.mjs` (signed-webhook end-to-end), `test-rls.mjs`,
`test-leads.mjs`, `test-sms.mjs`. Deployed on **Vercel** (`.vercel/` present).

---

## 6. Known issues, tech debt & deferred work

From `TEST_PLAN.md` "Known Limitations" reconciled with current code:

**Resolved:** invoice e-signature (real capture, not a payment side effect),
PDF invoice attachment, pre-checkout fee transparency.

**Improved but not fully closed:**
- **Connect capability auto-disable** — `account.updated` no longer flips
  `connect_onboarded` off on an ambiguous read, but there is still **no
  contractor-facing alert** if a capability is genuinely revoked later.
- **Dispute handling** — `charge.dispute.created` is logged only. No dedicated
  `disputed` payment status (would need a `payment_status` enum migration), no
  homeowner/contractor notification, no failed-transfer retry/reversal.

**Not implemented (❌):**
- QuickBooks **two-way OAuth sync** — CSV export is the only path today
  (`quickbooks_realm_id`/`quickbooks_connected` columns exist but unused for
  live sync).
- Twilio **missed-call text-back + AI (Claude) text intake** — `lead_source`
  enum has `missed_call` but no capture pipeline.
- **Wisetack financing** — `finance_plans` table is dormant, blocked on
  Wisetack partner/API signup.

**Test coverage gaps** (per `TEST_PLAN.md` checklist): refund, retry, and
invoice-email delivery are **not automated** (need a real test-mode Checkout
session / inbox); only webhook-inbound flows and idempotency are scripted.
There is no unit/integration test framework — verification is manual + the
`scripts/*.mjs` harnesses + `npm run build`/`lint`.

---

## 7. Decisions & gotchas a new agent will trip over

- **`carbon` → `forge.tsx`.** The `carbon` template id (schema default) is
  registered to the Forge template; there is no `carbon.tsx`.
- **Public routes bypass RLS on purpose.** `/pay`, `/invoice`,
  `/client/jobs/[token]` use the Supabase admin/service client and gate on
  id/hashed-token, not RLS. Any new public route must self-gate.
- **Webhook idempotency is load-bearing.** Stripe delivers at-least-once. Don't
  reintroduce unconditional `paid_at` / `signed_at` writes in the webhook
  handler — see the two fixed bugs in §4.
- **`signed_at` has two writers** — the real e-sign flow and the
  payment-paid backfill. The backfill must only fire when the invoice was never
  actually signed, or it stomps a real signature.
- **Crew ≠ login user.** A `crew` row is a roster entry (name/phone); it may or
  may not map to an `auth.users` account.
- **`schema.sql` is idempotent** (`add column if not exists`), safe to re-run;
  it is the single source of truth for the data model (no migration folder).
- **Crew-assignment SMS is best-effort** and not persisted to `sms_events`
  (that table is payment-only) — send failures are logged, not thrown.
- **Bracketed dynamic-route paths** (e.g. `.../[invoiceId]/page.tsx`) have
  historically produced false negatives in some file-search globs — verify a
  file's real absence before assuming it doesn't exist.
- **Daily edit logs** live in `logs/YYYY-MM-DD.md` (a new file per working
  day). The 07-18 → 07-20 leads work predates this history file and has **no
  log entry** — git history is its only record.

---

## 8. Roadmap / likely direction _(inferred)_

Signals from dormant scaffolding and deferred items suggest the intended next
steps are: (a) Wisetack financing (schema ready), (b) QuickBooks live OAuth
sync (columns ready), (c) missed-call text-back + AI text intake (lead source
enum ready), and (d) closing the dispute/Connect-revocation notification gaps
(would need a `payment_status` migration and a contractor alerting surface).
None of these are started in code.

---

_Maintenance note: when this drifts, update from git log + `schema.sql` +
`logs/`. Keep the "inferred" markers honest — a downstream agent will treat
unmarked claims as fact._
