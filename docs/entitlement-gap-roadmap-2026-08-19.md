# Closing the entitlement-gating gaps — 2026-08-19

The gating *machinery* is sound: a reserve/commit/release credit ledger, purchased-capacity
tables, DB-level trigger guards, the exact-`'1'` flag convention, and all eight billing worker
cron routes already scheduled in `vercel.json`. What is missing is **coverage**. Of the fourteen
metered items the price book sells, three have an enforcement path with a live caller -- and
none of those three is switched on in production.

This roadmap is ordered by what unblocks what, not by size. Sizes are relative (S/M/L), not
calendar estimates.

> **Read 2.2 first if you read nothing else.** "1 dedicated voice/text business number" is sold in
> six places on the pricing page and is the compare-table row separating every paid plan from Flex.
> The dashboard tells the same contractor **"Coming soon"**, because number assignment is blocked
> on a downstream carrier registration that has not been confirmed with the provider. Two surfaces,
> two answers, and the buyer sees one before paying and the other afterwards.

## Where we actually are

| Item | Limit | Measured | Enforced in code | Live caller | Flag | Flag set in Production |
|---|---|---|---|---|---|---|
| Crew seats | yes | yes | yes | `dashboard/crew/actions.ts` | `LGQ_CREW_SEAT_ENTITLEMENT_GATE_ENABLED` | **absent** |
| AI Intake credits | yes | yes | yes | `api/public/leads/classify-estimate` | `LGQ_AI_INTAKE_USAGE_GATE_ENABLED` | **absent** |
| File storage | yes | yes | yes | five workspace `*-storage.ts` libs | `LGQ_STORAGE_CAP_ENFORCED` | **absent** |
| Office seats | yes | yes | yes | **none** | `LGQ_OFFICE_SEAT_ENTITLEMENT_GATE_ENABLED` | **absent** |
| Text credits | yes | yes | yes | **none yet** | `LGQ_TEXT_CREDIT_METER_ENABLED` + `..._GATE_ENABLED` | **absent** |
| Marketing email sends | yes | yes | yes | `lib/campaigns.ts` | `LGQ_MARKETING_EMAIL_METER_ENABLED` + `..._GATE_ENABLED` | **absent** |
| AI writing drafts | yes | no | no | no | none | n/a |
| Custom domains | yes | no | no | no | none | n/a |
| Dedicated numbers | yes | no | no | no | none | n/a |
| Forwarding minutes | yes | no | no | no | none | n/a |
| AI Voice minutes | yes | no | no | no | none | n/a |
| Voice concurrency | yes | no | no | no | none | n/a |
| Voice history days | yes | no | no | no | none | n/a |
| `featureFlags` block | yes | n/a | no | no | none | n/a |

Office seats being callerless is expected and documented (`docs/office-seat-activation.md`).
Text credits being callerless is 1.2, and is blocked on a product decision rather than on code.
Everything below those rows is not expected.

**Nothing in this table is enforced in production today.** Every gate is exact-`'1'` and all four
flag names are absent from the Production environment (verified 2026-08-19), so each fails open.
"Enforced in code" means a code path exists, which is a different claim from a limit a workspace
can actually hit. Public lead-photo uploads are ungated on purpose -- a homeowner's photos are
never refused over the contractor's storage bill.

## The two enforcement templates

Both already exist in the codebase. New meters should copy one of them rather than invent a third.

**Reservation ledger** — `src/lib/billing/ai-intake-usage.ts`. For *flow* meters where the work
can fail after the credit is claimed: reserve, do the work, commit or release. It already handles
idempotent replay, a claim nonce so only the reserving request may refund, and fail-closed
fallback on any uncertainty. This is the template for text credits, marketing email, and AI
writing drafts.

**Cap check** — `src/lib/billing/storage-usage.ts`. For *stock* meters: measure, compare to the
entitlement limit, refuse at admission. This is the template for custom domains, dedicated
numbers, and voice concurrency.

---

## Phase 0 — Repair and truth-telling

Small, independent, and worth doing before anything else. One is happening right now and is
silent; one is latent until a flag is set; one is a public claim we cannot currently honor.

### 0.0 New workspaces get eight limits under a ten-limit catalog — S — **live, silent**

*An earlier draft of this item claimed the database was still pinned to
`2026-08-15-preview` across six sites, and that the projector's Scale limits were stale. Both were
wrong: they were read out of migration source files rather than out of the live schema, and both
had already been fixed — the version by `20260818120000`, Scale by `20260818200000`. What follows
is what is actually left, which is narrower and, unlike the imagined problem, currently happening.*

