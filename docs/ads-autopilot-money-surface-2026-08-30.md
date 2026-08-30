# The ads autopilot takes recurring money and fabricates the delivery

**Found:** 2026-08-30, verifying an unrelated remediation pass.
**Status:** live and sellable right now. Nothing here was executed — no checkout was
created, no campaign provisioned. Every claim below is read from source.

The [audit-gap sweep](audit-gap-sweep-2026-08-30.md) committed this morning does **not**
cover this. The AI advertising autopilot landed in commits after that sweep ran, so it
has never been audited by anything. It is a new money surface with a new external
dependency, shipped days before the first unknown customer.

---

## What it charges

`src/app/api/stripe/ad-budget/route.ts` → `createAdBudgetCheckoutSession`
(`src/lib/ad-billing.ts:59`) creates a **real recurring Stripe subscription**
(`mode: 'subscription'`, monthly) using an inline `price_data` — not a catalog Price.
The amount is the ad budget **plus a 15% platform fee** (`AD_PLATFORM_FEE_RATE`,
`ad-billing.ts:8`) combined into a single `unit_amount`.

Reachable today: the page is `/dashboard/marketing/ads` behind
`requireOfficeContext('settings.write')`, and the public feature page
`src/app/features/ai-ads/page.tsx:101` advertises it with a **"Launch My Campaign"**
CTA pointing straight at it. It is announced in `src/lib/changelog.ts:96`. **No feature
flag gates any of it.**

## What it delivers

On `checkout.session.completed`, `handleAdBudgetWebhookEvent` marks the workspace's ad
budget **active** and then calls `provisionManagedSearchCampaign` (`ad-billing.ts:230`).

That provisioning **cannot report failure**, through three independent layers:

1. **It is not awaited.** `provisionManagedSearchCampaign({...}).catch(err => console.warn(...))`
   (`ad-billing.ts:230-241`) — a floating promise. The webhook returns `true` no matter
   what happens, and the money is already recorded as collected.
2. **The function never returns failure on this path.** `google-ads-api.ts:102` wraps the
   real Google Ads REST calls in `if (isGoogleAdsConfigured())`. If any of the five
   `GOOGLE_ADS_*` env vars is missing the whole block is skipped; if the API throws, the
   `catch` at `:182` logs `console.warn` and falls through. **Both roads land on the same
   simulated return** (`:188-196`): `success: true`, `status: 'simulated'`, and a
   **fabricated campaign id** `gads_<random 9 digits>`. The comment calls this mode
   "for staging/development without live MCC keys" — there is no environment check, so
   it behaves identically in Production.
3. **The `simulated` status is discarded.** Because the call is fire-and-forget, the
   result object is never captured. A repo-wide grep finds no consumer of `'simulated'`
   from this module anywhere — it is never stored on the account, never checked, never
   shown to the contractor or to staff.

**Net effect:** a contractor pays a real recurring monthly subscription (minimum $100
budget, so ≥$115/mo with fee, and **no upper bound is validated** — `route.ts:10` takes
`monthlyBudgetDollars` straight from the request body and only a `< 100` minimum is
enforced at `ad-billing.ts:71`). The dashboard says the budget is active. If the Google
Ads credentials are not set in Vercel Production, **no ad ever runs**, and the only trace
is a `console.warn` in Vercel logs — which, per this morning's audit, reaches nobody:
there is no error tracker, no alerting, and no one watching function logs.

Whether those credentials are set in Production **cannot be determined from here** —
Vercel Sensitive env vars are write-only. That is the first thing to check, and it is
one question to the operator.

## Second defect: the ads would point at a hostname that does not exist

`ad-billing.ts:238` builds the campaign's landing page as
`https://${accountId}.letsgetquoted.com/estimate` — the **raw account UUID** as a
subdomain. This is the only place in the codebase that does that; every other site URL
is built from the `sites.subdomain` slug. The ads page itself, twenty files away, does it
correctly (`marketing/ads/page.tsx` reads `siteRow.subdomain` and `custom_domain`). So
even with live credentials and a real campaign, paid clicks would land on a dead host.

## Third: the invoice line contradicts the fee

The single line item is named `Managed Google Search Ads — $600/mo Budget` while
`unit_amount` is budget **+ 15%**, and its description reads *"100% applied to Google
search clicks."* The customer's Stripe invoice will show $690 against a line that names
$600 and promises the whole amount goes to clicks. This is the same class as the
overage-copy defect the 08-22 audit found — a checkable claim on a money surface that the
charge contradicts.

## Smallest safe actions, in order

1. **Gate the purchase off** until the rest is settled — there is no flag today, so this
   is the only immediate brake. One env check in `route.ts` and the ads page.
2. **Ask the operator whether the five `GOOGLE_ADS_*` vars exist in Production.** If they
   do not, the surface is selling nothing and must not be reachable.
3. **Make simulated mode refuse to run in production.** `if (process.env.VERCEL_ENV === 'production' && !isGoogleAdsConfigured()) throw` — a purchase that cannot be fulfilled
   should fail loudly before the card is charged, not after.
4. **Await the provisioning and record its status** on the account, including
   `'simulated'`; surface a staff-visible failure row when it is not `'active'`.
5. Fix the landing-page URL to use `sites.subdomain` / `custom_domain`.
6. Validate an upper bound on `monthlyBudgetDollars`, and split the fee into its own line
   item or rename the line so the invoice matches the promise.

## What this says about the audit plan

The morning sweep's recommendation list still stands, but this changes one thing: **a
feature that takes recurring money shipped, unflagged and unaudited, in the hours after
an audit declared what remained.** Before launch, the question is not only "did we fix
the findings" but "what shipped since the findings were written." Any go-live checklist
needs a diff-since-audit step, and every new money surface needs the same treatment the
billing rail already gets: a flag, a fulfillment record, and a failure that is visible.
