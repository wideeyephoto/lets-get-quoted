# Custom Email Sending Domains — Production Runbook

**Date:** 2026-09-08
**Companion to:** [plan-custom-email-domains-go-live-2026-09-08.md](./plan-custom-email-domains-go-live-2026-09-08.md) — that document says *what* must be true and why; this one is the executable sequence, with the commands to run, the Codex prompts to relay verbatim, and the runbook for after it is live.
**Production target:** Vercel project `lets-get-quoted` (`prj_bwbvxqj10cuQKKIflEdNMGhQOWEY`), origin `https://letsgetquoted.com`, Supabase `mfuvvtrkipkigwqqtcal`.

---

## How to read this

Every step is one of three kinds, and mixing them up is how these rollouts stall:

| Marker | Who | Notes |
| --- | --- | --- |
| **[me]** | I run it | Code, migrations, commits, pushes, production reads, all gates |
| **[codex]** | You relay the prompt to Codex | Every Vercel env change, every redeploy, all Resend dashboard work. Prompts are written out in §8, ready to paste |
| **[you]** | You do it by hand | Registrar DNS edits, reading raw email headers, choosing the canary |

**Shell warning.** Commands below are written for **Git Bash**, not PowerShell. In PowerShell `curl` is an alias for `Invoke-WebRequest`, which does not take `-H` and will fail in a way that looks like an auth problem. Run every `curl` in a Git Bash window.

**Evidence rule.** A step is done when its evidence line in §9 is filled with output, not when it feels done. Exit codes are not evidence on their own — a green apply has hidden twelve runtime defects on this codebase before.

---

## Day 0 — Stage 0: make the provider calls possible

Nothing downstream can be attempted until this is true, because every domain-management call currently returns `401 restricted_api_key`.

### 0.1 **[codex]** Create the domain-capable Resend key

Relay **Prompt A** (§8.1). You are asking for one new full-access key named `lgq-domain-management`, and for the *permission* column of every existing key to be reported back.

Do **not** widen the existing sending key. Fifteen call sites only need to send; a full-access key behind all of them is a larger blast radius for no gain.

> Codex refusing is a finding, not a failure — if it cannot create the key, record why and create it yourself in the Resend dashboard.

### 0.2 **[me]** Split the two keys in code

In [resend-domains.ts](src/lib/resend-domains.ts):

```ts
// Domain management needs full access; sending does not. Keep them apart so a
// restricted sending key cannot silently disable domain provisioning, and so a
// full-access key is never handed to the 15 paths that only send.
function getApiKey(): string | undefined {
  return process.env.RESEND_DOMAINS_API_KEY || process.env.RESEND_API_KEY;
}
```

`src/lib/email.ts` and every sending path keep reading `RESEND_API_KEY` untouched.

### 0.3 **[me]** Make the configured-check prove permission, not presence

`isSendingDomainProvisioningConfigured()` currently returns `Boolean(getApiKey())`. That is what let a key which cannot manage domains report itself as configured. Replace presence with a probe:

- `GET /domains`; cache the result for the process lifetime.
- `200` → configured. `401` with `name: "restricted_api_key"` (or any 401/403) → **not** configured.
- Anything else (timeout, 5xx) → not configured *for this request only*, never cached, so a provider blip does not pin the feature off until the next deploy.

Both callers already handle the false case: `getEmailSendingDomainAction()` returns `isConfigured: false` and the section renders its unavailable state; the reconciler returns `{ skipped: true }` and records a clean run instead of a failure.

### 0.4 **[me]** Stop showing contractors raw provider errors

`resendRequest` throws `Resend API error (401): {"statusCode":401,...}`, and that string reaches the settings page. Map 401/403 to a single contractor-safe sentence, log the provider body server-side with the account id.

### 0.5 **[me]** Tests that bite

Three, and each must be shown to fail against the pre-fix file from git — a guard nobody has watched fail is decoration:

1. A `401 restricted_api_key` response makes `isSendingDomainProvisioningConfigured()` false and writes **no row**.
2. `RESEND_DOMAINS_API_KEY` is preferred when both are set; `RESEND_API_KEY` is used when it is not.
3. No provider error body reaches the action's thrown message.

### 0.6 **[me]** Gates — each on its own line

Piping a gate loses its exit code, and that once let me report "build 0" across 33 commits while the build was failing.

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:pg17:email-sending-domains
npm test test/cron-jobs.test.ts
```

Then commit and push.

### 0.7 **[codex]** Add the env var and redeploy

Relay **Prompt B** (§8.2): add `RESEND_DOMAINS_API_KEY` to **Production and Preview**, then redeploy Production.

Two things that have cost days before:

- Adding a variable is an **ADD**, not an edit. Editing an existing row is the operation that fails.
- **Vercel bakes env at build time.** The variable does nothing at all until the redeploy in the same prompt completes. Two billing workers once looked broken for exactly this reason.

If the variable is marked Sensitive it becomes unreadable to everyone afterwards, including Codex — so its value must be recorded wherever you keep the others *before* it is saved.

---

## Day 1, 07:00 UTC — Stage 1: prove the reconciler runs, and prove the key works in production

The daily reconciler fires at `23 6 * * *`. Its first run is the cheapest possible proof of Production's key permission, because it is the only production code that calls a domain-management route.

### 1.1 **[me]** Read the run

```bash
npm run inspect:cron-health
```

| What you see | What it means | Next |
| --- | --- | --- |
| `OK email-domain-reconcile … 1 run(s), 0 failure(s)` | Key works, orphan sweep clean | Proceed to Day 1 afternoon |
| `FAILING …` with a 401 in the error | Production's key is still restricted — 0.7 did not take effect, or the redeploy has not happened | Re-run 0.7; confirm the deploy timestamp is after the env change |
| `SILENT … never recorded a run` | The cron is registered but not firing — a deploy/registration problem, not code | Confirm Production has deployed a commit at or after `8b41b282a` |
| `OK` but `orphanedAtProvider > 0` on an empty table | `isPlatformOwnedDomain()` does not match the real Resend inventory | Fix the exclusion before any customer row exists, or every future run reports a permanent orphan |

### 1.2 **[me]** Optional: trigger it by hand instead of waiting

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  https://letsgetquoted.com/api/cron/email-domain-reconcile
```

A `401 Unauthorized` here means the local `CRON_SECRET` is not Production's — it does **not** mean the endpoint is broken. On success the JSON body is the summary: `checked`, `errors`, `orphanedAtProvider`, `ownersNotified`.

Note that a manual trigger writes a real `cron_runs` row. That is fine and intended — it is the same code path the scheduler uses.

---

## Day 1, afternoon — Stage 2: Preview rehearsal

**Never rehearse this in Production.** A test domain connected in Production creates a real row that the reconciler will manage forever, and Resend counts it against the account's domain cap.

### 2.1 **[codex]** Turn the flag on in Preview only

Relay **Prompt C** (§8.3): add `LGQ_EMAIL_SENDING_DOMAINS_ENABLED=true` to the **Preview** environment and redeploy the preview branch.

### 2.2 **[me]** Confirm which database the preview writes

Preview has written Production data on other rails on this project. Before creating a row, confirm the preview's `NEXT_PUBLIC_SUPABASE_URL`. If Preview points at Production, the rehearsal rows are production rows — connect a domain we own, and clean it up in 2.6.

### 2.3 **[you]** Connect a company-owned domain through the UI

`/dashboard/settings` → Custom Email Sending Domain. Use a domain or subdomain we control, not a customer's.

**Before touching DNS, check the rendered record table for an apex MX.** It must contain exactly: two DKIM `TXT`, one SPF `TXT` on `send.`, one `MX` on `send.`. If anything is scoped to `@` or a blank name, **stop** — publishing an apex MX would break inbound mail for whoever followed the instructions, which is the most damaging thing this feature could put on a screen.

### 2.4 **[you]** Publish the records, then Verify

