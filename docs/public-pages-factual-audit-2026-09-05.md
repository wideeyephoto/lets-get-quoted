# Public Pages — Factual Error Audit

**Date:** 2026-09-05
**Scope:** Public marketing surfaces — `/`, `/pricing`, `/features/*`, `/compare` + `/compare/[competitor]`, `/faq`, `/security`, `/privacy`, `/changelog`, `/contact`, `/tools/*`, plus the site-wide Sparky Copilot widget that renders on all of them.
**Method:** Every claim below was checked against a source of truth inside this repository — `src/lib/billing/catalog.ts`, `src/lib/templates/types.ts`, `src/lib/features.ts`, `src/lib/trades.ts`, `src/lib/payments.ts`, `src/lib/sms-provider.ts`, existing tests, and `docs/ftc-substantiation-register.md`. Claims about the outside world that cannot be checked from here are listed separately at the end and are **not** asserted to be wrong.

Two of these findings violate rules this repository has already written down for itself:
`docs/ftc-substantiation-register.md` §3.3 (unverified customer cohort claims) and §3.4 (withheld SKUs sold as active).

---

## Critical

### C1 — Two different fabricated customer ratings

| Surface | Copy | File |
| :--- | :--- | :--- |
| Homepage hero | `★★★★★ 4.9/5 · rated by 400+ trade contractors` | `src/components/flagship/flagship-home.tsx:687-698` |
| `/features/neighborhood-halo` hero | `⭐ Rated 4.9 by 1,200+ contractors` | `src/app/features/neighborhood-halo/page.tsx:115` |

Neither is supported, and they disagree with each other about the same 4.9 rating (400+ vs 1,200+).

The repository already documents that this proof does not exist. `src/components/marketing/real-proof.tsx:90-105`:

> "the five published sites in the database are test accounts … there is no testimonial anyone has given permission to quote and no measured result to report. So this renders NOTHING until it is given a story. Not a placeholder, not a greyed-out card, not 'trusted by contractors like you'."

`src/app/features/page.tsx:95-99` says the same ("no testimonial we have permission to quote, no cohort, no measured conversion lift"). And `flagship-home.tsx:291-293` — **fifteen lines above the live rating** — removed a star rating from the mock site preview on the grounds that "A star rating is the figure a homeowner is most likely to believe, and we have no basis for it."

Also relevant: `src/lib/billing/plan-crossover.ts:16-19` records that there are "zero settled non-test payments across every account."

No test locks either string. `docs/ftc-substantiation-register.md` §3.3 prohibits exactly this class of claim.

### C2 — `/pricing` advertises phone and chat support that does not exist

`src/app/pricing/PricingExperience.tsx:454-455` renders a trust card reading **"Dedicated trade desk — US-based phone & chat support ↗"**, linked to `/contact`.

`/contact` (`src/app/contact/page.tsx`) offers a web form and email only, and says so: *"A person reads every message and replies by email — there is no ticket robot in between."* There is no phone number and no chat widget anywhere in the codebase — `/pricing` is the only file in the repo that mentions phone or chat support.

Worse, `test/pricing-crossovers-and-entitlements.test.ts` pins the string under a test named *"uses support, transport, payment-provider, and plan-change trust claims **accurately**"* — so the claim is currently protected by a test.

### C3 — Privacy Policy subprocessor list is incomplete, and there is no cookie/tracking disclosure

`src/app/privacy/page.tsx:104-119` presents a subprocessor list. Missing from it:

- **Twilio, Inc.** — a first-class supported SMS/voice provider (`src/lib/sms-provider.ts:297-310`, and the incumbent when both providers are configured). Per `README.md`, Supabase Auth's Twilio Phone provider also sends and verifies contractor **login codes**. Only SignalWire is listed, including in the SMS-specific §3.
- **Printful** — `src/lib/merchandise/printful-client.ts:113-121` sends customer **full name, street address, city and ZIP** for merchandise fulfillment.
- **Cloudflare** — Turnstile (`challenges.cloudflare.com` in `src/lib/csp.ts`), which receives visitor IP.

Separately, the policy contains **no** section on cookies, analytics, tracking or advertising — the words do not appear on the page — while:

- `src/app/layout.tsx:208` loads Google Tag / gtag.js on every public marketing page, including `/privacy` itself (`src/components/google-tag.tsx`).
- `src/lib/templates/SiteAnalytics.tsx:78-120` loads gtag, **Meta Pixel** and **TikTok Pixel** on contractor tenant sites.

