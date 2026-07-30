# Backend audit — 2026-07-29

Read-only source audit across five tracks: auth/tenant-isolation, Stripe/money,
public endpoints, cron/background, and secrets/config. Findings are consolidated
and de-duplicated, most severe first. **No critical IDOR, injection, auth-bypass,
or secret leak was found.** The real gaps are (1) refund idempotency, (2) abuse /
rate-limiting on public write paths, and (3) missing HTTP security headers.

## Overall posture

**Strong, verified:**
- Multi-tenant isolation is airtight — RLS enabled on all 35 tables; every owner action goes through `requireOwnerContext()` + the RLS client and additionally pins `.eq('account_id', …)`; admin-client routes always re-scope with a `getX(admin, accountId, id)` read before writing. No cross-tenant IDOR found.
- Stripe webhook verifies the signature before any DB work and uses compare-and-set idempotency throughout (won't resurrect refunded→paid).
- Secrets never reach the client bundle; service-role/anon split is clean; exports and account-delete are correctly account-scoped; admin console is 404-gated + audited.
- Money-moving crons (recurring, dunning, plan-installments) use atomic claims + Stripe idempotency keys + webhook reconciliation — no double-charge path found.
- Public IDs are unguessable UUIDs / hashed tokens; Twilio webhooks validate signatures; photo storage is path-traversal-proof.

---

## Priority 1 — fix first

### P1-a. Refund path lacks idempotency → realistic double-refund
`src/lib/payments.ts:383-469` (`refundPayment`). It's the one money-moving op with **no Stripe `idempotencyKey`** and a non-atomic read-modify-write of `refunded_amount` (plain `.eq('id',…)`, no compare-and-set). A retry after a lost DB write, or a double-click / concurrent call, can issue a second refund. Bounded by the captured amount (Stripe blocks over-refund) but still real money out and refunds more than intended.
**Fix:** deterministic `idempotencyKey` on `stripe.refunds.create` (e.g. `refund_${paymentId}_${alreadyCents}_${requestedCents}`) + compare-and-set on the DB write (`.eq('refunded_amount', prior)`), reload on 0 rows.

### P1-b. Extra Stop cancellation refunds *before* claiming the status
`src/lib/extra-stop-refunds.ts:96-128` — calls `refundPayment` then runs the idempotency claim. Two concurrent resolutions (customer-cancel racing admin-resolve, or a double-submit) both refund before one loses the claim. Same ordering in `confirmExtraStopPayment` (`extra-stop-payments.ts:127-134`). Compounds P1-a.
**Fix:** claim the terminal status with the compare-and-set **first**; only the winner calls `refundPayment`.

### P1-c. Public write paths have no real abuse control (cost DoS / SMS pumping / email amplification)
Turnstile + durable limiting exist but are wired **only to the marketing `/contact` form**. These revenue-path endpoints have only per-instance in-memory `Map` counters (useless on Vercel — reset on cold start, per-lambda):
- `/api/public/leads` + `submitBookingAction` / `submitExtraStopRequestAction` / `submitCallbackAction` (`book/[subdomain]/actions.ts`) — scripted spam burns **paid OpenAI + Google geocoding**, fills the DB, floods the owner inbox.
- `/api/public/leads/verify-phone` — sends an SMS code to an **attacker-supplied number** → SMS pumping / toll fraud / text-bombing.
- Photo uploads: 6 × 6MB = 36MB per unauth request → storage/bandwidth DoS.
- `submitBookingAction` → `sendBookingConfirmationEmail` sends a branded email to an **attacker-chosen recipient** (booking.ts:309-318) → phishing amplification + sender-reputation damage.
**Fix:** wire the existing Turnstile onto these four surfaces + move rate-limiting to a shared store (Upstash/Redis); hard per-number/day caps on verify-phone; don't email an unverified recipient on an unauthenticated request.

### P1-d. No HTTP security headers
`next.config.mjs` / `vercel.json` set none — no CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy. Dashboard is framable (clickjacking); public tenant sites (`/site/[subdomain]`, `/site-domain/[domain]`) render owner-supplied AI/blog HTML with **no CSP to contain stored XSS**.
**Fix:** add a `headers()` block — `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Strict-Transport-Security`, `Referrer-Policy`, and a CSP scoped over the public-site routes.

---

## Priority 2 — correctness / revenue

### P2-a. Invoice marked fully paid on any single payment
`src/lib/invoices.ts:198-211` (`markInvoicePaidForPayment`, called from the webhook) flips an invoice to `paid` when *any* linked payment settles — a $2k deposit on a $10k invoice marks the whole thing paid. The manual path already does it right (`>= total`) and its comment calls out this exact webhook bug.
**Fix:** sum paid payments for the invoice; only flip to `paid` at `>= total`.

### P2-b. Fee-tier gaming via manual "cash" payments
`getTrailingVolume` (`payments.ts:49-78`) sums all `status='paid'` rows (excluding only `imported`), including `markPaymentPaidManually` cash/check rows with no Stripe intent. A contractor can self-mark large cash "payments" to inflate trailing volume and drop their real platform fee.
**Fix:** count only Stripe-settled volume (require non-null `stripe_payment_intent`, or a `manual` flag excluded like `imported`).

### P2-c. Daily digest drops coverage past 500 accounts
`src/lib/daily-digest.ts:132-140` applies `.limit(500)` with no order **before** the in-memory "already sent today" filter → accounts 501+ silently never get a digest.
**Fix:** push the date filter into the query and/or order `last_digest_date asc nulls first`; paginate.

---

## Priority 3 — low / hardening

- **Checkout self-heal** writes `status='paid'` without a status guard — the one transition missing compare-and-set (`payments.ts:253-267`). Add `.in('status',['requested','processing','failed'])`.
- **Refund application-fee split** on destination charges relies on Stripe defaults (platform is losses_collector) — make the intended behavior explicit rather than default (`refundPayment`).
- **Notification idempotency** (reminders/followups/digest) is read-then-write, not atomic — a double-send window only under truly concurrent cron runs. Harden with a unique guard / compare-and-set stamp.
- **Timezone date math** in scheduled sends is UTC-only and ignores the existing `accounts.timezone` — correct-by-luck for the continental US at current cron hours; fragile for HI/dateline/DST. (reminders.ts, daily-digest.ts, followups.ts)
- **Extra Stop auto-complete** parses `arrival_end` as UTC not owner-local (`extra-stop-sweep.ts:117`) → premature auto-complete (status-only, no money).
- **`.or()` filter injection** via `email` in the lead blocklist (`api/public/leads/route.ts:131-142`) — `EMAIL_REGEX` allows commas, so a crafted "email" injects extra OR conditions. Stays account-scoped (no cross-tenant read), but a malformed condition errors the query → `blocked` is null → **the blocklist check fails open** (a blocklisted contact can slip a lead through). Use separate `.eq()` queries (as `hasActiveExtraStopRequest` already does) and tighten the regex.
- **Review-invite tokens** are stored in **plaintext** (`review_invites.token`), never expire, and the rating is overwritable — unlike the schedule/client-job flows which hash tokens (`reviews.ts:116-146`, `review/[token]/actions.ts`). Low (needs the unguessable 144-bit token) but a DB/backup/log leak exposes live tokens. Fix: store a SHA-256 `token_hash`, add `expires_at`, gate acceptance on `responded_at is null`.
- **Invoice signing** is keyed only on the raw invoice UUID and mutates state (invoice→signed, lead→won, job→in_progress) for any holder of the id (`invoice/[id]/actions.ts`, `invoices.ts:379-422`). Correctly idempotent (can't overwrite a real signature) and the id is unguessable, so low — but prefer routing it through the hashed `client_job_access` token like the other client flows.
- **Unescaped TwiML** reflection of DB strings (`api/twilio/inbound/route.ts:48`) — malforms XML on `&`/`<`; escape before interpolation.
- **`getPublicPayment` selects `*` + account `stripe_connect_id`** on a public path (`payments.ts:162-166`) — not leaked to the client today, but over-selecting on an unauthed route is fragile; use an explicit column list.
- **PII in logs** — `email.ts` logs recipient email on every send; drop/mask it.
- **DB error passthrough** — `throw new Error(error.message)` in server actions leaks Postgres/PostgREST detail to the client; throw generic, log detail.
- **Invoice PDF** (`api/invoices/[id]/pdf`) is intentionally public, keyed only on the invoice UUID — acceptable given unguessable IDs; ensure a sequential `ref` is never used in a URL.
- **Field task actions** don't verify `taskId` belongs to `jobId` — intra-account only (RLS blocks cross-tenant); minor.
- **Self-serve account delete** has no server-side typed confirmation (client confirm only); scoped to the caller's own account, so low impact.

---

## Remediation status (2026-07-29)

**Fixed & deployed** (schema migrations applied):
- ✅ P1-a refund idempotency key + compare-and-set (`3f179fe`)
- ✅ P1-b claim-before-refund in `resolveExtraStopCancellation` (`3f179fe`)
- ✅ P1-c durable Postgres rate limiter on verify-phone / classify-estimate / extra-stop-qualify / lead + booking actions, with per-number daily cap (`1c581ff`)
- ✅ P1-d security headers — X-Frame-Options, CSP frame-ancestors, HSTS, nosniff, Referrer-Policy, Permissions-Policy (`bddff8d`)
- ✅ P2-a invoice only marked paid when collected ≥ total (`3f179fe`)
- ✅ P2-b trailing volume = Stripe-settled only (`3f179fe`)
- ✅ P2-c daily-digest coverage past 500 accounts (`bddff8d`)
- ✅ P3 checkout self-heal status guard (`3f179fe`), `.or()` blocklist injection → separate `.eq()` (`bddff8d`), PII removed from email logs (`bddff8d`), TwiML XML-escaped (`bddff8d`)

**Deliberately deferred** (low severity; need schema/behavior changes best done with care):
- Full content-CSP (script-src/style-src) — needs per-route nonces/allowlists + testing (only `frame-ancestors` shipped).
- Review-invite token hashing + expiry — token is already 144-bit unguessable; hashing needs a schema change + read-path rewrite.
- Cron UTC→owner-timezone date math (reminders/digest/followups) + Extra Stop auto-complete UTC parse — correct-by-luck for the continental US; needs tz plumbing.
- `getPublicPayment` `select('*')` narrowing — not leaked today; narrowing risks dropping a needed column.
- DB-error passthrough in server actions — owner-scoped, low; broad refactor.
- Notification (reminders/followups/digest) atomic-claim idempotency — only bites under truly concurrent cron runs (Vercel doesn't).
- Invoice-signing via raw UUID / field taskId intra-account scoping / self-serve delete typed confirm — design-level, no cross-tenant break.

## Suggested order of work
1. **P1-a / P1-b** (refund idempotency + ordering) — small, contained, real money.
2. **P1-c** (Turnstile + shared-store rate-limiting on the four public endpoints) — needs a rate-limit store (Upstash/Redis) decision.
3. **P1-d** (security headers) — quick, broad win.
4. **P2-a / P2-b** (invoice over-mark, fee-tier basis) — revenue correctness.
5. Sweep the P3 hardening list.