Add all four at the registrar, wait for propagation, click Verify. Expected: status `verified`, `verified_at` and `last_checked_at` populated.

### 2.5 **[me/you]** Walk the failure paths — none has ever run against the real provider

| Path | How | Expected |
| --- | --- | --- |
| DNS removed after verification | Delete one DKIM `TXT`, then trigger the reconciler | Row → `failed` with `failure_reason`; owner emailed **from the platform address**; next quote sends as `hello@letsgetquoted.com` |
| Domain deleted at the provider | Delete it in Resend, trigger the reconciler | Provider 404 treated as a downgrade, not an exception; no crash, `errors: 0` |
| Same domain, second workspace | Attempt the connect from another account | Refused by the `lower(domain)` index; the first account's row is untouched and still owns it |
| Transient provider failure | (Inspect code path) | A single timeout must not downgrade a `verified` domain |
| Self-recovery | Re-publish the deleted DKIM record, trigger the reconciler | `failed` → `verified`, `failure_reason` cleared |

The ownership-move case is the one that matters most: a raced upsert could have moved another tenant's verified domain onto the caller's account. The index refuses it — confirm the refusal, do not assume it.

### 2.6 **[me]** Clean up

Disconnect the rehearsal domain through the UI, confirm the row is gone and the domain is removed at Resend. Leaving it behind consumes a slot against the cap you are about to measure.

---

## Day 2 — Stage 3: live header verification (the gate that cannot be skipped)

Re-connect and verify the test domain (or keep it from Day 1 if the cleanup in 2.6 is deferred to after this stage).

### 3.1 **[you]** Send real quotes to two independent receivers

One to a **Gmail** address, one to a **Microsoft 365 / Outlook** address. Real quote emails from the product, not a test harness.

### 3.2 **[you]** Read the raw source and assert all six lines

Gmail: "Show original". Outlook: "View message source".

1. `From: Test Company <quotes@testdomain.com>`
2. `Reply-To:` the contractor's operational mailbox
3. `DKIM-Signature:` contains `d=testdomain.com` — **the tenant domain, not `letsgetquoted.com`**
4. `Authentication-Results:` contains `dkim=pass header.i=@testdomain.com`
5. `Authentication-Results:` contains `spf=pass` for `send.testdomain.com`
6. `dmarc=pass` where the apex publishes a DMARC policy

### 3.3 **[me]** Archive the headers verbatim into §9

Paste the header blocks, not a summary of them. A sentence saying "DKIM passed" is exactly the kind of certification that has been false on this project before.

**If `d=` is `letsgetquoted.com`, stop the rollout.** Everything else can be green and the feature still does not do the one thing it is sold for.

---

## Day 2 — Stage 4: measure the ceiling

### 4.1 **[me]** Count what the account holds

```bash
curl -s -H "Authorization: Bearer $RESEND_DOMAINS_API_KEY" https://api.resend.com/domains
```

### 4.2 **[codex]** Get the plan's documented domain cap

Relay **Prompt D** (§8.4). The dashboard is the only place the cap is stated; treat it as a claim to be checked against the API's behaviour at the boundary, not as truth.

### 4.3 **[me]** Record headroom and decide the refusal

`headroom = cap − platform domains − test domains`. This is a hard ceiling on **how many customers can ever use this feature**, because one tenant = one Resend domain.

If headroom is small, one of two things must happen before GA: gate the feature (Decision 1 in the plan) or upgrade the Resend plan. Either way the connect action must refuse at the boundary with a clear sentence — not a raw provider error.

---

## Days 3–10 — Stage 5: canary

### 5.1 **[me]** Decide the gate *before* the flag flips

There is **no plan or tier gating** on `createEmailSendingDomainAction` — it checks the feature flag and `settings.write`, nothing else. Flipping the production flag opens the section to every workspace at once, which is not a canary. Either land a plan check first, or accept that this is a general release with one supervised customer in it.

### 5.2 **[codex]** Turn it on in Production

Relay **Prompt E** (§8.5): ADD `LGQ_EMAIL_SENDING_DOMAINS_ENABLED=true` to Production, then redeploy. Inert until the redeploy finishes.