`20260818120000` moved the enforced catalog version by rewriting every function body that pinned
the old string:

```sql
new_def := replace(pg_get_functiondef(fn.oid), '2026-08-15-preview', '2026-08-18-preview');
```

Correct for a version bump, and it widened three CHECK constraints to accept both versions so
existing evidence stays interpretable. But `initialize_workspace_pricing` does not only *name* a
catalog version — it also carries a copy of the Flex limits, and `REPLACE` moved the label without
moving the map. The 2026-08-15 catalog wrote **eight** limits; the current one writes **ten**.

So every account created since that migration is provisioned with:

```
catalog_version = '2026-08-18-preview'
feature_limits  = { 8 keys, no forwarding_minutes, no voice_included_minutes }
```

which is exactly the shape `20260819040000` refuses — *"claim catalog 2026-08-18-preview without
its limits"*. Nothing fails at signup. The workspace simply carries two fewer limits than its plan
sells, and the next run of `20260819040000` raises `55000` on a row nobody edited.

Fixed by `20260819060000_new_workspace_gets_current_flex_limits.sql`: source-patches the map,
refuses to run before `20260818120000` (eight limits is *correct* under the old catalog, so moving
the map without the label would manufacture the mirror-image defect), and repairs already-created
rows by **adding** the two missing keys rather than overwriting the map, so a deliberately raised
limit survives. Verified 18/18 on PostgreSQL 17 by `scripts/verify-new-workspace-flex-limits.mjs`.

**The lesson worth keeping.** A blanket `REPLACE` over function bodies is safe for a value that
appears once per function and means one thing. It is not safe where the same function carries a
*label* and the *data the label describes*. Anything holding both needs checking by hand after a
sweep like that — there were two such functions here, and the sweep got one of them right only
because `20260818200000` had already corrected it for an unrelated reason.

### 0.1 Wire the reservation expiry sweeper — S — **latent; must precede the AI Intake gate**

`expire_usage_reservations` is a properly built sweeper (batch limit, `for update skip locked`,
advisory locks) in `migrations/20260815213142_pricing_entitlements.sql`, and
`usage_reservations.expires_at` is `not null` — the design expects it to run. It has **no caller**
anywhere in `src`, `migrations`, or `scripts`, and no cron route.

Because `available = granted − consumed − reserved − revoked`, an AI Intake reservation abandoned
mid-request (crashed process, dropped connection) strands those credits permanently. AI Intake is
the one meter with a consumer, so this becomes reachable the moment
`LGQ_AI_INTAKE_USAGE_GATE_ENABLED=1`. It is not reachable today: that flag is absent from
Production and `usage_reservations` held zero rows when checked on 2026-08-19. Latent, not live --
but it must land before the gate, not after.

**Built.** `/api/cron/usage-reservation-expiry` every 15 minutes, gated on
`LGQ_USAGE_RESERVATION_EXPIRY_ENABLED`, following the same shape as the other eight workers: the
flag is checked *before* `cronRoute`, so a disabled job reads no secret, creates no service-role
client and writes no heartbeat. Reservations live 15 minutes, so a stranded credit comes back
within half an hour at worst.

One deliberate choice worth knowing: the sweep does **not** loop until empty. It takes one batch of
250 and reports `saturated` when the batch comes back full. Looping would hold a transaction open
across an unbounded backlog, and a backlog that large is a signal worth seeing in `cron_runs`
rather than absorbing silently — `expired: 0` is the healthy steady state, because a request that
can run its own cleanup already does.

Registered in `cron-jobs.ts` as **money**, not housekeeping. Nothing errors when it is missing; a
workspace simply loses balance it paid for, permanently and quietly.

The code already anticipates the sweeper's absence — `ai-intake-usage.ts` declines to spend a
provider call on a stale row "while waiting for the expiry sweeper."

### 0.2 Reconcile the overage / spending-cap copy — S — **public claim, no implementation**

There is no overage or spending-cap mechanism in `src` or `migrations`. The only `overage` in the
product is job-price overage (`lib/job-lifecycle.ts`), unrelated. The capability was nonetheless
stated publicly in **five** places — this document originally found three:

- `pricing-catalog.ts:156` — Scale bullet, "opt-in through top-ups or a spending cap"
- `pricing-catalog.ts:190` — compare table, "Top-ups or enabled overages with a spending cap"
- `pricing-catalog.ts:234` — FAQ, "an overage setting you deliberately enable with a spending cap"
- `PricingExperience.tsx:627` — voice fine print, "requires your approval and spending cap"
- `PricingExperience.tsx:718` — promise band, "deliberately enable a spending cap"

