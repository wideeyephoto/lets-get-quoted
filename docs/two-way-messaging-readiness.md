# Two-Way Messaging Readiness

**Owner:** LGQ Operations<br>
**Last verified:** 2026-08-22, against production and `main`<br>
**Status:** blocked. No contractor has a number, and none can be registered from inside the product.

This is the gate list for `contractor_dedicated` — a contractor texting their own
customers from their own number. It is a companion to
[the cutover runbook](signalwire-messaging-cutover-runbook.md), which covers the
platform lanes. Every claim here was checked rather than recalled; the query or
file that proves each one is named, because most of this state moves.

---

## The headline: this is not only about chat

`senderPurposeFor()` sends **everything except owner alerts and crew dispatch**
down the dedicated lane:

```ts
// src/lib/sms-delivery.ts
if (category === 'owner_alert') return 'lgq_shared';
if (category === 'crew_message') return 'lgq_dispatch';
// Customer, payment, and lead-verification traffic speaks for the independent
// contractor. It must never escape on LGQ's shared Campaign.
return 'contractor_dedicated';
```

And `stage_sms_delivery` refuses when no number matches the account:

```sql
where s.purpose = v_event.sender_purpose
  and (s.purpose = 'contractor_dedicated' and s.account_id = v_event.account_id)
  ...
if v_sender.id is null then
  return query select 'blocked_sender'::text, ...
```

Production holds **zero** `contractor_dedicated` rows. So arrival texts, payment
reminders, appointment confirmations, estimate and reschedule offers, and lead
phone verification are all `blocked_sender` today — two-way chat is the visible
part of a lane that carries most of the product's customer contact.

Total outbound events ever recorded: **three**. Two delivered owner alerts on the
shared lane, and one failed Twilio row from 2026-07-21.

```sql
select status, sender_purpose, billing_category, count(*) from sms_events group by 1,2,3;
select count(*) from sms_sender_numbers where purpose = 'contractor_dedicated';
```

---

## A. Carrier — the long poles

