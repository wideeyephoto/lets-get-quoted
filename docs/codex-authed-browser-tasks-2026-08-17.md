# Codex browser tasks — the three things a session key cannot do

Written 2026-08-17, after all sixteen payment migrations landed. Everything in the
database is done. What remains is entirely on Stripe and Vercel, and it is blocked on
**credentials, not permission**: the local `STRIPE_SECRET_KEY` is a *test* key on the
sandbox `acct_1TtDcKPqCWgR3Ww0`, so live reads through it return empty and live writes
are impossible. An authenticated browser on the Stripe and Vercel dashboards is the
shortest path.

## Two accounts, and they are easy to confuse

| | |
|---|---|
| `acct_1TuCWJGqh5LFKuTC` | **production platform.** Everything below belongs here. |
| `acct_1TtDcKPqCWgR3Ww0` | sandbox. The 6 existing Prices are here and are **unusable** for production. The Stripe CLI is paired here. |

Before doing anything, confirm the Dashboard account switcher shows
`acct_1TuCWJGqh5LFKuTC` **and** that you are in **live mode**, not test mode. Prices
created in test mode look identical and will fail the binding with
`price_contract_mismatch` on `livemode`.

## Hard rules

- **Do not enable any feature gate**, in Vercel or anywhere else. All 17 stay absent
  or `0`. In particular do **not** set
  `LGQ_LEGACY_DESTINATION_CHECKOUT_PROJECTION_ENABLED` — the classifier it hands
  settlement to has no production caller yet, so today it is a kill switch, not a
  switch.
- **Do not rotate or regenerate the webhook signing secret.** Endpoint
  `we_1TuE0BGqh5LFKuTCEyt5d4jh` was corrected in place on 2026-08-17 specifically so
  the secret survived.
- **Do not modify or delete anything on the sandbox account.**
- **Do not delete or archive any existing live object.** Everything here is additive.
- If a Price comes out wrong, **create a new one** — see the immutability note below.

---

## Task 1 — create 6 live Prices on `acct_1TuCWJGqh5LFKuTC`

The app verifies these against a strict contract in
[`src/lib/billing/stripe-plan-prices.ts`](../src/lib/billing/stripe-plan-prices.ts)
(`validatePrice`, ~line 252). Miss any single field and the whole binding fails with
`price_contract_mismatch`. The module is read-only and creates nothing, so every field
below has to be right at creation time.

### The six

Amounts come from `BILLING_PLANS` in `src/lib/billing/catalog.ts` and are exact, in
cents:

| Env var | Plan | Interval | `unit_amount` | Human |
|---|---|---|---|---|
| `STRIPE_PRICE_SOLO_MONTHLY` | solo | month | `3900` | $39.00 / month |
| `STRIPE_PRICE_SOLO_ANNUAL` | solo | year | `42000` | $420.00 / year |
| `STRIPE_PRICE_GROWTH_MONTHLY` | growth | month | `12900` | $129.00 / month |
| `STRIPE_PRICE_GROWTH_ANNUAL` | growth | year | `118800` | $1,188.00 / year |
| `STRIPE_PRICE_SCALE_MONTHLY` | scale | month | `32900` | $329.00 / month |
| `STRIPE_PRICE_SCALE_ANNUAL` | scale | year | `358800` | $3,588.00 / year |

The annual prices are a **single yearly charge**, not a monthly price billed annually:
`recurring.interval = year`, `interval_count = 1`.

Product structure is not constrained — the validator only requires `product` to be a
plain `prod_…` id. Three products (Solo, Growth, Scale) with a monthly and an annual
Price each is the tidiest.

### Every field the validator checks

Recurring, standard, per-unit, USD, tax-exclusive, no trial, no tiers, no metering:

| Field | Required value |
|---|---|
| `active` | `true` |
| `livemode` | `true` |
| `currency` | `usd` |
| `type` | `recurring` |
| `billing_scheme` | `per_unit` |
| `unit_amount` | exactly as tabled above |
| `tax_behavior` | **`exclusive`** |
| `custom_unit_amount` | null — no "customer chooses" |
| `tiers_mode` | null — no tiered/volume/graduated pricing |
| `transform_quantity` | null |
| `recurring.interval` | `month` or `year` per the table |
| `recurring.interval_count` | `1` |
| `recurring.usage_type` | `licensed` — **not** metered/usage-based |
| `recurring.meter` | null |
| `recurring.trial_period_days` | null — no trial on the Price |
| `product` | a plain `prod_…` id matching `^prod_[A-Za-z0-9]{8,}$` |

### Metadata — four keys, exact

Set on the **Price**, not the Product. Extra keys are tolerated; these four must match
character for character:

| Key | Value |
|---|---|
| `lgq_price_purpose` | `base_plan` |
| `lgq_plan_code` | `solo` \| `growth` \| `scale` |
| `lgq_billing_interval` | `monthly` \| `annual` |
| `lgq_catalog_version` | `2026-08-15-preview` |