**Done.** Each keeps the promise and drops the mechanism. The FAQ answer is now stronger than
what it replaced, and true: *"No. There is no automatic overage and no setting that turns one on,
so nothing can bill past your plan without you buying it."* The compare row now reads
`Approved top-ups` in all four columns, because that is what every plan actually does — the Scale
column's differentiation was the imaginary feature. `No unapproved overages` survives as a
heading; it is trivially true while no overage exists and stays true if 3.2 ever ships.

If 3.2 does ship, this copy comes back — but promising a spending cap the product cannot honor is
worse than promising less than it will one day do.

### 0.3 Correct the appendix status table — S — **blocked: the appendix is not in this repo**

The price book appendix is referenced from `catalog.ts:299`, `top-up-purchase.ts:16` and
`TopUpPurchaseCheckout.tsx:26` as the settled source of truth, but it lives outside this
repository — a full-text search finds no copy of it here. So this item cannot be executed from the
codebase; it needs whoever holds that document. What follows is the finished replacement text, so
applying it is a paste rather than a re-derivation.

**Replace** the Flex starter allowances note. "Enforcement coverage is incomplete" understates it:

> Text credits, marketing email sends, and AI writing drafts have no enforcement on **any** plan.
> The credit ledger has exactly one consumer — AI Intake — and its gate is off in production, so
> no balance currently decreases.

**Replace** the top-ups note. "Purchase/fulfillment not fully active" describes the wrong half:

> The purchase rail is built and the fulfillment rail is built. What is missing is consumption:
> four of the five sellable SKUs — `text_1000`, `flex_text_250`, `marketing_email_5000`,
> `ai_writing_250` — grant units that nothing in the product spends. `ai_intake_100` is the one
> with a consumer.

**Add** a row:

> **AI Voice Receptionist — priced on all four plans, not built.** No implementation, no minute
> meter, no concurrency limiter, no history retention. Also not purchasable: there is no Voice
> add-on SKU, so the three plans that price it as a monthly add-on have no way to buy it.

**Add** a row:

> **Overage / spending cap — published, not built.** No mechanism exists. The public pricing copy
> claiming one was corrected on 2026-08-19 (see 0.2); the appendix is the remaining copy that
> still describes it.

---

## Phase 1 — Make the sold credits real

The largest revenue-integrity gap. Today `flex_text_250` ($12), `text_1000` ($42),
`marketing_email_5000` ($17), and `ai_writing_250` ($19) are purchasable SKUs whose units nothing
consumes. Only `ai_intake_100` has a consumer. Grants, monthly resets, purchased-credit wallets,
and the settings display all work — the drain does not exist.

`src/lib/sms.ts`, `src/lib/campaigns.ts`, `src/lib/email.ts`, `quote-draft-ai.ts`,
`change-order-ai.ts`, `marketing-draft.ts`, `smart-import-ai.ts`, and `client-import-ai.ts` have
**zero** imports from `lib/billing`.

### 1.1 Segment counter utility — S — blocks 1.2 — **done**

*Correction to the original draft: segment counting did exist. `smsSegments` in `campaign-guard.ts`
was `ceil((body.length + 40) / 160)` — an estimator for the composer's "this will bill as N
segments" warning, with no callers elsewhere. It assumed GSM-7 unconditionally, so a body one
emoji away from UCS-2 was warned about at 160 characters per segment and billed at 70. Not "no
counter" — a wrong one, in front of the customer.*

`src/lib/sms-segments.ts` is the real thing: GSM-7 vs UCS-2 classification from the GSM 03.38
default alphabet, the 160/153 and 70/67 boundaries, the nine extension-table characters that cost
two septets, and iteration by code point so an astral emoji is charged the two UTF-16 units it
occupies rather than parsed as two lone surrogates.

The part worth keeping in mind for 1.2: **a two-unit character cannot straddle a segment
boundary.** `'x'.repeat(152) + '€' + 'x'.repeat(152)` is 306 septets — exactly two segments by
division — and costs three, because the euro sign will not fit in what remains of the first part
and moves whole. Dividing units by capacity under-bills every message shaped like that, and those
are the messages sitting closest to a boundary where a customer is most likely to be counting.

`campaign-guard.ts` now delegates to it, so the number a contractor is warned about and the number
they are charged come from one function. All 30 existing campaign-guard assertions still pass
unchanged; two were added for the emoji case and for not over-warning on an accented customer name.

### 1.2 Text credit meter — L — **metering built; wiring blocked on a product decision**

**Seam decision.** `sendProviderMessage(to, body)` at `src/lib/sms-provider.ts:327` is the single
funnel every outbound message passes through — but it takes no `accountId`. Threading it there
rather than metering at the helper layer buys the property that matters: exactly one place a
segment can escape unmetered.