### 5.3 **[me]** Verify the flag actually bit

Log into a production workspace and confirm the section renders. There is no unauthenticated endpoint that reports this flag, so the UI is the check. A Production variable that exists but has not been redeployed past looks identical to one that was never added.

### 5.4 **[you]** Onboard one contractor, supervised

Pick an active contractor with real outbound quote volume and a domain at a mainstream registrar. Walk them through the four records on a call or a screen-share; do not let the canary self-serve unattended.

### 5.5 **[me]** Daily during the soak

```bash
npm run inspect:cron-health          # expect one new ok run per day, seven by day 7
```

```bash
# The canary's row: status, failure_reason, last_checked_at
curl -s -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  "https://mfuvvtrkipkigwqqtcal.supabase.co/rest/v1/email_sending_domains?select=domain,status,failure_reason,last_checked_at,verified_at"
```

**[you]** each day: Resend logs for that domain — bounces, complaints, and that mail is actually flowing.

### 5.6 Exit criteria

Seven consecutive `ok` runs, zero complaints, and **real send volume behind them**. A quiet week with no sends is not a pass; confirm the contractor actually sent quotes.

---

## Day 11 — Stage 6: GA

- **[me]** Ship the alias-guidance callout (Google Workspace / M365) and registrar-specific guides for GoDaddy, Cloudflare, Namecheap, Squarespace.
- **[me]** Ship complaint auto-pause if that decision was yes: threshold crossed → `status = 'disabled'` plus an owner email explaining the pause and the fallback.
- **[you]** Publish the help article; brief support on the three states they will see — `pending` (DNS not visible yet), `failed` (records missing), `disabled` (we paused it).
- **[me]** Confirm the settings copy keeps this distinct from the custom *website* domain rail, which is separately broken: it reports "Verified and connected" while the TLS handshake fails. A contractor reading both as one feature concludes we are lying about one of them.

---

## 6. Steady-state monitoring

| Signal | Where | Cadence | Means |
| --- | --- | --- | --- |
| `email-domain-reconcile` status | `npm run inspect:cron-health` | Daily during soak, then weekly | `FAILING` = provider or key problem; `SILENT` = the scheduler stopped calling it |
| `errors` in the run summary | `cron_runs.summary` | Same | Non-zero is the orphan sweep or a provider call failing; it already marks the run not-ok |
| Rows stuck in `pending` > 72h | REST query in 5.5 | Weekly | The contractor never finished their DNS — a support prompt, not a defect |
| Rows flipping `verified` → `failed` | Owner-notification emails | On occurrence | Their DNS changed. Fallback is automatic; the email is the only thing that tells them |
| `orphanedAtProvider` | Run summary | Weekly | Domains at Resend with no row — usually a failed cleanup, and each one holds a slot against the cap |
| Domains used vs cap | `GET /domains` | Monthly | Approaching the ceiling means the next customer is refused |

Detection latency for a broken domain is **up to 24 hours** by design, and mail keeps flowing from the platform address the whole time. That is the accepted trade; it is not an incident.

---

## 7. Rollback

| Situation | Action | Blast radius |
| --- | --- | --- |
| Anything wrong pre-canary | **[codex]** Remove `LGQ_EMAIL_SENDING_DOMAINS_ENABLED` from Production, redeploy | Section disappears. **Existing verified rows keep sending** — the flag gates the UI, not the send path, deliberately, so switching off does not strand a contractor on a domain nothing re-checks |
| One tenant harming deliverability | **[me]** `disabled` write, below | That tenant reverts to `hello@letsgetquoted.com` on the next send; no deploy |
| All tenants off, now | **[me]** Same write without the account filter | Every send reverts to the platform address; the reconciler will not re-promote a `disabled` row |
| Reconciler itself misbehaving | **[me]** Remove from `vercel.json`, **[codex]** redeploy | Domains stop being re-checked, so a broken one keeps sending unaligned until noticed. Accept only briefly |

