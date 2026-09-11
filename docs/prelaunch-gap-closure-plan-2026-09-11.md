# Pre-launch gap closure plan — 2026-09-11

Ten requirements that no item in `LAUNCH_CHECKLIST.md` currently covers. Verified absent
against the checklist at `409df2e21` (1,359 lines / 399 items / 72 open), against
`docs/launch-blockers-summary-2026-09-10.md`, and against
`docs/production-configuration-audit-2026-09-10.md`.

These are not new defects discovered in the code. They are categories the checklist never
opened. Seven carry legal, financial or reachability exposure that compounds with every
signup; three are console reads that cost minutes.

Same evidence standard as the checklist: **a closed item requires dated command output or
external-system evidence. Configuration presence is not runtime proof, and a sentence
asserting a verification is not the verification.**

---

## Summary

| # | Gap | Owner | Blocks | Effort |
|---|---|---|---|---|
| G1 | AI inference tier — published claim with no artifact | Operator → agent | Any customer data through AI paths | 30 min + 1h codify |
| G2 | Sales tax registrations | Operator + CPA | First subscription or card order | 1h + CPA lead time |
| G3 | Inbound mail liveness for 14 addresses | Operator | G5, G7, all paging | 30 min |
| G4 | Vendor account continuity register | Operator | Everything | 2h |
| G5 | Customer-facing incident channel (`/status`) | Agent | Inviting traffic | ~1 day |
| G6 | Legal counsel review | Human — attorney | Launch | Days–weeks |
| G7 | Post-cutover watch window | Agent + operator | Cutover | 3h |
| G8 | Supabase Auth SMS rate limits and spend caps | Operator | Open signup | 15 min |
| G9 | Vercel log retention | Operator | Forensics | 10 min |
| G10 | Ads conversion actually recording | Operator | Ad spend | 30 min |

## Ordering

Dependency, not preference.

1. **Start today, longest lead:** G6 (counsel engagement) and G2 (CPA). Both are gated on
   another person's calendar. Everything else can finish while they run.
2. **Today, cheap, unblocks others:** G3, G9, G8, G10. G3 first — it is a prerequisite for
   G5 and G7, and for the paging chain in `src/lib/on-call-paging.ts`.
3. **Before any further real customer data crosses an AI path:** G1.
4. **Before inviting traffic:** G4, then G5, then G7.

G1 and G6 overlap: the AI tier claim is one of the questions counsel should see, so close
G1 first and hand counsel the answer rather than the question.

---

## G1 — The AI inference tier claim is published as verified, and the verification is still an open task

### Why this is first

`src/app/privacy/page.tsx:116` states:

> **Artificial Intelligence Inference Platforms:** Google LLC (Google Gemini API) and
> OpenAI, LLC. All AI inference is conducted exclusively through paid enterprise API tiers
> with strict zero-data-retention and non-training guarantees (verified: Google Cloud
> Billing active on Gemini API project; customer data, prompts, job notes, photos, and
> voice transcripts are never used to train public foundation models).

The parenthetical was added 2026-09-09 in `8ea306817`. The task that was supposed to
produce it — **T27, "Confirm the Gemini project is on the paid tier"**
(`docs/admin-command-center-task-list-2026-09-09.md:325`) — instructed the operator to check
Cloud Console billing and *"record the answer beside the claim."* T27 is still listed as an
open operator task at priority 9, open since 2026-08-30. No evidence artifact exists in
`docs/`, `docs/evidence/`, or the checklist. The answer was written beside the claim without
the check being run.

Two distinct exposures:

- **Data.** If either project is on a consumer or free tier, homeowner photos, call
  transcripts, job notes and quotes flowing through `src/lib/ai-model-call.ts` (19 call
  sites) are training data. That is a breach of the published policy, not a copy defect.
- **Claim.** A published, self-certified verification that did not happen is materially
  worse than an unverified claim, and it is absent from all 13 entries in
  `docs/ftc-substantiation-register.md`.

