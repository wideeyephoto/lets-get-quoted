# Vendor account continuity register — G4

Scaffolded per
[G4 in the gap closure plan](prelaunch-gap-closure-plan-2026-09-11.md#g4--no-vendor-account-continuity-register):
"agent scaffolds, operator fills." Every row below cites the exact env vars and
source files an agent can verify from the repository. **The Plan/Tier, Payment
method, Billing owner, Billing-alert recipient and Console-confirmed columns
are blank because they require a console login this session does not have —
they are the operator's half of this document**, not omissions.

Do not close G4 by filling in the table alone. The gap plan's evidence bar is:
a non-expiring payment method and billing alerts confirmed on each vendor,
SignalWire auto-recharge confirmed, and a dated, numbers-backed Supabase
tier decision. A fully filled table without those three is a nicer-looking
gap, not a closed one.

## How to fill this in

For each vendor: log in to the console URL, confirm the plan/tier and payment
method on file (card brand/last4 and expiry, or "invoiced"), confirm a
billing-alert recipient is set and routes to [a monitored address](prelaunch-gap-closure-plan-2026-09-11.md#g3--nobody-has-proven-a-human-receives-mail-at-any-of-the-14-addresses),
and date your entry. A blank "What breaks at the limit" cell means nobody has
tested it — write what you'd expect from the code cited, then correct it once
observed.

---

## Vendors

### Vercel — hosting, cron, deployment

| | |
|---|---|
| Console | <https://vercel.com/dashboard> → project settings → Billing |
| Env vars | `VERCEL_TOKEN`, `VERCEL_AUTH_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID` |
| What depends on it | The entire product. All 51 cron jobs (`vercel.json`), every deployment, environment variables (baked at build — see the T26 note on `ONCALL_PRIMARY_EMAIL` elsewhere in this checklist). |
| Plan/tier | *(operator: confirm)* |
| Payment method + expiry | *(operator: confirm)* |
| Billing owner | *(operator: confirm)* |
| Billing-alert recipient | *(operator: confirm — route to a [G3](prelaunch-gap-closure-plan-2026-09-11.md#g3--nobody-has-proven-a-human-receives-mail-at-any-of-the-14-addresses)-confirmed address)* |
| Hard limits | Function duration (`maxDuration` per route, e.g. 120s on `operational-alerts`), cron count/frequency, bandwidth, build minutes — plan-dependent. |
| Behavior at limit | Deploys fail or crons silently stop running. `scripts/inspect-cron-health.mjs` (§ below) is what would surface a stopped cron, if run. |
| Log retention | **Open — this is G9.** Sets the forensics window; not recorded anywhere yet. Record the number here once read from Vercel's plan page. |
| Console-confirmed | *(date)* |

### Supabase — database, auth, storage, realtime

| | |
|---|---|
| Console | <https://supabase.com/dashboard> → project → Settings → Billing / Usage |
| Env vars | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| What depends on it | Everything with state: 162+ RLS-enforced tables, Auth, and 7 Storage buckets (`insurance-proof`, `job-photos`, `lead-photos`, `site-videos`, `site-images`, `crew-photos`, `account-attachments`). |
| Plan/tier | **Free, by deliberate decision** (checklist §11, "keep-Free decision"), framed around PITR being disabled. The *other* Free-tier ceilings — database size, Storage across all 7 buckets, egress, log retention, connection count — have never been sized against real usage. That sizing, not a re-litigation of the Free decision, is what closes this row. |
| Payment method + expiry | *(operator: confirm — Free tier may still want a card on file to avoid a hard stop if usage forces an upgrade)* |
| Billing owner | *(operator: confirm)* |
| Billing-alert recipient | *(operator: confirm)* |
| Hard limits (Free tier, size now against real usage) | Database size, total Storage, monthly egress, log retention window, concurrent connections (via Supavisor pooler — see `docs/large-tenant-capacity-gate.md`), Auth SMS rate limits (**this is G8**, tracked separately since 2026-08-31 and still open). |
| Behavior at limit | Undocumented for this project specifically — Supabase's own published Free-tier behavior is project pause after inactivity and hard caps on size/egress; verify against the current plan page rather than assuming. |
| Console-confirmed | *(date)* |

### Stripe — payments, Connect, billing, tax

| | |
|---|---|
| Console | <https://dashboard.stripe.com> → Settings → Billing |
| Env vars | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_BILLING_WEBHOOK_SECRET`, `STRIPE_CONNECTED_PAYMENT_WEBHOOK_SECRET`, `STRIPE_TOP_UP_WEBHOOK_SECRET`, six `STRIPE_PRICE_*` vars |
| What depends on it | All revenue: subscriptions, top-ups, merchandise, Connect payouts to contractors, refunds. |
| Plan/tier | Stripe itself has no "plan" to lapse — this row is about the *platform account*, not a subscription. |
| Payment method + expiry | N/A — Stripe charges by transaction, not a card on file. Confirm the **payout bank account** is current instead. |
| Billing owner | *(operator: confirm)* |
| Billing-alert recipient | *(operator: confirm)* |
| Hard limits | API rate limits (not currently monitored for), radar/fraud thresholds, and — separately tracked as **G2** — sales tax registration state. |
| Behavior at limit | A rate-limited API call fails the request it was in (a checkout, a refund) rather than degrading gracefully; no retry/backoff policy for this was found in `src/lib/stripe.ts` or `src/lib/payments.ts`. |
| Console-confirmed | *(date)* |

### SignalWire — SMS and voice

| | |
|---|---|
| Console | <https://signalwire.com> → Dashboard → Billing |
| Env vars | `SIGNALWIRE_SPACE_URL`, `SIGNALWIRE_SPACE_ID`, `SIGNALWIRE_PROJECT_ID`, `SIGNALWIRE_API_TOKEN`, `SIGNALWIRE_SIGNING_KEY`, `SIGNALWIRE_FROM_NUMBER`, `SIGNALWIRE_NUMBER_GROUP_ID` |
| What depends on it | All customer/contractor SMS and the AI Voice receptionist. |
| Plan/tier | Prepaid balance, not a subscription tier. |
| Payment method + expiry | *(operator: confirm)* |
| **Auto-recharge** | **Not confirmed — explicitly named in the gap plan.** SMS and voice stop at zero balance with **no application-level symptom** until a customer reports it; nothing in `src/lib/voice/` or the SMS send path checks balance before sending. This is the single highest-priority cell in this entire register. |
| Billing-alert recipient | *(operator: confirm — this is arguably the most urgent alert route in the register, since the failure mode is silent)* |
| Hard limits | 10DLC campaign throughput, per-number rate limits. |
| Behavior at limit | Balance exhaustion: sends fail; nothing pages anyone. 10DLC throughput: provider-side throttling, likely surfaces as delivery delay rather than an error. |
| Console-confirmed | *(date)* |

### Resend — transactional and operational email

| | |
|---|---|
| Console | <https://resend.com/settings/billing> |
| Env vars | `RESEND_API_KEY`, `RESEND_DOMAINS_API_KEY`, `RESEND_WEBHOOK_SECRET` |
| What depends on it | Every outbound email including the operational alert path itself (`src/lib/operational-monitor.mjs`) — if this vendor fails, the system trying to tell you it failed is the same system that just failed. This is exactly why [G3](prelaunch-gap-closure-plan-2026-09-11.md#g3--nobody-has-proven-a-human-receives-mail-at-any-of-the-14-addresses) asks for an independent (non-Resend) failure path. |
| Plan/tier | *(operator: confirm)* |
| Payment method + expiry | *(operator: confirm)* |
| Billing-alert recipient | *(operator: confirm — by definition cannot be a Resend-delivered address alone)* |
| Hard limits | Monthly send volume, domain verification limits. |
| Behavior at limit | Sends start failing (`resendRequest` in `operational-monitor.mjs` throws `resend_http_{status}` on a non-OK response) — the monitor's own failure path is designed to catch this and fall back to SMS, but only if `ONCALL_PRIMARY_PHONE` is set (see G3). |
| Console-confirmed | *(date)* |

### Google Cloud — Gemini API, Maps, Ads

Three distinct products under one billing account; verify each surfaces the
same project/billing account you expect, since G1 found the AI tier claim
itself was never verified against the console.

| | |
|---|---|
| Console | <https://console.cloud.google.com/billing> |
| Env vars | `GEMINI_API_KEY` (also tracked by **G1**), `GOOGLE_MAPS_API_KEY`, `GOOGLE_ADS_CLIENT_ID`/`GOOGLE_ADS_CLIENT_SECRET`/`GOOGLE_ADS_DEVELOPER_TOKEN`/`GOOGLE_ADS_MCC_CUSTOMER_ID`/`GOOGLE_ADS_REFRESH_TOKEN`/two `GOOGLE_ADS_CONVERSION_ACTION_*` vars |
| What depends on it | Gemini: AI quote drafting, photo analysis, voice transcription (19 call sites in `src/lib/ai-model-call.ts`). Maps: geocoding, service-area lookups. Ads: managed ad campaigns and conversion tracking (**G10**). |
| Plan/tier | Gemini's billing-enabled state is **G1**, open. Maps and Ads are pay-per-use against the same or a different billing account — confirm which. |
| Payment method + expiry | *(operator: confirm)* |
| Billing-alert recipient | *(operator: confirm — a spend spike on an unmetered AI path is exactly the failure the "Do not build the Flex monthly refill yet" deferral and the credit-ledger-has-no-consumer item elsewhere in this checklist both worry about)* |
| Hard limits | Gemini: rate limits per model/tier. Maps: daily quota per API. Ads: standard Google Ads API quotas. |
| Behavior at limit | Not verified for any of the three. |
| Console-confirmed | *(date)* |

### OpenAI — AI inference (secondary provider)

| | |
|---|---|
| Console | <https://platform.openai.com/settings/organization/billing> |
| Env vars | `OPENAI_API_KEY`, `OPENAI_IMAGE_MODEL` |
| What depends on it | Shares the 19 `src/lib/ai-model-call.ts` call sites with Gemini. |
| Plan/tier | **Open — this is G1's other half.** The privacy page's zero-data-retention claim for this provider is very likely false as written (ZDR is an approved-account feature, not default) until confirmed. |
| Payment method + expiry | *(operator: confirm)* |
| Billing-alert recipient | *(operator: confirm)* |
| Hard limits | Usage tier rate limits, scale with spend history. |
| Behavior at limit | Not verified. |
| Console-confirmed | *(date)* |

### Meta — Facebook/Instagram ads and conversions

| | |
|---|---|
| Console | <https://business.facebook.com/billing_hub> |
| Env vars | `FACEBOOK_APP_SECRET`, `META_APP_ID`, `META_ACCESS_TOKEN`, `META_APP_SECRET`, `META_PAGE_ACCESS_TOKEN`, `META_SYSTEM_USER_TOKEN`, `META_VERIFY_TOKEN`, `META_WEBHOOK_VERIFY_TOKEN`, `META_AD_ACCOUNT_ID`, `META_PAGE_ID`, `META_PIXEL_ID`, `META_DATASET_ID`, `META_GRAPH_API_VERSION` |
| What depends on it | Managed ad campaigns and Meta Pixel/Conversions API tracking, gated separately in [the Meta ads launch checklist](meta-ads-launch-checklist.md). |
| Plan/tier | Ad spend billing, not a subscription. |
| Payment method + expiry | *(operator: confirm)* |
| Billing-alert recipient | *(operator: confirm)* |
| Hard limits | Ad account spending limit (self-set in Meta Ads Manager), API rate limits. |
| Behavior at limit | A spending limit halts delivery, not billing — confirm one is actually set, since its absence is a real-money exposure symmetric to the SignalWire auto-recharge gap above, just in the opposite direction (unbounded spend vs. silent stop). |
| Console-confirmed | *(date)* |

### Printful — merchandise fulfillment

| | |
|---|---|
| Console | <https://www.printful.com/dashboard/billing> |
| Env vars | `PRINTFUL_API_KEY`, `PRINTFUL_ACCESS_TOKEN`, `PRINTFUL_STORE_ID`, `PRINTFUL_WEBHOOK_SECRET` |
| What depends on it | The merchandise/card ordering flow (`src/lib/merchandise/printful-client.ts`, `card-operations.ts`, `card-catalog-types.ts`). |
| Plan/tier | *(operator: confirm)* |
| Payment method + expiry | *(operator: confirm — Printful charges per fulfilled order, so a lapsed method blocks order fulfillment, not just new signups)* |
| Billing-alert recipient | *(operator: confirm)* |
| Hard limits | Per-order and catalog API rate limits. |
| Behavior at limit | Not verified — check whether a failed fulfillment call surfaces to the customer or silently drops the order. |
| Console-confirmed | *(date)* |

### Intuit / QuickBooks — accounting sync

| | |
|---|---|
| Console | <https://developer.intuit.com> → app dashboard |
| Env vars | `QUICKBOOKS_CLIENT_ID`, `QUICKBOOKS_CLIENT_SECRET`, `QUICKBOOKS_ENVIRONMENT`, `QUICKBOOKS_REDIRECT_URI` |
| What depends on it | Contractor-side QuickBooks OAuth sync (per-contractor connection, not a platform-wide account this company pays for directly — but the developer app itself has its own standing and rate limits). |
| Plan/tier | Free developer app tier is typical; confirm nothing has changed. |
| Payment method + expiry | N/A unless the developer account itself has a paid tier. |
| Billing-alert recipient | *(operator: confirm — a revoked developer app breaks sync for every connected contractor at once)* |
| Hard limits | Intuit API rate limits, per-realm and per-app. |
| Behavior at limit | Not verified. |
| Console-confirmed | *(date)* |

### Acorn Finance — homeowner financing

| | |
|---|---|
| Console | Acorn Finance partner portal (URL not in repo — operator to add) |
| Env vars | `ACORN_FINANCE_PARTNER_CODE` |
| What depends on it | Homeowner financing offers (`src/lib/acorn-financing.ts`, `src/lib/bnpl-financing.ts`), the $1,000 minimum loan floor work referenced elsewhere in this checklist. |
| Plan/tier | Partner agreement, not a metered API — confirm there is no separate billing relationship beyond the partner code. |
| Payment method + expiry | *(operator: confirm whether applicable)* |
| Billing-alert recipient | *(operator: confirm)* |
| Hard limits | Not documented in this codebase. |
| Behavior at limit | Not verified. |
| Console-confirmed | *(date)* |

### Cloudflare (Turnstile) — bot/abuse protection

| | |
|---|---|
| Console | <https://dash.cloudflare.com> → Turnstile |
| Env vars | `TURNSTILE_SECRET`, `TURNSTILE_SECRET_KEY` (two names for what appears to be the same credential — confirm both are actually read, or that one is dead) |
| What depends on it | Bot protection on public forms, notably `src/app/contact/actions.ts` (bounded with `AbortSignal.timeout(6000)` per the egress-timeout hardening work already in this checklist). |
| Plan/tier | Turnstile's free tier has no meaningful cap for this scale; confirm nothing has changed. |
| Payment method + expiry | N/A on the free tier. |
| Billing-alert recipient | N/A unless upgraded. |
| Hard limits | Effectively none at free tier. |
| Behavior at limit | A Turnstile outage/timeout: the 6s bound means the contact form fails closed rather than hanging — confirm the failure mode a user actually sees is a real error, not a silent drop. |
| Console-confirmed | *(date)* |

---

## Evidence to close G4

- Every "operator: confirm" cell filled with a dated console read.
- SignalWire auto-recharge confirmed on, with the threshold and top-up amount recorded.
- Meta ad account spending limit confirmed set (or explicitly decided against, with the reasoning recorded).
- A stated, dated Supabase tier decision citing actual current usage against each Free-tier ceiling — extending the existing keep-Free decision with numbers, not re-litigating it.
- G9 (Vercel log retention) filled in as part of this same pass, since it lives in the same console.

This register does not itself close G2 (Stripe tax), G8 (Supabase Auth SMS limits) or G10 (ad conversion recording) — each is cross-referenced above where it overlaps, but has its own evidence bar in [the gap closure plan](prelaunch-gap-closure-plan-2026-09-11.md).
