# Codex — archive the six superseded base-plan Prices

Stripe live platform account **`acct_1TuCWJGqh5LFKuTC`**. Stripe only, no Vercel
changes. This is the last cleanup item after plans went on sale on 2026-08-20.

**Do not touch any other Stripe object.** No Products, no top-up Prices, no
subscriptions, no webhook endpoints, no Connect settings. Six Prices, one field each.

## Why

Twelve base-plan Prices are active on the live account: six current, carrying
`lgq_catalog_version = 2026-08-18-preview`, and six superseded ones from
`2026-08-15-preview`. **The amounts are identical between the two sets**, so a
binding pointing at the wrong one would not look wrong on any screen — the id string
and the metadata are the only things that differ.

The six Production `STRIPE_PRICE_*` bindings were confirmed on 2026-08-20 to point at
the current set, so nothing references these six today. Archiving them means the
mistake cannot be made later either.

## The task

For each of the six Prices below, set **`active` to `false`** (Stripe calls this
"Archive price"). Nothing else — do not change the amount, currency, product,
recurring interval, nickname or metadata.

```
price_1U5VGoGqh5LFKuTCkR17qlzm    solo   monthly   $39.00
price_1U5VI6Gqh5LFKuTCmPmK5Q9W    solo   annual    $420.00
price_1U5VItGqh5LFKuTC97CtsoRT    growth monthly   $129.00
price_1U5VJbGqh5LFKuTCh04wqbAH    growth annual    $1,188.00
price_1U5VK1Gqh5LFKuTCPdCT2UUa    scale  monthly   $329.00
price_1U5VKZGqh5LFKuTCpzLfXMNC    scale  annual    $3,588.00
```

**Before archiving each one, confirm its `lgq_catalog_version` metadata reads
`2026-08-15-preview`.** If any of them reads `2026-08-18-preview`, that is one of
the CURRENT Prices and archiving it would break a live plan — stop immediately,
archive nothing further, and report which id it was.

**These six must stay active. Do not archive them under any circumstances:**

```
price_1U5n8eGqh5LFKuTCh9KIQFws    price_1U5n8eGqh5LFKuTCTSUmI5CR
price_1U5n8eGqh5LFKuTCZKW7rINt    price_1U5n8fGqh5LFKuTCjJRhOzQ9
price_1U5n8fGqh5LFKuTCUBcPBlFY    price_1U5n8fGqh5LFKuTCOEm7ACLn
```

If Stripe refuses to archive any Price because something still references it, that
is a **finding, not an obstacle** — report the exact message and stop. It would mean
a live object depends on a Price we believe is unused, which is worth knowing before
anything else changes.

Archiving is reversible: a Price can be set active again if this turns out wrong.

## Report back, verbatim

1. For each of the six: its `lgq_catalog_version` before archiving, and its `active`
   value after.
2. Confirmation that the six current Prices are still `active: true` — list them.
3. Anything refused, with exact error text.
