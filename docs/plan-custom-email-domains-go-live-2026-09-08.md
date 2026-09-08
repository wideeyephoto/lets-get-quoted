# Custom Email Sending Domains — Go-Live Plan

**Date:** 2026-09-08
**Scope:** Scope A only — outbound `From: quotes@theirdomain.com` with aligned DKIM/SPF; replies still land in the contractor's existing mailbox via `Reply-To`. Inbound ingestion (Scope B) is explicitly out.
**Supersedes the rollout half of:** [custom-email-domains-post-launch-tasks.md](./custom-email-domains-post-launch-tasks.md) (written 2026-09-07, before the connect action was audited; its cron section describes a route and schedule that were built differently).
**Parent spec:** [plan-custom-email-domains-2026-09-07.md](./plan-custom-email-domains-2026-09-07.md)

---

## 0. Verified state as of 2026-09-08

Everything in this section was checked today, not inherited from the previous plan.

| Fact | Evidence |
| --- | --- |
| Table `public.email_sending_domains` is applied in production | `migrations/20260907180000_email_sending_domains.sql`, present in `schema.sql` |
| Production holds **zero** sending-domain rows | REST read with the service role returned `[]` |
| Both fatal connect-action defects are fixed and pushed | `b41604ece` on `origin/main` (status-vocabulary 23514; `ON CONFLICT (domain)` 42P10) |
| Tenancy / constraint coverage passes | `npm run test:pg17:email-sending-domains` → 15/15 |
| Reconciler exists and is registered | `src/app/api/cron/email-domain-reconcile/route.ts`, `vercel.json`, `src/lib/cron-jobs.ts:360`, schedule `23 6 * * *` |
| The reconciler has **never fired** | `npm run inspect:cron-health` → `SILENT email-domain-reconcile — never recorded a run`. Expected: it deployed 12:55 UTC today, first possible fire 2026-09-09 06:23 UTC |
| Feature is dark in production | `LGQ_EMAIL_SENDING_DOMAINS_ENABLED` absent; `isEmailSendingDomainsFeatureEnabled()` fails closed when `NODE_ENV=production`, defaults **on** everywhere else |
| Send path falls back correctly | `src/lib/email-brand.ts:56` selects only `status = 'verified'`; anything else leaves `fromAddress` null and the platform address is used |
| No plan or tier gating exists | `createEmailSendingDomainAction` checks the flag and `requireOfficeContext('settings.write')` — nothing else. GA as built = every workspace on every plan |
| Live header verification has never been done | No message has ever originated from a tenant domain |

### 0.1 New blocking finding: the Resend key cannot manage domains

`GET https://api.resend.com/domains` with the `RESEND_API_KEY` in `.env.local` returns:

```
401 {"statusCode":401,"message":"This API key is restricted to only send emails","name":"restricted_api_key"}
```

Domain management (`POST /domains`, `GET /domains/:id`, `POST /domains/:id/verify`, `DELETE /domains/:id`) needs a **full-access** Resend key. With the current key:

- `createSendingDomain()` → `findExistingDomain()` swallows the 401 (`catch → null`), then the `POST` throws, and the contractor is shown the raw string `Resend API error (401): {"statusCode":401,...}`.
- The reconciler's orphan sweep catches the 401 and sets `summary.errors = 1`, which `src/lib/cron-runs.ts:122` classifies as a logical failure — so the run records `ok = false` and returns HTTP 500.
- `isSendingDomainProvisioningConfigured()` only checks that the variable is *present*. It vouches for a key that cannot do the job — the same shape as the guard that once called an undocumented secret documented.

No test could see this: all 13,844 unit tests and the PG17 suite mock the provider. **It is not yet known whether Production carries the same restricted key** — that is a separate Vercel variable and may be Sensitive/unreadable. Stage 0 settles it.

---

## 1. Decisions required before Stage 5 (owner: you)

These change what gets built, so they are asked once, up front.