| # | Item | State on 2026-08-22 |
|---|---|---|
| A1 | Shared number assignment `eaea6053` | `failed`; the only sender row is `assignment_pending` / `failed`. Blocks the platform lane too. Awaiting SignalWire support |
| A2 | **Per-contractor brand + campaign** | Manual, outside the product. See below |
| A3 | Campaign use case must permit contractor→customer | Our platform campaign declares the opposite |
| A4 | Callback token rotation | **Outstanding** — the token was leaked twice on 2026-08-22. Rotation is a carrier operation that destroys and re-creates the assignment, so it waits until a failed assignment costs nothing. Procedure and the failure it caused are in the [runbook](signalwire-messaging-cutover-runbook.md#rotating-the-token-is-a-carrier-operation) |
| A5 | Campaign has no `status_callback_url` | Registered on the assignment order 2026-08-22, but not on the campaign — so a suspension, expiry or revoked use case delivers nothing anywhere. Needs a valid callback token, so it sequences with A4 |

### A2 is the real gate

Each application carries its **own** carrier identity:

```sql
select column_name from information_schema.columns
 where table_name = 'messaging_registration_applications'
   and column_name in ('provider_brand_id','provider_campaign_id');
```

That is correct for 10DLC — the brand must be the business whose messages go out,
and that is the contractor, not LGQ. But the client is **read-only**:

```
src/lib/signalwire-number-provisioning.ts:401  async getBrand(...)
src/lib/signalwire-number-provisioning.ts:420  async getCampaign(...)
```

There is no `createBrand` and no `createCampaign`. Staff paste the two UUIDs into
the admin review form (`src/app/admin/messaging/registrations/page.tsx:317-318`)
after registering them by hand in SignalWire. So per contractor: a manual TCR
registration, days-to-weeks of vetting, and carrier fees — before the product
can do anything.

Everything downstream of that *is* built: purchase, configure inbound, assign,
each idempotent and operator-resolvable.

### A3 is a separate vetting question

The platform campaign's TCR description states that it carries no
contractor-to-customer traffic — that declaration is what keeps the shared lane
honest, and it is why the shared number's auto-reply carries no marketing. A
contractor's campaign has to declare the opposite. It is not a copy of ours with
a different name on it.

---

## B. Commercial — nothing can be sold or granted

| # | Item | Evidence |
|---|---|---|
| B1 | **No dedicated-number SKU exists** | `TopUpId` in `src/lib/billing/catalog.ts:182` lists twelve; none is a number. No recurring line either |
| B2 | **The TS catalog and the database disagree** | See below |
| B3 | Pricing says "coming soon" in four places | `src/app/pricing/pricing-catalog.ts:90,119,152,200`, `PricingExperience.tsx:32,90,101` |
| B4 | Cost model without a revenue model | `LGQ_SIGNALWIRE_NUMBER_MONTHLY_PRICE_CENTS` and a monthly spend ceiling both exist |

### B2, in detail

`src/lib/billing/catalog.ts` sets `dedicatedBusinessNumbers: 0` on all four
plans, with a comment warning that a TS-only change here dead-letters every Solo
activation because the projector recomputes `feature_limits` and refuses the
projection when the two disagree.

Production does not match:

```sql
select plan_code, catalog_version, feature_limits->>'dedicated_business_numbers'
  from workspace_entitlements order by plan_code;
```

| plan | catalog_version | dedicated_business_numbers |
|---|---|---|
| flex (×5) | `2026-08-18-preview` | `0` |
| solo (×1) | `2026-08-15-preview` | **`1`** |

It is worse than a wrong number. The same stale row also says `office_users: 1`,
so it never received Solo's second office seat and that workspace can never
invite anybody. Why it is stuck, and why it cannot heal itself, is under B3.

The one Solo workspace is on a **stale catalog version** and carries an allowance
the current catalog sets to zero. It is display-only — `plan-usage.ts:156` reads
it and `PlanUsageSection.tsx:155` renders it as a row; nothing gates provisioning
on it. So the live Plan & usage tab currently promises that workspace a dedicated
business number that no part of the product can deliver.

### B3 is not a copy edit

Turning "coming soon" into a sold feature is a catalog change with checkout
live, which is refused in both orderings. Verify against the live function body,
never the migration file — after a chain of text patches, no file states the live
value.

**And a version bump strands every subscription that already exists.** A
separate, permanent hazard from that transient deploy window, found 2026-08-22.

`project_stripe_billing_subscription_event_v1_unchecked` pins one exact string:

```sql
or v_catalog_version <> '2026-08-18-preview' then
  raise exception 'Stripe Billing projection contract is invalid' using errcode = '22023';
```

That value does **not** come from the app constant.
`stripe-billing-subscription-events.ts:356` reads
`catalogVersion: metadata.lgq_catalog_version` off the **Stripe subscription** —
written once at checkout — and passes it to the projection at line 688. Stripe
metadata never migrates. So the moment `PRICING_CATALOG_VERSION` moves, every
subscription created before the bump fails projection on its next event:
renewal, cancellation, payment failure, all of it. Nothing self-heals, because
the only thing that could rewrite the entitlement row is the projector now
refusing it.

It has already happened once, which is how it was found. The one row in
`billing_subscriptions` is `solo`, `active`, on `2026-08-15-preview`, renewing
2026-09-18. Its entitlement row is stranded on the same version — so it never
received Solo's second office seat (`office_users: 1`, and the owner occupies it,
so that workspace can never invite anybody) while also advertising
`dedicated_business_numbers: 1` on the live Plan & usage tab.

**Impact today is nil** — it is `BIGFATPIPEGUYS2`, a rehearsal workspace with
zero leads, jobs and clients. The mechanism is the finding, not the row.

Preflight before any catalog change, one query:

```sql
select account_id, plan_code, status, catalog_version, current_period_end
  from billing_subscriptions
 where catalog_version <> '2026-08-18-preview';
```

Either migrate their Stripe metadata first, or make the projector accept a set of
versions rather than one. Note `stripe-billing-subscription-events.ts:637` also
requires the PRICE metadata to match the subscription's, so a metadata fix has
two sides.

---

## C. Engineering

### Built, and proven

- The contractor application form and its persisted draft
  (`src/app/dashboard/messages/dedicated-number/`), collecting everything TCR
  needs — legal name, website, privacy policy, terms, opt-in evidence, use case,
  sample messages — with EIN handled separately as compliance verification that
  never stores the full number.
- Staff review, approval, and operator resolution of provider operations.
- Purchase / configure-inbound / assign-campaign operations, idempotent, with
  `indeterminate` outcomes reconciled by a human before any retry.
- Purpose-isolated inbound routing. `npm run test:pg17:sms-inbound-actions` runs
  **30/30** against a real PostgreSQL 17, including *"same-phone dedicated reply
  can mutate customer intent only"* and its dispatch and shared counterparts.
- Consent scopes — nine `customer` rows exist in production today.
- Inbox actions correctly gated: `requireActiveDedicatedMessagingSender` is
  called by both reply paths and both settings paths.

### Missing or unproven

| # | Item |
|---|---|
| C1 | **The rail has never run once.** `select count(*) from messaging_registration_applications` → `0` |
| C2 | Brand/campaign creation unautomated (A2) |
| C3 | `LGQ_TEXT_CREDIT_METER_ENABLED` / `LGQ_TEXT_CREDIT_GATE_ENABLED` — state unknown. Two-way multiplies volume; measure before enforcing, per the usage-meter convention |
| C4 | `LGQ_SMS_CONTRACTOR_MESSAGING_ENABLED`, `LGQ_SMS_DELIVERY_WORKER_ENABLED`, `LGQ_SMS_INBOUND_ACTION_WORKER_ENABLED` all need sequencing, and each is baked at build |
| C5 | **Inbound actions apply inline with no gate, but their retry is dark.** `processSmsInboundActionReceipt` has no flag check, so the webhook applies actions whatever the flags say. The `sms-inbound-actions` cron — declared `* * * * *` — has recorded **zero** runs in seven days, because the route 404s before recording when `LGQ_SMS_INBOUND_ACTION_WORKER_ENABLED` is off. So an action that comes back `busy`, `deferred` or `failed` has no backstop; the route's 503 asks the carrier to redeliver, and carrier redelivery is finite. Nothing is stuck today (`select task_state, count(*) from sms_inbound_action_tasks` → one `completed`), but two-way multiplies the inbound volume that would test it |

---

## D. Compliance

| # | Item |
|---|---|
| D1 | Opt-in evidence per contractor. Their customers' consent is their obligation and LGQ's carrier risk |
| D2 | STOP / HELP on a dedicated number must answer as **the contractor's** brand, not LGQ's. The copy is brand-interpolated, but it has only ever run on the shared lane — verify before a real customer sends STOP |
| D3 | The shared-number courtesy reply must never fire on a dedicated number. Enforced twice on purpose — in the route (`SHARED_NOTICE_LANES`) and again in `record_sms_shared_notice_reply` — and covered by test. Do not relax either |

---

## E. Open defects that touch this lane

| # | Item |
|---|---|
| E1 | **An AI-written city list decides who gets alerted.** Disclosed on the Automations page 2026-08-22; the scoring question is still open. Full mechanism below |
| E2 | Custom domains cannot complete a TLS handshake — and the registration form suggests the contractor's site as the TCR website URL |
| E3 | Orphaned SWML resource `6db2d8f3`, still pointing at dead staging |
| E4 | Four `Dana Whitfield` test leads (cleanup script dry-runs by default) |

---

### E1, corrected

