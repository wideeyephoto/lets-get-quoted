# Codex prompt — plan-change rehearsal, phase 2

**Phase 2 runs the actual end-to-end test.** It ends with a real test-mode charge
against a real Stripe sandbox subscription — that is the point of it.

## State this assumes, verified locally 2026-08-23

- `subscription-rehearsal` was merged up to `main` (tip **`439b45e9`**). Verified
  independently: the branch's tree SHA is **byte-identical** to `main`'s
  (`a51cbef1…`), so the merge dropped nothing and added nothing.
- The Stripe sandbox's only webhook endpoint, `we_1U5dHvPqTgiW6iRM8Si0gH56`,
  points at that branch's Preview host. Read from the Stripe **API**, not the
  dashboard.
- **The flag has NOT been confirmed.** An earlier agent reported the Preview
  "now carries `LGQ_BASE_PLAN_SUBSCRIPTION_PLAN_CHANGE_ENABLED=1`", but nothing
  it ran could have set or read that. Treat it as unknown. Step 1 settles it,
  and it is the single most likely reason this run stops early.

Before sending, generate a fresh one-time login URL and substitute it for
`<LOGIN_URL>`. It is single-use and short-lived — generate it immediately before
sending, and do not save it into this file.

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
- In **Vercel**, the only writes permitted are: adding one environment variable
  (step 1) and one redeploy (step 2). Nothing else.
- If a step is refused, blocked, or looks different from what is described,
  **stop there and report what you actually saw.** A refusal is a result. Do not
  work around it and do not substitute a different route.
- Report **exact** values: full URLs, deployment ids, commit SHAs, Stripe object
  ids, invoice ids, statuses, timestamps, and the literal on-screen text of any
  error. Do not paraphrase them.
- Do not report a step as done unless you saw it succeed. If you could not check
  something, say that you could not check it.

## CORRECTION 2026-08-23 — the panel needs THREE things, not one

The first run of this prompt stopped correctly at step 4: no Change plan panel.
The cause was a gate I had not accounted for, and my earlier claim that
`LGQ_BASE_PLAN_SUBSCRIPTION_PLAN_CHANGE_ENABLED` is "the single control" was
wrong. It controls whether the plan-change DATA loads. The panel renders inside
the **Plan & usage tab**, and that whole tab is conditional on a different flag:

```
...(pricingDashboardEnabled && planUsage ? [{ id: 'plan', label: 'Plan & usage' ...
planUsageDashboardEnabled() === (env.LGQ_PRICING_DASHBOARD_ENABLED === '1')
```

So all three must hold, and the deployment must have been BUILT after them:

1. `LGQ_PRICING_DASHBOARD_ENABLED = 1` in Preview — without it the page shows
   "The plan-and-usage dashboard is not enabled in this environment yet", which
   is exactly what the first run saw.
2. `LGQ_BASE_PLAN_SUBSCRIPTION_PLAN_CHANGE_ENABLED = 1` in Preview.
3. A rebuild after both.

The first run reported `LGQ_PRICING_DASHBOARD_ENABLED` as already present in
Preview, yet the app said otherwise — so either its value is not exactly `1`, or
the deployment predates it. Step 2 is what settles that, and the first run did
not do the comparison it asks for: it reported "Built and deployed 2026-08-23"
with no time, so the timing was never checked.

Also: the plan-change flag was created **Sensitive**, which this prompt asked it
not to be. A Sensitive variable cannot be read back, so its value can no longer
be confirmed by looking — only by observing the app after a rebuild. Deleting and
re-adding it non-Sensitive is the way to make it checkable again.

---

## Step 1 — Does the flag actually exist in Preview?

Open the Vercel project that serves `app.letsgetquoted.com` → **Settings →
Environment Variables**. Search `LGQ_BASE_PLAN_SUBSCRIPTION_PLAN_CHANGE_ENABLED`.

Report: whether it exists, in **which** environments, whether it is marked
Sensitive, and — if visible — its value.

**If it is absent from Preview**, add it:

- **ADD** a new variable; do not edit an existing one. Adding is the operation
  that has failed in this project before, so if the form rejects it, capture the
  exact error text and stop.
- Name `LGQ_BASE_PLAN_SUBSCRIPTION_PLAN_CHANGE_ENABLED`, value `1`,
  **Preview only** — leave Production and Development unchecked.
- Do **not** mark it Sensitive. A Sensitive variable cannot be read back, so it
  could not be confirmed.

Re-open the list afterwards and report what it now shows. Note the time you
added it.

## Step 2 — The trap: environment is baked at build time

In this project a Preview variable does **nothing** for a deployment built
before that variable existed.

Find the most recent Preview deployment for branch **`subscription-rehearsal`**.
Report its full URL, commit SHA, status, and exact **build finished** timestamp.
Its commit should be `439b45e9` or newer; if it is older, stop and say so.

Now compare build time against the flag:

- If the build finished **before** the flag existed (including if you added it in
  step 1), **redeploy**, and when Vercel offers the choice, **uncheck "Use
  existing Build Cache"** so the environment is read fresh. Wait for Ready.
  Report the new deployment id and build time.
- If the build is newer than the flag, change nothing and say so.

## Step 3 — Confirm the endpoint still points where we think (Stripe, read-only)

In the **sandbox** account `acct_1TtDcSPqTgiW6iRM` ("LETSGETQUOTED sandbox"),
open webhook endpoint `we_1U5dHvPqTgiW6iRM8Si0gH56`.

Report its status, its URL host, and its most recent delivery attempt with the
response code. If the host is not the `subscription-rehearsal` Preview host from
step 2, **stop** — events would not reach the code under test.

## Step 4 — Sign in to the Preview app

Open `<LOGIN_URL>`. It is single-use.

You are signed into Vercel with access to this project, so deployment protection
should let you through with no bypass token. If you hit a Vercel login or
"protected deployment" wall instead, stop and report it — do not go hunting for a
bypass secret.

Go to **/dashboard/settings**. Report whether a **"Change plan"** panel is
visible.

Its presence is the first real proof the flag took effect: the panel is hidden
whenever the flag is absent or the build predates it. **If it is not visible,
stop and report** — steps 1 and 2 are then the thing to re-examine, not this one.

## Step 5 — Read the panel before touching it

Report verbatim:

1. The plan the page says the workspace is currently on.
2. Every option the panel offers, and for each, its effect text (e.g. "Takes
   effect now…" versus "Takes effect … at your renewal").

## Step 6 — The upgrade

Choose the option that takes effect **now** and moves **up** a tier (e.g. Solo →
Growth monthly). Do not choose one that takes effect at renewal, and do not
choose anything mentioning the free or Flex plan.

1. Click to begin. A **recurring billing authorization** disclosure with a
   checkbox should appear.
2. **Before ticking it**, report whether the confirm button is disabled. It is
   supposed to be. If it is clickable with the box unticked, **stop and report
   that** — it is a defect and the run ends there.
3. Tick the box, confirm, let it finish.
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

**Why the existing subscription is the subject.** `sub_1U5hxL…` carries
`lgq_catalog_version: 2026-08-15-preview`, which is why its renewal was expected
to dead-letter. A plan change rewrites that key to the current version, so this
run doubles as a repair. If the binding instead refuses on the *old* value before
the new metadata lands, that is a real finding about ordering — not a wasted run.

**What I verify locally afterwards, and cannot ask Codex for:** the
`billing_subscription_plan_change_operations` row reaching `provider_accepted`
and then `activated`; `proration_invoice_id` matching the invoice Codex reports;
`workspace_entitlements` moving to the new plan; and — the thing the last
migration exists for — four **new** `usage_credit_lots` rows carrying the new
plan's full monthly units alongside the old plan's, under the plan-aware
idempotency key.

**If step 6 fails**, likeliest causes in order: the build predates the flag (step
2 misjudged); the workspace entitlement is not `active`/paid, which the claim RPC
requires; the consent acceptance expired between minting and claiming. All three
are visible in the database and quick to tell apart.