The policy does collect-and-disclose "IP addresses, browser and device types" (§1) but never says who receives them. Google LLC is listed only as an "Artificial Intelligence Inference Platform."

---

## High — numbers a customer would act on

### H1 — "20+ trade themes" — there are 8

`AVAILABLE_TEMPLATES` (`src/lib/templates/types.ts:46`) contains **8** templates: carbon, professional, modern, handy, coat, fixit, reno, shine. `THEME_DEMOS` in `/themes/[template]` also has 8. The product's own feature page agrees: `src/app/features/website-builder/WebsiteBuilderExperience.tsx:205` says **"8 Pro Theme Archetypes."**

"20+ trade themes / templates" appears **17 times** on public surfaces:

- `src/app/compare/compare-data.ts` — lines 112, 200, 291, 372, 438, 484, 535, 653, 718, 757, 1063, 1118, 1150, 1538
- `src/app/compare/[competitor]/page.tsx:194`
- `src/components/marketing/CompetitorSavingsCalculator.tsx:284`
- `src/components/marketing/StackCostComparison.tsx:14`

### H2 — Site-wide help widget quotes a plan and a fee that do not exist

`src/components/marketing/SparkyCopilot.tsx`:

- **:38** (shown on `/pricing`, answering *"Are there any hidden fees or contracts?"*) — *"You can cancel anytime from Settings or upgrade to **Pro ($99/mo)** to drop your platform fee to **0.75%**."*
- **:247** (shown on `/`) — *"Paid plans start at **$99/month** and reduce fees to **0.75%**."*

There is no Pro plan and no 0.75% fee. Current plans are Flex/Solo/Growth/Scale at 1.25% / 0.50% / 0.25% / 0.10% (`src/lib/billing/catalog.ts`), and paid plans start at **$39/mo** (Solo). `pro` survives only as a legacy alias mapping to Growth (`catalog.ts` `LEGACY_PLAN_MAP`).

This widget is mounted in `src/components/app-shell.tsx:1500` on every non-login, non-dashboard route — so the stale answer is served on `/pricing` itself, directly contradicting the page it sits on.

### H3 — "Guaranteed Savings" calculator scores LGQ's cost as exactly $0

`src/components/marketing/CompetitorSavingsCalculator.tsx:102-104`:

```js
const lgqFlexAnnual = 0;
const annualSavingsOnFlex = competitorAnnualTotal - lgqFlexAnnual;
```

The result is rendered as **"Your Guaranteed Savings — +$X / year"** (`:301-305`), where X is the competitor's entire annual bill. The 1.25% Flex platform fee appears as adjacent prose but is never in the arithmetic. A contractor collecting $150k/yr through LGQ pays ~$1,875/yr on Flex, so the figure overstates savings by that much — and "Guaranteed" is an unqualified word attached to it.

`/pricing`'s equivalent comparison uses `recommendation.annualTotal`, which *does* include the platform fee. The two public pages compute LGQ's own cost differently.

Renders on `/compare` (`page.tsx:114`) and every `/compare/[competitor]` page (`:231`).

### H4 — `/pricing` shows the Angi/Thumbtack comparison as ~$0/year

`src/app/pricing/PricingExperience.tsx:192` calls:

```js
estimateCompetitorAnnualCost(activeCompetitor, officeUsers)
```

omitting the third parameter, `monthlyLeads`, which defaults to `0`. The `leadbrokers` benchmark has `monthlyBase: 0, perUserMonthly: 0, leadFeeAvg: 75` — so the per-lead fee, which is the entire cost of a lead broker, is never counted. Selecting "Angi" in the competitor toggle renders **"~$0/yr"** and **"$0/mo base + $0/mo per seat"** for a competitor whose own benchmark note reads *"You pay $50–$120 for shared leads sent simultaneously to 4–5 other contractors."*

The dead `PricingCalculator.tsx:457` passes the argument correctly; the component that actually ships does not.

### H5 — Upgrade break-even milestones are annual-billing figures, shown while the page defaults to monthly

`src/app/pricing/PricingExperience.tsx:549-570` hardcodes three milestone pills with assertive tooltips:

| Pill | Tooltip | True under annual | True under monthly |
| :--- | :--- | ---: | ---: |
| `$56k/yr` | "At $56k/yr volume, Solo's 0.50% fee beats Flex's 1.25% fee" | $56,000 ✓ | **$62,400** |
| `$307k/yr` | "At $307k/yr volume, Growth's 0.25% fee beats Solo's 0.50% fee" | $307,200 ✓ | **$432,000** |
| `$1.6M/yr` | "At $1.6M/yr volume, Scale's 0.10% fee beats Growth's 0.25% fee" | $1,600,000 ✓ | $1,600,000 ✓ |

