# Custom Email Sending Domains: Early Post-Launch Roadmap & Task List

**Date:** 2026-09-07  
**Status:** Post-Stage 3 Operational & Rollout Task Tracker  
**Parent Specification:** [plan-custom-email-domains-2026-09-07.md](file:///c:/dev/CLAUDE%20CODE%20FOLDER/docs/plan-custom-email-domains-2026-09-07.md)  
**Codebase State:** Stages 1–3 Complete (Database migration applied, PG17 RLS verified, Resend domain adapter implemented, 15 email call sites wired, Settings UI implemented behind `LGQ_EMAIL_SENDING_DOMAINS_ENABLED`, test suite passing at 23/23).

---

## Executive Summary

Custom email sending domains (Scope A: outbound sending from `quotes@contractordomain.com` with aligned DKIM/SPF) is code-complete and tested in isolation. However, email deliverability directly affects contractor revenue: if a contractor's quotes silently end up in homeowner spam folders due to unaligned DKIM or a dropped DNS record, the platform loses trust immediately.

Therefore, moving from code-complete to General Availability (GA / Stage 7) requires an orderly execution sequence of operational gates, live header verification, automated reconciliation crons, and canary monitoring.

```
Stage 4: Dark Deployment & Env Flag
  │
  ▼
Stage 5: Internal Live RFC 822 Header Verification (Non-Negotiable Gate)
  │
  ▼
Task 3: Automated Daily Reconciler Cron Job (§10)
  │
  ▼
Stage 6: Supervised Single-Customer Canary Pilot (7-Day Soak)
  │
  ▼
Task 5: Reputation & Delivery Webhook Guards (§8)
  │
  ▼
Task 6: Google Workspace / M365 Inbound Alias Guidance Copy
  │
  ▼
Stage 7: General Availability (GA) & Broad Rollout
  │
  ▼
Future Follow-ons: Paid Add-On Catalog Integration (§12) & Scope B Discovery
```

---

## 1. Stage 4: Production Deployment & Dark Flag Verification

**Goal:** Ship the completed Stages 1–3 code to production without exposing the feature to end users prematurely.

- [ ] **Deploy Build to Production:** Merge and deploy the current changes to Vercel production.
  - Verify that `LGQ_EMAIL_SENDING_DOMAINS_ENABLED` is **not set** (or set to `false`) in Production.
  - Verify zero console errors or hydration errors on dashboard navigation.
- [ ] **Verify Dark State Behavior:**
  - Navigate to `/dashboard/settings` as an existing contractor: confirm the "Custom Email Sending Domain" panel is **not rendered**.
  - Send a standard test quote or transactional email: confirm it cleanly sends from `Company Name <hello@letsgetquoted.com>` with no deviation in headers.
  - Confirm table `public.email_sending_domains` remains clean in production.
- [ ] **Enable Flag in Staging/Preview First:**
  - Add `LGQ_EMAIL_SENDING_DOMAINS_ENABLED=true` to Vercel Preview/Staging environment.
  - Confirm the Settings UI panel renders properly with empty state and input fields.

---

## 2. Stage 5: Internal Live Header Verification (The Critical Gate)

**Goal:** Prove cryptographic DKIM alignment and SPF pass on real emails received by real email providers (Google Workspace/Gmail and Microsoft 365/Outlook) before allowing any customer to connect a domain.

> [!IMPORTANT]
> **Why this gate cannot be skipped:** Unit tests prove our code calls Resend with the right string; only reading raw email headers proves that the receiving MTA (Google/Microsoft) evaluated the DKIM signature against the contractor's apex domain and marked it `dkim=pass`.

- [ ] **Connect Internal Test Domain:**
  - In a test or internal organization workspace on Staging/Production (with flag on), connect a domain owned by the company (e.g., a test domain or subdomain).
  - Note the exact DNS records generated:
    - 2x DKIM `TXT` records (`resend._domainkey...`)
    - 1x SPF `TXT` record on `send.` subdomain (`v=spf1 include:amazonses.com ~all`)
    - 1x Return-Path `MX` record on `send.` subdomain (`feedback-smtp...`)
- [ ] **Verify Hostile Apex MX Exclusion:**
  - Confirm the rendered DNS table strictly excludes any apex `MX` records (`name: @` or blank).
  - Verify that existing Google Workspace / Microsoft 365 inbound mail routing on the apex domain is untouched.
- [ ] **Publish DNS Records & Verify:**
  - Add the records to the registrar DNS zone.
  - Click "Verify DNS Records" in the UI.
  - Confirm the domain status flips to `verified` in the database with `last_checked_at` populated.
- [ ] **Dispatch Real Quotes to External Inboxes:**
  - Send a live quote from the test account to a real **Gmail** inbox (`@gmail.com`).
  - Send a live quote from the test account to a real **Microsoft Outlook / 365** inbox (`@outlook.com` or corporate M365).
- [ ] **Download and Inspect Raw RFC 822 Headers (.eml):**
  - Open raw headers in Gmail ("Show original") and Outlook ("View message source").
  - Assert the following headers:
    1. `From:` matches `Test Company <quotes@testdomain.com>`
    2. `Reply-To:` matches the contractor's operational email (e.g., `owner@testdomain.com`)
    3. `DKIM-Signature:` contains `d=testdomain.com` (aligned with the `From` header domain).
    4. `Authentication-Results:` contains `dkim=pass header.i=@testdomain.com` or `dkim=pass (testdomain.com)`.
    5. `Authentication-Results:` contains `spf=pass (google.com: domain of ...@send.testdomain.com designates ...)`.
    6. `DMARC:` evaluates to `pass` if the apex domain has a DMARC policy.
- [ ] **Archive Verification Proof:**
  - Paste the exact raw `Authentication-Results`, `DKIM-Signature`, and `From`/`Reply-To` headers into the deployment verification record or PR discussion.

---

## 3. Daily Reconciler Cron Job (§10)

**Goal:** Automatically detect when a contractor's verified domain stops working (e.g., contractor changes DNS providers, deletes records, or lets domain expire) before homeowner quotes silently bounce or fail DKIM.

### Context & Requirements:
- Resend flips a domain to `failed` if DKIM verification checks fail. Without a reconciler, our system would continue attempting to send from `quotes@theirdomain.com`, causing silent send failures or spam placement.
- When a domain drops, our system must:
  1. Downgrade `status` to `failed` and record `failure_reason`.
  2. Fall back immediately to `Company <hello@letsgetquoted.com>` so subsequent quotes continue to deliver.
  3. Send an alert email to the contractor owner explaining the issue — sent from the **platform address** (`hello@letsgetquoted.com`), since their custom domain is broken.

### Tasks:
- [ ] **Author Cron Route:** Create `src/app/api/cron/email-domains-reconcile/route.ts`.
  - Authorize using standard cron authorization headers (`CRON_SECRET` / bearer token).
  - Select all rows from `public.email_sending_domains` where `status IN ('pending', 'verified')`.
  - For each row, call `getResendDomain(resend_domain_id)`.
  - Map provider status to local status using `normalizeResendStatus()`.
  - Filter DNS records using `filterSafeSendingDnsRecords()`.
  - If a `verified` domain is now `failed`:
    - Update database: `status = 'failed'`, `failure_reason = 'DNS records missing or misconfigured at provider'`, `last_checked_at = now()`.
    - Dispatch notification email to account owner: *"Action required: Custom email sending domain verification failed"*.
  - If a `pending` domain is now `verified`:
    - Update database: `status = 'verified'`, `verified_at = now()`, `failure_reason = null`.
- [ ] **Adhere to Dark-Worker Invariants:**
  - Always write a `cron_runs` record on execution, logging the number of domains checked (even if `0`).
  - On logical provider failures or HTTP timeouts, write explicit failure details to `cron_runs` rather than a generic 200.
  - Never downgrade a `verified` domain on a single transient HTTP timeout to Resend.
- [ ] **Register Cron Job:**
  - Add route to `vercel.json`: schedule `0 4 * * *` (daily at 04:00 UTC).
  - Add specification to `CRON_JOBS` array in `src/lib/cron-jobs.ts`:
    ```typescript
    {
      job: 'email-domains-reconcile',
      label: 'Email sending domains reconciliation',
      schedule: '0 4 * * *',
      importance: 'customer',
      consequence: 'Externally dropped DNS records for custom email domains are not detected, causing contractor quotes to silently bounce or fail DKIM without alert.',
    }
    ```
  - Run `npm test test/cron-jobs.test.ts` to verify `vercel.json` and `src/lib/cron-jobs.ts` match.

---

## 4. Stage 6: Supervised Single-Customer Canary Pilot (7-Day Soak)

**Goal:** Run one genuine, active contractor through live domain onboarding and monitor deliverability for a full week.

- [ ] **Select Canary Candidate:**
  - Choose 1 active, friendly contractor with an established custom domain (e.g. on GoDaddy, Google Domains / Squarespace, or Cloudflare).
  - Ensure they have an active volume of outbound quotes.
- [ ] **Assisted DNS Setup:**
  - Enable `LGQ_EMAIL_SENDING_DOMAINS_ENABLED` for their account.
  - Walk them through adding the 3 DNS records.
  - Confirm the UI indicates `verified`.
- [ ] **Monitor 7-Day Soak Period:**
  - Day 1: Send live quotes to real homeowners; verify homeowner receives them.
  - Day 1: Confirm homeowner clicking "Reply" routes directly to contractor's inbox.
  - Days 2–7: Check daily reconciler execution — confirm 7 successful `cron_runs` rows.
  - Review Resend dashboard logs: confirm zero bounces and zero spam complaints.
  - Contractor check-in: confirm positive experience and no deliverability anomalies.

---

## 5. Automated Reputation & Webhook Guard (§8)

**Goal:** Safeguard both the contractor's apex domain reputation and the platform's Resend sending reputation against accidental spam tagging or high bounce rates.

- [ ] **Resend Webhook Ingestion:**
  - In `src/app/api/resend/webhook/route.ts`, handle `email.complained` and `email.bounced` events.
  - Parse `resendTags(data.tags)` to extract `account_id` and sending domain.
- [ ] **Threshold & Auto-Pause Logic:**
  - If an account's custom sending domain records spam complaints exceeding **0.3%** (industry standard Gmail/Yahoo spam complaint threshold):
    - Update `public.email_sending_domains`:
      ```sql
      UPDATE public.email_sending_domains
      SET status = 'disabled',
          failure_reason = 'Automated protection: spam complaint rate exceeded threshold'
      WHERE account_id = :account_id;
      ```
    - Email the contractor owner explaining the temporary pause and fallback to platform address.
- [ ] **Graceful Fallback:**
  - Verify that whenever a domain is `disabled` or `failed`, `contractorFrom(brand)` in `src/emails/brand.ts` immediately falls back to `hello@letsgetquoted.com` without throwing an error or halting queued sends.

---

## 6. Google Workspace / Microsoft 365 Inbound Alias UX Guidance

**Goal:** Prevent lost communication when homeowners manually retype `quotes@contractordomain.com` instead of clicking "Reply".

### Context:
When an email is sent from `Test Plumbing <quotes@testplumbing.com>` with `Reply-To: office@testplumbing.com`, 99% of homeowners click "Reply" and their client addresses `office@testplumbing.com`. However, if a homeowner manually types `quotes@testplumbing.com` or copies the From address, that message is delivered to the MX servers for `testplumbing.com` (e.g., Google Workspace or Microsoft 365). If that alias doesn't exist, it bounces.

- [ ] **Add Informational Callout to Settings UI:**
  - Update `src/app/dashboard/settings/EmailSendingDomainSection.tsx` to include an informative guidance banner once a domain is verified:
    > **Tip: Add a free `quotes` alias in your email provider**  
    > Homeowner replies to your quotes go directly to your regular email address via *Reply-To*.  
    > However, if a customer manually types `quotes@yourdomain.com`, your email host needs to know where to deliver it. We recommend creating a free `quotes` email alias in Google Workspace or Microsoft 365 pointing to your main inbox so you never miss an email.
  - Provide a direct link or collapsible helper showing how to add an alias in Google Workspace and Microsoft 365.

---

## 7. Stage 7: General Availability (GA) & Rollout

**Goal:** Open custom email sending domains to all eligible customer workspaces.

- [ ] **Enable Flag in Production:**
  - Set `LGQ_EMAIL_SENDING_DOMAINS_ENABLED=true` in Vercel Production environment variables.
  - Trigger redeploy.
- [ ] **Contractor Knowledge Base & Announcements:**
  - Publish help documentation: *"How to connect your custom domain for quotes & invoices"*.
  - Include DNS record guides for popular registrars (GoDaddy, Cloudflare, Namecheap, Google Domains/Squarespace, Wix).
- [ ] **Support Team Enablement:**
  - Brief customer support on troubleshooting pending DNS records (propagation delays, TTL, registrar-specific prefix handling).

---

## 8. Strategic Post-GA Follow-Ons

### Follow-On A: Monetization & Billing Catalog Integration (§12)
- **Current Architecture:** v1 is gated by the feature flag and server action plan-tier checks, deliberately avoiding touching `src/lib/billing/catalog.ts` while checkout is live.
- **Trigger to Execute:** When product leadership decides to monetize custom email domains as a paid add-on (e.g., \$15/mo) or strictly restrict it to upper tiers with usage allowances.
- **Implementation Rules:**
  - Must follow the strict two-half catalog bump procedure:
    - **Half 1:** Add `email_sending_domains` to `allowance_keys` in `src/lib/billing/catalog.ts` and update catalog version.
    - **Half 2:** Execute the subscription currentness migration for all active customer records in Stripe / Supabase.
  - Do *not* overload `custom_domain_connections` (which tracks website domains).

### Follow-On B: Scope B Exploration (Inbound Reply Routing)
- **Concept:** Homeowner replies to quotes are ingested directly into the platform via Resend Inbound Webhooks and threaded into the job card / conversation timeline, rather than only landing in the contractor's external email inbox.
- **Discovery Tasks:**
  - Interview canary and first 50 GA users: Does direct-to-inbox reply (Scope A) fulfill 100% of their operational needs, or are replies getting lost across team members?
  - If inbound threading is demanded, design Scope B architecture:
    - MX routing setup on dedicated subdomain (e.g. `reply.contractordomain.com` or platform inbound proxy).
    - Webhook receiver with message parsing, spam filtering, and attachment processing.
