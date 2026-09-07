# Plan: customer-owned email sending domains

**Date:** 2026-09-07
**Status:** Stages 1–3 built & tested. Active rollout tracked in [custom-email-domains-post-launch-tasks.md](custom-email-domains-post-launch-tasks.md).
**Scope owner:** unassigned

Today every contractor's customer email leaves as `Elite Electricians <hello@letsgetquoted.com>`.
This plan lets it leave as `Elite Electricians <quotes@eliteelectricians.com>`, DKIM-signed by the
contractor's own domain, without touching the mailbox they already use.

---

## 1. Scope decision — read this before anything else

"Set up email with their custom domain" is three different products. They share a phrase and
nothing else. This plan builds the first, designs for the second, and explicitly refuses the third.

| | What the user gets | What it costs us |
|---|---|---|
| **A. Custom sending domain** (IN SCOPE) | Outbound mail is `From: quotes@theirdomain.com`, DKIM/SPF aligned to their domain. Replies still land in the mailbox they already have. | One provider adapter, one table, one send-path change. ~2 weeks. |
| **B. Inbound reply routing** (DESIGNED FOR, NOT BUILT) | Replies to `quotes@theirdomain.com` are captured by us and threaded onto the job. | Inbound webhook, message store, threading UI, spam handling. Separate project. |
| **C. Hosted mailboxes** (OUT OF SCOPE) | A real inbox at `info@theirdomain.com` they log into. IMAP, storage, webmail, MX on the apex. | We would be reselling Google Workspace / Migadu. This is a mail-hosting business, not a feature. Resend cannot do it. |

**Recommendation: build A only.** A is where essentially all the perceived value is — the customer
sees the contractor's domain in the From line — and it is the only one of the three that does not
require us to take custody of the tenant's real mail. B is a reasonable follow-on once A has
adoption. C should be answered in the marketing copy with "keep the email you already have."

The rest of this document is A.

---

## 2. Verified current state

Everything in this section was read out of the tree on 2026-09-07, not recalled.