**The footgun:** `lgq_billing_interval` is `monthly`/`annual`. That is *not* the same
vocabulary as `recurring.interval`, which is `month`/`year`. A Price can be perfectly
correct on the Stripe side and still fail the binding because its metadata says
`month`. If `PRICING_CATALOG_VERSION` in `src/lib/billing/catalog.ts` has moved since
this was written, use whatever it says now — the validator reads it live.

### Three Dashboard-specific traps

1. **Do not add a second currency.** The Dashboard offers multi-currency pricing.
   `hasNoAlternateCurrencyOptions` (~line 225) requires `currency_options` to contain
   **exactly one** key, `usd`, whose `unit_amount` and `tax_behavior` restate the
   Price's own. Any additional currency fails the binding. The reason is not
   cosmetic: it stops Checkout localizing a verified binding to an unverified amount.
2. **`tax_behavior` is immutable once set.** The Dashboard often defaults it to
   *unspecified*, which fails. If a Price is created with the wrong tax behavior it
   cannot be edited — create a replacement Price and use the new id.
3. **All six ids must be distinct.** `readBindingConfig` (~line 172) rejects a
   duplicate across bindings with `configuration_invalid`. Do not point two env vars
   at one Price.

---

## Task 2 — verify the live webhook endpoint (read-only)

This is the one claim from the 2026-08-17 work that **could not be verified locally**,
because reading a live endpoint needs a live key. Everything code-side already checks
out; only the live side is unconfirmed.

Open endpoint `we_1TuE0BGqh5LFKuTCEyt5d4jh` on `acct_1TuCWJGqh5LFKuTC` — its URL is
`https://letsgetquoted.com/api/stripe/webhook` — and confirm it subscribes to
**exactly these 11 events**, no more and no fewer (verbatim from
`REQUIRED_LIVE_WEBHOOK_EVENTS`):

```
account.updated
charge.dispute.closed
charge.dispute.created
charge.failed
charge.refunded
checkout.session.async_payment_failed
checkout.session.async_payment_succeeded
checkout.session.completed
checkout.session.expired
payment_intent.payment_failed
payment_intent.succeeded
```

If you find only seven, compare against
`LIVE_WEBHOOK_EVENTS_BEFORE_2026_08_17_FIX` in the same module (~line 60) — that is
the exact pre-fix subscription, and a match against it means the 2026-08-17 correction
was reverted rather than something new going wrong.

The authoritative list is `REQUIRED_LIVE_WEBHOOK_EVENTS` in
[`src/lib/billing/stripe-webhook-subscription.ts`](../src/lib/billing/stripe-webhook-subscription.ts)
(~line 16); read it from source rather than trusting this copy. A test derives the
route's dispatch table by regex and asserts equality in both directions, so the code
side is pinned — this task is only about whether the live endpoint agrees.

Four of these were added on 2026-08-17 (`async_payment_succeeded`,
`async_payment_failed`, `payment_intent.succeeded`, `charge.dispute.closed`) and were
dead handlers before that. The first two are the only paths that settle an ACH
payment. **Report what you find; change nothing** — if it drifted, that is a decision,
not a fix, because editing the subscription risks the signing secret.

Also confirm `url`, `api_version` and `status` are unchanged. The pinned API version
elsewhere in the app is `2026-06-24.dahlia`.

---

## Task 3 — add the environment variables in Vercel

Only after Task 1 produces six real `price_…` ids.

| Variable | Value |
|---|---|
| `STRIPE_PRICE_SOLO_MONTHLY` … `STRIPE_PRICE_SCALE_ANNUAL` | the six ids from Task 1 |
| `LGQ_STRIPE_BILLING_LIVEMODE` | `1` |

`LGQ_STRIPE_BILLING_LIVEMODE` accepts **only** the literal `1` or `0`. Anything else —
`true`, `yes`, empty — fails with `configuration_invalid` (`expectedLivemode`, ~line
158).

It must also **agree with the secret key's own mode**. `STRIPE_SECRET_KEY` is parsed
as `^(sk|rk)_(test|live)_…`; a live key with `LGQ_STRIPE_BILLING_LIVEMODE=0`, or a
test key with `1`, fails with `credential_mode_mismatch`. So setting this to `1`
requires the environment it applies to already to carry a **live** `sk_live_…` or
`rk_live_…` key. Check what is actually in that Vercel environment before setting it,
and if it is still a test key, stop and report rather than pairing them wrong.

Note `rk_live_` is accepted, so a **restricted** live key is a legitimate choice here;
this module needs only read access to Prices.

**No gate variables. None.** Adding these six plus the livemode flag changes no
behavior on its own — every consumer is still gated off.

---

## When you are done

Report back with:

1. The six `price_…` ids, mapped to their env vars.
2. The `prod_…` ids you created, and whether you used three products or six.
3. A field-by-field confirmation for **one** Price against the table above — including
   the expanded `currency_options` showing a single `usd` entry — as evidence the
   pattern is right, since all six were made the same way.
4. The webhook endpoint's actual subscribed event list, verbatim.
5. Whether the target Vercel environment already had a live Stripe key.

Do not attempt to exercise the subscription flow to "test" the Prices. It is gated
off, and turning a gate on to check a Price is exactly the failure mode the whole
sequence has been designed to avoid.