The disable write, with the check that it changed anything:

```bash
curl -s -X PATCH \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  "https://mfuvvtrkipkigwqqtcal.supabase.co/rest/v1/email_sending_domains?account_id=eq.<ACCOUNT_ID>" \
  -d '{"status":"disabled","failure_reason":"Paused by support pending deliverability review"}'
```

**Read the response array.** An accepted statement is not a changed row — a filter that matches nothing returns `200 []`, and that has been mistaken for success on this codebase more than once, including on a live double-billing path.

**Deleting the domain at Resend is not a rollback step.** It turns every row pointing at it into a provider 404, which the reconciler then downgrades on its own schedule — slower, noisier, and it emails the contractor.

---

## 8. Codex prompts (relay verbatim)

### 8.1 Prompt A — Resend key

> In the Resend dashboard for the Let's Get Quoted account, go to API Keys. First, report back the full list of existing keys with their name, permission ("Full access" or "Sending access"), and creation date — I need the permission column for every key, exactly as shown. Then create one new API key named `lgq-domain-management` with **Full access** permission, domain restriction set to all domains. Return the new key value once, in full. Do not modify, rotate, or delete any existing key.

### 8.2 Prompt B — env var and redeploy

> In Vercel, project `lets-get-quoted`: **ADD** a new environment variable named `RESEND_DOMAINS_API_KEY` to the **Production** and **Preview** environments with the value I am providing. This must be a new variable — do not edit or replace any existing variable, and do not touch `RESEND_API_KEY`. After it is saved, confirm the variable appears in both environments, then trigger a **redeploy of Production** from the latest `main` commit and report the deployment id and its completion status. The variable has no effect until that redeploy finishes.

### 8.3 Prompt C — Preview flag

> In Vercel, project `lets-get-quoted`: **ADD** environment variable `LGQ_EMAIL_SENDING_DOMAINS_ENABLED` with value `true` to the **Preview** environment only. Do not add it to Production. Then redeploy the current preview deployment and report the preview URL and deployment id.

### 8.4 Prompt D — Resend plan cap

> In the Resend dashboard, open Settings → Billing (or Plan). Report back: the current plan name, the maximum number of sending domains that plan allows, the current number of domains on the account, and the monthly email send limit. Quote the numbers exactly as shown, and tell me where on the page each number appeared.

### 8.5 Prompt E — Production flag

> In Vercel, project `lets-get-quoted`: **ADD** environment variable `LGQ_EMAIL_SENDING_DOMAINS_ENABLED` with value `true` to the **Production** environment. This must be an ADD of a new variable, not an edit. Then trigger a redeploy of Production from the latest `main` commit and report the deployment id and completion status. Confirm afterwards that the variable is listed in Production.

### 8.6 Prompt F — emergency off

> In Vercel, project `lets-get-quoted`: **DELETE** the environment variable `LGQ_EMAIL_SENDING_DOMAINS_ENABLED` from the **Production** environment, then immediately redeploy Production from the latest `main` commit. Report the deployment id and when it completed. This is time-sensitive.

---

## 9. Evidence log

*(An empty line means the gate has not been met — not that it was judged unimportant.)*

| Gate | Evidence required | Filled |
| --- | --- | --- |
| 0.1 | Existing key permissions; new key created | |
| 0.6 | Six gate commands, each exit 0 | |
| 0.7 | Deployment id, completed after the env add | |
| 1.1 | `inspect:cron-health` line for `email-domain-reconcile` | |
| 2.3 | The rendered DNS record set — must show no apex MX | |
| 2.4 | Row at `verified` with `verified_at` | |
| 2.5 | One line per failure path with the observed result | |
| 3.2 | Gmail raw headers, verbatim | |
| 3.2 | Outlook / M365 raw headers, verbatim | |
| 4.1–4.3 | Domain count, plan cap, computed headroom | |
| 5.3 | Section renders in a production workspace | |
| 5.5 | Seven consecutive `ok` reconciler runs | |
| 5.6 | Canary sign-off with actual send volume | |