`billing` defaults to `'monthly'` (`:130`), and the pills do not react to the toggle. The monthly figures are proven in `test/pricing-crossovers-and-entitlements.test.ts:38-49`. The second pill is **29% low** under the page's default state.

A correct helper already exists and is not called here — `planCrossover()` in `pricing-catalog.ts`, mirrored by `src/lib/billing/plan-crossover.ts`, whose header comment warns: *"Reimplementing money arithmetic and letting it drift is how the mockup's break-evens ended up 26% low."*

### H6 — Competitor pricing contradicts itself between `/pricing` and `/compare`

| Competitor | `/pricing` (`pricing-catalog.ts` `COMPETITOR_BENCHMARKS`) | `/compare` |
| :--- | :--- | :--- |
| Jobber | `$169/mo + $29/seat`, **1** included user | "$169/mo (Connect, **up to 5 users**)" — `compare-data.ts:368`, and `CompetitorSavingsCalculator.tsx:88-90` |
| Housecall Pro | "**Essential**", `$189/mo` + $35/user, 1 included user | "**Essentials (1-5 users)** $169" and "Basic $65 / Max $299" — `compare-data.ts:407`, `CompetitorSavingsCalculator.tsx:66-76` |
| ServiceTitan | `$350/mo` base + `$125`/user | "$398–$1,000+/month" (`compare-data.ts:614`); calculator uses $398 → $2,985 by team size |

`/pricing`'s ServiceTitan entry also contradicts *itself*: `perUserMonthly: 125` against a note reading *"High per-technician monthly cost ($250–$400+/mo)"* (`pricing-catalog.ts:383`).

Consequence on `/pricing`: because Jobber is modelled with 1 included seat, a visitor who sets 5 office users is charged 4 × $29 × 12 = **$1,392/yr** of Jobber seat fees that `/compare` says Jobber's own Connect tier includes — inflating the "Save ~$X/year" headline.

---

## Medium — availability and consistency

### M1 — AI Voice is sold as a live add-on, in violation of a codified rule

`docs/ftc-substantiation-register.md` §3.4 states:

> "**Withheld SKUs / Features Sold as Active Prohibited:** Features listed in `TOP_UPS_WITHHELD` … must not be marketed as immediately available without explicit qualification of their preview / carrier rollout status."

All three AI Voice SKUs are in `TOP_UPS_WITHHELD` and `VOICE_PURCHASABLE = false`. Marketed without qualification anyway:

- **Plan cards, `/pricing`** — `PricingExperience.tsx:101-107`: *"AI Receptionist: 1 call at a time · $69/mo add-on"* ($59 Solo, $55 Growth).
- **Comparison table, `/pricing`** — `pricing-catalog.ts` `COMPARISON_ROWS`, row "AI calls answered at once": `1 with add-on`.
- **`/features/ai-voice`** — `page.tsx:127`, heroNote: *"Dedicated phone line · 2-way call forwarding · Audio recording + instant transcripts · **Included on eligible plans**"*. Only **Scale** includes voice (`includedInBasePlan: true`); the other three plans need an add-on that cannot be purchased. The whole page is written in the present tense with no availability qualifier.
- **`/changelog`** — page metadata lists "AI Receptionists" among features "shipped"; v2.7.0 (2026-09-01) ships "📞 24/7 Voice Call Recordings" as **New**.

The same `/pricing` page's own FAQ says the opposite: *"AI Voice Receptionist is coming soon (in preview rollout)."* `VOICE_PLANNED_PRICE_LABEL` ("Launch pricing from $55/month") was written for exactly this and is never rendered.

### M2 — `/pricing` structured data claims iOS and Android apps

`src/app/pricing/page.tsx:35` — `operatingSystem: 'Web, iOS, Android'`.

There are no native apps. The only installable surface is a PWA scoped to `/field` (`public/manifest.webmanifest`). The homepage's own JSON-LD says `operatingSystem: 'Web'` (`src/app/page.tsx:42`), and `/features/text-to-job:409` markets the opposite: *"No mobile app download required."*

### M3 — Three different feature counts, two of them on the same page

