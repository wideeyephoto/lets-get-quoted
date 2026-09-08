# Plan: Acorn Finance homeowner financing

Supersedes the provider choice in `docs/wisetack-integration-readiness-2026-09-05.md`.
That document's *rules* still bind — every one of them. Only the provider changes.

Wisetack requires ~500 platform customers before opening a partner integration
(owner report, September 8, 2026). Acorn Finance is the replacement because it
partners at the **software-platform** level with platforms our size (FieldPulse,
JobTread, Joist, AccuLynx, LMN) and because its integration shape is a
prequalification hand-off rather than a lending lifecycle we host.

## 1. Scope decision — read this before anything else

**We are integrating a referral/prequalification surface, not a lending rail.**

The homeowner clicks through to Acorn, Acorn's lender marketplace underwrites and
funds **the homeowner**, and the homeowner then pays the contractor through the
Stripe rail we already have. Money never moves through a new path. There is no
loan we service, no funding we reconcile against an invoice, no disbursement we
hold.

That single fact removes almost the entire lifecycle the Wisetack readiness doc
demanded (application state machine, authenticated provider events, idempotent
funding reconciliation, financing-vs-Stripe collection mutual exclusion). What
survives from that list is the part that was never about the provider:

- financing approval must **never** mark an invoice paid;
- we must never render an offer, APR, term, or monthly figure we computed;
- per-tenant identifiers must not leak across accounts.

