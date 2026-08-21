# The crew-seat Price: what is load-bearing and what I over-specified

Written 2026-08-20, after an operator run stopped on a requirement that should
never have been in the brief.

## What I got wrong

The brief said "no tax code" on the Product. The dashboard's Product form
forcibly assigns `txcd_10000000`, so the operator stopped rather than deviate --
correctly, given what it was told.

The requirement was wrong. **Stripe Tax is off for this account and the code
asserts it**: `stripe-billing-subscription-checkout.ts:474` refuses any checkout
call whose `automatic_tax.enabled` is not `false`, and the top-up checkout never
sets it at all. A Product tax code is inert. It affects nothing, and no contract
anywhere in this repo reads it.

I wrote the constraint by pattern -- "be exact about every field" -- rather than
by asking which fields are load-bearing. Being exact about the wrong things
costs a round trip and teaches the operator that the brief's requirements are
arbitrary, which is worse than the round trip.

## What is actually load-bearing

`resolveTopUpPrice` in `src/lib/billing/top-up-purchase.ts` refuses the purchase
with `price_contract_mismatch` unless ALL of these hold on the **Price**:

| Field | Required | Why it bites |
|---|---|---|
| `active` | `true` | also part of the search query |
| `currency` | `usd` | |
| `unit_amount` | `500` | |
| `tax_behavior` | **`exclusive`** | **immutable after creation -- see below** |
| `recurring.interval` | `month` | |
| `recurring.interval_count` | `1` | |
| `recurring.trial_period_days` | absent | |
| `metadata.lgq_price_purpose` | `top_up` | |
| `metadata.lgq_resource_code` | `crew_users` | |
| `metadata.lgq_units` | `1` | |
| `metadata.lgq_top_up_id` | `crew_user` | part of the search query |
| `metadata.lgq_catalog_version` | `2026-08-18-preview` | part of the search query |

Nothing on the Product is read except that a product id exists.

## The trap worth knowing about

**`tax_behavior` cannot be changed after a Price is created.** A Price created
with `unspecified` -- which is what you get when the field is not offered,
and Stripe often does not offer it while Stripe Tax is disabled -- is
permanently wrong and cannot be repaired.

Worse, the obvious repair makes it worse. Creating a second, correct Price
leaves two active Prices matching `lgq_top_up_id:'crew_user'` at this catalog
version, and `resolveTopUpPrice` refuses that outright with `price_ambiguous`:
"picking either would be picking a price for the customer at random". So a
botched Price must be **archived**, not left alongside its replacement.

That is why the brief now says to stop if `tax_behavior` cannot be set to
Exclusive, rather than to create the Price and check afterwards.

## The permission problem

The `rk_live_` key in `.env.live.local` is read-only by design and must stay
that way -- a write-capable Stripe key never goes on this disk. It has neither
`product_write` nor `product_read`, which is why neither the operator nor I
could create the Product, and why I could not even read the existing five
Products' tax codes to check my own assumption.

Granting `product_write` to that key would solve the immediate problem and break
the standing rule. A temporary restricted key, used and then revoked, does not.