*Two corrections to the original estimate, both found while building 1.1.* It is **not** "42
importing files" — only four files import `sendProviderMessage` at all, and 31 of the 32 call
sites are inside `sms.ts`. That makes the seam far narrower than this said.

But the second correction cuts the other way, and is why the wiring is not mechanical: **it is not
true that every helper has an `accountId`.** Fifteen declare it `accountId?: string` — optional —
and two have none at all. `sendVerificationCodeSms` is a signup code with no workspace to bill
yet, which is legitimately exempt. `sendInboxReplySms` is a contractor replying to a customer,
which certainly should bill, and simply never had the account threaded to it.

So 1.2 contains a product decision of the same kind as 1.4: **which outbound messages are exempt
from a workspace's balance.** Signup verification codes plainly are. Payment receipts and
card-update requests are arguable — a contractor whose text credits ran out arguably still needs
the message that gets them paid. That set has to be settled before 31 live send paths are rewired,
because guessing it wrong either bills for messages nobody agreed to pay for or silently exempts
the highest-volume ones.

**Built: the metering, not the wiring.** `src/lib/billing/text-credit-usage.ts` is complete and
tested — reserve, commit, release, in the `ai-intake-usage.ts` shape as the "no third pattern" rule
requires. No call site uses it yet.

Two things in it are worth knowing before wiring:

**It must not fail closed.** AI Intake fails closed on any uncertainty because falling back to the
ordinary quote form loses nothing. This channel carries appointment reminders, arrival texts and
payment receipts; a message not sent because a ledger read timed out is a contractor on a roof
whose customer was never told they were coming. So refusal requires a *definite* answer — the
P0001 "insufficient usage credits" raise, and nothing else. Timeouts, transport errors and
unusable responses all admit the message and name the reason.

**Enforcement takes two flags.** `LGQ_TEXT_CREDIT_METER_ENABLED` starts the ledger writing;
`LGQ_TEXT_CREDIT_GATE_ENABLED` additionally lets it refuse, and reads both. The measure-first
rollout 1.5 asks for is therefore a type, not a note somebody has to remember: there is no way to
express "refuse" without having first expressed "measure".

**Remaining for 1.2:** settle the exempt set, thread `accountId` (making it required where it is
currently optional, and finding every caller that omits it), and wrap the 32 call sites in
reserve/send/commit — committing only on a real provider ID, never on `SIMULATED_PROVIDER_ID`,
which means the message was composed and went nowhere.

#### The exempt-set decision, in one table

Every helper that reaches a carrier, grouped by the question each group raises. Only the last
column needs answering; everything else here is read out of the code.

**Plainly billable — customer-facing work the plan sells.** No question raised.

`sendCampaignSms` · `sendReviewRequestSms` · `sendRebookInviteSms` · `sendQuoteFollowupSms` ·
`sendAppointmentReminderSms` · `sendArrivalSms` · `sendArrivalTimeChangedSms` ·
`sendBookingDecisionSms` · `sendEstimateOfferSms` · `sendSchedulingOptionsSms` ·
`sendLeadQuoteVisitSms` · `sendLeadQuoteVisitOptionsSms` · `sendLeadDeclineSms` ·
`sendJobUpdateSms` · `sendQuoteUpdatedSms` · `sendClientJobDashboardSms` ·
`sendClientPortalLinkSms` · `sendSelectionRequestSms` · `sendMissedCallTextBack` ·
`deliverCrewSms` · `sendSubcontractorSms`

**Q1 — is a contractor charged to be told about their own business?** `sendOwnerHighValueLeadSms`
and `sendOwnerEstimateAcceptedSms` text the owner on their **own mobile**. They cost the same at
the carrier as any other segment. Charging a credit to receive your own lead alert is defensible
as cost recovery and indefensible as product.

**Q2 — does a workspace out of credits still get the messages that get it paid?**
`sendCardUpdateSms` is dunning after a declined card. `sendQuickStopOfferSms`,
`sendQuickStopConfirmedSms`, `sendQuickStopStatusSms` and `sendCardSetupSms` carry pay links and
payment state. Metering these means a contractor who ran out of texts also stops being able to
collect — which is the moment they can least afford it, and the moment LGQ earns its platform fee.

**Q3 — signup codes.** `sendVerificationCodeSms` verifies a *lead's* phone before intake submits.
There is often no workspace relationship yet, and refusing it does not save a credit, it blocks
lead capture. This one is exempt unless someone argues otherwise.