If Acorn's partner agreement turns out to include a real application/funding API
(JobTread's page claims "JobTread lets you know when your customer's loan is
funded", mechanism undocumented), that is **Stage 3** below and it is additive.
It does not change Stages 0-2.

### What we are explicitly NOT building

- No loan servicing, amortisation, or payment schedule of our own. `payment_plans`
  already exists for contractor-held installments and is a different product.
- No reuse of `finance_plans` (`schema.sql:1205`). It defaults `provider` to
  `'Wisetack'`, stores `financed/monthly/months/apr` — precisely the computed
  terms we are forbidden to invent — and has no provider application ID and no
  event dedup. It has **zero writers** in the codebase today. Leave it dormant;
  see section 4.3.
- No APR, no "as low as $X/mo", no payment estimate anywhere. See section 6 —
  this is a legal constraint, not a style preference.

## 2. Verified current state

| Thing | Where | State |
|---|---|---|
| Availability constant | `src/lib/bnpl-financing.ts` | Frozen Wisetack `pending_partner_approval` object, `available: false` |
| Payments tool tile | `src/app/dashboard/payments/PaymentModals.tsx:484`, modal at `:914` | Renders the pending message as a disabled tool |
| Feature catalog | `src/lib/all-features-catalog.ts:510` (`monthly-financing-display`) | Name/desc derived from the constant, tagged `Planned` |
| Operator reports | `ai-operator/financial-forecasting.ts:79`, `ai-operator/weekly-strategy-report.ts:41` | Both emit `operatorNextStep` verbatim |
| Guard suite | `test/wisetack-availability.test.ts` | Asserts the public invoice page matches **no** `/financing\|APR\|as low as\|\$X\/mo/i` at 5 amounts, plus paid, partial and void |
| Second guard | `test/advanced-platform-features.test.ts:249` | Asserts `provider === 'wisetack'` |
| Dormant table | `finance_plans` | RLS `plan_all` owner-only (`schema.sql:2298`), indexed, in `data-disposition-registry.ts:729`, never written |

Homeowner-facing surfaces that display a project amount — the complete list, and
therefore the placement surface area:

1. `src/app/client/jobs/[token]/page.tsx` — the quote deck. **Highest value.**
   Financing changes a *buying* decision, and this is the only page where the
   homeowner has not yet decided.
2. `src/app/invoice/[id]/page.tsx` — public invoice.
3. `src/app/pay/[id]/page.tsx` — payment request (deposit/stage/final).
4. `sendClientQuoteEmail` — `src/lib/email.ts:258`.
5. `sendQuoteFollowupEmail` — `src/lib/email.ts:563`.
6. `sendInvoiceEmail` — `src/lib/email.ts:167`.

Verify before building: whether the quote/invoice PDF path is print-CSS off these
same pages or a separate renderer. If separate, it is a seventh surface and it
inherits every rule in section 6.

## 3. Sequencing — business before code

Acorn enrolls the **platform**, not each contractor. JobTread's customer-facing
copy is explicit: "There's nothing for you to sign up for and nothing for you to
pay." So the partner agreement is ours, and contractor enablement is a toggle.

**Do not start Stage 1 before the partner call.** Three answers change the design:

- **A. Identifier model.** Is there a per-contractor dealer/partner code (Acorn's
  own consumer URLs carry `?d=<code>`, e.g. `acornfinance.com/pre-qualify/?d=2D6DU`),
  or one platform-level code with contractor attribution passed as a parameter?
  This decides whether section 4 needs a per-account row or a single env value.
- **B. Surface contract.** Hosted link, embedded widget/iframe, or API? A widget
  changes our CSP — and a CSP gap against a third-party embed fails silently,
  exactly as it did with the Google Maps map ID.
- **C. Funding signal.** Is there any callback, webhook, or report telling us a
  loan funded? If yes: is it authenticated, and how? If it exists, it is Stage 3
  and it must be built from their written contract, never inferred.

Also ask: state coverage, contractor eligibility or trade restrictions, whether
Acorn pays the platform per funded loan (section 9), and what disclosure text
they require verbatim.

**Ship Stage 0 in parallel with the call.** It is provider-independent.

## 4. Data model

### 4.1 New table

`migrations/<ts>_homeowner_financing.sql`

```sql
create table if not exists public.homeowner_financing_enrollments (
  id                uuid primary key default gen_random_uuid(),
  account_id        uuid not null references public.accounts(id) on delete cascade,
  provider          text not null default 'acorn'
                      check (provider in ('acorn')),
  provider_code     text,                     -- dealer/partner code, answer A
  status            text not null default 'pending'
                      check (status in ('pending','active','suspended','declined')),
  enabled_on_quotes    boolean not null default false,
  enabled_on_invoices  boolean not null default false,
  enrolled_at       timestamptz,
  disabled_reason   text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index if not exists homeowner_financing_one_per_account
  on public.homeowner_financing_enrollments (account_id, provider);
```

Widen the `provider` CHECK by migration if a second provider is ever added. A
status union wider than the column CHECK is exactly the defect that killed the
sending-domains connect path — keep the TypeScript union and this CHECK generated
from one list, and assert they match in a test.

### 4.2 RLS, and the grant that is the actual security

New tables are anon-accessible by default in this project: the DEFAULT ACL grants
`anon` INSERT/UPDATE/DELETE on every new table. The revoke *is* the security, and
it must be asserted rather than assumed:

```sql
alter table public.homeowner_financing_enrollments enable row level security;
revoke all on public.homeowner_financing_enrollments from anon, authenticated;
grant select on public.homeowner_financing_enrollments to authenticated;

drop policy if exists homeowner_financing_read on public.homeowner_financing_enrollments;
create policy homeowner_financing_read on public.homeowner_financing_enrollments
  for select to authenticated
  using (public.office_can(account_id, 'settings.write'));
```

Writes go through the service role in server actions only. `settings.write` is
the right capability — it is what `office-access.ts:137` already uses for the
settings surfaces, and financing enablement is a business-settings decision, not
a payments one.

Add the table to `src/lib/data-disposition-registry.ts` beside the existing
`finance_plans` entry: `direct_account_id`, `localAction: 'delete'`,
`portability: 'full'`.

### 4.3 What to do with `finance_plans`

Nothing, this release. It is unreferenced by code, its RLS is owner-only, and
dropping it means touching the disposition registry, the `schema.sql` policy
block, and two indexes in
`migrations/20260901000000_supabase_security_advisor_remediations.sql`. Removing
a dormant table is not worth coupling to a shipping feature. Add a comment above
its DDL pointing at this document so the next reader does not mistake it for the
Acorn integration.

## 5. Code shape

### 5.1 Replace the constant with a resolver

`src/lib/bnpl-financing.ts` becomes provider-neutral and account-aware. The
current `HOMEOWNER_FINANCING` frozen object has four consumers (section 2) and
they all want the same thing: "what, truthfully, can I say right now?"

```ts
export type FinancingAvailability =
  | { available: false;
      reason: 'not_configured' | 'not_enrolled' | 'account_disabled' | 'surface_disabled';
      statusLabel: string; message: string; operatorNextStep: string }
  | { available: true; provider: 'acorn'; providerName: 'Acorn Finance';
      applyUrl: string; disclosure: string };
```

The `available: true` branch carries **a URL and a disclosure string, and no
numbers**. There is no field an offer amount could be assigned to. That is
deliberate: make the fabrication something the type system forbids.

`resolveHomeownerFinancing(accountId, surface)` reads the enrollment row and both
flags. Every consumer calls it; nothing reads `process.env` directly except the
resolver.

### 5.2 Provider adapter

`src/lib/acorn-financing.ts`, mirroring the shape of `src/lib/resend-domains.ts`
— provider concerns behind one module, everything else provider-agnostic.

At Stage 1 this is a URL builder over the code from answer A, plus whatever
attribution parameters Acorn specifies. Nothing else. **Do not add functions for
endpoints that do not exist.** If Stage 3 arrives, the client goes here.

### 5.3 Settings surface

`src/app/dashboard/settings/HomeownerFinancingSection.tsx` plus
`financing-actions.ts`, modelled on `QuickBooksSection.tsx` (server component,
bound server actions, a `NOTICES` map for the outcome banner). Filed under
Finances.

The contractor sees: what it is, that it is free to them, that the homeowner
borrows directly and pays them normally, that Acorn and its lenders make all
credit decisions, and two independent toggles — quotes, invoices. Both default
off. Opt-in, always: this places a third-party credit offer in front of *their*
customer under *their* brand.

### 5.4 Placement component

One `<FinancingOption />` component used by all three public pages, so the copy
and the disclosure cannot drift between them. It renders nothing at all when
`available: false`.

## 6. The copy rule, and why it is a legal constraint

Advertising closed-end credit triggers TILA/Reg Z disclosure obligations the
moment the ad states a **trigger term** — an amount of downpayment, number of
payments, period of repayment, amount of any payment, or amount of any finance
charge (12 CFR 1026.24(d)). State any one of those and the ad must then carry APR
and the full required set. The contractor is the advertiser; we render the ad.
Both carry exposure.

So the CTA is neutral by construction:

> **Monthly payment options** — See if you prequalify through Acorn Finance
> without affecting your credit score. Checking takes about a minute.
> *[See options →]*

No dollar figure. No term. No APR. No "as low as". No "0%". The project total is
already on the page; passing it to Acorn as a parameter is fine — *displaying a
derived payment* is not.

Additional required copy, near the CTA:

- Acorn Finance is a lending marketplace — not the contractor, and not us.
- Prequalification is a soft credit check and does not guarantee approval or terms.
- Approval does not pay this invoice; the homeowner still pays the contractor.

Take Acorn's exact disclosure wording during onboarding and use it verbatim.
Their contractor page carries California licensing language, so there is a
jurisdictional dimension to confirm on the partner call.

### Where it must never appear

- On a paid or void invoice. `test/wisetack-availability.test.ts` already asserts
  a settled invoice offers nothing; that assertion stays, and now covers
  financing too.
- After the balance reaches zero via a partial payment.
- On a payment request whose checkout is blocked (`CHECKOUT_BLOCK_NOTE`) — do not
  offer a path to borrow money the contractor currently cannot collect.
- Anywhere the homeowner has already signed and accepted.

## 7. Flags and rollout order

Two flags, following the `.env.example` convention, and the order matters:

```
# Contractor-facing enrollment and the Settings section. Safe first: no homeowner
# sees anything, and contractors can opt in before any customer surface exists.
LGQ_HOMEOWNER_FINANCING_ENABLED=0

# The homeowner-facing placement on quotes, invoices and payment requests.
# MUST NOT go on before the flag above, or contractors get financing offers
# rendered under their brand that they never opted into.
LGQ_HOMEOWNER_FINANCING_CUSTOMER_SURFACES_ENABLED=0
```

A Vercel Production flag does nothing until a redeploy — the env is baked at
build. Plan the flip as flag, then redeploy, then verify, and verify by observing
the surface rather than by reading the flag back.

Rollout:

1. Both off. Stage 0 merged. Nothing changes for anyone.
2. Flag 1 on, our own workspace enrolled and nobody else. Walk the Settings section.
3. Flag 2 on. Verify on one real quote and one real invoice.
4. Announce to contractors.

## 8. Tests

Rename `test/wisetack-availability.test.ts` to
`test/homeowner-financing-availability.test.ts`. **Do not delete its negative
assertions** — they are the only thing standing between us and a fabricated
offer, and the reason they exist has not gone away. Restructure as:

- *Disabled path* (all existing cases, behaviour unchanged): no enrollment, or
  flags off, means the public invoice page matches no
  `/financing|APR|as low as|\$[\d,.]+\/mo/i`.
- *Enabled path* (new): enrolled plus both flags means the page contains the CTA
  **and still matches no** `/APR|as low as|\$[\d,.]+\/mo|\d+ months|0%/i`. The
  fabrication guard survives the feature going live; only the word "financing" is
  permitted through.
- Paid, void, zero-balance and checkout-blocked invoices render no financing even
  when fully enabled.
- Financing state never changes `invoicePayState` output. Assert on the resolved
  pay state, not on rendered copy.
- Tenant isolation: account A's `provider_code` never appears in a page rendered
  for account B's invoice.
- The `provider` TypeScript union equals the SQL CHECK list.
- `anon` has no grant on the new table — assert the revoke actually bites. A
  substring check against a policy name proves nothing.
- Catalog and operator-report assertions updated: `provider === 'acorn'`, and the
  operator next step no longer says "Wisetack partner approval".

Run `npm run lint` alongside typecheck and `next build` before calling any of this
done, and do not pipe a gate through anything that swallows its exit code. Delete
`.next/types` before trusting a typecheck verdict.

## 9. Referral revenue — keep it out of contractor finances

If Acorn pays us per funded loan, that is **platform** revenue. It must not reach
`FinanceReports`, the cash-flow board, or any contractor-facing total.
Misattributed numbers presented as real finances is a defect this codebase has
shipped before. If such revenue exists, it lands in platform reporting only, and
a test should assert its absence from the contractor surfaces.

## 10. Privacy

Clicking through to Acorn discloses the homeowner's interest to a third party,
and the URL will carry attribution parameters. Update the privacy policy, add the
new table to the disposition registry (section 4.2), and confirm no PII beyond
what Acorn requires rides in the query string — the project total and a dealer
code are fine; a name, address, or email in a URL is not.

## 11. Estimate

| Stage | Work | Size |
|---|---|---|
| 0 | Resolver refactor, migration + RLS + revoke, Settings section, disposition entry, test restructure. Provider-independent, ships dark. | ~2 days |
| 1 | Adapter URL builder, `<FinancingOption />`, 3 page placements, 3 email placements, disclosure copy, catalog and operator-report updates. **Blocked on answers A/B/C.** | ~2 days |
| 2 | Flag rollout, live verification, contractor announcement. | ~0.5 day |
| 3 | Funding callback, if one exists. Design from the signed contract. Not scoped here. | unknown |

Stage 0 can start now. Stage 1 cannot, and a plausible guess at Acorn's link
format is worth less than an hour on the phone with them.

## 12. Open decisions

1. Answers A, B and C from section 3.
2. Is financing gated by plan/SKU, or available to every paid workspace?
   Recommendation: every paid workspace, ungated. It costs us nothing per use, and
   gating it would turn it into a support question.
3. Quote deck placement — inline in `QuoteDocument`, or in the `QuoteBottomBar`
   beside the pay modes? The bottom bar is where the buying decision is made.
4. Whether to keep a Wisetack path open. Wisetack's gate is on their *API* tier; a
   referral tier may exist below it, and LendingClub originating through their
   merchant network gives them reason to want reach. One email, no code.