The OpenAI half is the weaker half. API data has not been used for training by default
since March 2023, but **zero-data-retention is an approved-account feature, not a default** —
standard API retention is 30 days for abuse monitoring. "Strict zero-data-retention" for
OpenAI is very likely false as written unless ZDR was explicitly granted to the org.

### Steps

1. **Google (operator, 10 min).** Cloud Console → the project owning `GEMINI_API_KEY` →
   Billing. Record project ID, billing account ID, billing state, and the date. PASS =
   billing enabled on the project the production key belongs to. A billing account on a
   *different* project is not a pass.
2. **OpenAI (operator, 10 min).** platform.openai.com → org settings → Data controls.
   Record org ID, training opt-out state, and whether ZDR is granted. If ZDR is not
   granted, the page is wrong today.
3. **Reconcile the copy to the evidence (agent).** Three outcomes:
   - Both confirmed → keep the sentence, cite the evidence.
   - Google paid, OpenAI without ZDR → rewrite to what is true: no training, 30-day
     retention for abuse monitoring, zero retention only where granted.
   - Either on a free tier → treat as an incident: rotate the key to a paid project,
     correct the page, and assess what already went through.
4. **Add `scripts/inspect-ai-provider-tier.mjs` (agent).** Read-only, modeled on
   `scripts/inspect-live-top-up-prices.mjs`: loads credentials from `.env.live.local`,
   refuses to write, records provider, project/org id, model reachability and a dated
   verdict line to `docs/evidence/`. Wire as `npm run inspect:ai-tier`.
5. **Register as CLM-014 (agent)** in `docs/ftc-substantiation-register.md` with the console
   evidence as its basis, following the CLM-013 entry's format.
6. **Add a standing guard (agent)** to `test/claims-substantiation.test.ts`, matching the
   existing CLM assertions: the privacy page's tier sentence and the CLM-014 register entry
   must stay in sync, and the word "verified" may not appear in that sentence without a
   corresponding dated evidence file.

### Evidence to close

Dated console capture for both providers · `npm run inspect:ai-tier` output in
`docs/evidence/` · CLM-014 registered · guard test passing · T27 closed with a pointer to
the artifact.

---

## G2 — Sales tax is enabled in code and may be registered nowhere

`automatic_tax: { enabled: true }` is set on all three checkout paths —
`src/lib/billing/stripe-billing-subscription-checkout.ts:377`,
`src/lib/merchandise/card-checkout.ts:54`,
`src/app/dashboard/merchandise/actions.ts:335` — and `tax_behavior` is `exclusive`
throughout. Stripe Tax calculates **only where an active registration exists**. With none,
every checkout collects zero tax and the liability accrues silently against the company,
not the customer. The checklist has zero mentions of tax, nexus or registration.

**Correction (2026-09-11).** This section first read the entity address off §13, which still
carries `11801 Domain Blvd, 3rd Floor · Austin, TX 78758`, and reasoned from Texas law. That
address is stale. It was an email fallback retired on 2026-09-09 in
`docs/email-campaign-audit-2026-09-09.md`. The steps below are rewritten against the real entity;
the §13 line now carries a dated correction pointing here.

The legal entity is `LETS GET QUOTED LLC · 2222 W GRAND RIVER AVE STE A, OKEMOS, MI 48864`, set
in `src/lib/company.ts` and rendered by the website footer, Contact, Terms, Privacy, SMS Terms and
DPA. `src/app/terms/page.tsx:25` and `:321` describe a **Michigan** limited liability company under
Michigan governing law, and the operator is in Michigan. **Michigan is the home state, and physical
presence there is nexus.**

Two surfaces, two different questions:

- **Subscriptions and top-ups.** Whether Michigan taxes remotely accessed software is a live
  question with a real chance of coming back "no", so home-state registration may not be required
  at any dollar. It is the CPA's to answer, not this plan's, and it is not a reason to delay
  asking.
- **Merchandise.** Both card paths sell physical goods fulfilled by Printful and shipped to US
  addresses, tagged with the tangible-goods tax code `txcd_99999999`
  (`src/lib/merchandise/card-checkout.ts:50`). Tangible goods sold from a state where you have
  physical presence are the ordinary case for registration from the first sale. This, not SaaS, is
  the likely trigger.