**Q4 — the two that should bill and cannot.** `sendInboxReplySms` is a contractor replying by hand
from the two-way inbox — unambiguously their own outbound message, and it has no `accountId`
threaded to it at all. `sendPaymentSmsEvent` likewise. These are not exemptions, they are missing
plumbing, and they are the two most likely to be forgotten because they will not show up as a
compile error.

Answer Q1–Q3, and the wiring becomes mechanical.

**Semantics from the book.** Outbound only — inbound replies do not consume, subject to fair-use
controls. Count segments, not messages. Note that `sendProviderMessage` returns a
`SIMULATED_PROVIDER_ID` sentinel when suppressed; a suppressed message was composed but never
carried, so it must not consume a credit.

Reservation pattern: reserve N segments, send, commit on a provider ID, release on throw.

Flag: `LGQ_TEXT_CREDIT_GATE_ENABLED`.

### 1.3 Marketing email meter — M — **done and wired**

A clean seam already exists. `sendCampaignEmail` is a dedicated marketing function called only
from `src/lib/campaigns.ts`, which is also the only caller of `sendCampaignSms`.

**Critical scoping.** Meter *only* the campaign path. The price book promises "Transactional
email: Unlimited · fair use" on every plan — metering `email.ts` broadly would break that promise
and silently cap invoices, quotes, and portal links. The twenty-odd `send*Email` functions in
`email.ts` are transactional and stay unmetered.

**Done, and wired — the first meter that runs end to end.** `sendCampaignEmail` takes
`accountId: string` **required** and has exactly two callers, so unlike 1.2 there was no exempt set
to settle and no optional parameter to make required.

*One design correction.* This document proposed reserving the audience size at campaign start and
committing per accepted delivery. That cannot be expressed: `commit_usage_reservation(uuid, text)`
takes **no unit count**, so a reservation commits whole or releases whole. Reserving the audience
would mean either billing for a campaign that died on recipient three, or writing a partial-commit
RPC. A campaign is capped at 250 recipients in batches of eight, so **one reservation per
recipient** is bounded, exact, and needs no new SQL.

`src/lib/billing/marketing-email-usage.ts` holds a credit before each send, commits when the
provider accepts, releases on failure. `campaigns.ts` builds the service-role client lazily and
only when the meter is on, so a dark meter changes neither the module's import graph nor what a
campaign costs.

**Where its failure posture differs from text credits.** Text may not refuse on uncertainty
because it carries appointment reminders and payment receipts. A marketing campaign is
discretionary, so this one may — but only for **one recipient, never the campaign**. A transient
ledger error still sends: a campaign silently truncated while the contractor watches it run and
reports success is worse than an unbilled email. And a genuine refusal increments `failed`, so the
shortfall appears in the result the contractor is shown rather than being reported as fully sent.

Flags: `LGQ_MARKETING_EMAIL_METER_ENABLED`, then `LGQ_MARKETING_EMAIL_GATE_ENABLED`.

**Note for 1.4.** That will be the third module in this shape. Two was not enough to know which
parts are genuinely common — and the two that exist already disagree about the most important
part, which is what happens when the ledger cannot answer. At three, extract the shared core;
leave `ai-intake-usage.ts` alone when doing it, since it is the only one with a live caller.

### 1.4 AI writing drafts meter — M — **needs a product decision first**

Ten modules call a model. The book sells "AI writing drafts" at 25/50/250/500 without defining
which generations count, and the answer changes the effective value of every plan:

| Module | Plausible classification |
|---|---|
| `quote-draft-ai.ts` | draft — almost certainly counts |
| `change-order-ai.ts` | draft — almost certainly counts |
| `marketing-draft.ts` | draft — almost certainly counts |
| `smart-import-ai.ts` | import assist — counts? |
| `client-import-ai.ts` | import assist — counts? |
| `quote-guard-ai.ts` | guard, not a draft — probably free |
| `campaign-guard-ai.ts` | guard, not a draft — probably free |
| `quick-stop-qualify.ts` | qualifier — probably free |
| `receipt-ocr.ts` | OCR, not writing — probably free |
| `blog-generate.ts` | LGQ's own content, not the customer's — must not count |

Settle the counted set, record it in the catalog, then meter only those. Reservation pattern — a
model call that fails should refund.

Flag: `LGQ_AI_WRITING_GATE_ENABLED`.

### 1.5 Roll out measure-first — M

Do not enable any Phase 1 gate straight to enforcing. For each meter, run a period where the
reservation is taken and immediately committed but exhaustion **logs** instead of refusing. The
storage cap comments make the argument better than this doc can: turning enforcement on before
the first sweep has run "would refuse real uploads from contractors standing on a roof."