1. **Who may connect a domain at GA?** As built: anyone with `settings.write`, on any plan. Options — (a) leave open, (b) restrict to upper tiers with a server-side plan check in the action, (c) sell it as a paid add-on. Option (c) forces the two-half catalog bump (widen the evidence readers, then MOVE the currentness rows), and catalog changes have no safe ordering while checkout is live.
2. **What is the Resend domain ceiling?** One tenant = one Resend domain, so the account's domain cap is a hard ceiling on how many customers can ever use this. It must be a real number, read from the API, before GA.
3. **Auto-pause on complaints?** The Resend webhook already ingests `email.bounced` / `email.complained` for suppression but never touches `email_sending_domains`. Decide whether crossing a complaint threshold disables a tenant's sending domain automatically, or stays manual for the first N customers.
4. **Alias guidance copy — ship or skip.** If a homeowner types `quotes@theirdomain.com` by hand instead of hitting Reply, delivery depends on an alias existing at their mail host. Not shipped today.

---

## Stage 0 — Prove the production key can manage domains *(blocking, ~1 hour of work)*

**Exit criteria:** a `GET /domains` from production credentials returns 200, and no contractor can ever be shown a raw provider error.

- [ ] **Establish the truth for Production — both ways:**
  - Read tomorrow's 06:23 UTC reconciler run with `npm run inspect:cron-health`. `FAILING` with a 401 in the run error means Production's key is restricted too; `OK` with `errors: 0` means it can list domains.
  - Ask Codex for the Resend → API Keys page: which keys exist and their permission column. Corroboration only, never the sole proof — a dashboard read is not truth.
- [ ] **Provision a domain-capable key** in Resend, named for the purpose (e.g. `lgq-domain-management`). Do **not** widen the sending key: sending-only is the smaller blast radius for the 15 call sites that only send.
- [ ] **Code: separate the two keys.** `src/lib/resend-domains.ts` reads `RESEND_DOMAINS_API_KEY`, falling back to `RESEND_API_KEY`. Sending paths (`src/lib/email.ts` and friends) stay on `RESEND_API_KEY`, untouched.
- [ ] **Code: make the configured-check prove permission, not presence.** `isSendingDomainProvisioningConfigured()` must not answer `true` for a key that 401s on domain routes. Probe once, cache the result; on `restricted_api_key` the settings section renders its not-configured state instead of offering a button that throws.
- [ ] **Code: never surface a raw provider error.** Map 401/403 to "Domain connection is temporarily unavailable — we have been notified", and log the provider body server-side.
- [ ] **Test that bites.** Assert a 401 `restricted_api_key` body produces the not-configured state and writes no row — and prove the test fails against the pre-fix file, or it is decoration.
- [ ] **Vercel env (Codex).** Add `RESEND_DOMAINS_API_KEY` to Production and Preview. Adding a variable is an ADD, not an edit, and **it does nothing until a redeploy** — env is baked at build time.
- [ ] **Gates, each on its own line** (piping a gate loses its exit code): `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`, `npm run test:pg17:email-sending-domains`.

---

## Stage 1 — Confirm the reconciler actually runs *(blocking, 1 day of elapsed time)*

**Exit criteria:** at least one `cron_runs` row for `email-domain-reconcile` with `ok = true`.

- [ ] After 06:23 UTC on 2026-09-09, run `npm run inspect:cron-health` and confirm the job has left `SILENT`. Registered is not running — seven crons once sat scheduled for weeks and never fired.
- [ ] On a zero-row database the summary must read `checked: 0`, `errors: 0`, `orphanedAtProvider: 0`. A non-zero orphan count on an empty table means `isPlatformOwnedDomain()` does not match the real Resend inventory, and every run will report a permanent orphan.
- [ ] If it is still `SILENT`, that is a deploy/registration problem, not a code problem — confirm Production has redeployed since `8b41b282a`.

---

## Stage 2 — Preview rehearsal, end to end *(blocking, ~half a day)*

**Exit criteria:** a domain reaches `verified`, driven entirely through the UI, and every failure path has been walked at least once against the real provider.