The first version of that row said a real nearby town is "pruned" and "sends
nothing". Half right, and the wrong half matters.

**Leads are never hidden.** The schema is explicit that
`mute_low_quality_leads` stops "owner alerts / the dashboard nag. They still
land in the leads board, just quietly." It is `true` on all six workspaces, and
nothing is lost from the board.

**What actually happens is narrower and sharper** —
`src/app/api/public/leads/route.ts`:

```ts
const isHighValue = !hasPruneFlag && estimate != null && ...
score: hasPruneFlag ? 'low' : ...
// and inside notifyOwner:
if (alert.muteLow && lead.triage?.score === 'low') return;
```

A prune flag makes high-value **impossible by construction**, forces the score
to `low`, and the mute then suppresses the alert. So a genuinely large job from
a town the list does not name produces **no alert and no text at all** — it sits
on the board waiting to be noticed. A second submission from the same person
does get through: a duplicate deliberately passes `muteLow: false`, because "a
homeowner asking twice is hotter, not spam".

**Where the list comes from is the uncomfortable part.** The cities are written
by a model at site creation. `serviceAreaGate` defaults to **on**
(`leadFilters.serviceAreaGate !== false`), and `serviceAreaVerdict` fails open
only when the list is EMPTY — a populated but incomplete list fails closed on
every town it omits, and contractors serve more towns than a model lists.

The known-bad case is already fixed at the source: gpt-4o-mini asked to resolve
ZIP 48067 once answered "Maplewood, Springfield, Sunnyvale" — real US place
names, none near Royal Oak — so Google resolves the primary city first now and
the answer enters the prompt as a fact. The model still invents the
*neighbouring* towns and those are never verified. Invented extras are harmless
here, since they only make matching more permissive; it is the **omissions**
that cost alerts.

Live state: one workspace (`BIGFATPIPEGUYS`, the test one) still carries the old
placeholder list. The other three populated lists are real and plausible —
Illinois, Kansas City metro, Nashville area. Two have no list at all and so fail
open.

**The middle option shipped 2026-08-22.** Scoring is unchanged. The service-area
row on the Automations page now names the towns that are actually filtering —
not "your list" — and, when the low-quality mute is on, states plainly that a
lead from any other town lands on the board but **will not alert you, not even
if it is a big job**. It offers the two exits that genuinely work: add the town,
or untick the mute. The old hint read "flags leads outside your list", which is
true and sounds cosmetic.

It stays silent when there is no list, because `serviceAreaVerdict` returns null
for an empty one and the gate cannot fire — a warning there would be noise.

`test/service-area-gate-disclosure.test.ts` pins both halves: the copy, and the
four route behaviours the copy asserts. If the route stops working this way the
test fails, because a disclosure is only as true as the thing it describes.

**Still open, and still a product call:** may a prune flag suppress a high-value
alert at all? Today `isHighValue = !hasPruneFlag && …` makes it impossible by
construction. Alerting on every out-of-area lead is noise; silently not alerting
on a large one is worse. Disclosing it does not settle it.

---
## F. Not verifiable from here

Production flag values are Vercel **Sensitive** variables: write-only, unreadable
by anyone including the operator agent. Confirming the live state of any
`LGQ_SMS_*` flag needs a Vercel read or an authenticated probe.

`npm run verify:signalwire` tags those rows **`[local env]`**. Its carrier rows
— brand, campaign, number, handler, assignment — are true wherever it runs; the
tagged rows only describe the machine running it. Do not read a tagged FAIL as a
production fact.

---

## The one decision that reorders this list

**Does each contractor register their own 10DLC brand, or does LGQ pursue a
reseller / sub-account arrangement with SignalWire?**

It changes the cost model, the onboarding time, and whether B1–B3 are a pricing
change or an entirely new purchase flow. It is worth asking in the same support
thread as the failed assignment (A1), because the answer gates everything in
section B and most of section C.
