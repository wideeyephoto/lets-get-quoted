# Pre-Launch Audit — 2026-08-22

**Method:** seven independent audits run in parallel, each dimension’s findings then
attacked by a separate skeptic instructed to REFUTE and to default to “does not
survive” when uncertain. 42 raw findings → **36 confirmed, 6 refuted**. 15 agents,
~34 minutes.

## What was re-verified by hand before this was committed

Agent output is not evidence. These were re-read or re-run directly:

| Claim | Verified |
|---|---|
|  is ON DELETE CASCADE | yes —  |
|  has no dependency guard | yes —  |
| “Edit & resend quote” reaches it, and its dialog never says “payments” | yes —  |
| Resubscribe requires all four of flex/none/free/active | yes —  |
|  excludes  | yes —  |
| Plan-change panel is not flag-gated | yes —  |
| Binding refuses a changed price | yes — live  |
|  | yes —  |
| accounts FKs: 83 cascade / 24 restrict / 5 set null | yes — query |
|  is UPDATE with  NULL | yes —  |
|  is FOR ALL | yes —  |
| 61 of 144 public tables are RLS-with-no-policy | yes — query |

**One citation was wrong** and is corrected here: the undo-convert button lives at
{ is a shell keyword, not .
Treat other file:line references as good but not infallible — open the file.

**Nothing below was executed.** No job deleted, no plan changed, no account deleted,
no Stripe call made, no page rendered. Consequences are derived from the live FK
catalog, live function bodies and source. See “What this audit could NOT check”.

---
# Pre-launch briefing — Let's Get Quoted

**Date:** 2026-08-22 · **Scope:** what breaks for the *first* real paying contractor · **Method:** seven audits, every finding attacked by a skeptic; refuted items excluded. All file:line and query evidence below was re-read or re-run during this synthesis.

---

## Bottom line

Nothing found leaks one contractor's data to another, and nothing found exposes a credential. The two dimensions people fear most came back clean.

What is broken is the **lifecycle around the sale**. A first customer can sign up, get a site, take payments, and buy a plan. What they cannot safely do is **change that plan, cancel it, delete their account, or correct a quote after a deposit** — and the pricing page makes a categorical, checkable, false statement about how they can be billed. Nine grouped items should be fixed before you take money from someone you don't know.

Ranking below is by *what stops a first paying contractor from succeeding*, not by severity instinct. That is why "an owner can lift their own suspension" (high severity, no victim yet) sits below "Edit & resend quote deletes a deposit payment" (medium-sounding, week-one reachable, irreversible).

---

# MUST FIX BEFORE A REAL CUSTOMER

### 1. "Edit & resend quote" permanently destroys the deposit that was already paid
**Problem:** `deleteJob` is a bare DELETE with no dependency check, and 23 tables cascade off `jobs` — including `payments`, `invoices`, `payment_plans`, `time_entries` and `warranties`.

**Evidence:** `src/lib/jobs.ts:939-945` (bare delete, no guard). Live `pg_constraint` on `confrelid='public.jobs'`: ON DELETE CASCADE from payments, invoices, payment_plans, finance_plans, time_entries, costs, warranties, warranty_claims, change_orders, job_milestones, milestone_photos, job_feed, crew_assignments, subcontractor_requests. Two live entry points: the Danger-zone button (`src/app/dashboard/jobs/[id]/page.tsx:1619-1621`) and — the dangerous one — the ordinary quote-correction flow: `LeadActionDeck.tsx:143` → `undoConvertLeadAction` (`src/app/dashboard/leads/actions.ts:883-886`) → `unconvertLeadFromJob` → `deleteJob` (`src/lib/leads.ts:901`). Both confirm dialogs name only "costs, invoices or schedule requests".

**What the contractor experiences:** Customer accepts a quote and pays a deposit. Contractor spots a wrong price, presses "Edit & resend quote". The deposit payment row, its invoice and the job feed entry are gone. Stripe still holds the money. The customer's portal shows nothing. The payment vanishes from Insights and from the Schedule C worksheet. Nothing warns, nothing logs.

**Smallest fix:** Refuse in `deleteJob` when a payment exists on the job in any status other than `requested` — the exact shape already used by `skipNextVisitAction` (`src/app/dashboard/recurring/actions.ts:152-159`). One guard closes both entry points.

---

### 2. Every self-serve plan change charges the card and then breaks that subscription forever
**Problem:** The plan change updates Stripe with `proration_behavior: 'always_invoice'` (charges immediately) but never writes a new checkout-operation row, and the SQL projector pins plan, price and entitlement to the *original* checkout operation — so every subsequent event for that subscription fails to bind and dead-letters.

**Evidence:** `src/lib/billing/plan-change.ts:313-334` sends the new price with `always_invoice`; `planChangeMetadata` (`plan-change.ts:186-196`) deliberately leaves `lgq_operation_id` untouched, and no writer anywhere in `src/` or `migrations/` updates `billing_subscription_checkout_operations` on a plan change. The live function body of `resolve_stripe_billing_subscription_projection_binding_v1_unchecked` (dumped via `pg_get_functiondef`) raises `'Stripe Billing provider metadata does not bind to one Checkout operation'` when `v_operation.stripe_price_id is distinct from p_provider_price_id`, plus a second refusal on `v_subscription.provider_price_id` (23505), plus a third in `project_stripe_billing_subscription_event_v1_unchecked`: `if v_entitlement.plan_code not in ('flex', v_plan_code) then raise 'workspace entitlement is already bound to another paid plan'`. An RPC exception is not a typed provider error, so `subscription-event-projector.ts:510-518` classifies it retryable and `subscription-projection-worker.ts:240-252` gives up after 8 attempts. The panel is explicitly **not** flag-gated (`src/app/dashboard/settings/page.tsx:156-171`), and `plan-change-apply` has 202 live cron runs.

**What the contractor experiences:** Upgrades Solo → Growth. Stripe charges the proration on the spot. They keep Solo's limits, Solo's allowances and Solo's platform fee while paying Growth. Every later renewal, failure and cancellation for that subscription also fails to project, so their billing record freezes at the pre-change state permanently. Nothing self-heals.

**Smallest fix to ship today:** gate the ChangePlanPanel off and handle the first few upgrades by hand. **Real fix:** write a new `billing_subscription_checkout_operations` row (new `lgq_operation_id`, new price/plan/amount, state `activated`) in the same transaction as the Stripe update, and put that operation id in the subscription metadata.

---

### 3. Cancelling is terminal — a workspace can never resubscribe self-serve
**Problem:** The projector sets `plan_code = v_plan_code` on *every* event including cancellation, so the entitlement never returns to `flex`; both the checkout gate and the plan-change panel require exactly `flex`.

**Evidence:** Live `project_stripe_billing_subscription_event_v1_unchecked` — only `entitlement_state` moves to `restricted`. `src/lib/billing/workspace-fee-rate.ts:74-81` documents it: "a cancelled or unpaid Scale workspace keeps plan_code 'scale' forever." The only checkout entrypoint requires all four of `plan_code === 'flex' && billing_interval === 'none' && billing_status === 'free' && entitlement_state === 'active'` (`src/lib/billing/base-plan-subscription-entrypoint.ts:226-231`, re-read and confirmed) and otherwise returns `not_eligible` with "Existing paid plans need the plan-change flow" — which is also gone, because `CHANGEABLE_STATUSES = ['trialing','active','past_due']` (`plan-change.ts:50`). `subscription-cancellation.ts:59` excludes `canceled`, so there is no resume either. Downgrade-to-Flex routes through cancellation (`plan-change.ts:367-381`), so it lands in the same hole.

**What the contractor experiences:** They try the product for a month, cancel, then want back in — the single most likely thing a first customer does. Settings says "This workspace is currently restricted. Contact support if that does not look right." No Buy button, no plan panel, no resume. Winning them back needs a manual database edit.

**Smallest fix:** On the cancel/ended transition, write the entitlement back to `flex` / `none` / `free` / `active` with Flex feature_limits — the exact shape `migrations/20260819060000_new_workspace_gets_current_flex_limits.sql` gives a new workspace. Everything downstream already treats that as the correct free state.

---

### 4. Both account-deletion paths are broken, and one of them lies about it
**Problem (a):** "Delete my account" cancels the Stripe subscription *first*, then the delete always fails — 24 tables hold a RESTRICT-only FK to `accounts`, including `payments`.
**Problem (b):** The admin hard-delete never reads the delete error, redirects with `deleted=1`, and has already scrubbed the privacy request and written an `account_delete` audit line.

**Evidence:** Query I ran on production: FKs to `public.accounts` by delete action → **83 cascade, 5 set null, 24 restrict**. The 24: `payments`, `billing_subscription_customers`, `billing_subscription_checkout_operations`, `billing_subscription_consent_acceptances`, `billing_payment_operations`, `billing_top_up_purchase_operations`, `workspace_purchased_capacity`, `workspace_overage_settlements`, `stripe_merchant_provisioning_operations`, `billing_allowance_reset_worker_{states,attempts}`, `billing_direct_{checkout_late_success,payment_settlement}_tasks`, 5 × `sms_*`, 4 × `messaging_*`, `payment_sms_producer_tasks`, `quick_stop_payment_tasks`. Because `payments` is on that list, **any workspace that has ever taken a customer payment is already undeletable** — not just subscribers. `src/app/dashboard/settings/actions.ts:945` cancels Stripe, `:947` deletes and throws; the comment at `:926-929` asserts "cascades every child row", which the catalog contradicts. Admin path: `src/app/admin/accounts/[id]/actions.ts:398-401` nulls `privacy_requests.details`, `:404` logs `account_delete`, `:405` `await admin.from('accounts').delete()...` with **no error destructuring**, `:416` redirects `deleted=1`.

**What the contractor experiences:** Clicks Delete account. Their subscription is really cancelled, mid-period, no refund. Then a raw Postgres foreign-key error. They still have the account, no longer have a plan, and (per item 3) cannot resubscribe. Every retry repeats it. On the staff side, a GDPR erasure is reported as done, the audit log says it happened, the free-text record of what the customer asked is destroyed — and every row of their personal data is still there.

**Smallest fix:** (a) Attempt the local delete first and only cancel Stripe once it commits (or run the delete in a savepoint before touching Stripe). (b) `const { error } = await ...; if (error) backTo(accountId, 'error=delete_failed')`, and move the privacy scrub to after a confirmed delete.

---

### 5. /pricing states an automatic overage cannot exist; the switch ships, the cron charges cards, and the rates are published nowhere
**Problem:** Three surfaces disagree — the pre-sale promise, the live setting, and the consent text that references rates no page prints. *(Grouped: this was found independently by the money and promises audits, plus the unpublished-rates finding.)*

**Evidence:** Promise — `src/app/pricing/pricing-catalog.ts:282-283` (re-read, verbatim): *"No. There is no automatic overage and no setting that turns one on, so nothing can bill past your plan without you buying it."* Plus `PricingExperience.tsx:715` "never an automatic charge", plus the stale code comment at `pricing-catalog.ts:213-216` calling a spending-cap overage "a mechanism that does not exist anywhere in the product". Reality — `src/app/dashboard/settings/OverageAuthorizationPanel.tsx` *is* that setting, rendered from `PlanUsageSection.tsx:703`; `src/lib/billing/overage-settlement-worker.ts:273-275` creates real Stripe `invoiceItems`. Production `cron_runs`: `overage-settlement` 14 runs (last 2026-08-22T23:37Z), `overage-period-close` 13 runs — and those runs *prove* the flags, because `src/app/api/cron/overage-settlement/route.ts:17` returns 404 before `cronRoute` records anything when the flag is off. Rates — the consent text (`src/lib/billing/overage-consent.ts:27`) authorizes charges "at the published per-unit rates"; those rates exist only in `src/lib/billing/usage-overage.ts:51-62` (4.8¢/text segment, 0.34¢/marketing email, 7.6¢/AI draft, 15¢/AI intake thread, 35¢/voice minute) and appear on no page. `overage-summary.ts:151` computes `rateMillicents` per line — "so the arithmetic is checkable" — and `PlanUsageSection.tsx:686-696` renders resource, units and total and throws the rate away. Git: the FAQ was true when written 2026-08-19 (`d7e9db2f`); the switch shipped 2026-08-22 (`dde0d95f`).

**What the contractor experiences:** Reads that nothing can ever bill past their plan, finds the switch, turns it on, and is charged per-unit at prices no surface ever stated — under a consent claiming those prices were published. The first chargeback writes itself.

**Smallest fix:** Rewrite the FAQ, the "No unapproved overages" tile and the comparison row to describe what ships (no overage unless you switch it on and set a hard limit); delete the stale comment; and render the already-computed `rateMillicents` beside the consent tick. Add a test that fails when the overage module exists and the pricing copy denies it.

---

### 6. Refunds and voids don't reach the money surfaces, so the portal bills a refunded customer for the full amount
**Problem:** `outstanding` on the customer portal sums *every* invoice including voided ones, and the contractor's job page computes the invoice balance gross of refunds. *(Grouped: two surfaces, one root cause — nobody nets `refunded_amount` / zeroes a void.)*

**Evidence:** Portal — `src/lib/client-portal-data.ts:281` reduces `invoice.due` over every invoice loaded, and the query at `:216-221` deliberately includes `.in('status', [...,'void'])`. `src/lib/invoice-pay.ts:70-71` returns `due` for a void invoice as `total - paid`, never zeroed; `:52-56` counts only `status === 'paid'`, and a full refund sets the payment to `refunded` and the invoice to `void` (`src/lib/payments.ts:884`, `:910-912`; repeated in the webhook at `route.ts:974`, `1005-1007`). So after a full refund: paid = 0, due = total. `src/app/portal/view/[token]/page.tsx:60` filters void out of the *list* but `:80-85` renders the headline from `portal.outstanding`, which does not. Job page — `src/app/dashboard/jobs/[id]/page.tsx:249-251` reduces paid payments with no `refunded_amount` subtraction (the same file reads that column at `:1357`); the wrong number renders at `:1237`, prefills the collect-payment amount at `:1261`, and feeds PaymentPreview at `:1321-1322` — the component the file's own comment at `:1300` calls "THE INVOICE AS THE CLIENT WILL SEE IT". The customer-facing `/invoice/[id]` *does* net it (`invoice-pay.ts:55`), so the two sides answer differently.

**What the contractor experiences:** A fully refunded homeowner opens the branded portal link and reads "Balance due $4,237.50" with no invoice listed and no Pay button. After a *partial* refund, the contractor's screen says "Balance $0" while `/invoice/[id]` offers that same customer a live "Pay $1,000" button.

**Smallest fix:** Return `due: 0` in the `void` branch of `invoice-pay.ts:71`, and call the already-tested `paidTowardInvoice` from `jobs/[id]/page.tsx:250` instead of hand-rolling the reduce. `src/lib/client-detail.ts` (via `clients.ts:211`) carries the same gap and takes the same fix.

---

### 7. The printable client statement is wrong three different ways at once
**Problem:** The document a contractor hands a customer to settle up rounds every figure to whole dollars, credits Quick Stop fees against the quote they were promised not to be credited against, and ignores refunds.

**Evidence (all re-read):** `src/app/dashboard/clients/[id]/statement/page.tsx:5` imports `formatMoney` from `@/lib/jobs` — whose own definition at `src/lib/jobs.ts:237-243` says *"ROUNDS TO WHOLE DOLLARS, which is right for a summary and wrong for a charge. Use formatMoneyExact for anything a customer pays or authorizes."* It is used for the Agreed/Paid/Balance boxes (`:101,105,109`), every job row (`:123-125`), the table footer Total (`:132-134`) and every payment (`:153`). So three $438.50 jobs print as three "$439" rows over a Total of "$1,316". Separately `src/lib/clients.ts:187-193` builds `paidByJob` from **all** paid payments on the job — `refunded_amount` is not even selected (`:180`) and there is no `invoice_id` filter — and `:206` computes `balance: round2(quoted - paid)` against `jobs.quoted_amount` with no clamp, while `src/lib/quick-stop-payments.ts:66-72` books the priority-visit fee as a payment on that same `job_id` with no invoice and `src/app/pay/[id]/page.tsx:461-463` tells the homeowner that fee "is not taken off the cost of the job". This file appears in neither list in `test/customer-money-is-exact.test.ts`.

**What the contractor experiences:** A printed statement whose rows do not add up to its own total, where a $145 fee the customer was told was *not* credited has been subtracted, and where sales tax pushes Paid above Agreed so the Balance prints negative — styled green, because `:109` falls to `'pos'` for anything ≤ 0. Every figure disagrees with `/invoice/[id]`.

**Smallest fix:** Swap the import at `:5` to `formatMoneyExact`; add `refunded_amount` to the select at `clients.ts:180` and net it in the reduce; scope `paidByJob` to payments carrying an `invoice_id`. Add this file to the exact-money guard list.

---

### 8. Inviting an office user is described as granting nothing, and actually grants full read/write/delete on the customer book
**Problem:** The Office team card says an invitation connects an account "and nothing more". RLS already grants every office user CRUD on that workspace's clients, leads and jobs.

**Evidence:** `src/app/dashboard/settings/OfficeTeamSection.tsx:99-102`, rendered ungated from `settings/page.tsx:454-464`: *"**They can't open anything yet** — what they're allowed to see is still being built, so for now an invitation connects an account and nothing more."* Query I ran: `select capability from office_capabilities where enabled` → **13 enabled**: clients.read, clients.write, crew.read, invoices.read, jobs.read, jobs.write, leads.read, leads.write, messages.read, messages.send, payments.read, quotes.read, schedule.write. `pg_policies` confirms live: `clients_owner_read USING office_can(account_id,'clients.read')`, `clients_owner_insert/update/delete USING office_can(account_id,'clients.write')`, identical on jobs and leads. `office_can` (from `pg_proc`) is `is_owner(acc) OR (is_office(acc) AND EXISTS(... enabled))` — true for any office member today. The UI only routes them to `/dashboard/leads` (`src/lib/office-access.ts:63-76`), but the UI is not the boundary: `NEXT_PUBLIC_SUPABASE_ANON_KEY` ships to the browser (`src/lib/supabase.ts:5-11`), so their own session token reaches PostgREST directly.

**What the contractor experiences:** They invite a receptionist on Solo/Growth/Scale, are told in bold that it grants nothing, and have handed over the complete customer list — names, phones, addresses — plus every lead and job, with insert, update and delete. Combined with item 1, that includes the ability to delete a job and its payments.

**Smallest fix:** Set `clients.read/write` and `jobs.read/write` back to `enabled=false` until their pages ship (leave `leads.*`, which is genuinely converted), **or** replace the paragraph at `OfficeTeamSection.tsx:99-102` with what an office user actually receives. Do not ship both as they are.

---

### 9. A recurring crew-seat subscription can be bought and nothing in the codebase can cancel it
**Problem:** `crew_user` is a live, sellable $5/month recurring SKU with no off switch anywhere in the product.

**Evidence:** `src/lib/billing/catalog.ts:294-303` — $5/mo, `recurring: true`, `fulfillment: 'recurring_capacity'`, eligible on solo/growth/scale — and it is **not** in `TOP_UPS_WITHHELD` (`catalog.ts:385-411` withholds only storage_100gb, office_user, the three ai_voice SKUs and voice_minutes_100), so it is in `SELLABLE_TOP_UP_IDS` and rendered with a Buy button by `TopUpPurchaseCheckout.tsx`. The flag is on: `billing_top_up_purchase_operations` holds 3 rows with `livemode = true`. Purchase creates a Stripe subscription (`top-up-purchase.ts:191-197`). A repo-wide grep for `subscriptions.cancel|subscriptions.update|subscriptionItems.|/v1/subscriptions` across `src/` and `scripts/` returns exactly four write sites — all four operate on `billing_subscriptions` (the base plan) only. `capacity-lifecycle-worker.ts:14-26` is a read-only sweep. Account deletion doesn't touch it either.

**What the contractor experiences:** Adds two crew seats, loses those crew next month, and cannot stop paying $10/month. No remove-seat control, no admin action, no cancellation on account delete. Their remaining lever is a card dispute.

**Smallest fix right now:** add `crew_user` to `TOP_UPS_WITHHELD` (one line). **Then:** a per-row `cancel_at_period_end` control on the Plan & usage add-ons card, and include those subscription ids in `cancelSubscriptionForAccountDeletion`.

---

# FIX SOON

### 10. Seat counts contradict themselves on one screen, and the calculator prices a seat you can't buy
*(Grouped: three findings — comparison table, calculator, owner-counts-as-a-seat.)*
`src/app/pricing/pricing-catalog.ts:196` hardcodes `['Office / admin users', '1', '1', '5', '15']` (re-read and confirmed) while `src/lib/billing/catalog.ts:98` grants Solo `officeUsers: 2` and Solo's own card twelve lines away says "2 office users". Solo's second seat landed 2026-08-21 (`828564cd`); the row hasn't changed since 2026-08-15. Separately `pricing-catalog.ts:37` prices extra office users at $15/mo and feeds that into the headline estimate (`:350`) while `office_user` is withheld with "No live recurring Price exists" and the same page's add-on list says "Coming soon" (`:236-238`). And every plan's office count silently includes the owner (`migrations/20260819210000_office_invitations.sql:135-141` counts `role in ('owner','office')`) while the crew count does not — so Flex advertises "1 office user" and can invite nobody.
**Contractor:** A two-person shop reads "Solo: 1 office user", steps up to Growth at $129/mo for something Solo at $39 already grants — a 3.3× overpay from one stale cell.
**Fix:** Derive the comparison cells from `BILLING_PLANS`, gate the calculator's office-seat cost on `SELLABLE_TOP_UP_IDS`, and say "(including you)" in the seat copy. Widen `test/allowance-grant-tables-match-catalog.test.ts:117-131` past column index 4 — see the guards section.

### 11. The Plan & usage tab tells paying customers their plan includes AI Voice
`src/app/dashboard/settings/PlanUsageSection.tsx:158-159` builds "AI Voice Receptionist simultaneous calls" and "history: N days" rows from `feature_limits` (present and non-null on all six live workspaces) under the heading "Everything included with {planName}" (`:1200-1209`). `src/lib/billing/capacity-usage.ts:159-167` states in as many words why they must not be shown: all three AI Voice SKUs are withheld with no live Price. /pricing says "Coming soon".
**Contractor:** A Scale subscriber at $329/mo opens Settings and is told they have 3 simultaneous AI calls. Pre-sale says coming soon; post-sale says included — the wrong way round.
**Fix:** Drop the two voice rows (and the dedicated-numbers row) from `includedLimits()`.

### 12. Every unpaginated read stops at exactly 1,000 rows
*(Grouped: data export, tax worksheets, CSV import dedupe.)* Live probe against the production REST endpoint: `GET /rest/v1/cron_runs?select=id` returned exactly 1000 rows with `content-range: 0-999/*` on a table of 8,762. None of these paginate: `src/lib/data-export.ts:35-39,56,79-85`; `listJobs` (`src/lib/jobs.ts:537-547`); `src/lib/tax-reports.ts:59-70` and `:185`; `src/lib/client-import.ts:144`.
**Contractor:** "Download everything" silently omits everything past row 1,000, and invoices join to a truncated job list so Customer/Phone/Email/Address come out blank. The Schedule C worksheet understates both revenue and deductions on a document that goes to an accountant. And a second CSV import re-creates every customer past the first 1,000, reported as `imported`, not `duplicates`.
**Fix:** `.range()` loops in the four export builders, `buildProfitAndLoss`, `build1099PrepList`, and the import dedupe read.

### 13. Merging duplicate customers permanently orphans their warranties
`src/app/dashboard/clients/actions.ts:288` repoints exactly four tables and `:299` deletes the losers; the doc comment at `:207-209` claims "Four tables carry a client_id… nothing is orphaned". The live catalog lists a fifth SET NULL FK: `warranties.client_id` (`migrations/2026-08-03-warranties.sql:15`). It is written only at creation (`warranties-data.ts:81-88`) and `updateWarranty` never touches it, so there is no repair path. No test covers the repointing.
**Contractor:** Warranties still show on the job, so it looks fine — but they vanish from the client's warranty list and from the customer portal, which is the entire point of the feature two years later when the homeowner calls.
**Fix:** Add `'warranties'` to the list at `:288`, and derive that list from the FK catalog.

### 14. Unparseable phone numbers are silently discarded to NULL — on create and again on every save
`normalizeUsPhone` (`src/lib/phone.ts:1-7`) returns null for anything that isn't 10 digits, 11 starting with 1, or `+`-prefixed. `clients/actions.ts:175` stores that null. The edit path *looks* protected (`actions.ts:140` `?? typed`) but `src/lib/clients.ts:248` re-normalises and undoes it. No `pattern`, no validation, no throw.
**Contractor:** Types a commercial number with an extension, saves, and the field comes back empty with no error — worse on the edit form, where the number is lost while they were editing something else. That customer now has no number for texts, reminders or portal lookup.
**Fix:** Mirror `?? typed` inside `clients.ts:248`, or reject the save naming the field.

### 15. First run makes six consequential decisions and reports them as settled
Six independent findings, one theme: the product decides, then tells the contractor it's ready.
- **Estimate posture defaults to `lean`** — `src/lib/estimate-posture.ts:9` (re-read); `balanced` ("Fair, realistic mid-market") exists at `:34` and is not the default. The bias string *"LEAN TOWARD THE AFFORDABLE SIDE… a scary high top number loses the customer"* is interpolated into the pricing prompt (`classify-estimate/route.ts:201`). Live column default is `'lean'`; all 6 workspaces are on it. Smart Intake is on by default (`site-content.ts:1445,1508`). **The first number a homeowner sees under the contractor's brand is deliberately shaded low.** Fix: default to `balanced`.
- **The trade dropdown pre-selects "Something else"** — `src/app/welcome/WelcomeForm.tsx:98-103` (re-read): no `required`, first option `value=""`, unlike the name and ZIP inputs either side of it. A blank trade makes the model infer the trade from the business name (`sites/actions.ts:314`) and seed 10-15 services and 5 FAQs **enabled** (`site-seed.ts:130-134`) with no publish gate. 5 of 6 live workspaces have `trade` null. Fix: make the placeholder `disabled` or move "Something else" to the end.
- **Business hours are invented and emitted to Google as fact** — `sites/actions.ts:326` asks for `"<typical hours for this trade>"` (re-read, verbatim); written at `site-seed.ts:185`, rendered in the footer, and turned into schema.org `openingHoursSpecification` (`site-seo.ts:237,261`). Three published sites carry model-written hours today. The first-run banner (`WebsiteBuilder.tsx:282`) doesn't mention hours at all. Fix: seed hours empty (the SEO node already fails closed) or list them in the banner.
- **Arrival updates defaults ON and is the only texting card missing the "blocked" line** — live default `arrival_updates_enabled = true` (every sibling defaults false); `automation-switch.tsx:48` `activationBlocked = !checked && enableBlocked`, so an already-on switch never shows `blockedReason` (both re-read). Its two sibling cards say "customer texts are blocked until your dedicated number is ready"; the arrival card doesn't. Fix: add the same line to the card body.
- **"High-value lead texts: Ready" above the blank field that makes them impossible** — `high_value_lead_amount` has no column default (null on 5 of 6 workspaces), and `public/leads/route.ts:267` requires `> 0`, so `isHighValue` is false for every lead. `ownerAlertChip` (`src/lib/owner-sms.ts:112-157`) checks phone, consent, version and enabled — never the threshold. This is the *one* SMS lane that works end to end, so it's the texting promise a first customer will actually test. Fix: fold the threshold into the chip.
- **Timezone defaults to America/New_York and the ZIP collected at signup is never used** — live default confirmed; no timezone write anywhere in the signup path. Drives bookable-day boundaries, reminder send hours and "today". All six live workspaces are 48067, so it has never been visible here. Fix: derive from `postal_code` in `completeFirstRunAction`.

---

# KNOW ABOUT IT

These are real and verified, but none of them has a victim before you have customers, staff enforcement in use, or texting at volume.

- **An owner can lift their own suspension and payout restriction with one PostgREST call.** `pg_policies`: `acc_write` on `accounts` FOR UPDATE, `USING is_owner(id)`, `with_check NULL`; probed as a real `authenticated` session (rolled back, no DML): `has_column_privilege UPDATE = true` for `suspended_at`, `payouts_restricted_at`, `plan`, `free_jobs_limit`. `protect_account_merchant_state` uses exactly the right idiom but covers only the 17 `merchant_*` columns. These two are the only brakes on a fraudulent contractor (`auth.ts:250`, `stripe.ts:108`) and the audit log would show staff restricting and nothing un-restricting. **Fix before you ever suspend anyone**: a second BEFORE UPDATE OF trigger on the same pattern.
- **The SMS opt-out ledger is tenant-writable and deletable.** `sms_consent_all` FOR ALL `USING is_owner(account_id)`; probed: UPDATE and DELETE both true — while the newer `sms_consent_scopes` beside it is SELECT-only. `isPhoneOptedOut` (`sms.ts:489-506`) reads nothing else and treats an absent row as not-opted-out; it gates 21+ send sites. The server writers go to real trouble to protect it (`.neq('status','opted_out')` at `:433-445`) and direct writes bypass all of it. TCPA exposure lands on LGQ's brand. Fix: SELECT-only policy, matching its sibling.
- **61 of 144 tables are held closed by RLS-with-no-policy rather than by grants**; 21 of them still grant full SIUD to `anon` **and** `authenticated`, including `staff` and `staff_role_changes`. `pg_default_acl` shows new tables in `public` are created wide open, and the `rls_auto_enable` event trigger that closes them wraps its ALTER in `EXCEPTION WHEN OTHERS THEN RAISE LOG` — a failure is a log line. No repo check asserts `relrowsecurity` across public. Fix: one query in the existing audit scripts, plus revoke the blanket grants.
- **Any stranger can push every real delivery failure off the admin dashboard.** `sms/registry-status/[token]/route.ts:126` writes a `webhook_failures` row on the *authentication-failed* branch; the Resend and Stripe webhooks do the same on signature failure and attach 500 caller-chosen bytes. None of the four routes is rate limited. The reader shows the newest 50 (`admin-alerts.ts:360-367`). Production already holds 26 unresolved rows from callers that never authenticated. `csp-report/route.ts:12-16` states the correct rule two directories away and follows it.
- **Five access-granting lookups pass user-supplied email into `.ilike()`**, so `_` and `%` act as wildcards — including the `/admin` gate (`auth.ts:435,460`) and the crew→membership linker (`crew-auth.ts:150`, which then *writes* a membership per matching row, `:158-172`). The codebase documents this exact hazard at `email-suppression.ts:88-91` and strips the characters at `admin.ts:120` — the rule is enforced on the two lowest-stakes sites and skipped on the highest. Accidental hit with a legitimate `bob_jones@` address is the realistic path. Fix: `.eq()`, plus a test that `aXb@x.com` is not returned for `a_b@x.com`.
- **The public lead form confirms whether a number is blocked or already a prospect.** `public/leads/route.ts:180` promises silent drops; the three success exits differ observably — blocked returns `{ok:true}` 200 with no `leadId` and writes nothing, a new lead returns 201 with `leadId`, a matched existing lead returns 200 *with* `leadId`. Rate limit 20/min/IP. Fix: make all three byte-identical.

### Guards that report something other than what they check
The audit was told to look for these. Five, all currently green:
1. `test/allowance-grant-tables-match-catalog.test.ts:117-131` — titled "keeps the comparison table honest", reads only `row(label)?.[4]` (the Scale column). No guard has ever looked at the Solo cell that item 10 is about.
2. `test/plan-usage-capacity.test.ts:153-162` — "rows the product cannot honor are absent, not zeroed" asserts over `buildWorkspaceCapacity()` only, so it cannot see `includedLimits()` forty lines below it on the same tab (item 11).
3. `assertMetadataMatchesPrice` (`plan-change.ts:164-184`) — at its only call site both sides derive from the same two variables and the same constant, so all three comparisons are a value against itself and the throw is unreachable. Its three tests hand-build mismatched pairs and pass regardless. The file's header rests the whole safety argument for charging a proration on it (item 2 is the failure it claims to prevent, one layer down).
4. `rls_auto_enable` — swallows its own failure into a log line (above).
5. `admin/accounts/[id]/actions.ts:405` — the delete whose error is never read, on the most consequential write in the product (item 4).
6. `test/client-portal.test.ts` contains no reference to `outstanding`, `due` or `void`; the statement page appears in neither list in `test/customer-money-is-exact.test.ts`.

---

# What this audit could NOT check

Stated plainly, because some of the above rests on inference:

- **Nothing was executed.** No job was deleted, no account deleted, no client merged, no plan changed, no refund issued. Every destructive consequence above is derived from the live FK catalog, live SQL function bodies and source — not from an observed failure. The FK and policy evidence is strong; the *user-visible* rendering of those failures is not first-hand.
- **No browser verification.** Every UI claim comes from source. Nothing was rendered, clicked or screenshotted.
- **Vercel Sensitive env flags are unreadable from here.** The overage self-serve panel's own flag was inferred, not read. The *worker* flags are proven by `cron_runs` (the routes 404 before recording when off), which is solid; the panel flag is not directly confirmed. The copy/reality conflict in item 5 holds either way.
- **No Stripe API calls were made.** No test transaction, no Price verification, no webhook replay. Item 2's failure chain is proved from the live projector function bodies plus code paths, not from an observed dead-lettered plan change — and there has been no real plan change yet.
- **Production is six internal workspaces**, five on Flex/free and one on Solo (query above). Zero office memberships and zero crew memberships exist, so the office RLS finding is proved from policy bodies rather than a real office session. All six are in one ZIP and one timezone. Nothing at scale — >1,000 rows, multi-seat, multi-location — has ever run here.
- **Out of scope by instruction:** everything in `docs/two-way-messaging-readiness.md` and `docs/messaging-handoff-2026-08-22.md`. The dedicated-number and two-way texting rail is therefore *not* covered by this briefing — assume it is still blocked as documented.
- **Not examined at all:** email and PDF rendering and deliverability, carrier behaviour, performance, accessibility, mobile layout, the actual Stripe dashboard state (which memory notes is not a source of truth anyway). `npm test`, `npm run typecheck` and `npm run build` were not run in this pass.

# Dimensions that produced nothing real

Say it plainly rather than pad it:

- **Cross-tenant isolation: clean.** `npm run verify:tenant-isolation` passes on its shipped invocation (3 tables × 6 owners, every owner blind to a real neighbour population of 58-86 rows), and a wider ~70-table sweep found zero over-exposure — every discrepancy was in the *denial* direction. The four isolation survivors above are all privilege-shape problems within a tenant's own data, not leaks between tenants. A claim that the isolation checker is a vacuous guard was investigated and **refuted**.
- **Secrets and credentials: nothing.** No exposed key, no leaked token, no credential in a bundle. The `/auth/confirm` console-logging claim was **refuted** (dead route, no callers since the initial commit, discloses nothing the same-origin session storage doesn't already hold). The `rate_limits` retention claim was **refuted** (128 rows total, primary-keyed by bucket, RLS with no policy, unreadable by anyone). What survived in this dimension is four low-severity items, none of which blocks launch.

Also refuted and not to be resurrected: that `jobs.write` misleads an owner at a disclosure surface (no such surface renders `OFFICE_CAPABILITIES`), that `verify:tenant-isolation` overstates its coverage (its first line of output prints the table count), and that Scale's "highest AI Voice capacity" claim is false (it leads on 4 of 5 dimensions, and the page states voice is unavailable and unpurchasable).