Then flip to enforcing, one meter at a time.

---

## Phase 2 — Close the display-only limits

These are in the entitlement snapshot and rendered in `PlanUsageSection.tsx`, and read by no
enforcement point.

### 2.1 Custom domain connections — S — **may already be structural; needs a schema read first**

Limit is 1 on every plan. Before writing a gate, note what the connect path actually does:
`verifyCustomDomainAction` (`dashboard/sites/actions.ts:572`) ends with

```ts
.update({ custom_domain: domain, custom_domain_verified_at: ... }).eq('account_id', accountId)
```

— it writes the domain to **every** site row the account owns. Verifying a second domain therefore
overwrites the first everywhere rather than adding to it, so that path cannot produce two verified
connections. `publishSiteAction` and its neighbours all read `.eq('account_id', accountId).limit(1)`,
which is the same one-site-per-account assumption expressed a different way.

If an account can only hold one site row, this limit is enforced by the schema exactly as
`quickbooks_connections` is, and a gate here would be a check that can never fire.

**What is not knowable from this repository:** whether `sites.account_id` is unique. The `sites`
table predates the `migrations/` directory and is defined nowhere in the tree, so its constraints
cannot be read here — and inferring a live schema from repository source is precisely the error
that produced the first draft of 0.0. Settle it with a read before writing anything:

```sql
select count(*) as accounts_with_more_than_one_site from (
  select account_id from public.sites group by account_id having count(*) > 1
) t;

select conname, pg_get_constraintdef(oid)
  from pg_constraint
 where conrelid = 'public.sites'::regclass and contype in ('u', 'p');
```

Zero and a unique constraint on `account_id` means this item closes as "already structural" and the
per-plan allowance becomes documentation rather than a gate. Anything else means the site editor
(`updateSite`, per-`siteId`) can set different `custom_domain` values on different rows, and the
cap-check belongs there rather than at verification.

### 2.2 Dedicated business numbers — **blocked on a carrier registration, not on code**

*Corrected twice. This item first said "nothing prevents a Flex workspace attaching a dedicated
number — enforce at number attach", and there is indeed no attach path. I then wrote that the
feature did not exist at all and that there was "no column, no table". **That was wrong**, and it
was wrong because I searched for `from_number|business_number|twilio_number` and the columns are
called something else. What is actually there is most of it.*

Three pieces already exist:

- **`accounts.call_tracking_number`** (migration `2026-08-04-call-tracking-verified.sql`) — a
  per-workspace number with a unique index, settable by the contractor in settings, and used to
  route **inbound voice**: `sms/voice/route.ts:68` looks the account up by the dialled number and
  forwards to `call_forward_number`. The voice half of "dedicated voice/text number" works today
  for a contractor who brings their own number.
- **`accounts.sms_number`** (`2026-08-04-inbound-routing.sql`) — a second per-workspace number,
  uniquely indexed, used by `resolveAccountForInbound` to route **inbound SMS** by the `To`
  number. **Nothing writes it.**
- **`messaging_registrations`** (`2026-08-19-messaging-registration.sql`) — the whole registration
  lifecycle: `not_started → submitted → in_review → approved → action_required → rejected`,
  provider reference, `assigned_number`, and select-only RLS so an owner cannot mark themselves
  approved and start texting on the strength of it.

**What is missing is not code. It is the provider relationship.** That migration says so in as many
words: every account is `not_started` because "the downstream-business registration process has not
been confirmed by the provider, so there is nothing for a contractor to submit". `owner-sms.ts:170`
deliberately renders that state as **"Coming soon"** rather than "Not started", on the grounds that
"Not started" would imply the contractor could start it and they cannot.

Outbound is the one genuine code gap: `buildSendRequest` (`sms-provider.ts:214-215`) still sends
from the shared `MessagingServiceSid` or the single platform `From`, so even an assigned number
would not appear as the sender. That is small, and pointless to write before a number exists to
send from.

Every message from every workspace on every plan is sent the same way
(`sms-provider.ts:214-215`):

```ts
if (config.senderPoolId) data.set('MessagingServiceSid', config.senderPoolId);
else if (config.from) data.set('From', config.from);
```

Both come from the environment — one shared messaging service, one platform number — so a Scale
customer at $329/month sends from the same number as a free Flex workspace.

**So the real finding is an inconsistency, and it is still worth acting on.** The product tells a
contractor **"Coming soon"**. The pricing page sells the same thing as included, in six places:
the Solo, Growth and Scale feature lists (`pricing-catalog.ts:89, 118, 151`), all three
`messagingSummary` lines, and the compare table at `:177`, where it is the row separating every
paid plan from Flex's "Shared LGQ texting number". The FAQ at `:241` describes what the number
does. Somebody can buy Solo for the dedicated number and find a "Coming soon" chip in their own
dashboard the same afternoon.

