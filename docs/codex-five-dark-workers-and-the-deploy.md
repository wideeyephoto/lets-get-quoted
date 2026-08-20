# Codex brief: five dark workers, then the deploy

Two tasks, and **the order is the point**. Vercel bakes environment variables
into the build, so a flag added *after* a deployment does nothing until the next
one. Adding all five first means the merge in Task 2 is the single deploy that
turns them on — do it the other way and they sit inert until somebody notices.

## Task 1 — add five Production environment variables

Each of these five cron routes returns `404` before reading anything when its
flag is off, which means it writes **no `cron_runs` row at all**. Production
confirms it: 19 of 26 declared crons have run in the last three days, and these
five are absent entirely. Not failing — silent.

Add to the **Production** environment, value exactly `1`, **Sensitive OFF** so
they can be read back:

| Variable | Value | Worker it starts |
|---|---|---|
| `LGQ_STRIPE_CONNECTED_PAYMENT_PROJECTION_WORKER_ENABLED` | `1` | `connected-payment-projection`, every 5 min |
| `LGQ_DIRECT_PAYMENT_SETTLEMENT_WORKER_ENABLED` | `1` | `direct-payment-settlement`, every 5 min |
| `LGQ_LEGACY_QUICK_STOP_LATE_REFUND_WORKER_ENABLED` | `1` | `legacy-quick-stop-late-refunds`, every 5 min |
| `LGQ_REFUND_RECONCILIATION_ENABLED` | `1` | `refund-reconciliation`, every 15 min |
| `LGQ_VOICE_ALLOWANCE_WORKER_ENABLED` | `1` | `voice-allowance`, every 15 min |

These are **ADD**, not edit — none of the five currently exists in Production.
All five are read as an exact `=== '1'`, so `true`, `yes`, or a trailing space
all mean off.

**What is being switched on, stated plainly.** Two of these five can move money
outbound: `direct-payment-settlement` settles payments, and
`legacy-quick-stop-late-refunds` issues refunds through Stripe. Their queues
were checked before writing this brief and are empty — `quick_stop_payment_tasks`
holds **0 rows**, and the whole `payments` table holds four. So enabling them
starts them idle; they begin working on the next real event, which is the point
of doing this before the first real customer rather than after.

If any of the five already exists with a different value, **stop and report it**
rather than editing — an existing row means somebody set it deliberately and
this brief is working from a stale reading.

## Task 2 — merge the deploy

**PR #15**, `golive-followup` → `main`:
https://github.com/wideeyephoto/lets-get-quoted/pull/15

Merge with **Rebase and merge** — the same method used for PR #14, which kept
the tree identical while rewriting the SHAs.

Four commits. One is the feature: a paying customer can now change plan, which
no self-serve route allowed before. Its migration is **already applied to
production and verified**, so the database is ahead of the code — the correct
direction. The other three are documentation.

This merge is the production deploy, and it is the build that bakes in the five
variables from Task 1.

## Report back

1. The five variables, read back from Production with their values, confirming
   Sensitive is off on each.
2. Whether any already existed (and its prior value, if so).
3. The merge commit SHA on `main`.
4. The deployment id and whether it reached **READY**.

Do not run migrations, and do not touch Stripe — there is nothing to do in
Stripe in this brief.

## What I verify afterwards, so you do not need to

Within about 15 minutes of READY, all five jobs should start writing rows to
`cron_runs`. I read that table directly and will confirm it. A worker that stays
absent after the deploy means the flag did not reach the build, which is the
exact failure this ordering exists to prevent.
