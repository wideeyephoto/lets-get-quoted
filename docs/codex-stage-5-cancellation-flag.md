# Codex task — Stage 5: turn on in-app plan cancellation

Vercel project: **`lets-get-quoted`**. This brief touches **Vercel only**. No Stripe
changes at all, in any account.

## Scope, stated as a fence

You are adding **one** environment variable and redeploying. Specifically:

- Do **not** create, edit, or delete any other variable.
- Do **not** touch any `STRIPE_PRICE_*` binding. They were rebound and verified on
  2026-08-18 and are correct.
- Do **not** enable `LGQ_BASE_PLAN_SUBSCRIPTION_CHECKOUT_ENABLED`. That is a separate,
  later decision and turning it on here would put a paid plan on sale.
- Do **not** change any existing `LGQ_*` flag's value.

## Why this is safe to turn on now, and why it goes first

The flag exposes a "Cancel plan" panel in Settings to an owner who has a base-plan
subscription. Its two stated preconditions are both met as of today:

- `LGQ_STRIPE_BILLING_WEBHOOK_ENABLED=1` — live, verified by external probe
- the subscription projection worker is scheduled and running — verified in `cron_runs`,
  every 5 minutes, zero failures

Without those, a cancellation would succeed at Stripe and never reach the workspace.
With them, the resulting `customer.subscription.updated` is projected like any other event.

There is nothing to cancel yet, because checkout is still dark, so the panel renders for
nobody today. That is the point of the ordering: the cancel path must be live **before**
anything can be bought, so no customer can ever buy a plan they have no way to cancel.

---

## Step 1 — Add the variable

Add to the `lets-get-quoted` project:

| Key | Value | Environments | Sensitive |
|---|---|---|---|
| `LGQ_BASE_PLAN_SUBSCRIPTION_CANCELLATION_ENABLED` | `1` | **Production only** | **No — leave Sensitive OFF** |

Three things about that row that are each deliberate:

**This should be an ADD, not an edit.** The variable is expected to be absent. If you
find it already exists, do not change it — report its current environments, value if
readable, and Sensitive state, and stop at this step.

**Production only.** Do not add it to Preview or Development. Preview deployments point
at the production Stripe account, so a cancel button on a preview URL would cancel a real
subscription.

**Leave Sensitive off.** It is a boolean feature flag, not a credential. Marking it
Sensitive makes the value unreadable to everyone including the person who set it, and
that has already cost time on this project — several flags now cannot be confirmed by
reading, only inferred from behaviour. Nothing is protected by hiding the digit `1`.

## Step 2 — Redeploy Production

Vercel bakes environment variables at **build** time, so the variable does nothing until
a new build runs. A Production flag change with no redeploy has previously made working
workers look like they had stopped.

Redeploy the **current Production deployment**, keeping the same commit — do not deploy a
different branch and do not use "use existing build cache" if it would skip re-reading the
environment. The current production commit is `93dd0551`.

Wait for the deployment to reach **Ready**. If it fails, report the build log's error and
stop; do not retry more than once.

---

## Report back, verbatim

1. The `LGQ_BASE_PLAN_SUBSCRIPTION_CANCELLATION_ENABLED` row as the project now shows it:
   environments it applies to, and whether it is marked Sensitive. If the value is
   readable, quote it; if it is not readable, say so rather than assuming.
2. Whether this was an add or the variable already existed.
3. The new deployment's id, its commit SHA, its status, and its build duration.
4. Anything you were asked to do that you could not, and the exact error text. A refusal
   or a permission denial is a useful finding, not a failure — report it rather than
   working around it.