**Why this was not fixed the way 0.2 was.** The spending-cap copy was corrected unilaterally
because the honest version is strictly *stronger* — "we never charge an unapproved overage" beats
"you can enable one with a cap". Nothing equivalent exists here: the honest version is *smaller*,
and moving a headline differentiator off three paid tiers is a pricing decision.

**The options.** Complete the registration with the provider, at which point the remaining code is
small: write `sms_number` on approval and teach `buildSendRequest` to prefer it. Or mark the number
as coming on the pricing page in the same words the dashboard already uses, and price it as an
add-on when it lands. What should not survive go-live is the two surfaces disagreeing — one selling
it as included while the other tells the buyer it is not available yet.

### 2.3 Decide the fate of `featureFlags` — S

`entitlement-catalog.ts:78` builds `quickbooks`, `shared_lgq_texting_number`, `voice_included`,
and `voice_advanced_routing` into every entitlement snapshot;
`stripe-billing-subscription-events.ts:705` persists it; **nothing reads it.**

Either wire the flags to real branches or drop the block. A write-only entitlement field is worse
than no field — it looks like enforcement to anyone auditing the snapshot.

**Confirmed exhaustively, 2026-08-19.** Each of the four names appears in exactly one place — the
line in `entitlement-catalog.ts` that constructs it:

| Flag | Occurrences in `src/` |
|---|---|
| `shared_lgq_texting_number` | 1 — `entitlement-catalog.ts:80` |
| `voice_included` | 1 — `entitlement-catalog.ts:81` |
| `voice_advanced_routing` | 1 — `entitlement-catalog.ts:82` |
| `quickbooks` | many, but none of them this flag |

`feature_flags` itself appears twice outside that file: written at
`stripe-billing-subscription-events.ts:705`, typed at `subscription-event-projector.ts:152`. The
property access `featureFlags.` occurs **nowhere**. Nothing branches on any of it.

**But the decision is genuinely blocked, and not on evidence.** Wiring requires the features to
exist — `voice_advanced_routing` has nothing to gate until Phase 4, and would be that phase's first
real reader. Dropping the block means a migration to remove a column Phase 4 then re-adds. So this
turns on whether AI Voice is being built, which is a business question rather than an engineering
one. Until it is answered the safe half is available and cheap: leave the field, and add a comment
at `entitlement-catalog.ts:78` saying plainly that nothing reads it, so the next person auditing
the snapshot is not misled by it. The dangerous reading of this field is "these are enforced",
and that costs one comment to prevent.

(QuickBooks' one-connection limit happens to be structurally enforced already:
`quickbooks_connections` upserts on `account_id`. It needs no gate.)

---

## Phase 3 — The gates the business model depends on

### 3.1 Enforce `entitlement_state` — L — **blocks launch gate #5**

`active | grace | restricted | archived` is projected by the subscription event projector,
admin-editable via `admin-plan-authority.ts`, and displayed in settings and the admin console.
The only functional read is *checkout eligibility* — `base-plan-subscription-entrypoint.ts:229`
uses it to decide whether a Flex workspace may start a paid plan.

**No product surface degrades on `past_due`, `restricted`, or `canceled`.** A workspace that stops
paying keeps everything. `/api/cron/dunning` is homeowner-invoice dunning, unrelated to
subscriptions.

This is the gate that makes a paid plan actually paid, and it cannot be skipped before selling
subscriptions. It needs three things:

1. A policy matrix — what precisely does `grace` allow that `restricted` does not, and what does
   `archived` retain? The book already commits to some of this: archived Flex workspaces keep
   data and purchased credits, and reactivation is free.
2. A single server-side read point, so the answer cannot drift per surface.
3. Customer-facing messaging — dunning, grace countdown, recovery — which launch gate #5 already
   calls for.

### 3.2 Overage and spending cap — L — depends on Phase 1

Cannot be built before the meters exist; you cannot overage a meter that does not drain. Needs
metered Stripe Prices, a per-workspace cap, a durable approval artifact in the same shape as the
recurring-consent evidence, and a hard stop at the cap. The book's rule is absolute — automatic
overages are forbidden without affirmative approval and a cap — so the failure mode must be
refusal, never a silent charge.

### 3.3 Office seat lifecycle — L