One open input feeds both. `2222 W GRAND RIVER AVE STE A, OKEMOS, MI 48864` is a suite address of
the kind registered agents use, and an address of record is not necessarily where work happens.
**Nexus follows physical presence** — where the operator and the equipment actually are. If the
business operates from a different Michigan address, the CPA needs that one too, and the answer
rests on it rather than on the mailing address.

### Steps

1. **Add `scripts/inspect-stripe-tax-registrations.mjs` (agent).** Read-only, same shape and
   guardrails as `inspect-live-top-up-prices.mjs` (live key required, refuses non-live keys,
   no writes). Calls `stripe.tax.registrations.list({ status: 'active' })` and
   `stripe.tax.settings.retrieve()`. Prints each active registration's country/state and
   active-from date, plus head office and default tax behavior. Wire as
   `npm run inspect:tax-registrations`. Stripe SDK is `^22.3.1`; both calls are available.
2. **Operator: set the Stripe Tax head office to the Michigan operating address** in Stripe
   Dashboard → Tax — the Okemos address of record unless step 5 establishes a different one — and
   confirm or create the **Michigan** registration once the CPA answers which surfaces require
   it. Do not register in Texas on the strength of the stale §13 address; Texas matters only if
   Texas nexus is established on its own facts.
3. **Operator: set product tax codes** on all six base-plan Prices, the top-up Prices and
   the merchandise Prices. Without a tax code Stripe falls back to a default that may not
   match SaaS treatment.
4. **Operator: enable Stripe Tax threshold monitoring** so economic nexus in other states
   surfaces before it is breached rather than after.
5. **CPA sign-off** on four questions, recorded in `docs/tax-posture-2026-09.md`: which address
   the business physically operates from, given that the Okemos suite may be an agent address
   only; whether Michigan taxes the subscription and top-up products as sold; whether the Printful
   card orders require a Michigan registration from the first sale; and which other states to
   monitor for economic nexus rather than register in today.

### Evidence to close

`npm run inspect:tax-registrations` output · head office set to the confirmed Michigan
operating address · every
registration the CPA calls for active, or a dated CPA note saying none is required and why · tax
codes present on every sellable Price · threshold monitoring on.

Not agent-closable. Needs the Stripe account and an accountant.

---

## G3 — Nobody has proven a human receives mail at any of the 14 addresses

Fourteen `@letsgetquoted.com` addresses appear in product code: `alerts`, `finance`,
`founder`, `hello`, `ops`, `orders`, `privacy`, `risk`, `security`, `support`, `system`,
`tools`, `updates`, `voice`. MX resolves to Google Workspace and DMARC is
`p=reject; rua=mailto:dmarc@letsgetquoted.com` — both confirmed by live lookup today. What
is unconfirmed is whether anything lands in front of a person.

The checklist item **"Support Reachability & Chargeback-Evidence Drill"** (line 835) is
checked, but its text only codifies routing SLAs into a runbook. Codifying a routing rule is
not delivery proof.

This is load-bearing beyond support. `src/lib/on-call-paging.ts:49` and
`src/lib/founder-alerts.ts:219` both fall back to `hello@letsgetquoted.com` when
`ONCALL_PRIMARY_EMAIL` is unset. **If that variable is not set in Production, every
operational page across all seven alert categories terminates at an address whose liveness
has never been tested.**

### Steps

1. **Probe (operator, 20 min).** From an external mailbox — not the Workspace account — send
   a dated probe to all 14 plus `dmarc@`. Record for each: arrived yes/no, which
   mailbox or group it landed in, and which human sees it.
2. **Confirm `ONCALL_PRIMARY_EMAIL` and `ONCALL_PRIMARY_PHONE` are set in Production**, and
   that the current deployment was built *after* they were set — Vercel bakes env at build,
   so a variable added later is inert. This is T26, also still open.