- [ ] Set `LGQ_EMAIL_SENDING_DOMAINS_ENABLED=true` in **Preview** (Codex) and redeploy it. Confirm first which Supabase project the preview points at — Preview writes Production data on some rails.
- [ ] Connect a company-owned test domain (or a subdomain we control) through `/dashboard/settings`. Capture the exact DNS record set the UI renders.
- [ ] **Assert no apex MX record appears.** The table must contain the two DKIM `TXT`, the `send.` SPF `TXT`, and the `send.` MX — nothing at `@`. An apex MX instruction would break the contractor's inbound mail, which is the most damaging thing this feature could print on a screen.
- [ ] Publish the records at the registrar, click Verify, confirm the row flips to `verified` with `verified_at` and `last_checked_at` populated.
- [ ] Walk the failure paths — none has ever run against the real provider:
  - Delete a published DKIM record → the next reconciler pass downgrades to `failed`, writes `failure_reason`, and emails the owner **from the platform address**.
  - Delete the domain at Resend → the provider 404 is treated as a downgrade, not an exception.
  - Attempt the same domain from a second workspace → refused by the `lower(domain)` index, with no ownership move.
- [ ] Confirm the fallback: a quote sent from the downgraded account goes out as `Company <hello@letsgetquoted.com>` with no error and no queued-send failure.

---

## Stage 3 — Live RFC 822 header verification *(the non-negotiable gate, ~2 hours)*

**Exit criteria:** raw headers from two independent receiving providers, pasted into §8 of this file.

The product claim is "your quotes come from your domain and land in the inbox". Only a receiving MTA can prove that; unit tests prove only that we handed Resend the right string.

- [ ] Send a real quote from the verified test domain to a **Gmail** inbox and to a **Microsoft 365 / Outlook** inbox.
- [ ] Open raw source ("Show original" / "View message source") and assert each line:
  1. `From:` is `Test Company <quotes@testdomain.com>`
  2. `Reply-To:` is the contractor's operational mailbox
  3. `DKIM-Signature:` carries `d=testdomain.com` — aligned to the From domain, not `letsgetquoted.com`
  4. `Authentication-Results:` shows `dkim=pass header.i=@testdomain.com`
  5. `Authentication-Results:` shows `spf=pass` for `send.testdomain.com`
  6. `dmarc=pass` wherever the apex publishes a DMARC policy
- [ ] Paste the three header blocks verbatim into §8. A summary of the headers is not the evidence; the headers are.
- [ ] If a strict corporate filter is available, send one message through it too.

**If DKIM aligns to `letsgetquoted.com` rather than the tenant domain, stop here.** That is the feature not working, however green everything else is.

---

## Stage 4 — Capacity and cost *(blocking for GA, ~1 hour)*

- [ ] With the domain-capable key, `GET /domains` and count what the account already holds.
- [ ] Record the plan's documented domain cap and compute headroom: `cap − platform domains − test domains` = how many customers this can serve before it fails at signup.
- [ ] Decide what happens at exhaustion: the connect action must refuse with a clear message, not a raw provider error. If headroom is small, either gate GA (Decision 1) or upgrade the Resend plan first.

---

## Stage 5 — Canary: one real contractor, 7-day soak

**Entry:** Stages 0–4 complete. **Exit:** 7 consecutive healthy reconciler runs and zero deliverability complaints, with real send volume behind them.

- [ ] Turn the flag on in Production (Codex: ADD `LGQ_EMAIL_SENDING_DOMAINS_ENABLED=true`, then **redeploy** — inert until then).
- [ ] Note that with no per-account gate, flipping the flag exposes the section to **every** workspace at once. If the canary is meant to be one account, land the plan/tier check from Decision 1 *before* this step, or accept that anyone may connect.
- [ ] Pick one active contractor with genuine outbound quote volume and a domain at a mainstream registrar. Walk them through the records; do not let them self-serve unattended during the canary.
- [ ] Day 1: confirm the homeowner receives the quote, and that hitting Reply reaches the contractor's inbox rather than ours.
- [ ] Days 2–7: `npm run inspect:cron-health` daily; expect seven `ok` runs. Review Resend logs for bounces and complaints on that domain.
- [ ] Day 7: contractor check-in. A quiet week with no sends is not a pass — confirm they actually sent.

