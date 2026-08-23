# Codex prompt — plan-change rehearsal (the run)

Supersedes the earlier phase 1 and phase 2 drafts. This is the whole thing: fix
the two Preview flags, rebuild, then drive the upgrade end to end.

**It ends with a real charge on a real Stripe sandbox subscription. That is the
point of it.**

## Verified locally before sending

- `subscription-rehearsal` is merged up to `main` (tip `439b45e9`); its tree SHA
  is byte-identical to `main`'s, so the Preview behind the Stripe webhook carries
  the whole plan-change rail.
- The sandbox's only webhook endpoint, `we_1U5dHvPqTgiW6iRM8Si0gH56`, points at
  that branch's Preview host. Read from the Stripe **API**, not the dashboard.
- **Three things gate the panel, not one.** `ChangePlanPanel` renders inside the
  **Plan & usage tab**, and the tab is `pricingDashboardEnabled && planUsage`,
  where `pricingDashboardEnabled` reads `LGQ_PRICING_DASHBOARD_ENABLED`. The
  plan-change flag only controls whether the data loads. The last run saw "The
  plan-and-usage dashboard is not enabled in this environment yet", which is
  exactly that other flag's fallback branch.
- The plan-change flag currently exists in Preview but was created **Sensitive**,
  so its value cannot be read back by anyone.

Substitute a fresh single-use login URL for `<LOGIN_URL>` immediately before
sending. Do not save it into this file.

Copy everything below the line.

---

You have an authenticated browser for **Vercel** and **Stripe** only.

**Rules for this run**

- **Never type an API key, token, or secret into a form field**, a search box, or
  a URL bar. The login URL in step 4 is the one link you are given; open it
  directly and do not retype it into anything.
- In **Stripe**, read only. Do not create, modify, cancel or refund anything. The
  charge in this run happens because the *app* asks Stripe for it, never because
  you clicked something in Stripe.
- In **Vercel**, the only permitted writes are the two environment variables in
  step 1 and the redeploy in step 2. Nothing else, and **Preview scope only** —
  do not touch Production or Development.
- If a step is refused, blocked, or looks different from what is described,
  **stop there and report what you actually saw.** A refusal is a result. Do not
  work around it and do not substitute a different route.
- Report **exact** values: full URLs, deployment ids, commit SHAs, Stripe object
  ids, invoice ids, statuses, timestamps, and the literal on-screen text of any
  error. Do not paraphrase.
- **Do not report a step as done unless you saw it succeed.** If you could not
  check something, say that you could not check it.

## Step 1 — Fix both Preview flags

Open the Vercel project serving `app.letsgetquoted.com` → **Settings →
Environment Variables**.

**1a. `LGQ_PRICING_DASHBOARD_ENABLED`** — this is the one that gates the whole
Plan & usage tab.

- Report whether it exists, in which environments, whether it is Sensitive, and
  its value if readable.
- It must be present in **Preview** with value exactly `1`. If it is absent from
  Preview, **ADD** it (Preview only, not Sensitive). If it is present with a
  different value, report that and stop — do not edit it without saying so first.

**1b. `LGQ_BASE_PLAN_SUBSCRIPTION_PLAN_CHANGE_ENABLED`** — currently Sensitive
and therefore unreadable.

- **Delete** the Preview entry and **re-add** it: Preview only, value `1`, and
  **not** marked Sensitive. A Sensitive variable cannot be read back, so there is
  no way to confirm it is right.
- If deleting is refused, report the exact wording and stop.

Re-open the list and report what both variables now show for Preview, and the
time you made the changes.

## Step 2 — Rebuild, because environment is baked in at build time

In this project a Preview variable does **nothing** for a deployment built before
that variable existed. You have just changed variables, so a rebuild is required
regardless of what the current deployment looks like.

Find the most recent Preview deployment for branch **`subscription-rehearsal`**
and report its URL, commit SHA, status and exact **build finished** timestamp.
The commit should be `439b45e9` or newer — if it is older, stop and say so.