3. **Fix the black holes.** Priority order by what breaks: `dmarc@` (with `p=reject` you are
   blind to alignment failures if nobody reads aggregate reports), `security@` (researcher
   reports), `privacy@` (DSAR intake, published on the privacy page), `risk@` and `finance@`
   (Stripe notices), then the rest.
4. **Write `docs/runbooks/inbound-mail-routing.md`:** address → group → owner → SLA →
   out-of-hours behavior.

### Evidence to close

Dated receipt log covering all 15 addresses · `ONCALL_PRIMARY_EMAIL` confirmed set and baked
into the current build · routing runbook committed.

---

## G4 — No vendor account continuity register

Zero mentions of payment method, plan limit, vendor billing or auto-recharge anywhere in the
checklist. Every dependency below can take the product down without a code change, and most
fail silently.

Supabase is deliberately on Free — recorded twice (lines 901, 937) as the "keep-Free
decision," framed entirely around PITR. The *other* free-tier ceilings have never been
sized: database size, storage across the seven buckets (`insurance-proof`, `job-photos`,
`lead-photos`, `site-videos`, `site-images`, `crew-photos`, `account-attachments`), egress,
log retention, connection limits. A photo-heavy contractor product on a free storage tier is
a capacity question, not only a backup question.

### Steps

1. **Build `docs/vendor-account-register.md` (agent scaffolds, operator fills).** One row per
   vendor: Vercel, Supabase, Stripe, SignalWire, Resend, Google Cloud (Gemini · Maps · Ads),
   OpenAI, Meta, Printful, Intuit, Acorn, Cloudflare (Turnstile). Columns: plan/tier ·
   payment method and expiry · billing owner · billing-alert recipient · hard limits ·
   behavior at limit · what breaks · console URL.
2. **Operator: confirm a non-expiring payment method and billing alerts on each**, with
   notices routed to a monitored address from G3.
3. **Operator: SignalWire balance and auto-recharge.** SMS and voice stop at zero balance
   with no application-level symptom until a customer reports it.
4. **Size the Supabase free ceilings against launch load and decide explicitly:** upgrade now,
   or document the accepted limits with the number that would force the upgrade. This extends
   the existing keep-Free decision rather than reopening it.

### Evidence to close

Register committed with dated console reads · auto-recharge confirmed on SignalWire · a
stated, dated Supabase tier decision citing actual current usage against each ceiling.

---

## G5 — No customer-facing incident channel

Seven operational alert categories page the operator through `src/lib/founder-alerts.ts`
(`uptime`, `runtime_exception`, `cron_failure`, `webhook_dead_letter`,
`billing_reconciliation`, `sms_queue_stall`, `provider_outage`), and
`docs/runbooks/vercel-rollback-drill.md` covers getting back. Nothing tells a customer
anything. There is no `/status` route. For a one-operator business, the first outage where a
contractor loses a lead and hears nothing is a churn event and a support flood at the same
time.

This is the only item requiring real build work.

### Steps

1. **Migration: `platform_incidents`** — `id`, `started_at`, `resolved_at`, `severity`,
   `component`, `public_title`, `public_body`, `published_at`, `updated_at`. RLS: `anon` may
   read published rows only; writes restricted to admin. Follow the forward-only,
   non-breaking pattern in `docs/runbooks/vercel-rollback-drill.md` so a rollback still runs
   cleanly against the newer schema.
2. **`src/app/status/page.tsx`** — public, anonymous, no auth. Current state plus the last 10
   incidents. Must render under the CSP nonce pipeline in `src/middleware.ts`. Add to
   `src/app/sitemap.ts`; confirm `src/app/robots.ts` allows it. Keep it dependency-light — it
   has to render when the rest of the platform is unhealthy, so no dashboard bundle.
3. **Admin control** in the existing operator cockpit
   (`src/app/admin/operator/OperatorCockpit.tsx`): open → update → resolve, writing
   `admin_actions` audit rows like the other admin mutations.
4. **Deep link from the alert emails.** `sendOperationalEmergencyAlert` already generates SRE
   console deep links; add "open a public incident" so paging and publishing are one step.
5. **Optional: dashboard banner** when an incident is open, reusing the existing launch
   banner component rather than adding a new one.
6. **Policy, written down:** which severities get published, who writes the copy, and the
   target time from page to publish.

### Evidence to close

Deployed `/status` returning 200 anonymously against the frozen release SHA · a rehearsed
open → update → resolve cycle with the page correctly reflecting each state · RLS test
proving `anon` cannot read unpublished rows · route present in sitemap.

**2026-09-11 verification:** G5 remains open. The rehearsal runner has been
corrected and regression-tested, but the actual staging run fails before writing
data because `platform_incidents.published` is missing. Production has the same
schema gap; the live `/status` returns 404 and is absent from the sitemap. See
[the rehearsal record](runbooks/incident-rehearsal-2026-09-11.md) for evidence and
the remaining deployment, page-state, and operator-audit checks.

---

## G6 — Legal counsel review has no line item, and it is the longest pole

Zero mentions of lawyer, attorney, counsel, legal review or surcharge in the checklist.
§13 verified that disclosures **exist in the code** and that claims have a substantiation
register. Neither is a lawyer saying the posture is sufficient.
`docs/unrun-prelaunch-audits-2026-08-31.md:311` already names this cluster as
"**Lawyer, not an agent**" and it never became a tracked item.

### Brief to assemble (agent, 2h)

`docs/legal-review-brief-2026-09.md`, pulling together: the 13 FTC claims ·
`src/app/terms/page.tsx` · `src/app/privacy/page.tsx` · `src/app/dpa/` ·
`AI_VOICE_DISCLOSURE` and `RECORDING_DISCLOSURE` in `src/lib/voice/` · the employee
monitoring and crew GPS notices · the lien/NOI generator · the UPPA and trade-insurance
surface · fee and surcharge logic · `docs/ftc-substantiation-register.md`.

### Questions for counsel

Counsel should be Michigan-licensed: `src/app/terms/page.tsx:321` chooses Michigan law and Michigan
venue, and the permits surface already encodes Michigan-specific requirements
(`src/components/permits/PermitSubmissionModal.tsx:193` cites MCL 125.1523a). Start question 1 with
Michigan.

1. Mechanic's lien and NOI validity per state served — the generator produces documents with
   statutory deadlines.
2. **Public-adjusting exposure** from the insurance-claims workflow. Unlicensed public
   adjusting is a criminal offense in many states; "UPPA-Aligned Workflow" is a description,
   not a legal opinion.
3. Card surcharge and platform fee legality per state, plus card-network rules if any fee is
   passed to a cardholder.
4. All-party-consent recording states versus the current disclosure design.
5. Sufficiency of the employee electronic-monitoring notice for crew GPS and call recording.
6. State privacy rights (CA, CO, CT, VA and the rest) against the DSAR and 30-day deletion
   flow.
7. ADA and WCAG posture — §9 and §10 cover contrast; they do not cover keyboard or screen
   reader conformance, nor a legal opinion on exposure.
8. The G1 AI tier claim, once the answer exists.

Record dispositions in `docs/legal-review-2026-09.md`. Anything counsel flags becomes its own
checklist item.

**Start the engagement today.** Everything else here finishes in days; this one does not.

---

## G7 — No post-cutover watch window

`§4 — Orderings where the wrong sequence causes the harm` covers flag sequencing, and
`§6 — Who does what` in `docs/platform-go-live-2026-09-08.md` splits agent versus operator
work *during preparation*. Neither defines the hours after cutover: what is watched, by whom,
at what cadence, and what number triggers a rollback instead of a judgment call.

The real constraint is that it is one person, who sleeps. That should be designed for, not
discovered.

### Steps

Write `docs/runbooks/launch-watch-window.md`:

1. **T-0 sequence** — reference the §4 orderings rather than restating them.
2. **Hours 0–24 and 24–72** — named metrics with numeric thresholds: failed-payment rate,
   webhook dead-letter depth, SMS queue depth and stall duration, cron failures per fleet
   inspection, 5xx rate, AI spend rate, signup-to-activation.
3. **Abort criteria as numbers, not adjectives**, each tied to `vercel rollback` from the
   existing drill runbook and to the §4 reverse-ordering rules for flags.