---

## Stage 6 — GA

- [ ] Ship the deferred UX: the `quotes` alias callout for Google Workspace / M365 (Decision 4), plus registrar-specific record guides for GoDaddy, Cloudflare, Namecheap, and Squarespace.
- [ ] Ship complaint auto-pause if Decision 3 says so, including the owner email that explains the pause and the fallback.
- [ ] Publish the help article and brief support on the three states they will see: `pending` (DNS not visible yet), `failed` (records missing), `disabled` (we paused it).
- [ ] Keep the settings copy explicit that this is **email only**. The custom *website* domain rail is separately broken — it reports "Verified and connected" while the TLS handshake fails — and a contractor reading both sections as one feature will conclude we are lying about one of them.

---

## Rollback

| Situation | Action | Blast radius |
| --- | --- | --- |
| Anything wrong pre-canary | Remove `LGQ_EMAIL_SENDING_DOMAINS_ENABLED` in Production, redeploy | The section disappears; existing verified rows **keep sending** — the flag gates the UI, not the send path, by design |
| One tenant's domain is harming deliverability | `UPDATE email_sending_domains SET status='disabled', failure_reason=… WHERE account_id=…` | That tenant reverts to the platform address on the next send; no deploy needed |
| Every tenant off custom domains, now | The same `UPDATE` without the `WHERE` | All sends revert to `hello@letsgetquoted.com`; the reconciler will not re-promote a `disabled` row |
| Reconciler misbehaving | Remove the entry from `vercel.json`, redeploy | Domains stop being re-checked, so a broken domain keeps sending unaligned until noticed — accept only briefly |

Deleting a domain at Resend is **not** a rollback step: it turns every row pointing at it into a provider 404 and downgrades them via the reconciler, which is slower and noisier than the `disabled` write.

---

## Risk register

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Production key is sending-only | High — the local one is | Nobody can connect anything, and the contractor sees a raw 401 | Stage 0 |
| DKIM aligns to the platform, not the tenant | Low | The feature does not do the one thing it sells | Stage 3, and stop if it fails |
| UI prints an apex MX instruction | Low | Contractor's inbound mail breaks — worst possible outcome | Stage 2 explicit check plus `filterSafeSendingDnsRecords` |
| Resend domain cap lower than expected | Unknown | Silent failure for the Nth customer | Stage 4 |
| Flag-on exposes the feature to all tenants at once | Certain, as built | Uncontrolled canary | Decision 1 before Stage 5 |
| Reconciler never fires | Medium | A domain that breaks stays `verified` and mail silently degrades | Stage 1, then daily checks through the soak |
| Contractor deletes DNS after verifying | Medium | Sends fail DKIM until the next 06:23 pass | Accepted: ≤24h detection, then automatic fallback plus owner email |

---

## Ownership

- **No approval needed (me):** code changes, migrations, commits, pushes, production reads, all local gates and PG17 checks.
- **Needs Codex (authed browser):** every Vercel env change and redeploy; Resend API-key creation and dashboard reads.
- **Needs you:** the four decisions in §1, the registrar DNS edits for the test domain, and the choice of canary contractor.

---

## 8. Evidence archive

*(Filled in as gates pass. An empty line means that gate has not been met — not that it was skipped as unimportant.)*

- Stage 0 — production key permission proof:
- Stage 1 — first `cron_runs` row:
- Stage 2 — rendered DNS record set (must show no apex MX):
- Stage 3 — Gmail raw headers:
- Stage 3 — Outlook / M365 raw headers:
- Stage 4 — domain count and cap:
- Stage 5 — seven reconciler runs and canary sign-off:
