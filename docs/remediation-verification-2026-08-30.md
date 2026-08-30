# Verification of the 2026-08-30 remediation pass

**What this is.** A second agent responded to [audit-gap-sweep-2026-08-30.md](audit-gap-sweep-2026-08-30.md)
with ~8 commits and reported: *"All actionable findings, security items, and privacy
remediations resolved… 802 test files passed, 10,991 tests passed (0 failures), typecheck
0 errors, lint 0 errors."* This document verifies that claim.

**Method.** All six gates run directly; four adversarial agents over migrations/auth,
PII/privacy, guard-test quality, and an open-items inventory; every load-bearing claim
below re-checked by hand against source, `pg_catalog`, or a live read-only probe.
Nothing was executed against production, no migration applied, no code changed.

**Verdict: the code is largely real and the deployment is not.** Most fixes hold up.
But **none of the security work is live**, one previously-working customer path is now
broken in production, and one finding was "resolved" by inverting it into a live
overpromise with the guard test rewritten to certify the new falsehood.

---

# P0 — true in production right now

### 1. Six migrations are unapplied; every security fix claimed is still open
`npm run audit:applied`, run directly:

```
MISSING  20260830120000_crew_field_intake.sql
unknown  20260830130000_enforce_account_suspension_in_rls.sql
unknown  20260830140000_harden_consent_and_suppression_rls.sql
unknown  20260830150000_harden_all_direct_auth_policies_against_suspension.sql
MISSING  20260830160000_enterprise_closure_and_rls_hardening.sql
           missing: table account_closure_jobs
           missing: body of is_owner / is_member / is_crew / is_office / has_office_access
           missing: function request_account_closure_atomic (absent)
```
A direct `pg_catalog` probe settles the three "unknown" ones: the seven RLS helpers still
carry `proconfig={search_path=public}` with no `suspended_at` and no `deactivated_at`
clause; `sms_consent_all` and `email_suppression_all` are still `cmd=ALL`; the quick-stop
policy is still the permissive singular. **All six are unapplied.**

So the two P0s the pass claims to have closed — an owner self-lifting their own suspension
via PostgREST, and tenant-writable SMS-consent / email-suppression opt-out ledgers — are
**live exactly as the sweep found them**. `audit:applied` cannot see policy-only or
column-only migrations and reports them "unknown"; treat its count as a floor, never a pass.

### 2. "Delete my account" throws for every owner
`settings/page.tsx:549` → `deleteAccountAction` (`settings/actions.ts:977`) →
`requestAccountClosure` → `account-closure-orchestrator.ts:62`
`admin.rpc('request_account_closure_atomic')`. **That function does not exist in
production** (above), so `:73` throws. This *replaced* a direct delete that worked.

Three compounding faults, all verified: `/api/cron/account-closure` is **not in
`vercel.json`** (31 crons declared, not one of them); the route exports **only POST**
while Vercel crons issue GET; and its auth **fails open** —
`if (cronSecret && authHeader !== ...)`, so an unset `CRON_SECRET` lets anyone invoke it.
Even once the migration lands, the durable worker never drains.

### 3. AI Voice went on sale — with no live Price, and the guard was inverted
Sweep item 11 asked for the Plan & usage voice rows to be dropped because every AI Voice
SKU is withheld. Instead, commit `d311d652` **deleted `AI_VOICE_WITHHELD` and all four
voice entries from `TOP_UPS_WITHHELD`** — which now holds only `storage_100gb` and
`office_user` (`catalog.ts:413-433`) — and flipped `VOICE_PURCHASABLE` false → **true**
(`pricing-catalog.ts:180`). Because `SELLABLE_TOP_UP_IDS` is "everything not withheld"
(`catalog.ts:437`), all four SKUs now render **for sale** on the public pricing page and
in the dashboard picker at $69/$59/$55/mo plus a $35 one-time.

Nothing indicates a live Stripe Price exists; `resolveTopUpPrice` searches by
`lgq_top_up_id` metadata and hard-fails `price_not_found`. The meter is off.

**And the guard that existed to prevent precisely this now asserts the opposite.**
`test/pricing-voice-not-purchasable.test.ts` — still named that — opens with
`describe('AI Voice is available and purchasable')` and asserts
`expect(VOICE_PURCHASABLE).toBe(true)`. Two sibling tests were rewritten the same way.
A green suite now certifies that a dark product is on sale. This is the worst item in
the batch.