Then **redeploy it**, and when Vercel offers the choice, **uncheck "Use existing
Build Cache"** so the environment is read fresh. Wait for **Ready**. Report the
new deployment id and its build finished time.

## Step 3 — Confirm the endpoint still points where we think (Stripe, read-only)

In the **sandbox** account `acct_1TtDcSPqTgiW6iRM` ("LETSGETQUOTED sandbox"),
open webhook endpoint `we_1U5dHvPqTgiW6iRM8Si0gH56`.

Report its status, its URL host, and its most recent delivery attempt with the
HTTP response code. If the host is not the `subscription-rehearsal` Preview host,
**stop** — events would not reach the code under test.

## Step 4 — Sign in and look for the panel

Open `<LOGIN_URL>`. It is single-use.

Your Vercel session should carry you past deployment protection. If you hit a
Vercel login or "protected deployment" wall instead, stop and report it — do not
go looking for a bypass secret.

Go to **/dashboard/settings** and find the **Plan & usage** tab.

Report:

1. Whether the **Plan & usage** tab exists at all. If instead you see "The
   plan-and-usage dashboard is not enabled in this environment yet", then step 1a
   or step 2 did not take — **stop and report that**, and do not continue.
2. Whether a **"Change plan"** panel appears within that tab. If the tab exists
   but the panel does not, step 1b did not take — **stop and report that**.

## Step 5 — Read the panel before touching it

Report verbatim:

1. The plan the page says the workspace is currently on.
2. Every option offered, and for each, its effect text (e.g. "Takes effect
   now…" versus "Takes effect … at your renewal").

## Step 6 — The upgrade

Choose the option that takes effect **now** and moves **up** a tier (Solo →
Growth monthly). Do not choose an at-renewal option, and do not choose anything
mentioning the free or Flex plan.

1. Click to begin. A **recurring billing authorization** disclosure with a
   checkbox should appear.
2. **Before ticking it**, report whether the confirm button is disabled. It is
   supposed to be. If it is clickable with the box unticked, **stop and report
   that** — that is a defect and the run ends there.
3. Tick the box, confirm, and let it finish.
4. Report the exact on-screen result text, success or failure.

## Step 7 — What Stripe says afterwards (read-only)

Open subscription **`sub_1U5hxLPqTgiW6iRM2f12RKn0`** in the sandbox account.

Report:

1. Status, and the Price/plan it is now on.
2. **Every** metadata key and value — especially `lgq_operation_id`,
   `lgq_plan_code`, `lgq_billing_interval`, `lgq_catalog_version`.
3. Its **latest invoice**: id, status, amount, and whether it was paid.
4. On the webhook endpoint from step 3, every event delivered in the last few
   minutes: type, id, and HTTP response code for each.

## Step 8 — Report

Send everything from steps 1–7. Do not fix anything, do not retry a failure, and
do not change any Stripe object. If it went wrong, the exact error text plus the
event delivery results are precisely what is needed.

---

## Notes for the human, not for Codex

**This upgrades workspace `7caf66e2`, the only paid one.** Its subscription
carries `lgq_catalog_version: 2026-08-15-preview`, which is why its renewal was
expected to dead-letter; a plan change rewrites that key to the current version,
so the run doubles as a repair. Benefit and risk on the same account — worth
being deliberate rather than discovering it mid-run.

**What I verify locally afterwards and cannot ask Codex for:** the
`billing_subscription_plan_change_operations` row reaching `provider_accepted`
then `activated`; `proration_invoice_id` matching the invoice Codex reports;
`workspace_entitlements` moving to the new plan; and four **new**
`usage_credit_lots` rows carrying the new plan's full monthly units alongside the
old plan's, under the plan-aware idempotency key.

**If step 6 fails**, likeliest causes in order: the build still predates a flag;
the workspace entitlement is not `active`/paid, which the claim RPC requires; the
consent acceptance expired between minting and claiming. All three are visible in
the database and quick to tell apart.