The gate, trigger, RPC, and flag are all built; `office-seat-entitlement.ts` has no product
caller. Requirements are already written up in `docs/office-seat-activation.md`: role design,
invitation lifecycle, last-owner protection, promotion rules. The blocking constraint is
unchanged — an added office user currently receives full owner-dashboard authority, so a narrower
role has to exist before the seat can be sold.

The `office_user` top-up SKU ($15/mo) should stay unpurchasable until this lands.

---

## Phase 4 — AI Voice Receptionist

The largest gap and the most independent. Priced on all four plans — $69 / $59 / $55 / included —
with 100–200 minutes, 1–3 concurrency, standard vs advanced routing, and 30/90-day history. **None
of it exists.** `src/app/api/sms/voice/route.ts` is 113 lines of signature validation and
dial/forward. There is no AI voice implementation, no minute meter, no concurrency limiter, no
history retention job.

It is also not purchasable: there is no Voice add-on SKU in `TOP_UPS`, so even the three plans
that price it as a monthly add-on have no way to buy it.

Work, roughly in order:

1. **Build vs. partner decision.** Everything else depends on it.
2. Voice add-on SKU in the catalog plus mode-scoped Stripe Prices for Flex/Solo/Growth. Recurring
   capacity, same shape as `storage_100gb`.
3. AI-connected minute meter with the book's exclusions: ringing, failed calls, blocked spam, and
   time after a completed transfer do not consume. Reservation pattern, since a call's length is
   unknown at admission.
4. The package-limit behavior the book already specifies: finish the current interaction, up to 15
   grace minutes, 60-minute total-call safety cap, then fall through to the configured forwarding
   or voicemail rule.
5. Concurrency limiter (1/1/1/3) — cap-check at call admission.
6. Routing tiers and history retention (30 vs 90 days) — a retention job, plus the first real
   reader of the `voice_advanced_routing` feature flag from Phase 2.3.
7. Forwarding/voicemail minutes (100/100/200). Note this is not even in `PlanUsageLimits` in
   `plan-usage.ts:37-45` — the type needs the field before anything can display or enforce it.

**Interim:** consider pulling AI Voice from the public pricing page until it exists, or labeling it
clearly as coming. It is currently the only priced line item on the page with no product behind it.

---

## Sequencing summary

```
Phase 0  ─────────────────────────────────────────►  independent, do now
  0.0 new-workspace Flex limits (live and silent; fixed by 20260819060000)
  0.1 expiry sweeper (latent; must precede the AI Intake gate)
  0.2 overage copy
  0.3 appendix rows

Phase 1  ─────────────────────────────────────────►  revenue integrity
  1.1 segment counter ──► 1.2 text meter ──┐
  1.3 marketing email meter ───────────────┤
  1.4 AI writing meter (decision first) ───┼──► 1.5 measure-first rollout
                                           │
Phase 2  ──────────────────────────────────┤        display-only limits
  2.1 domains   2.2 numbers   2.3 featureFlags
                                           │
Phase 3                                    │
  3.1 entitlement_state ───────────────────┼──► blocks subscription launch
  3.2 overage + cap ◄──────────────────────┘    (needs Phase 1 meters)
  3.3 office seat lifecycle

Phase 4  ─────────────────────────────────────────►  independent, largest
  AI Voice, end to end
```

**Before selling subscriptions:** Phase 0, Phase 1, and 3.1. Without 3.1 a non-paying workspace
keeps everything; without Phase 1, four of the five one-time top-up SKUs sell nothing.

The database side of subscription checkout is no longer what blocks it — `20260818120000` and
`20260818200000` settled the catalog version and the Scale allowances, and `20260819060000` closes
the gap those left. What remains is **3.1**, plus configuration outside this document: the six
`STRIPE_PRICE_*` bindings are Sensitive and unreadable, so nobody can currently confirm they point
at the `2026-08-18-preview` Prices rather than the six stale twins still active in Stripe; and
`/api/stripe/billing/webhook` returns 404 in production because `LGQ_STRIPE_BILLING_WEBHOOK_ENABLED`
is absent, while a live Stripe endpoint is enabled and pointing at it.

**Can ship after launch:** Phase 2, 3.2, 3.3, and Phase 4 — provided the public pricing page is
truthful about them in the meantime, which is what 0.2 and the Phase 4 interim note are for.

## What not to do

- Do not meter `email.ts` broadly. Transactional email is sold as unlimited on every plan.
- Do not meter inbound SMS. The book excludes replies from the customer's balance.
- Do not enable a Phase 1 gate without a measure-only period first.
- Do not build a third enforcement pattern. Extend the reservation ledger or the cap check.
- Do not enable the `office_user` SKU before 3.3. It would sell a seat that grants full owner
  authority.
