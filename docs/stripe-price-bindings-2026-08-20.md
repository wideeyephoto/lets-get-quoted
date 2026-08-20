# The six live Prices already exist at the current catalog version

Read from live Stripe on 2026-08-20 with `npm run preflight:prices:discover`.
Price IDs are identifiers, not secrets; recording them is what makes the fix a
copy-paste rather than another investigation.

## What is actually there

**Twelve** base-plan Prices, live and active — two for every plan/interval pair.
One set at the old catalog version, one at the current one. Amounts are correct
on both sets and match `BILLING_PLANS`.

| plan | interval | amount | `2026-08-18-preview` — **use these** | `2026-08-15-preview` — stale |
|---|---|---|---|---|
| solo | monthly | $39 | `price_1U5n8eGqh5LFKuTCh9KIQFws` | `price_1U5VGoGqh5LFKuTCkR17qlzm` |
| solo | annual | $420 | `price_1U5n8eGqh5LFKuTCTSUmI5CR` | `price_1U5VI6Gqh5LFKuTCmPmK5Q9W` |
| growth | monthly | $129 | `price_1U5n8eGqh5LFKuTCZKW7rINt` | `price_1U5VItGqh5LFKuTC97CtsoRT` |
| growth | annual | $1,188 | `price_1U5n8fGqh5LFKuTCjJRhOzQ9` | `price_1U5VJbGqh5LFKuTCh04wqbAH` |
| scale | monthly | $329 | `price_1U5n8fGqh5LFKuTCUBcPBlFY` | `price_1U5VK1Gqh5LFKuTCPdCT2UUa` |
| scale | annual | $3,588 | `price_1U5n8fGqh5LFKuTCOEm7ACLn` | `price_1U5VKZGqh5LFKuTCpzLfXMNC` |

## So the job is not what it looked like

Every plan for creating new Prices was wrong. Somebody already created the
current-version set — the `1U5n8*` IDs share a creation timestamp, so they were
made in one batch. Creating six more would have produced a **third** set, and a
third set is a third chance to bind the wrong one.

What is left is to make the six `STRIPE_PRICE_*` variables in Vercel Production
point at the `2026-08-18-preview` column, and redeploy. Those variables are
Sensitive — write-only, unreadable by anyone including their owner — so **no one
can currently say which set is bound.** The circumstantial case is that the old
set is: the variables were set on 2026-08-17 and the new Prices were created
after the catalog moved on 2026-08-18.

## Confirming it, before and after

`npm run preflight:prices` reads the *bound* IDs and runs the same validator
checkout uses. It needs the Production variables in its process, so it only runs
inside a Production runtime. That is the one check that can say whether checkout
will work; discovery cannot, and must not be read as if it can.

## The stale set is still active

Both sets are `active: true`. An active stale Price is a live opportunity to
bind the wrong one again. Archiving the `2026-08-15-preview` column once the
bindings are confirmed would close that off — a Stripe write, and a separate
decision. Archiving a Price does not affect subscriptions already on it, and
nothing is on these.
