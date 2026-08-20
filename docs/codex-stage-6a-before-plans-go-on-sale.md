# Codex — Stage 6a: the two things that must precede putting plans on sale

Vercel project **`lets-get-quoted`**, plus one **read-only** Stripe inventory.
Platform Stripe account: `acct_1TuCWJGqh5LFKuTC`.

**This brief does NOT put plans on sale.** `LGQ_BASE_PLAN_SUBSCRIPTION_CHECKOUT_ENABLED`
stays exactly as it is — absent. That is Stage 6b, a separate decision after this is
verified. If you find yourself about to touch that variable, stop: it is out of scope.

## Why this exists

Turning checkout on is the step that starts taking real money. Two preconditions are
currently unmet, and both fail *quietly* rather than loudly:

- **Paid-plan allowances would never refill.** The `billing-allowance-resets` cron is
  scheduled every 15 minutes in `vercel.json` and **has never run — not once**. Its route
  returns 404 when its flag is absent, so it records nothing and looks like silence rather
  than failure. A customer would get month one's allowance and nothing after.
- **Six stale Stripe Prices are still active**, carrying `lgq_catalog_version` of
  `2026-08-15-preview` alongside the six current ones at `2026-08-18-preview`. Checkout
  refuses any Price whose metadata is not the current version, so a stale binding means a
  dead buy button for that plan.

## Task 1 — Report the six base-plan Price bindings (READ ONLY)

In the `lets-get-quoted` project's **Production** environment variables, report the value
of each of these six:

```
STRIPE_PRICE_SOLO_MONTHLY      STRIPE_PRICE_SOLO_ANNUAL
STRIPE_PRICE_GROWTH_MONTHLY    STRIPE_PRICE_GROWTH_ANNUAL
STRIPE_PRICE_SCALE_MONTHLY     STRIPE_PRICE_SCALE_ANNUAL
```

**Change none of them.** If any is marked Sensitive and unreadable, say so for that
variable specifically rather than guessing or inferring from the others.

Each value must be one of these six — the current `2026-08-18-preview` set:

| Variable | Must be | Amount |
|---|---|---|
| `STRIPE_PRICE_SOLO_MONTHLY` | `price_1U5n8eGqh5LFKuTCh9KIQFws` | $39.00 / month |
| `STRIPE_PRICE_SOLO_ANNUAL` | `price_1U5n8eGqh5LFKuTCTSUmI5CR` | $420.00 / year |
| `STRIPE_PRICE_GROWTH_MONTHLY` | `price_1U5n8eGqh5LFKuTCZKW7rINt` | $129.00 / month |
| `STRIPE_PRICE_GROWTH_ANNUAL` | `price_1U5n8fGqh5LFKuTCjJRhOzQ9` | $1,188.00 / year |
| `STRIPE_PRICE_SCALE_MONTHLY` | `price_1U5n8fGqh5LFKuTCUBcPBlFY` | $329.00 / month |
| `STRIPE_PRICE_SCALE_ANNUAL` | `price_1U5n8fGqh5LFKuTCOEm7ACLn` | $3,588.00 / year |

**These are the STALE ones.** If you see any of them in a binding, report it loudly — that
plan's checkout is broken:

```
price_1U5VGoGqh5LFKuTCkR17qlzm   price_1U5VI6Gqh5LFKuTCmPmK5Q9W
price_1U5VItGqh5LFKuTC97CtsoRT   price_1U5VJbGqh5LFKuTCh04wqbAH
price_1U5VK1Gqh5LFKuTCPdCT2UUa   price_1U5VKZGqh5LFKuTCpzLfXMNC
```

Both sets carry identical amounts, so **do not** verify by price alone — the id and the
`lgq_catalog_version` metadata are what distinguish them. Report the ids verbatim, not
"they look correct".

## Task 2 — Turn on the two dark workers

Independent of Task 1's result. Add to the `lets-get-quoted` project:

| Key | Value | Environments | Sensitive |
|---|---|---|---|
| `LGQ_PAID_PLAN_ALLOWANCE_RESET_WORKER_ENABLED` | `1` | **Production only** | **No** |
| `LGQ_USAGE_RESERVATION_EXPIRY_ENABLED` | `1` | **Production only** | **No** |

Both are expected to be **absent** — this is an ADD, not an edit. If either already
exists, do not change it; report its current state and continue with the other.

Leave Sensitive **off** on both: they are boolean feature flags, not credentials, and
marking them Sensitive makes them permanently unreadable for no security gain.

Production only — these workers run on Vercel cron, which fires against Production.

The second one expires stale usage reservations. A reservation that never expires holds a
paid customer's allowance permanently, which is the same "sold it, did not deliver it"
shape as the resets.

## Task 3 — Redeploy Production

Vercel bakes environment variables at **build** time, so neither flag does anything until
a new build runs. Redeploy the current Production deployment on the same commit —
`0faa67b5080c2a237558567a14b8b4b6d8be88e6`. Wait for **Ready**.

## Report back, verbatim

1. All six Price bindings, as ids. Flag any that appear in the stale list.
2. Which of the two flags were added vs already present, their environments, and their
   Sensitive state.
3. The new deployment's id, commit SHA, status and build duration.
4. Anything refused or unreadable, with exact error text. A permission denial is a
   finding, not a failure — the restricted key on the repo side already lacks `sub_read`
   and `webhook_read`, so this would not be the first.

**After this lands I will confirm from the database that `billing-allowance-resets` has
actually recorded a run** — the flag being set is not evidence the worker runs. Stage 6b
waits on that.
