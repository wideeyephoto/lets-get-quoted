# Codex prompt — plan-change rehearsal, phase 1

## SUPERSEDED 2026-08-23 — read this first

The blocker below is **fixed**. `subscription-rehearsal` was merged up to `main`
(tip `439b45e9`); its tree SHA is byte-identical to `main`'s, so the Preview
deployment behind the Stripe webhook now carries the whole plan-change rail.

That merge came back "clean 3-way, 0 conflicts", which in this repo is normally
the warning sign rather than the reassurance — stranded branches here are mostly
rebased twins, and a clean merge is how real content goes missing. It is correct
this time, and independently so: all four of the branch's substantive commits
were already on `main` by patch-id, the other two were a TEMPORARY logging commit
and its own revert, and `git diff main...subscription-rehearsal` was empty
beforehand. The branch had nothing unique to drop.

**Steps 1–3 below are still worth running if phase 1 never happened** — the flag
is the open question. Step 4 is obsolete. Go to
`codex-prompt-plan-change-rehearsal-phase2.md`, which folds the flag check in as
its own step 1.

---

Copy everything below the line.

---

You have an authenticated browser for **Vercel** and **Stripe** only. Work only
in those two. This is phase 1 of two: it changes **Preview only** and ends with a
report. Do not touch Production anything.

**Rules for this run**

- **Never type an API key, token, or secret into a form field**, a search box, or
  a URL bar. If a step seems to need one, stop and say so.
- Do not create, modify, or delete anything in **Stripe**. Stripe is read-only in
  this phase.
- In Vercel, the only write is one environment variable in one scope, described
  below. Nothing else.
- If any step is refused, blocked, or looks different from what is described
  here, **stop at that step and report what you actually saw**. A refusal is a
  useful result. Do not work around it, and do not guess at a substitute.
- Report **exact** values — full URLs, full deployment ids, full commit SHAs,
  exact variable names and scopes. Do not summarise or paraphrase them.

**Background you can rely on (already verified via the Stripe API, not the
dashboard — do not re-derive it from the Stripe UI, which has been wrong here
before):**

- Stripe sandbox account is `acct_1TtDcSPqTgiW6iRM` ("LETSGETQUOTED sandbox").
- It has exactly one webhook endpoint, `we_1U5dHvPqTgiW6iRM8Si0gH56`, status
  `enabled`, pointing at:
  `https://lets-get-quoted-git-subscription-rehearsal-lets-get-quoted.vercel.app/api/stripe/billing/webhook`
- So Stripe's test-mode events for that sandbox reach the Vercel Preview
  deployment of the **`subscription-rehearsal`** branch, and nothing else.

## Step 1 — Vercel project and environments

Open the Vercel dashboard for the project that serves `app.letsgetquoted.com`.

Report:

1. The exact Vercel **project name** and the team/scope it sits under.
2. Every environment that project has (Production, Preview, Development, and any
   custom ones).

## Step 2 — Does the flag exist anywhere?

Go to the project's **Environment Variables** settings.

Search for `LGQ_BASE_PLAN_SUBSCRIPTION_PLAN_CHANGE_ENABLED`.

Report, exactly:

1. Whether it exists at all, and if so in **which environments**.
2. Whether it is marked **Sensitive**. (If it is, you will not be able to read
   its value. That is expected — report that you could not read it rather than
   guessing.)
3. Also search for `LGQ_BASE_PLAN_SUBSCRIPTION_CHECKOUT_ENABLED` and report the
   same three things for it.

**Do not change either variable yet.** Report first.

## Step 3 — Add the plan-change flag to Preview ONLY

Only if step 2 showed `LGQ_BASE_PLAN_SUBSCRIPTION_PLAN_CHANGE_ENABLED` is
**absent from Preview**:

- **ADD** a new variable. Do not edit an existing one. In this project, adding is
  the operation that has failed before, so if the form rejects it, capture the
  exact error text.
- Name: `LGQ_BASE_PLAN_SUBSCRIPTION_PLAN_CHANGE_ENABLED`
- Value: `1`
- Environments: **Preview only.** Leave Production and Development unchecked.
- Do **not** mark it Sensitive — this is a feature flag, not a credential, and a
  Sensitive one cannot be read back to confirm it.

Then re-open the variable list and report whether it now shows for Preview.

If it was already present in Preview, change nothing and say so.

## Step 4 — The rehearsal branch deployment

Find the most recent Preview deployment for the branch **`subscription-rehearsal`**.

Report:

1. Its full deployment URL.
2. Its **commit SHA** and commit message.
3. Its build date/time and status (Ready / Error / Building).
4. Whether the project has **Deployment Protection** enabled for Preview, and if
   so which mode.

Do **not** redeploy it. That is phase 2, and it has to wait for a code change
that has not been made yet.

## Step 5 — Stop and report

Send back everything from steps 1–4. Specifically confirm:

- the flag's state in Preview **after** your change,
- the `subscription-rehearsal` deployment's commit SHA.

Do not proceed to any purchase, checkout, upgrade, or redeploy. Phase 2 depends
on the commit SHA you report.

---

## Why it originally stopped there (superseded, kept for the reasoning)

The sandbox webhook points at the `subscription-rehearsal` branch preview, and
that branch is **319 commits behind `main`** — every commit of the plan-change
rail is missing from it. Redeploying it today would rehearse the *old* code and
tell us nothing.

So phase 2 cannot start until that branch carries this work. Two ways, and it is
a real choice:

- **Merge `main` into `subscription-rehearsal`.** Keeps the branch's 6 unique
  commits, which are rehearsal enablers and are still needed — treating a Vercel
  deployment URL as the platform rather than a tenant domain, refusing to send a
  paying subscriber back to localhost, and a runbook. Expect conflicts in
  `auth.ts`, `base-plan-subscription-entrypoint.ts` and `tenant-host.ts`, and
  note that `stranded-branches-are-mostly-rebased-twins` warns a clean 3-way
  merge is the dangerous outcome here, not the safe one.
- **Repoint the webhook at a deployment carrying `main`.** One Stripe change
  instead of a 319-commit merge, but it means enabling the flag wherever that
  deployment is — and in Production that makes the panel visible to workspace
  `7caf66e2`, the only paid one.

I have not picked between them.