4. **Overnight policy** — which categories page the phone via `ONCALL_PRIMARY_PHONE`
   (`src/lib/operational-sms-paging.mjs`) and which wait for morning. Depends on G3.
5. **Publication trigger** — which thresholds also open a public incident from G5.
6. **Tabletop walkthrough**, dated, before cutover.

### Evidence to close

Runbook committed · thresholds numeric and tied to real metric sources · dated tabletop
record.

---

## G8, G9, G10 — console reads, minutes each

**G8 — Supabase Auth SMS rate limits and spend caps.** Flagged as B4 in the 2026-08-31 sweep,
never migrated to the checklist. Auth SMS is a standard pumping-fraud target and the spend
lands on this account. Confirm per-hour and per-IP limits and any spend ceiling in the
Supabase console; record the values.

**G9 — Vercel log retention on the current plan.** Sets the forensics window. If retention is
shorter than the incident-detection lag, post-incident analysis is impossible by
construction. Record the number and state it in the DR posture doc.

**G10 — Ads conversion actually recording.** The checklist tracks the cross-device attribution
gap (lines 368, 457) but never whether the tag fires at all. Run one real end-to-end
conversion and confirm it appears in Google Ads and Meta. Do this before spend, not after.

---

## What this plan does not cover

It does not touch the 72 open items already tracked. It adds no scope to the six-SKU
acceptance, the 10DLC customer campaign gate, the AI Voice matrix, the domain canary
(R04, day 1 of 7, completing 2026-09-17 at earliest), or the DR sign-off. Those have owners
and evidence trails already.

It also does not re-litigate the keep-Free Supabase decision or the items under
`§ Deferred by decision`. G4 asks only that the *unsized* ceilings get sized and the decision
restated with numbers behind it.

---

## Appendix A — section to append to `LAUNCH_CHECKLIST.md`

Place immediately after `## Workstream Updates (2026-09-11)`.