| Surface | Says | Source |
| :--- | :--- | :--- |
| `/features` — catalog explorer | "Explore all **87** shipped features" | `FEATURE_COUNT` = `ALL_FEATURES.length` = 87 |
| `/features` — "Browse the full feature catalog" modal | "**134**+ features across **23** categories" | `TOTAL_CATALOG_FEATURE_COUNT` = 134 |
| Sparky Copilot (every page) | "Browse All **56** Capabilities →" | hardcoded, `SparkyCopilot.tsx:124` |

The first two render within ~10 lines of each other (`src/app/features/page.tsx:286` and `:292`). 56 matches nothing.

### M4 — Texting-number claims are wrong in both directions

- **Homepage hero pill** — `flagship-home.tsx:679`: *"📱 Keep your existing number."* No number porting exists anywhere in the codebase. Every other surface says *forward* your existing number (`/features/ai-voice:96`, `platform-campaign-templates.ts:104`). `/faq` **deliberately removed** this claim, with the reason in a code comment (`src/app/faq/page.tsx:119-124`): *"Somebody choosing this product because their number would carry over would have found out after switching."*
- **`/faq#can-i-switch`** — has now drifted stale the other way: *"Texts sent from the platform go out from a Let's Get Quoted number rather than your own,"* justified by a comment claiming *"there is no per-account number and no way to bring your own."* That is no longer true: per-contractor dedicated numbers are provisioned (`src/lib/messaging-number-provisioning.ts`, `/dashboard/messages/dedicated-number`, `sms_sender_numbers`), and `/pricing`'s comparison table promises "Dedicated number (carrier registration required)" on all four plans.

### M5 — Sparky Copilot: calendar sync that does not exist

`SparkyCopilot.tsx:124`: *"Booked jobs sync smoothly with Google Calendar and Apple Calendar."*

The only calendar feed in the codebase is `/api/permits/inspections/calendar.ics` — **permit inspections**, not jobs. There is no job or schedule calendar export. (The QuickBooks half of that same answer is accurate: `src/lib/quickbooks/sync.ts` is genuinely bidirectional.)

### M6 — Sparky Copilot: wrong Stripe charge type

`SparkyCopilot.tsx:220`: *"We use Stripe Connect with **direct charges**. Let's Get Quoted never touches or holds your funds; payments clear straight into your own bank account."*

Every charge is a **destination** charge, created on the platform account with `transfer_data.destination` and no `stripeAccount` header. The code says so twice, emphatically:

- `src/lib/payments.ts:672-677` — *"This is a destination charge … so the Session and its Charge are created on the platform account and settled onward."*
- `src/lib/payments.ts:840-843` — *"Every charge here is a DESTINATION charge."*

`/security` and the homepage FAQ word this carefully and correctly ("we never see or store card numbers", "never park your cash"); only the widget states the mechanism, and states it wrong.

### M7 — `/features/neighborhood-halo` contradicts itself on the spend cap

`page.tsx:115` heroNote: *"… · **$25/mo cap** · Cancel anytime"*

Same page: hero chip and step 3 say **"$25 / 5-Day Micro-Budget"** (per campaign), and the FAQ says *"Total monthly halo spend across all jobs is capped at **$250/month** by default."* The hero note is off by 10×, and conflates a per-campaign budget with a monthly cap.

### M8 — The substantiation register itself records a claim the product no longer makes

`docs/ftc-substantiation-register.md` **CLM-005** records, as ✅ VERIFIED:

> *"30-Day Money-Back Guarantee: Cancel your first annual plan within 30 days for a **full refund**."* — Published Surface: `/pricing` … "issues full refund"

Both halves are wrong:

- `/pricing` does not say this. Its FAQ says *"The refund is the annual prepayment **minus one normal month-to-month base charge**,"* and `test/pricing-crossovers-and-entitlements.test.ts:162` asserts `expect(PRICING_EXPERIENCE).not.toContain('30-Day Money-Back Guarantee')`.
- The code deducts a month: `calculateAnnualPlanGuaranteeRefund()` (`src/lib/billing/subscription-cancellation.ts:131-163`) returns `annualPrepaymentCents - monthlyPriceCents` — Solo $420 → **$381**, Growth $1,188 → **$1,059**, Scale $3,588 → **$3,259**.

This is the document Commercial Legal signs off from, so it should be corrected first.

---

## Low