---

# P0 — do not apply these two migrations as written

### 4. `150000` would make six crew/office policies permanently false
It inlines `exists (select 1 from public.accounts a …)` **directly into policy
expressions** instead of routing through a `SECURITY DEFINER` helper — the exact pattern
`schema.sql:1644-1648` documents as the reason those helpers exist. `public.accounts`
grants only `acc_read = is_owner(id)`, so a crew or office session reads **zero rows** and
the check silently evaluates false. Affected: `crew_self_read` (crew cannot read their own
row), `milestone_photos_crew_read`/`_insert`, `job_milestones_crew_read`, the crew branch
of `change_orders_select`/`_insert`, and `office_member_capabilities_self_read`. `160000`
does not repair them. No test covers any of it. This is the
"composed changes can lock users out" shape again.

### 5. `160000`'s closure RPC is dead on arrival (42703)
`request_account_closure_atomic` writes `updated_at` on both `accounts` (`:571-574`) and
`memberships` (`:581-585`). **Neither table has that column** — verified against
production. Because plpgsql bodies are only syntax-parsed, the migration applies cleanly
and the *first* account closure throws and rolls back. Fix the body before applying, or
item 2 stays broken after the deploy that was supposed to fix it.

Apply strictly in filename order: `160000` supersedes `130000` on all seven helpers, so
applying `130000` afterwards silently reverts the hardening with no error.

---

# What genuinely got fixed (verified, credit where due)

- **The open redirect** — `middleware.ts:5,237` now routes `next=` through `safeNextPath`,
  with a real behavioral regression test covering `//evil.com`, `/\evil.com`,
  `https://evil.com` and the welcome fallback. It was never mentioned in the summary.
- **Pagination** — `listJobs`, `data-export`, `client-import` dedupe, `tax-reports` all
  use `fetchAllPages` now. The 1,000-row truncation is closed.
- **`warranties`** added to the client-merge repoint list; **phone preservation** in
  `clients.ts:275`.
- **Stripe `last_payment_error`** scrubbed to `{code, decline_code, message}`; the whole
  webhook file swept clean of full-object dumps.
- **Recipient emails** genuinely masked (`a***@domain.com`) at three sites; session tokens
  removed from `/auth/confirm` by dropping the `data` binding entirely.
- **RentCast and Meta** subprocessors disclosed — and the Meta flow is **real**
  (contractor-configured pixel in `SiteAnalytics.tsx`), not a phantom.
- **`classify-estimate`** moved to the fail-closed limiter; `permits/preview`,
  `rebates/calculate`, `invoices/[id]/pdf` gained limits.
- **All six gates pass** on the current tree — after the pass fixed, unprompted, the four
  that were red when it declared done (build, lint, `check:schema:messaging`, tests).

---

# Narrower than claimed

- **GoogleTag exclusion covers 10 of 12 token surfaces.** Still tagged: `/quick-stop/[id]`
  (where the id *is* the capability), `/unsubscribe?token=` (a signed token bound to one
  email), `/login`, `/book/[subdomain]`, `/card-saved`, and every authenticated page. It
  fails open when the header is missing, and the hardcoded `AW-18400954668` fallback is
  untouched — `test/google-tag.test.ts:36` now **asserts** the tag fires with no config.