```markdown
## Coverage gaps opened — 2026-09-11

Ten requirements no prior item covered. Verified absent against this checklist at
`409df2e21`, `docs/launch-blockers-summary-2026-09-10.md` and
`docs/production-configuration-audit-2026-09-10.md`. Plan and evidence standards:
[prelaunch-gap-closure-plan-2026-09-11.md](docs/prelaunch-gap-closure-plan-2026-09-11.md).

- [ ] **AI inference tier — published as verified, never verified:** `src/app/privacy/page.tsx:116`
  asserts "paid enterprise API tiers with strict zero-data-retention and non-training guarantees
  (verified: Google Cloud Billing active on Gemini API project)", added 2026-09-09 in `8ea306817`.
  The originating task T27 (`docs/admin-command-center-task-list-2026-09-09.md:325`) is still open
  and no evidence artifact exists. OpenAI zero-data-retention is an approved-account feature, not a
  default, so the sentence is likely false for that provider as written. Close with dated console
  captures for both providers, `npm run inspect:ai-tier` output, CLM-014 in the FTC register, and a
  sync guard in `test/claims-substantiation.test.ts`. Customer photos, transcripts and job notes
  cross 19 call sites in `src/lib/ai-model-call.ts`.
- [ ] **Sales tax registrations:** `automatic_tax: { enabled: true }` is live on all three checkout
  paths, which collects nothing where no registration exists. The entity is a Michigan LLC at
  `2222 W GRAND RIVER AVE STE A, OKEMOS, MI 48864` (`src/lib/company.ts`; Michigan organization and
  governing law at `src/app/terms/page.tsx:25` and `:321`), so Michigan is the home state. Whether
  Michigan taxes remotely accessed software is the CPA's first question. The unambiguously taxable
  surface is merchandise: both card paths ship physical Printful goods to US addresses under
  tangible-goods tax code `txcd_99999999` (`src/lib/merchandise/card-checkout.ts:50`). Give the CPA
  the address the business physically operates from as well as the Okemos address of record, which
  is a suite of the kind registered agents use: nexus follows physical presence, not where mail is
  forwarded. Close with `npm run inspect:tax-registrations` output, head office set to the confirmed
  Michigan operating address, product tax codes on every sellable Price, threshold monitoring
  enabled, and a dated CPA note covering Michigan SaaS treatment, Michigan registration for the card
  orders, and which states to monitor for economic nexus.
- [ ] **Inbound mail liveness:** 14 `@letsgetquoted.com` addresses appear in product code; MX and
  `p=reject` DMARC resolve, but no delivery to a human has been proven. Line 835 codified routing
  SLAs only. `src/lib/on-call-paging.ts:49` falls back to `hello@` when `ONCALL_PRIMARY_EMAIL` is
  unset, so the entire paging chain may terminate at an untested address. Close with a dated receipt
  log for all 15 addresses including `dmarc@`, `ONCALL_PRIMARY_EMAIL` confirmed set and baked into
  the current build (T26), and `docs/runbooks/inbound-mail-routing.md`.
- [ ] **Vendor account continuity:** no payment method, plan limit or auto-recharge is tracked for
  any of the 12 vendors. Supabase free-tier ceilings beyond PITR — database size, storage across 7
  buckets, egress, log retention, connections — have never been sized. Close with
  `docs/vendor-account-register.md` carrying dated console reads, SignalWire auto-recharge confirmed,
  and a dated Supabase tier decision citing usage against each ceiling.
- [ ] **Customer-facing incident channel:** 7 alert categories page the operator; nothing informs a
  customer and no `/status` route exists. Close with a deployed anonymous `/status` on the frozen
  SHA, `platform_incidents` with anon-read-published-only RLS, operator open/update/resolve writing
  `admin_actions`, and a rehearsed incident cycle.
- [ ] **Legal counsel review:** §13 verified disclosures exist in code; no attorney has assessed
  lien/NOI validity per state, public-adjusting exposure, surcharge legality, all-party-consent
  recording, employee-monitoring sufficiency, state privacy rights, or ADA posture. Named as
  "Lawyer, not an agent" in `docs/unrun-prelaunch-audits-2026-08-31.md:311` and never tracked. Close
  with dispositions recorded per question in `docs/legal-review-2026-09.md`. Longest lead time on
  this list — engage now.
- [ ] **Post-cutover watch window:** §4 covers flag orderings and go-live §6 covers preparation
  ownership; nothing defines hours 0–72. Close with `docs/runbooks/launch-watch-window.md` carrying
  numeric thresholds for failed payments, dead-letter depth, SMS stalls, cron failures, 5xx and AI
  spend, each tied to a rollback trigger and an overnight paging policy, plus a dated tabletop.
- [ ] **Supabase Auth SMS rate limits and spend caps:** flagged as B4 on 2026-08-31, never tracked.
  SMS pumping fraud bills to this account. Close with recorded console values.
- [ ] **Vercel log retention:** sets the forensics window; never recorded. Close with the retention
  figure stated in the DR posture doc.
- [ ] **Ads conversion recording:** attribution gap is tracked (lines 368, 457) but not whether the
  tag fires at all. Close with one real end-to-end conversion visible in Google Ads and Meta, before
  spend.
```

## Appendix B — artifacts this plan creates

| Path | Item |
|---|---|
| `scripts/inspect-ai-provider-tier.mjs` + `npm run inspect:ai-tier` | G1 |
| `scripts/inspect-stripe-tax-registrations.mjs` + `npm run inspect:tax-registrations` | G2 |
| CLM-014 in `docs/ftc-substantiation-register.md` | G1 |
| Sync guard in `test/claims-substantiation.test.ts` | G1 |
| `docs/tax-posture-2026-09.md` | G2 |
| `docs/runbooks/inbound-mail-routing.md` | G3 |
| `docs/vendor-account-register.md` | G4 |
| `migrations/*_platform_incidents.sql`, `src/app/status/page.tsx`, cockpit controls | G5 |
| `docs/legal-review-brief-2026-09.md`, `docs/legal-review-2026-09.md` | G6 |
| `docs/runbooks/launch-watch-window.md` | G7 |