- **L1 — Sitemap `lastmod` is stale.** `src/app/sitemap.ts:71` pins `MARKETING_REVISED = '2026-08-24'` for nearly every marketing URL; per `LAUNCH_PAGE_INVENTORY.md`, most were touched Sep 1–4. The file's own comment anticipates this ("Forget to bump it and the date is merely OLD"). Its FEATURE_SLUGS comment also still says "The twelve feature detail routes" for a list of 20.
- **L2 — Drift risks in pricing data.** `OFFICE_USER_ADD_ON_MONTHLY = 15` is hardcoded (`pricing-catalog.ts:42`) while its crew twin derives from `TOP_UPS.crew_user.priceCents`; `hero-showcase.tsx:64` hardcodes "150 trades" where every other surface uses `TRADES.length` (both happen to be correct today).
- **L3 — Unrendered pricing data that will mislead the next editor.** `basePricing.lgq` in `compare-data.ts` quotes annual-equivalent rates as monthly prices — *"up to $299/mo (Scale)"* (:80, :406) and *"$35/mo (Solo) · $99/mo (Growth)"* (:621) against real monthly prices of $329 / $39 / $129. Only `basePricing.competitor` is currently rendered, so nothing ships today. Likewise `PricingCalculator.tsx` and the `ADD_ONS` export are dead. `ADD_ONS` would relabel `ai_writing_250` as "250 AI credits" although that SKU grants writing drafts only, not Smart Intake credits.
- **L4 — Entitlement flag with no reader.** `sharedLgqTextingNumber` is `true` only for Flex, but nothing reads it — the shared line is offered to any account without a dedicated number (`src/lib/dashboard-sms-dispatch.ts:30-35`). Harmless today; a future page that renders the flag would state something untrue.

---

## Checked and found accurate

Worth recording so these are not re-litigated:

- All plan prices, platform fees, seat counts, text/email/AI credits, storage and forwarding minutes on `/pricing` match `src/lib/billing/catalog.ts`, including the annual savings arithmetic ($48 / $360 / $360) and the "up to $360/yr" headline.
- `/security` — every pillar is either accurate or deliberately hedged; the page makes no SOC 2 claim and says "HTTPS/TLS" rather than a version. (`/pricing`'s trust strip is more specific — "HTTPS + TLS 1.3" — which the platform supports but does not guarantee per connection.)
- Refund handling: `/faq#fee-on-a-refund` matches `payments.ts`, which sets both `reverse_transfer` and `refund_application_fee`.
- Self-serve cancellation exists and is flag-enabled in production per `.env.example:85-99`; the 30-day account-closure grace period in `/privacy` §5 matches `src/lib/account-closure-orchestrator.ts`.
- QuickBooks Online two-way sync is real (`src/lib/quickbooks/sync.ts`).
- `/how-it-works` job-margin worked example is arithmetically correct ($8,950 − $1,650 − $3,900 = $3,400).
- "150 trades" / `TRADES.length` = 150, exact.

## Claims that need outside evidence, not repo evidence

Not asserted to be false — flagged because none carries an on-page citation and only the first is in the substantiation register:

- *"Contractors lose 30% of incoming jobs to voicemail"* — `/features/ai-voice:147`. **Already registered** as CLM-004 (Invoca / ServiceTitan benchmarks); consider citing it on the page.
- *"Contractors waste up to 35% of their working hours driving between far-flung jobs"* — `/features/neighborhood-halo:123`.
- *"Over 60% of homeowners choose the middle (Recommended) tier, increasing contractor average ticket sizes by 30% to 50%"* — `/tools/estimate-generator:255`. Overlaps CLM-002, which substantiates 15–25%, not 30–50%.
- *"yielding 3x higher close rates"* vs Angi shared leads — `compare-data.ts:1010`.
- *"Contractors lose an average of $1,500/month in unbilled change orders"* — `ScrapLumberComparison.tsx:12`.
- All third-party plan names and prices for Jobber, Housecall Pro, ServiceTitan, Angi and Thumbtack. H6 above is about them disagreeing *with each other* inside this repo; which set is right against the vendors' current published pricing still needs checking, and comparative pricing claims should carry a "as of <date>" capture.

## Related, outside public pages

`docs/ftc-substantiation-register.md` §4.1 and two email builders (`admin-platform-campaigns.ts:38,57`, `contractor-lifecycle-emails.ts:212,231`) hardcode a CAN-SPAM postal address of `Let's Get Quoted LLC · 11801 Domain Blvd, 3rd Floor · Austin, TX 78758`, while every legal page states the entity is *a Michigan limited liability company*. `COMPANY_MAILING_ADDRESS` is empty in `.env.example`, so the hardcoded fallback is what ships. Not contradictory on its face — but CAN-SPAM requires a valid physical address the company actually receives mail at, so this is worth confirming rather than inheriting.