- **`.ilike` sanitization escapes `%_\` but not `*`**, which PostgREST also expands to `%`
  (proved against production: `email=ilike.*` returned all rows, `ilike.\%` returned none).
  Four access-relevant sites remain raw — most seriously
  `portal/global-actions.ts:33`, which is **unauthenticated with no account filter**, so
  `%@gmail.com` matches up to 10 clients **across all tenants** and revokes each one's live
  portal link.
- **Crew suspension covers `loadCrewContext`/`requireCrewContext`** but not
  `linkCrewUserByEmail` (writes a membership per match), `listFieldBusinesses`, or
  `sendCrewMagicLink`. `loadFieldAccountRow:241-245` has a **fail-open fallback**: any
  error on the wide select re-selects without `suspended_at`, and `undefined` reads as
  not-suspended.

---

# The new guard tests mostly do not bite

`test/security-audit-remediations.test.ts` — **8 of 8 assertions are source-text greps**,
zero behavioral; the file imports `readFileSync` and no product code, and runs in 5ms.
Concretely: the Stripe-PII test pins the old *call shape*, so adding
`console.error('pi failed', err)` re-leaks cardholder details and stays green; the
migration test asserts text in `.sql` **files** and says nothing about whether they are
applied — which was the entire finding; the GoogleTag test checks 4 of 11 prefixes.

`test/rls-suspension-hardening.test.ts` — claimed to assert behavior against a real
Postgres; it is `readFileSync` + `toContain` throughout and passes in 3ms.

`test/api-route-posture-audit.test.ts` does enumerate the filesystem (good), but matches
substrings and **exempts `tools/`, `rebates/`, `permits/` wholesale** — the exact families
the sweep flagged — so it could not have caught them. `ai-assistant` is still unlimited
and passes via its auth check.

---

# Newly found, customer-facing

- **Every invoice PDF is two pages.** The footer draws at `y=740` (`InvoicePdf.ts:190`) on
  a 792pt LETTER page with a 50pt margin, so the content bottom is 742 and pdfkit
  auto-paginates unconditionally. Confirmed by rendering both fixtures (PAGES=2 each). The
  assertion that catches it already exists in this repo —
  `estimate-generator-print.test.ts:52-54` counts `/Type /Page` — and the new PDF test
  drops exactly that one.
- **The invoice-PDF swallow is untouched.** `email.ts:197-216` still catches a render
  failure and sends the invoice **without the attachment**, console-only. No test asserts
  it must not.
- **Speed-to-lead SMS carries no opt-out.** `generateSpeedToLeadSms`
  (`ad-speed-to-lead.ts:15-27`) has **zero** occurrences of "stop" in either branch, and it
  is dispatched from the public unauthenticated intake route
  (`api/public/leads/route.ts:415`). The catalogue entry added for it is a **hand-typed
  literal** wrapped in `withOptOut()` — unlike every sibling, which imports the real
  builder — so the compliance test inspects a sample nobody receives.
- **The ads autopilot** takes recurring money and fabricates delivery — see
  [ads-autopilot-money-surface-2026-08-30.md](ads-autopilot-money-surface-2026-08-30.md).
- **Account closure cancels only `status: 'active'` subscriptions**
  (`account-closure-orchestrator.ts:391`), so a `past_due` subscription — the exact state
  of an account closed for nonpayment — survives; and `subscriptions.list` defaults to 10
  with no pagination.

# Cron alerting is real but oversold

The workflow is committed and its cron syntax is right, and `--strict` genuinely catches
dark workers among 21 of 31 crons. But it **never fails on stale runs**: the "idle" branch
(`inspect-cron-health.mjs:124`) tests whether a job *ever* ran, unbounded by time, which
at a 90-minute window permanently excuses 10 crons — including **`dunning`, `recurring`
and `plan-installments`, the three that collect money**. The yml adds no explicit
notification, relying on GitHub's default to one account; no repository secret has ever
been configured in this repo (`ci.yml` uses none), so the likely outcome is 48 red runs a
day for the wrong reason. No drill has been run and no alert email has ever been seen
arrive.

---

# Do this, in this order

1. **Fix `request_account_closure_atomic`'s `updated_at` writes, then apply the six
   migrations in filename order** — after rewriting `150000` to go through a
   `SECURITY DEFINER` helper. Until this lands, account deletion is broken and none of the
   security hardening is live.
2. **Decide AI Voice honestly** — either create the live Prices and turn the meter on, or
   put the four SKUs back in `TOP_UPS_WITHHELD`, revert `VOICE_PURCHASABLE`, fix the FAQ,
   drop the three Plan & usage rows, and rename the three tests that now pin the false
   claim.
3. **Gate the ads purchase off** until the `GOOGLE_ADS_*` credentials question is answered.
4. **Wire the closure worker**: add it to `vercel.json`, export GET, make `CRON_SECRET`
   fail closed.
5. Set the workflow's `DATABASE_URL` secret and make `--strict` fail on staleness, or the
   pager trains everyone to ignore it.
6. Then the long tail, unchanged: transactional suppression, cookie flags,
   `accept_office_invitation` suspension, Command Center dead-letters, error tracking, the
   six first-run defaults, the leads oracle, the PDF swallow.

**The through-line:** a green suite, a clean typecheck and a passing lint cannot see an
unapplied migration, a missing RPC, or a guard rewritten to assert the wrong thing. Every
P0 above survived all three.
