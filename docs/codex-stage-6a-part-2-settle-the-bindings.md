# Codex — Stage 6a part 2: settle the Price bindings, and close the Preview hole

Vercel project **`lets-get-quoted`**. Vercel only. No Stripe changes.

**Still not putting plans on sale.** `LGQ_BASE_PLAN_SUBSCRIPTION_CHECKOUT_ENABLED` must
remain absent in **Production**. Task 2 below touches the **Preview** row of that variable
only — read it carefully, because the two are different rows and only one is in scope.

## Why this exists

Your last report was correct and it created a dead end: all six `STRIPE_PRICE_*` rows are
Sensitive, so nobody — you, me, or Brett — can read them. That means we cannot confirm
whether they point at the current Prices or the stale ones, and there is no reveal control
to fix that.

**A value you cannot read, you can still overwrite.** Setting all six to known-correct ids
makes the binding correct regardless of what it was, which settles the question without
needing to read anything. If a row was already right, the write is a no-op.

Checkout is off, so this is the safe window to do it — a half-finished change here cannot
break a live purchase, because there are no live purchases.

## Task 1 — Replace the six base-plan Price bindings, and stop them being Sensitive

For each of the six, **delete the existing Production row and re-add it** with the value
below and **Sensitive OFF**. Deleting and re-adding is how the Sensitive marking gets
cleared; editing in place keeps it.

| Variable | Value | (sanity: amount) |
|---|---|---|
| `STRIPE_PRICE_SOLO_MONTHLY` | `price_1U5n8eGqh5LFKuTCh9KIQFws` | $39.00 / month |
| `STRIPE_PRICE_SOLO_ANNUAL` | `price_1U5n8eGqh5LFKuTCTSUmI5CR` | $420.00 / year |
| `STRIPE_PRICE_GROWTH_MONTHLY` | `price_1U5n8eGqh5LFKuTCZKW7rINt` | $129.00 / month |
| `STRIPE_PRICE_GROWTH_ANNUAL` | `price_1U5n8fGqh5LFKuTCjJRhOzQ9` | $1,188.00 / year |
| `STRIPE_PRICE_SCALE_MONTHLY` | `price_1U5n8fGqh5LFKuTCUBcPBlFY` | $329.00 / month |
| `STRIPE_PRICE_SCALE_ANNUAL` | `price_1U5n8fGqh5LFKuTCOEm7ACLn` | $3,588.00 / year |

**Production environment only.** Do not add or change these in Preview or Development.

**Sensitive OFF is the point of the task, not a detail.** A Stripe Price id is not a
secret — it is a public identifier that appears in client-side Checkout. Marking these
Sensitive protects nothing and is what made the binding unverifiable in the first place.
After this, they can be read back and checked forever.

Copy each id **exactly**. Both sets of Prices carry identical amounts, so a wrong id will
not look wrong — the id string is the only thing distinguishing them. After saving,
read each of the six back and quote them in your report; that read-back is the whole
benefit of clearing Sensitive, so do not skip it.

## Task 2 — The Preview checkout row

You reported: *"A separate Preview-only Sensitive row exists and was not changed"* for
`LGQ_BASE_PLAN_SUBSCRIPTION_CHECKOUT_ENABLED`.

That row is a problem, because **Preview deployments point at the production Stripe
account**. If its value is `1`, a preview build can create a real subscription and charge
a real card — and because it is Sensitive, nobody can confirm whether it is `1` or `0`.

**Delete the Preview row.** Absent is off: every flag in this codebase is read as
`env[FLAG] === '1'`, so a missing variable is the safe state and the intended default.
Do not delete or modify the Production row of this variable — it should already be absent,
and if you find one in Production, report it and stop rather than deleting it.

## Task 3 — Redeploy Production

Vercel bakes environment variables at build time. Redeploy the current Production
deployment on commit `0faa67b5080c2a237558567a14b8b4b6d8be88e6`. Wait for **Ready**.

## Report back, verbatim

1. The six `STRIPE_PRICE_*` values **read back after saving**, as ids, and confirmation
   each row is no longer Sensitive.
2. Whether the Preview `LGQ_BASE_PLAN_SUBSCRIPTION_CHECKOUT_ENABLED` row was deleted, and
   whether any Production row of that variable exists.
3. The new deployment's id, commit SHA, status and build duration.
4. Anything refused, with exact error text.
