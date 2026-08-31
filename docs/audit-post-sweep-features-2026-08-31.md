# Pre-launch audit — the feature wave shipped after the 2026-08-30 sweep

**What this is.** The [audit-gap sweep](audit-gap-sweep-2026-08-30.md) and its
[verification](remediation-verification-2026-08-30.md) both ended at commit
`6e128eed` (2026-08-30 10:43). In the ~25 hours after, **135 commits / 265 files
/ +42,035 −4,741 lines** landed and reached HEAD `08dbee15` with no audit of any
kind. This document audits that range: `6e128eed..08dbee15`.

**Method.** Six parallel read-only auditors, one per surface (Revenue &
Payments Hub, insurance claims, the post-fix managed-ads wave, voice/SMS,
public pages + lead pipeline, cross-cutting infra), each primed with this
codebase's documented failure patterns. Every load-bearing finding below was
then re-verified by hand against source at HEAD (`git show 08dbee15:<path>`), the
migration files, and a live read-only Stripe probe. Nothing was executed against
production; no code changed; no database or external service was written.

**Verdict: this wave is mostly theater, and it is all live.** Not one feature in
the range is behind a feature flag. The nav entries ship, and the owner
capability sentinel passes every guard, so every surface below is reachable by
every owner today. The read surfaces that predate this wave (payments ledger,
receivables aging, Stripe payouts overview, revenue analytics base, the
collect/record/refund rails) are real and correct. Almost everything *new* is
one of three things: **(a)** fabricated data rendered as the customer's own
finances, **(b)** a success message for an operation that never happened —
including two that claim to have charged a card, or **(c)** a public/changelog
claim for code that has no callers. On top of the theater sit four genuine
engineering defects: a card-charging cron loop, an SSRF, a cross-tenant SMS
path, and a shared-secret confused-deputy on the voice webhook.

**The one piece of good news, and it is load-bearing.** There are still **no real
customers** ([[no-real-customers-yet]]), so nothing here has a victim *yet*. And
every customer-directed SMS/voice path routes through the `contractor_dedicated`
lane, which is dark (no active dedicated number can exist today), so
`stage_sms_delivery` cancels those sends as `blocked_sender` — which is what
keeps the SMS-bomb and voice-SMS-trigger vectors from being live. Frame each item
below by **which sale it must precede**, not by money it is bleeding today.

---

# P0 — will take money dishonestly, break tenant isolation, or fabricate a regulated document

## 1. The managed-ads wallet loop bills real cards for spend it invents, every 15 minutes
*Found by two independent auditors; verified against source.*

`/api/cron/ad-spend-sync` runs `*/15 * * * *` (96×/day, `vercel.json`). Three
compounding defects turn it into an autonomous card-charger:

- **It fabricates spend.** `syncAccountAdSpendUsage`
  ([ad-billing.ts:1053](../src/lib/ad-billing.ts#L1053)) has no
  already-synced-today guard. When Google returns nothing — including the normal
  "campaign has spent $0 so far today" case — it invents
  `dailySpendRateCents = monthlyBudget / 30.4` with fabricated
  clicks/impressions/conversions, tagged `source: 'scheduled_pacing'`.
- **It accumulates instead of replacing.** `recordAdSpendUsage`
  ([ad-billing.ts:948](../src/lib/ad-billing.ts#L948)) merges the same-day entry
  as `existing.spendCents + spendCents`. 96 runs ≈ **96× the daily budget**
  drained from the wallet per day. The real-Google path is also wrong — it
  re-adds the day's *cumulative* spend on every run.
- **The drain triggers a real charge.**
  ([ad-billing.ts:988](../src/lib/ad-billing.ts#L988)) when the fabricated spend
  pushes the balance below threshold, it calls `executeWalletRefillCharge` →
  `stripe.paymentIntents.create({ off_session: true, confirm: true })`
  ([ad-billing.ts:767](../src/lib/ad-billing.ts#L767)) on the saved card, with
  **no idempotency key**. State is a read-modify-write of a `sites.content` JSON
  blob written *after* the charge, so a crash in between re-charges on the next
  run. `spentThisMonthCents` is incremented by both spend and refills and
  **never resets monthly** (only at checkout), so the "monthly ceiling" is a
  lifetime cap that phantom spend exhausts in hours.

Net: a contractor on the wallet plan wakes to ~$1,100 across four off-session
PaymentIntents for ads that served ~zero clicks, and a dashboard of fabricated
click history to reconcile against the card. **Reachability:** completing a
wallet checkout requires Google Ads configured in production (the checkout guard
at [ad-billing.ts:210](../src/lib/ad-billing.ts#L210) throws otherwise) — so this
is gated behind "Google configured" + "a customer bought", neither of which has
happened. It is the single most dangerous thing to fix before the first ads sale.

## 2. `invoice.paid` activates a campaign whose provisioning failed
[ad-billing.ts:613](../src/lib/ad-billing.ts#L613) sets `status: 'active'`
unconditionally on the matching subscription, with no check of
`provisioningStatus`/`googleCampaignId`. A weekly-drip subscriber whose Google
provisioning failed (`pending_provisioning`, null campaign id) is flipped active
by the first weekly invoice; Stripe then bills $176+/wk and defect #1's pacing
fabricates "performance" forever, with no ad ever created. **Live.**

## 3. Cancel and pause do not stop the money, and a failed cancel reports success
- **Wallet cancel is a no-op on the money.** For wallet accounts
  (`stripeSubscriptionId` null) "cancel" only sets `cancelAtPeriodEnd: true`
  ([ad-billing.ts:1248](../src/lib/ad-billing.ts#L1248)); status stays `active`,
  both crons keep charging, while the UI states "No further charges will occur."
- **Subscription cancel swallows Stripe failure.** The `subscriptions.cancel`
  call is wrapped in `catch (err) { console.warn(...) }` and the function still
  returns `success: true` ([ad-billing.ts:1229](../src/lib/ad-billing.ts#L1229)) —
  a Stripe failure leaves the subscription billing while the customer is told it
  is cancelled.
- **Pause reverts itself.** `invoice.paid` (defect #2) sets `active`, so the next
  weekly renewal silently un-pauses a paused campaign. **Live.**

## 4. "Tap to Pay" reports a settled card payment with no backend whatsoever
[PaymentModals.tsx:3522](../src/app/dashboard/payments/PaymentModals.tsx#L3522).
The first option under "Collect Payment" (badged "New · Fast", sold as "Accept
contactless credit cards, Apple Pay, and Google Pay") flows keypad → "Activate
Contactless Reader" → a button literally labeled **"✨ Simulate Contactless Card
Tap"** whose handler is `onClick={() => setTerminalStep('approved')}` — a pure
client state change — then shows "**Payment Approved & Settled** · $X charged via
Contactless Card" and toasts "Settled $X via Tap to Pay." **No Stripe call, no
database row, not even a manual payment record.** A contractor runs $2,400, sees
"Approved & Settled," and leaves; no money moved and nothing will ever reconcile.
**Live.**

## 5. "Virtual Terminal" fakes charging a saved card with a `setTimeout`
[PaymentModals.tsx:1118](../src/app/dashboard/payments/PaymentModals.tsx#L1118).
"Charge Saved Card" submit is `setTimeout(() => onSuccess('Card charged
successfully via Virtual Terminal.'), 1000)`, under copy claiming "Processing
through Stripe Connect encrypted vault. Instant receipt will be emailed &
texted." There is no card on file, no charge, no receipt. **Live.**

## 6. SSRF via the authenticated image proxy
[lead-photos/proxy/route.ts:14](../src/app/api/lead-photos/proxy/route.ts#L14)
(new). The only gate is "is *a* user signed in" (no tenant/role check); the only
validation is `protocol === http|https`. It then `fetch()`es the
caller-supplied `url` verbatim and streams the body back with
`Access-Control-Allow-Origin: *`. Any signed-in user can point it at
`http://169.254.169.254/latest/meta-data/...` or an internal service and read the
response — cloud-credential / internal-service exfiltration, cross-origin
readable. The one legitimate caller only ever passes a Supabase storage URL, so a
host allowlist costs nothing. **Live, no flag.**

## 7. Insurance claim letters attest to inspections that never happened, with invented dollar amounts
Regulated domain (insurance supplementing / UPPA). The "AI Supplement Studio" is
**not AI** — the real model module `insurance-ai.ts` has **zero callers**; the
dashboard runs a client-side substring matcher over ~4–6 canned supplements per
trade. Its flagship output, a carrier-addressed demand letter presented as "Ready
to Send," states *"We have conducted a thorough physical inspection of the
property located at ${propertyAddress}"*
([insurance-claims.ts:256](../src/lib/insurance-claims.ts#L256)) — no inspection
occurred; the software has seen only pasted text. Line items carry canned
"reasons" asserted as fact about a property nobody measured, and hardcoded dollar
constants summed into a "Total Supplement Amount Requested." The property address
is hardcoded to a fictional **"1422 Meadowbrook Lane"** with its setter
deliberately suppressed and no input bound to it
([InsuranceClaimsClient.tsx:62](../src/app/dashboard/claims/InsuranceClaimsClient.tsx#L62)),
defaults naming State Farm and a fictional policyholder. With an empty scope box,
all six roofing supplements flag "omitted," producing a $3,850 demand letter for a
property with no data at all. No disclaimer appears anywhere. **Live, on indexed
public landing pages.**

## 8. "AI Detect Defects" stamps a fabricated defect + measurement onto real home photos
*Found by two independent auditors.*
[lead-photos/ai-suggest/route.ts:38](../src/app/api/lead-photos/ai-suggest/route.ts#L38)
(new) requires a `photoUrl` and **never fetches or examines it**, and calls no AI
provider. It returns hardcoded shapes at fixed fractions of the frame: a red "⚠️
DEFECT / REPAIR ZONE" box, a caliper labeled **`48" Span`**, and a note "Surface
moisture & crack detected" — identical for every photo — under a comment calling
itself an "AI Vision Defect Detection Engine," with `summary: 'AI detected 1
primary defect zone...'`. The button ("✨ AI Detect Defects" / "AI automatically
detects defects, leaks & damages") merges these onto the canvas and Save
re-uploads the marked-up JPEG into the photo gallery — fabricated inspection
evidence a contractor can attach to an insurance claim. **Live, no flag.**

## 9. "3D LiDAR CAD takeoffs" render a hardcoded sample room as the customer's property
[room-spatial-intel.ts:733](../src/lib/property-intel/room-spatial-intel.ts#L733)
(`SAMPLE_ROOM_SCANS`). There is no ingestion path — no route, no persistence, no
scan storage (the "Phone Scan" QR encodes nothing). On every real lead/job
Property tab, `RoomScanViewer` falls back to `SAMPLE_ROOM_SCANS[0]` and displays
it badged "**99.4% CAD Precision · iPhone 15 Pro · Apple RoomPlan LiDAR · Scanned
Today**" with `pointCount: 148500`. Every derived artifact — wall elevations,
material costs, the "ProDesk CSV" supply pick-list, and the "⚡ Sync to AI Quote
Draft" button — is computed from that invented geometry. A contractor can order
tile or quote a real job off a generic sample bathroom bearing no relation to the
address. No "sample/demo" label anywhere. **Live, no flag.**

## 10. The SWAIG voice webhook lets one shared secret act on any tenant
[swaig/route.ts:45](../src/app/api/voice/swaig/route.ts#L45). The route is gated
on one shared HTTP-Basic secret (fail-closed — good), but the signed per-call
`token` that is supposed to bind the account and caller is **optional**: when
absent, `accountId` is taken straight from the query string. All SWAIG functions
then run under the service-role admin client scoped only by that
caller-supplied value — `update_job_details`, `create_or_update_lead`,
`log_crew_time_and_materials`, `create_job_change_order`,
`append_job_caution_or_note` (rewrites `clients.notes`), plus booking SMS to a
caller-chosen phone. Anyone holding the one shared secret omits the token and
edits any tenant's data. Confused-deputy / broken tenant isolation; **P0 the
moment that secret leaks or is weak.** No negative-auth test exists. **Live.**

---

# P1 — customer-visible wrong, broken isolation (bounded), or a checkable false claim

- **Cross-tenant SMS billed to the victim.**
  [sms.ts:1047](../src/lib/sms.ts#L1047) `sendPaymentSmsEvent` looks a payment up
  by id alone via the admin client with no account scoping; the reminder actions
  only check the *caller's* `messages.send` in the *caller's* workspace
  ([payments/actions.ts:160](../src/app/dashboard/payments/actions.ts#L160)).
  Anyone who knows a payment UUID — homeowners get one in every `/pay/<id>` link —
  can fire SMS from another contractor's number, billed to that contractor.
  Bounded by UUID knowledge and idempotency, but it is a cross-tenant write.

- **The entire "Financial Operations Tools" layer is success-toast theater.**
  Beyond #4/#5, each of these renders a green success for an operation with no
  backend write: **Batch Settle** (runs on two hardcoded fake invoices INV-101/102,
  reports "settled 0 invoices"), **Dunning Engine** ("save" persists nothing; the
  real `/api/cron/dunning` only retries failed card charges), **ACH Incentive**
  and **Surcharge** and **Payment Rules** "save" (discard all settings, touch only
  `updated_at`), **Card Pre-Authorization** and **Lien-Waiver delivery** and
  **NOI "Serve via SMS"** and **Retainage "Demand Release"** (send an ordinary
  pay-me text, or nothing, while toasting that a legal notice was dispatched/
  registered). Multiple "send receipt" / "update card" buttons dispatch the
  *payment-request* template, so a customer who just paid receives a pay-me link.

- **Fabricated customer data on money surfaces.** The **Draw Calendar** (invented
  clients summed to "Expected Inflow +$38,300"), **Retainage Tracker** ("$12,600
  in Escrow"), **Consolidated Statement** (fallback client "Austin Real Estate
  Holdings LLC — $18,450.00" with a dead `/pay/consolidated` link — *found twice*),
  and **Revenue "30-Day Predictive Cash Velocity"** (last *year's* gross relabeled
  as next month's forecast) all render strangers' names and invented balances as
  the contractor's own pipeline.

- **1099-K "compliance tracking" states the wrong threshold and tracks nothing.**
  [PayoutsTransfersPanel.tsx:124](../src/app/dashboard/payments/PayoutsTransfersPanel.tsx#L124)
  hardcodes a "Compliant" badge and a `width: 100%` bar, computes no gross
  volume, and cites a **$5,000** threshold (the 2024 phase-in) when TY2026 under
  OBBBA is $20,000 + 200 transactions. A contractor relying on it is misled twice.

- **"Instant Payout — Within 30 Mins" has no payout rail.** `git grep
  payouts.create` → zero hits. The card shows a net-of-fee figure off the
  *standard* balance and ignores the real `instantPayoutEligible` it computes. No
  button, so no money at risk — an advertisement for a capability that does not
  exist.

- **Changelog v2.6.0 announces dead code as a shipped "Major Release."**
  [changelog.ts:49](../src/lib/changelog.ts#L49): Neighborhood Halo geofenced
  Meta/Instagram ads, Closed-Loop Meta CAPI sync, and Instant Aerial Satellite
  Property Sizing. Verified: `neighborhood-halo`, `neighborhood-halo-ai`,
  `ad-closed-loop-sync`, `satellite-property-sizing` each have **zero non-test
  importers and zero network calls**; there is no Meta integration anywhere;
  satellite `footprintSqFt` defaults to a hardcoded **1800** sqft labeled
  `'high_satellite'`. `features.ts` lists two of them as live `favorite`
  features.

- **AI Voice is sold on `/pricing` with no live Stripe Price.** Live Stripe probe
  (`inspect:live-top-ups`, run today) confirms `ai_voice_flex/solo/growth` and
  `voice_minutes_100` have **no live Price**, yet
  [pricing-catalog.ts:180](../src/app/pricing/pricing-catalog.ts#L180) sets
  `VOICE_PURCHASABLE = true` and the plan cards, comparison rows, and FAQ ("Yes,
  AI Voice is available!") sell 5/10 concurrent calls. Checkout hard-fails
  `price_not_found`; the customer-facing receptionist needs a dedicated 2-way
  number that cannot be provisioned today.

- **The guard test that existed to prevent that was inverted.**
  `test/pricing-voice-not-purchasable.test.ts` keeps its filename and header
  comment ("cannot be bought … written to fail loudly on the launch change") while
  its body now asserts `VOICE_PURCHASABLE === true`; four negative-guard tests in
  it were deleted. A green suite now certifies the over-promise.

- **False TCPA/quiet-hours claim.** `/terms` and `/sms-terms` state automated
  messages are "held and delivered once permissible daytime hours resume" in the
  recipient's local time zone. The delivery pipeline implements no such thing; the
  only quiet-hours code (`ad-speed-to-lead.ts`) computes windows in **Eastern
  time for everyone** and, on a quiet-hours hit, returns `sent: true` while
  **silently dropping** the message (no persistence, no later-send worker). A
  Pacific homeowner can be texted at 5:15 AM local; an overnight lead's text
  vanishes. Changelog claims "compliant 8:01 AM local dispatch" — false.

- **Ads copy contradicts the charge, and sells channels with no integration.**
  The `monthly_fixed` Stripe line still reads "100% applied to Google search
  clicks" while `unit_amount` includes the 10% fee
  ([ad-billing.ts:333](../src/lib/ad-billing.ts#L333)); Growth/Scale bundles
  allocate "$200 retargeting"/"$427 Meta" with **no Meta client anywhere** — the
  full budget goes to one Google Search campaign; dayparting/services/radius the
  customer configures are never written to checkout metadata.

- **Ad-billing 2FA is bypassable and an SMS-pump vector.** The OTP crypto is
  sound, but there is **no attempt counter / rate limit** on verify (900k-guess
  brute-force of a static 10-min code) and **no server-side send throttle** (only
  a client 60s timer), the send idempotency key is timestamp-derived, and the
  verification gates nothing server-side — any `settings.write` user can store an
  unverified `smsAlertPhone`.

- **`payments.write` / `billing.write` capabilities do not exist in the catalog.**
  ~8 hub actions and the claims-bundle payment actions gate on them
  ([payments/actions.ts](../src/app/dashboard/payments/actions.ts)); owners pass
  via the sentinel, but no office user can ever hold them — every hub tool is
  silently owner-only, contradicting the office-capability design, and no test can
  catch a capability name never in the catalog.

- **Cron-health gate weakened to pass on missing `DATABASE_URL`.**
  `scripts/inspect-cron-health.mjs:52` changed from `process.exit(1)` to
  `console.warn(...); process.exit(0)`. If the var is ever dropped from the
  monitor's env, the health check passes forever — the exact "dark worker records
  nothing" failure the registry exists to catch, and the repo's own
  "piping a gate loses its exit code" shape.

---

# P2 — latent or bounded

- **Tax vault targets an unexposed schema.** `subcontractor-tax-identity.ts` reads
  `.schema('tax_vault')`, which PostgREST cannot serve until an operator adds it
  to the exposed-schemas list (never done). ACLs are correctly service-role-only.
  **Zero importers today**, so nothing can hit the PGRST106; the first wiring will
  fail until the exposure task runs. The migration crypto (`TAX_VAULT_ENCRYPTION_KEY`,
  documented, fail-closed) and the new DLP guard blocking SSN/EIN from public-schema
  notes are real, added safety.
- **`.env.example` gained ~200 lines duplicating 50 existing keys.** dotenv
  first-occurrence-wins, so a future edit to the second copy is a silent no-op.
- **Receivables overstate.** Every open invoice reports `amountDue = total`
  (partial deposits never deducted), a fabricated `created_at + 14d` due date
  regardless of terms, and counts **draft** invoices as receivables that flip to
  "overdue."
- **Milestone plan builder does float math** (`total * 0.33`) while the exact-cents
  allocator sits imported one line above — a $1,234.56 contract bills 1¢ short.
- **Payment QR codes** are generated by `api.qrserver.com` — every pay link is
  leaked to a third party and the QR breaks if that host is blocked.
- **Crew arrival briefing** hand-types "Reply STOP" instead of the real
  `withOptOut` builder, has no pre-enqueue suppression check, and is absent from
  the message catalogue (the DB stage gate backstops actual delivery; recipient is
  an employee).
- Misc decorative claims: unconditional "Live Settlement Engine Active" heartbeat,
  a receipt "Verification Hash" that hashes nothing, "ACH saved" counting cash and
  checks, a "Bank Account" payout destination because `payouts.list` isn't
  expanded.

---

# What is genuinely real (so the absence of a finding means something)

- **The core money rails.** Payments ledger, receivables aging plumbing, Stripe
  payouts overview (`balance.retrieve` / `payouts.list`), revenue analytics base
  aggregation, offline/field payment recording (with a real
  refuse-to-mark-paid-until-collected rule), instant pay links, refunds
  (owner-gated). All account-scoped, exact-cents, no `maximumFractionDigits: 0`
  display formatter anywhere in the wave.
- **Auth hygiene of the mutating actions** (with the two filed exceptions): every
  one derives `accountId` from a session-verified `requireOfficeContext` /
  `requireOwnerContext`, not a caller-supplied id.
- **The marketing-texts gate BITES** server-side, in depth
  (`requireActiveDedicatedMessagingSender` + a lib-boundary re-check), and the UI
  reflects it honestly ("Setup required," disabled send). Test is behavioral.
- **Intake-confirmation and voice-booking SMS use the real `withOptOut` builder**
  and check `isPhoneOptedOut`; the catalogue entry imports the real builder.
- **Cron/auth/migration hygiene is clean.** All 34 scheduled routes go through the
  fail-closed `cronRoute`; the old fail-open `account-closure` auth was fixed in
  this range; 34 scheduled == 34 registered; both new migrations revoke anon and
  match their access paths.
- **Fixes since the 08-30 ads doc landed:** production checkout guard when Google
  Ads is unconfigured, awaited-and-persisted provisioning, landing URL built from
  the real subdomain, fee cut 15%→10% with copy aligned, `GOOGLE_ADS_*`
  documented.

---

# Recommended order before launch

1. **Ads money loop (P0 #1–3).** Gate the wallet/ads purchase off until the
   sync-cron idempotency, the replace-not-add fix, the cancel/pause money-stop,
   and the `invoice.paid` provisioning check are all in. This is the only rail
   that can charge a real card autonomously. Must precede the first ads sale.
2. **SSRF (P0 #6)** and **SWAIG optional-token (P0 #10)** and **cross-tenant SMS
   (P1)** — genuine security defects, fixable in isolation, no product decision
   needed. Do these regardless of launch date.
3. **Insurance + fabricated-inspection surfaces (P0 #7–9).** Regulated-domain and
   trust exposure. Either build the real thing or take the surfaces down and pull
   the public claims; do not ship keyword-grep output as AI inspection findings.
4. **Revenue Hub theater (P0 #4–5, the P1 tool layer).** Decide per tool: wire it
   or remove it. Two of them tell a contractor a card was charged when it was not
   — those cannot ship in any form.
5. **Honesty pass on public/pricing/changelog.** Re-withhold AI Voice, restore its
   guard test, remove the dead-code changelog entries, fix the 1099-K threshold
   and the quiet-hours terms, fix the "100% to clicks" line.

**Operator (Codex) questions this audit cannot answer from the repo:** are the
five `GOOGLE_ADS_*` credentials set in Vercel Production (decides whether the ads
loop is reachable at all), and is `tax_vault` on PostgREST's exposed-schemas list.