**The ESP is Resend.** One key, `RESEND_API_KEY`, Production only. The client in
[email.ts](src/lib/email.ts#L64-L70) is built lazily behind a getter, on purpose: `new Resend(undefined)`
throws from its constructor, and because this module is in the import graph of a page, an eager
client broke *every Preview build* for a day. **Any new module that touches Resend must construct
lazily too.** Preview deliberately has no sending credential and should keep not having one.

**Every From address is ours.** 22 sends in [email.ts](src/lib/email.ts), plus seven elsewhere:
[digest.ts:88](src/lib/ai-operator/digest.ts#L88), [crew-auth.ts:58](src/lib/crew-auth.ts#L58),
[magic-link.ts:43](src/lib/magic-link.ts#L43), [merchandise-emails.ts:101](src/lib/merchandise/merchandise-emails.ts#L101),
[email-report/route.ts:64](src/app/api/tools/email-report/route.ts#L64).

**There is exactly one choke point for contractor-branded mail.**
[`contractorFrom(businessName)`](src/emails/brand.ts#L175-L178) is called at 15 sites, and at every
one of them the argument is `brand.businessName` — meaning the full `EmailBrand` is already in
scope at every call site. This is the single most important fact in this plan: the send path needs
no new async work, only a wider argument.

**The reply address already reaches the contractor.**
[`loadEmailBrand`](src/lib/email-brand.ts) resolves `accounts.reply_to_email`, falling back to the
owner's auth email. That fallback is why v1 does not need inbound routing to be useful.

**A website custom-domain rail already exists and is a good model, not a dependency.**
`sites.custom_domain` + `sites.custom_domain_verified_at` ([schema.sql:486-519](schema.sql#L486)),
a provider adapter [vercel-domains.ts](src/lib/vercel-domains.ts), a verifier
[domains.ts](src/lib/domains.ts), and an action
[verifyCustomDomainAction](src/app/dashboard/sites/actions.ts#L613) whose authorization and
zero-row-write handling should be copied almost line for line.

> **It is a model, not a dependency.** The website domain rail currently cannot serve — it reports
> "Verified and connected" while the TLS handshake fails. Email verification runs through Resend and
> shares no code path with Vercel TLS. **Do not gate email domains on `custom_domain_verified_at`.**
> A contractor must be able to send from a domain whose website we do not host at all.

**A test currently forbids this feature.**
[deliverability-recovery-matrix.test.ts:57](test/deliverability-recovery-matrix.test.ts#L57) asserts
`contractorFrom` "always preserves verified domain @letsgetquoted.com to maintain SPF/DKIM/DMARC
alignment." That assertion is correct today and must be *narrowed*, not deleted — see §11.

**Platform DMARC is managed by a script.**
[manage-dmarc-transition.mjs](scripts/manage-dmarc-transition.mjs) walks `letsgetquoted.com` from
`p=none` to `p=reject`. Tenant domains get their own, unrelated DMARC posture (§7).

**Delivery outcomes already flow back.** [resend/webhook/route.ts](src/app/api/resend/webhook/route.ts)
verifies Svix signatures, records bounce/complaint/failure, and mirrors suppression per account.
Tags already carry `account_id`. This is reusable as-is and is how per-domain health gets measured.

---

## 3. Architecture

```
Owner enters domain
        │
        ▼
  createSendingDomainAction ──► resend-domains.ts ──► POST /domains (Resend)
        │                                                    │
        │                            returns DKIM + SPF + return-path MX records
        ▼                                                    │
  email_sending_domains row (status=pending, dns_records jsonb) ◄─┘
        │
   owner adds 3 DNS records at their registrar
        │
        ▼
  verifySendingDomainAction ──► POST /domains/:id/verify ──► GET /domains/:id
        │
        └─► status=verified, verified_at set   (never set from our own DNS read)
                    │
                    ▼
            loadEmailBrand() joins the verified row
                    │
                    ▼
            brand.fromAddress = "quotes@theirdomain.com"
                    │
                    ▼
            contractorFrom(brand) ─► From: header on 15 send sites
```

Three properties this shape buys:

1. **One write point for truth.** Only the provider's own status may set `verified_at`. Our DNS
   resolver is used for *diagnostics shown to the owner*, never for the verdict. This is the lesson
   [website-domain-manager.ts](src/lib/website-domain-manager.ts#L23) already records as "never
   fabricate successful DNS or SSL status."
2. **The send path stays synchronous.** `loadEmailBrand` already runs one round of lookups; the
   sending domain rides along on the existing `sites`/`accounts` fetch. No send gets slower.
3. **Fallback is structural, not conditional.** If the join returns nothing, `brand.fromAddress` is
   null and `contractorFrom` returns the platform address — the same string it returns today.

---

## 4. Data model

New table, new migration `migrations/2026MMDDHHMMSS_email_sending_domains.sql`.

```sql
create table public.email_sending_domains (
  id                 uuid primary key default gen_random_uuid(),
  account_id         uuid not null references public.accounts(id) on delete cascade,
  domain             text not null,
  from_local_part    text not null default 'hello',
  from_display_name  text,
  provider           text not null default 'resend',
  provider_domain_id text,
  status             text not null default 'pending'
                       check (status in ('pending','verified','failed','disabled')),
  dns_records        jsonb not null default '[]'::jsonb,
  last_checked_at    timestamptz,
  verified_at        timestamptz,
  failure_reason     text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Global, not per-account. Two tenants must never send as the same domain.
create unique index email_sending_domains_domain_key on public.email_sending_domains (lower(domain));
create unique index email_sending_domains_provider_key
  on public.email_sending_domains (provider_domain_id) where provider_domain_id is not null;
create index email_sending_domains_account_idx on public.email_sending_domains (account_id);

-- One verified sending domain per account for v1. Widening this later is additive.
create unique index email_sending_domains_one_verified_per_account
  on public.email_sending_domains (account_id) where status = 'verified';
```

Design notes, each with a reason:

- **`on delete cascade`, not `restrict`.** A restrict FK from a table nobody thinks about is how
  accounts become undeletable the moment the table gets its first row. The provider-side cleanup is
  handled by a delete hook (§9), not by blocking the delete.
- **`lower(domain)` unique.** `validateCustomDomain` already lowercases, but the index must not
  depend on a caller remembering to.
- **`dns_records` as jsonb, verbatim from the provider.** Resend rotates its recommended values.
  Hard-coding a DKIM host or an SES region into our code is the mistake
  [domains.ts:100](src/lib/domains.ts#L100) already documents ("a hard-coded legacy A record cannot
  decide whether this domain is ready").
- **`from_local_part` separate from `domain`.** The owner picks `quotes` / `hello` / `billing`
  without re-verifying DNS. Validate against `^[a-z0-9]([a-z0-9._-]{0,30}[a-z0-9])?$` and refuse the
  RFC 2142 reserved names (`abuse`, `postmaster`) — those are not ours to take on someone's domain.

**Grants — this is the security, and it must be asserted.** New tables in this database are
INSERT/UPDATE/DELETE-able by `anon` by default. The migration must end with:

```sql
alter table public.email_sending_domains enable row level security;
revoke all on public.email_sending_domains from anon, authenticated;
grant select on public.email_sending_domains to authenticated;

create policy email_sending_domains_read on public.email_sending_domains
  for select to authenticated
  using (public.office_can(account_id, 'settings.write'));
```

`public.office_can(account_id, '<capability>')` is the idiom every recent policy in this repo uses
(see `20260905140000_review_invites_rls_hardening.sql`), and `settings.write` is the capability
`/dashboard/sites` is already gated on in [nav-visibility.ts:36](src/lib/nav-visibility.ts#L36) —
the same people who may connect a website domain may connect a sending domain, and nobody else.

No insert/update/delete policy at all: every write goes through the service role in a server action
that has already called `requireOfficeContext('settings.write')`. A test must prove `anon` is
refused — a policy that was never granted looks identical to one that was, until it isn't.

---

## 5. Provider adapter — `src/lib/resend-domains.ts`

Mirrors [vercel-domains.ts](src/lib/vercel-domains.ts) deliberately: same `isConfigured()` guard,
same "validate the response actually describes the domain we asked about" discipline, same
`AbortSignal.timeout`, same lazy credential read.

```ts
export type SendingDomainRecord = {
  type: 'TXT' | 'MX' | 'CNAME';
  name: string;
  value: string;
  priority?: number;
  ttl?: string;
  status?: string;
};

export type SendingDomainResponse = {
  id: string;
  name: string;
  status: 'not_started' | 'pending' | 'verified' | 'failed' | 'temporary_failure';
  records: SendingDomainRecord[];
};

export function isSendingDomainProvisioningConfigured(): boolean;
export async function createSendingDomain(domain: string): Promise<SendingDomainResponse>;
export async function getSendingDomain(id: string): Promise<SendingDomainResponse | null>;
export async function triggerSendingDomainVerify(id: string): Promise<SendingDomainResponse | null>;
export async function deleteSendingDomain(id: string): Promise<boolean>;
```

Requirements on the adapter:

- **Read `process.env.RESEND_API_KEY` inside each call**, never at module scope. Module-scope reads
  are how Preview builds died last time.
- **`createSendingDomain` must be idempotent.** Retry after a network timeout must not create a
  second Resend domain. List-then-create, and on a create error, re-list and accept an existing
  binding — exactly the race [addDomainToVercel](src/lib/vercel-domains.ts#L79-L92) already handles.
- **Never map an unknown provider status to `verified`.** Default any unrecognized string to
  `failed`, not to success.

**Cost/limit check before committing to this design (CONFIRMED 2026-09-07):**
Resend includes:
- **Free:** 3 verified domains.
- **Pro ($20/mo):** 10 verified domains included.
- **Domains Add-On (Pro/Scale):** $20/month per 100 additional domains ($0.20/domain/month), toggled under Settings > Usage.
- **Scale:** 1,000 verified domains included.

Conclusion: One tenant = one Resend domain does **not** create a hard ceiling at 10 customers on Pro. Adding 100 custom domain customers costs $20/mo total. Scale covers up to 1,000 domains out of the box. No shared subdomain fallback is needed.

---

## 6. Send-path integration

**One type change, one function change, 15 mechanical call-site edits.**

`EmailBrand` in [src/emails/brand.ts](src/emails/brand.ts) gains one field:

```ts
/** A verified tenant sending address, or null to use the platform address. */
fromAddress: string | null;
```

`contractorFrom` takes the brand instead of a name:

```ts
export function contractorFrom(brand: Pick<EmailBrand, 'businessName' | 'fromAddress'>): string {
  const clean = String(brand.businessName ?? '').replace(/["\\<>\r\n]/g, '').trim().slice(0, 60);
  const address = sanitizeAddress(brand.fromAddress) ?? 'hello@letsgetquoted.com';
  return clean ? `${clean} <${address}>` : `Let's Get Quoted <${address}>`;
}
```

`sanitizeAddress` is not optional. `fromAddress` is assembled from an owner-supplied local part and
an owner-supplied domain, and it lands in an SMTP header. It must reject anything containing
`"`, `<`, `>`, `\`, CR, LF, or more than one `@`, and return null on any of them — the same header
injection defence the business-name path already has, applied to the half that is now also
user-controlled.

`loadEmailBrand` adds the lookup to its existing `Promise.all`:

```ts
admin.from('email_sending_domains')
  .select('domain, from_local_part, from_display_name')
  .eq('account_id', accountId)
  .eq('status', 'verified')
  .maybeSingle(),
```

and sets `fromAddress` only when the row exists. `nameOnlyBrand` sets it to `null`, so every
account-less send keeps today's behaviour with no branch.

The 15 call sites change from `contractorFrom(brand.businessName)` to `contractorFrom(brand)`. The
type change makes the compiler find all of them; there is no way to miss one.

### 6.1 What may NOT move to a tenant domain

This is a correctness boundary, not a preference. Three of these would be actively dangerous.

| Send | Domain | Why |
|---|---|---|
| Quotes, invoices, payment requests, appointment reminders, review asks, rebook invites | **tenant** | The whole point. Customer-facing, contractor-branded. |
| Marketing campaigns | **tenant** | Where alignment matters most, and where reputation isolation actually pays. |
| **Magic links** ([magic-link.ts](src/lib/magic-link.ts)) | **platform, always** | This is the login credential for *our* product. If a tenant's DKIM lapses, they lock themselves out of the dashboard and cannot get back in to fix the DNS that locked them out. |
| **Crew auth** ([crew-auth.ts](src/lib/crew-auth.ts)) | **platform, always** | Same lockout, and it already reads `"{business} via Let's Get Quoted"` — the "via" is doing real work. |
| Billing, receipts, dunning, plan changes | **platform, always** | Ours, about our contract with them. |
| Founder alerts, uptime, AI operator digests, merchandise | **platform, always** | Not tenant mail at all. |

The lockout risk is the sharp one. A test must assert that `magic-link.ts` and `crew-auth.ts` never
reach `contractorFrom`, and that assertion should name the reason.

---

## 7. DNS instructions — the highest-severity risk in this plan

Resend issues three records, and **all of them live on a `send.` subdomain or a `_domainkey`
selector. None of them touch the apex.** That is what makes this safe to ship to a contractor who
already runs Google Workspace:

```
TXT    resend._domainkey.theirdomain.com    p=MIGfMA0GCS...     ← DKIM
TXT    send.theirdomain.com                 v=spf1 include:amazonses.com ~all
MX     send.theirdomain.com                 feedback-smtp.<region>.amazonses.com   priority 10
```

**The UI must never instruct an owner to add, change, or remove an apex `MX` record or an apex
`v=spf1` record.** Doing either destroys the email they already receive — that is a business-ending
outcome for a contractor and it would be our fault. Enforce it as a guard, not a convention: the
record-rendering component filters to records whose `name` is a subdomain of the entered domain and
refuses to render an apex MX, and a test feeds it a hostile provider payload containing an apex MX
and asserts it is dropped with a visible warning rather than silently displayed.

**DMARC is advice, never a requirement, and never `p=reject`.** If the tenant has no DMARC record we
may *suggest* `v=DMARC1; p=none; rua=...`. Suggesting `p=quarantine` or `p=reject` to a domain that
also sends through Google Workspace, a CRM, and a scheduling tool will silently quarantine their
real mail. Show the record, explain it, let them decide, and do not block verification on it.

**Reuse the guided connector.** [DomainConnector.tsx](src/app/dashboard/sites/DomainConnector.tsx)
already carries per-registrar step-by-step instructions and deep links for GoDaddy, Squarespace,
Cloudflare and others, verified against their help docs. Extract the `PROVIDERS` array into a shared
module and reuse it verbatim with the email record set. Do not write a second set of registrar
instructions — one of them will go stale and nobody will know which.

---

## 8. Deliverability, honestly

**What this buys.** DKIM `d=` alignment to the tenant's own domain, a From line the recipient
recognizes, and per-tenant DMARC alignment. Gmail and Yahoo bulk-sender rules are satisfied per
domain rather than pooled.

**What it does not buy.** Resend's shared IP pool is still shared. One contractor mailing a
purchased list still degrades the pool everyone sends through. Domain separation isolates
*reputation attributed to the domain*, not *reputation attributed to the IP*. Anyone writing the
marketing copy for this feature needs to know that, because "your own sending reputation" is a claim
this does not fully support.

**What actually reduces the shared-pool risk** is unchanged by this plan and should be tracked
separately: the marketing email meter ([marketing-email-usage.ts](src/lib/billing/marketing-email-usage.ts))
capping campaign volume, the existing per-account suppression list, and complaint-rate monitoring.

**New capability worth building on top:** the Resend webhook already tags every send with
`account_id`. Once domains are per-tenant, bounce and complaint rates become attributable per domain,
which makes an automatic "your domain's complaint rate is above 0.3%, sending paused" guard possible.
Not v1, but the data model above supports it (`status = 'disabled'`, `failure_reason`).

---

## 9. Lifecycle and failure modes

| Event | Required behaviour |
|---|---|
| Owner changes the domain | Delete the old provider domain, delete the row, start fresh. Never carry `verified_at` across a domain change — the [website rail](src/app/dashboard/sites/actions.ts#L126-L130) already clears verification on change and this must match. |
| Owner deletes the domain | Provider delete first, row delete second. If the provider delete fails, mark `status='disabled'` and keep the row so it can be retried; do not orphan a verified domain at Resend. |
| Account deleted | Cascade removes the row. A scheduled reconciler (§10) is what catches the orphaned provider-side domain, because a cascade cannot make an HTTP call. |
| Verification never completes | Row sits at `pending` forever, harmlessly. Sends use the platform address. Show the age and the last checked time; do not auto-delete. |
| Domain verified, then DKIM record removed by the owner | Resend flips the domain to `failed`. Nothing in our code notices until someone re-checks — **mail from that account starts failing at the provider.** This is the one failure that is silent and customer-visible. It needs the reconciler in §10, not a manual re-check button. |
| Provider unreachable during verify | Leave `status` untouched, record `last_checked_at` and `failure_reason`, return a "could not check" message. Never downgrade a verified domain because one HTTP call timed out. |
| Two accounts claim one domain | Unique index refuses the second. Surface it as "this domain is already connected to another account" — the same message and the same pre-flight conflict check as [verifyCustomDomainAction](src/app/dashboard/sites/actions.ts#L623). |

**Zero-row writes.** Every status update must be `.update(...).eq('id', ...).eq('account_id', ...)
.eq('domain', domain).select('id').maybeSingle()` and must treat a null result as failure. `if
(error) throw` proves the database accepted the statement, not that it changed a row — an owner who
disconnects mid-verification would otherwise get a resurrected verified domain.

---

## 10. Reconciler

A daily cron, registered alongside the existing jobs in [cron-jobs.ts](src/lib/cron-jobs.ts):

- For every row with `status in ('pending','verified')`, `GET /domains/:id` and write back the
  provider's status, `dns_records`, and `last_checked_at`.
- A `verified` row that the provider now reports as `failed` is downgraded, `failure_reason` is
  recorded, and the owner is emailed — **from the platform address**, since their own is broken.
- Provider-side domains with no matching row are logged for manual review, not auto-deleted.

Two things to get right, both learned the hard way in this repo:

1. **A dark worker records nothing, and "zero failures" is not "it ran."** The job must write a
   `cron_runs` row with a count of domains checked on every execution, including when it checks zero.
2. **A logically-failed run must write its reason.** A reconciler that returns 200 after failing to
   reach the provider is indistinguishable from one that found everything healthy.

---

## 11. Tests

New file `test/email-sending-domains.test.ts`:

- `contractorFrom` returns the platform address when `fromAddress` is null — the existing assertion,
  narrowed rather than deleted.
- `contractorFrom` returns the tenant address when one is present.
- Header injection through `fromAddress`: `evil@x.com>\r\nBcc: victim@y.com` falls back to the
  platform address rather than emitting the header.
- Local-part validation accepts `quotes`, rejects empty, rejects `a@b`, rejects 64+ chars.
- Unknown provider status maps to `failed`, never `verified`.
- The DNS record renderer drops an apex `MX` from a hostile provider payload and warns.
- `magic-link.ts` and `crew-auth.ts` do not import or call `contractorFrom`.

Amend `test/deliverability-recovery-matrix.test.ts:57`: keep every existing assertion, restate the
title as "defaults to the platform domain when the account has no verified sending domain," and add
the aligned-tenant case beside it. **Do not delete this test** — it is the only thing standing
between a bug in the join and every contractor's mail silently losing alignment.

Migration verification `scripts/verify-email-sending-domains.mjs`, run against local PG17 like the
other `test:pg17:*` scripts:

- `anon` cannot select, insert, update, or delete. Assert all four; assert each one *bites* rather
  than asserting the policy exists.
- Account A's session cannot read account B's row.
- The unique index refuses a second row for the same domain, and a second `verified` row for the
  same account.
- Deleting the account removes the row and does not raise.

Gates before merge: `npm run typecheck`, `npm run test`, `npm run lint`, and `npm run build`. Run
them as separate commands — piping a gate through anything loses its exit code, and this repo has
already reported "build 0" across 33 commits while the build was failing.

---

## 12. Billing and entitlement

**Recommendation: do not add an entitlement allowance key for v1.**

The obvious move is a new `email_sending_domains` allowance beside `custom_domain_connections` in
[catalog.ts](src/lib/billing/catalog.ts#L59). Resist it. With checkout live, a catalog version bump
has two halves — widening the evidence readers *and* moving the currentness rows — and skipping the
second half has already stopped the only paying workspace from collecting money. That cost is not
worth paying to gate a feature that is currently free to us per tenant.

Instead: gate v1 on the feature flag plus a plan-tier check in TypeScript at the server action. If
the feature later needs to be sold as a paid add-on, the catalog bump can be done deliberately, once,
with the two-half procedure, rather than as a side effect of shipping a domain connector.

**Do not reuse `custom_domain_connections`.** Every plan grants exactly 1, and it counts website
domains. Sharing the key means connecting an email domain silently consumes the website allowance.

---

## 13. Rollout

Ordered so that no deploy ever reads something that does not exist yet.

| Stage | Action | Gate to pass before the next stage |
|---|---|---|
| 0 | Confirm the Resend per-plan domain cap and the cost of the next tier. Record it in §5. | A number is written down. |
| 1 | Apply the migration. Nothing reads the table. | `verify-email-sending-domains.mjs` green against PG17, then `audit:applied` shows it applied to production. |
| 2 | Ship the adapter, the brand field, the `contractorFrom` change, and all 15 call-site edits, with **no UI and no rows in the table**. Behaviour is byte-identical to today because every `fromAddress` is null. | Full suite plus `next build`. Spot-check one real send still reads `hello@letsgetquoted.com`. |
| 3 | Ship the UI behind `LGQ_EMAIL_SENDING_DOMAINS_ENABLED`, flag absent. | Deployed, flag off, dashboard unchanged. |
| 4 | Add the flag in Vercel Production. **Adding a variable, not editing one** — and Production env is baked at build, so it does nothing until a redeploy. | Redeploy, then confirm the panel appears. |
| 5 | Connect one internal domain end to end. Send a real quote to a real inbox. Read the raw headers and confirm `DKIM-Signature d=` matches the tenant domain and `Authentication-Results` shows `dkim=pass` and `spf=pass`. | Headers, pasted into the PR. Not a screenshot of the inbox. |
| 6 | Enable for one willing customer. Watch bounce and complaint rates for a week. | Reconciler has run 7 times with a row each. |
| 7 | Open to all plans. | — |

Stage 5 is the one that cannot be skipped. Every other stage can be verified from inside the
codebase; alignment can only be verified by reading the headers of an email that actually arrived.

---

## 14. Open decisions

1. **Apex or subdomain for the From address?** `quotes@theirdomain.com` is what contractors want and
   what looks legitimate to a homeowner. `quotes@mail.theirdomain.com` insulates their corporate
   domain reputation from our sending. Recommendation: apex, because Resend's `send.` MAIL FROM
   subdomain already separates the return path, and the product value is the recognizable address.
2. **What happens to in-flight scheduled sends when a domain is disabled?** They should fall back to
   the platform address rather than fail. Confirm this is acceptable — it means a customer can
   receive two emails from two different addresses in one thread.
3. **Is this a paid add-on or included?** Affects §12. Included is cheaper to ship and easier to
   sell against competitors who charge for it.
4. **Does anyone want B (inbound routing)?** If reply capture is the actual customer request, A alone
   will disappoint and the scope should be reconsidered before Stage 1 rather than after Stage 7.

---

## 15. Estimate

| | |
|---|---|
| Migration + PG17 verification script | 1 day |
| `resend-domains.ts` adapter | 1 day |
| Brand field, `contractorFrom`, 15 call sites, tests | 1 day |
| Server actions (create / verify / delete) with authorization | 1 day |
| UI panel, record display, registrar-instruction reuse | 2 days |
| Reconciler cron + cron_runs wiring | 1 day |
| Test suite + amending the alignment test | 1 day |
| Staged rollout, header verification, one-customer watch | 1 week elapsed, low effort |

**~8 working days of build, plus a week of supervised rollout.** The build is small because the send
path already funnels through one function and the brand loader already does the account lookup. Most
of the risk is in DNS instructions and provider-status handling, not in code volume.
