# Payment backend migration sequencing

State of production as read on 2026-08-17. No migration below creates a caller,
route, scheduler, or network call, and every runtime gate stays absent or OFF
throughout.

They are not, however, all inert. An earlier draft of this line claimed "applying
them changes no behavior on its own"; that is too strong. Six new triggers land on
the live `public.payments` (267 rows), plus triggers on `invoice_items` (262),
`invoices`, `billing_events`, `payment_plans` and `extra_stop_events`. Most refuse
only when `charge_model = 'direct'` and production is 267/267 `destination`, so
they are inert **by data, not by structure** — the first direct-charge payment
un-mutes several of them at once. Two are not gated at all: `20260816073000`'s
`reject_competing_open_invoice_payment` and `reject_direct_prepared_invoice_item_mutation`
both open with an unconditional `perform ... from public.invoices ... for update`
before any gate is consulted, establishing a new payments→invoices lock order on
the hottest write paths.

## Status — COMPLETE, 2026-08-17 (second session)

**All sixteen are applied to `mfuvvtrkipkigwqqtcal`, plus two new repair migrations.
Every one of the 17 gates is still absent or 0. Nothing is live.** The apply order
below is kept for the record; it is done.

| | |
|---|---|
| Applied this session | `20260815224559`, then `073000` `080000` `083000` `084500` `090000` `091500` `093000` `094500` `100000` `161844` `175955`, then `20260817120000`, then `194056` `213000` `221500`, then `20260817130000` |
| Already applied before it | `20260816220000` (adoption ledger) — **skipped, correctly; see below** |
| History rows | 39, high-water `20260817130000` — recorded by `20260817130000`, each gated on a catalogue probe |

`20260816194056` refused on the first attempt with `direct refund plan hold source
contract drifted`, which is how the line-ending problem below was found. It applied
cleanly once `20260817120000` had normalised the stored bodies — the refusal was the
guard working, not a defect.

Verified afterwards, read-only against the live catalogue:

| Check | Result |
|---|---|
| Destination Session pointers | **0** — the foundation's preflight passed on it |
| CRLF function bodies remaining | **0** of 156 public functions |
| `payments` rows | **267**, unchanged, still 100% `charge_model='destination'` |
| `billing_payment_operations` rows | 0 |
| `legacy_destination_checkout_operations` rows | 0 — the new ledger is empty, nothing live |
| `payments.current_checkout_operation_pk` | present (`161844`) |
| `payments.late_checkout_success_task_pk` | present (`194056`) |
| `classify_legacy_destination_checkout_event` | present (`221500`) |

One artifact legitimately disappeared: `billing_payment_operations_one_checkout_per_payment`,
created by `20260815224559`, is dropped by `20260816161844:357` and replaced with three
finer-grained unique indexes (`checkout_generation_unique`, `checkout_current_unique`,
`checkout_predecessor_unique`). The generation model supersedes one-checkout-per-payment.
That drop is also the statement the dependency audit falsely reports as a missing
prerequisite — see below.

Three corrections that mattered on the way:

1. **`20260816220000` was already applied and is not idempotent.** It is step 3 below
   and was counted in the "16". It opens with a bare `create table` — no
   `if not exists` — so re-running it aborts with `42P07 duplicate_table`. It also
   sits *above* the high-water this document records, which is how it was missed.
   The real count was 15, not 16.
2. **The destination-pointer count is 0, not 3.** See the corrected "After each
   step" section. All four pointers were cleared, not one.
3. **Line endings decided whether `194056` and `213000` could apply at all.** See
   "Line endings are load-bearing".

Three corrections that matter more than the rest:

1. **`20260816220000` is already applied and is not idempotent.** It is step 3 below
   and is counted in the "16". It opens with a bare `create table` — no
   `if not exists` — so re-running it aborts with `42P07 duplicate_table`. It also
   sits *above* the high-water this document records, which is how it was missed.
   Skip it. The real count from here was 15, not 16.
2. **The destination-pointer count is 0, not 3.** See the corrected "After each
   step" section. All four pointers were cleared, not one.
3. **Line endings decide whether `194056` and `213000` succeed.** This is new and
   it is the reason `194056` refused. See "Line endings are load-bearing".

## Line endings are load-bearing

`20260816194056` and `20260816213000` do not just create objects. They patch
**twenty-five** existing functions between them by reading
`pg_get_functiondef`, asserting a multi-line needle appears exactly once, and
replacing it. The assertion is exact text, so a CRLF needle cannot match an LF
body, and the migration refuses with `<name> source contract drifted` (`55000`).

`core.autocrlf` is true here, so a Windows checkout has CRLF on disk, and
`scripts/run-migration.mjs` used to send the file byte for byte — meaning the line
endings of whoever applied a *prerequisite* determined whether a *later* migration
could patch it. Production reached a genuinely mixed state: 59 of 124 `public`
function bodies stored CRLF, 65 stored LF. `20260816194056` refused on
`compute_direct_charge_refund_plan`, which came from the already-applied
`20260816050000` and is stored LF, while the eleven functions applied earlier in
this same session were stored CRLF. Normalising only the needle would have flipped
which half failed.

Two changes fix this properly:

- `scripts/run-migration.mjs` now normalises CRLF to LF at the read site. A fresh
  database is unaffected from here on.
- `migrations/20260817120000_normalise_function_body_line_endings.sql` repairs a
  database migrated before that fix. It refuses unless every CR is part of a CRLF
  pair (making the rewrite provably whitespace-only), rewrites the affected bodies
  in one transaction, and verifies zero remain before committing. It is a no-op on
  a fresh database and safe to re-run.

**It must be applied before `20260816194056`.** Its timestamp sorts after the
files it precedes in the apply order; that is deliberate, and the same
out-of-timestamp-order situation as `20260815224559`.

## Migration history is not written by the runner

`scripts/run-migration.mjs` records nothing in `supabase_migrations.schema_migrations`.
The only thing that had ever written a row was the bespoke
`scripts/prod-adopt-and-clean-destination-pointers.mjs` (lines 141-148), which does
it idempotently for its own version. So when the sequence landed, production's
history read `20260816220000` as its high-water while the schema was sixteen
migrations ahead of it.

**Resolved by `20260817130000_record_history_for_applied_migrations.sql`.** History
is now 39 rows with a high-water of `20260817130000`; 17 were inserted.

The distinction that makes this legitimate is worth keeping. "Do not resolve a
numeric version gap by inventing a history row" prohibits asserting a migration ran
when it did not. That migration does the opposite: **every row is gated on a
distinctive artifact of its own migration being present in the catalogue at the
moment it runs**, and the whole transaction refuses with `55000` if any probe fails.
`20260817120000` creates no object, so its probe is the absence it asserts — zero
CRLF function bodies. It records only what it can prove, is idempotent, and on a
database where these migrations did not run it refuses rather than lying.

Note this does not make the history table an authority. It never was: there is no
Supabase CLI in this environment, and `scripts/audit-migration-dependencies.mjs`
deliberately matches against the live catalogue because the numbering diverged. The
rows are documentation that now agrees with the catalogue, not a second source of
truth.

## Where production actually is

| | |
|---|---|
| Project | `mfuvvtrkipkigwqqtcal` |
| History high-water | `20260816220000` `legacy_destination_checkout_session_adoption_20260816` |
| Previously recorded here | `20260816072239` `stripe_billing_subscription_projection_worker_20260816` — stale; `220000` landed above it |
| Local equivalent of that older row | `20260816070134_stripe_billing_subscription_projection_worker.sql` |
| Missing when this was written | **16** — one earlier hole plus a 15-file tail |
| Actually missing once `220000` is excluded | **15** — and 12 of those are now applied; see Status above |

### The version numbers do not match, and that matters

Production's history records `20260816072239` for what is locally
`20260816070134`. The numbering schemes have diverged, so **anything of the form
"apply everything with a version greater than the high-water" is unsafe**.
Migrations have to be matched semantically, by name and by whether their schema
artifacts are actually present. Codex's read did this correctly; a naive numeric
diff would not have.

## The hole

`20260815224559_direct_checkout_operation_orchestration.sql` was never applied,
and its artifacts are genuinely absent rather than applied-without-a-history-row.
It adds `claim_token` and `submission_started_at` to
`public.billing_payment_operations`, five `one_off_direct_checkout` functions, one
trigger and one unique index.

Production applied migrations *after* it without failing, which tells us nothing
already installed depends on it. Three unapplied migrations do:

| Migration | Depends on |
|---|---|
| `20260816161844` direct checkout generation recovery | all five functions + `submission_started_at` |
| `20260816194056` late-success reconciliation | three functions + `submission_started_at` |
| `20260816213000` late-success operator resolution | `submission_started_at` |

`20260816221500` (the destination foundation) is downstream too, but indirectly:
its preflight reads `current_checkout_operation_pk`, which `20260816161844`
creates. Applied without it, the preflight fails with `42703 column does not
exist` rather than its intended domain error — a failure that reads like a broken
migration instead of a missing prerequisite.

Note the foundation also declares its *own* `submission_started_at`, on its own
`legacy_destination_checkout_operations` table. Same name, unrelated column; it is
not evidence of a dependency.

**Filling the hole out of timestamp order is safe here, but not because it is
purely additive.** An earlier draft of this section said it was, listing only
`add column if not exists`, `create or replace function` on all five, and a trigger
and index that do not currently exist. It also contains:

- a **data-dependent refusal** (lines 17-25): `raise exception 'existing direct
  Checkout operations require an explicit claim-token backfill'` if any
  `checkout_session.create` row sits in state `claimed`/`submitted` with a null
  `claim_token`;
- a **new CHECK constraint** `billing_payment_operations_checkout_claim_check`
  (lines 33-61), added with `alter table ... add constraint`, which validates
  against existing rows;
- a partial **unique index** on `(payment_id)`, also validated against existing rows;
- `revoke all on table public.billing_payment_operations from service_role` followed
  by `grant select` (lines 561-562).

All four were harmless on this database, but for reasons of current data rather
than of the migration: `billing_payment_operations` held **0 rows**, so the raise,
the constraint and the index were trivially satisfied; and `service_role` already
held exactly `SELECT` on that table, so the revoke/grant was a no-op rather than a
privilege change. Verified before applying. Any other database needs those four
checked first — in particular a single `claimed`/`submitted` row without a claim
token aborts step 1 with a message about a backfill this document never mentions.

## Apply order

~~Staging first, in full, before production.~~ **Staging was declined.**
`staging-db` is untouched and unused, and everything below went straight to
production. `main`'s own commit message records the same decision. Do not read the
rest of this document as assuming a staging rehearsal happened.

Steps 1-3 and step 4 are **done**; see Status above. The remaining order is
step 3½ → the rest of step 2 → step 5.

1. ~~**`20260815224559`**~~ — fill the hole. **Applied.**
2. **`20260816073000` → `20260816213000`** in timestamp order (13 files).
   `073000` through `175955` are **applied** (11 files). `194056` refused and
   `213000` was never reached.
3. ~~**`20260816220000`** — the adoption ledger.~~ **Already applied before this
   plan was written, and not idempotent — skip it.** It touches only
   `public.accounts` and `public.payments`, so it was never order-sensitive; the
   error was counting it as outstanding.
   - **3½. `20260817120000`** — normalise function body line endings. New, and
     required *before* `194056`. See "Line endings are load-bearing".
4. ~~**The `bf0df2cb` adopt-and-clear script**~~ — **done**, and it cleared all four
   pointers rather than only `bf0df2cb`'s. See below.
5. **`20260816221500`** — the foundation, **last**.

Step 5 must follow step 4. The foundation's preflight refuses to install while
any destination payment still carries a Checkout Session pointer. That refusal is
deliberate and was kept rather than amended: the four known pointers carry no
money, so clearing them is strictly better than teaching a fail-closed guard to
accept evidence.

## The four destination pointers, and what is actually established

Read-only against `acct_1TuCWJGqh5LFKuTC` on 2026-08-17.

| Payment | Status | Pointer | Provider result |
|---|---|---|---|
| `bf0df2cb` | `failed` | `cs_live_a1RKiUyk…` | exists, `expired`/`unpaid`, no PaymentIntent, **no sibling Sessions** |
| `ba7a6159` | `processing` | `cs_test_a1aSm45f…` | 404 |
| `665d872a` | `paid` | `cs_test_a1Z6lxQZ…` | 404, and its PaymentIntent 404s |
| `9e355543` | `paid` | `cs_test_a16LojIf…` | 404, and its PaymentIntent 404s |

Only `bf0df2cb` is genuine history on this platform, and nothing was ever
collected on it. It is the one the adopt-and-clear script covers, as
`inert_terminal`.

**The origin of the three test pointers is not established.** An earlier guess
that they came from the sandbox `acct_1TtDcKPqCWgR3Ww0` was inferred from Stripe
id substrings and does not survive checking: creating a Session on that sandbox
rejects their recorded destination `acct_1TtEtEPqTgY5Sbcb` with `No such
destination`, so that connected account does not exist there either. What is
established is only that they cannot be resolved or settled on the production
platform. Treat the provenance as unknown.

They cannot go through the adoption ledger, by design. Every provider fact that
RPC takes is `not null` and range-checked, and a 404 is the absence of provider
truth rather than a value; supplying invented values to satisfy the signature
would put a fabricated observation into an append-only audit table. Two of them
are unrepresentable twice over: `665d872a` and `9e355543` are `paid`, and
`inert_terminal` requires `failed`/`canceled` while `frozen_paid` asserts the
provider reported paid, which is exactly what cannot be observed.

So the three need their own reviewed decision, and it carries a data question:
production currently reports roughly $2,600 collected across the paid pair with
no provider evidence anywhere on this platform.

**Two corrections, both from reading the rows back afterwards.**

The clause "on rows that are not marked demo" is no longer true — and was already
false when written. `scripts/prod-clean-destination-pointers.sql` set
`test_marker = 'backfill-test-markers:demo job or seeded client'` on all three.
`test_marker` is now populated on 264 of 267 payments, and the only three unmarked
rows are `4b86f692` (requested, $100), `bf0df2cb` (failed, $125) and `ba1dcc4d`
(requested, $50). So **no unmarked row in production reads `paid` at all**: any
report that filters on `test_marker` now drops 100% of paid volume, and any report
that does not still shows $2,600 collected and $32.50 of platform fee earned
against Stripe objects that 404 on this platform. The money was not resolved; it
moved behind the marker.

The "$2,600 across the paid pair" arithmetic is right, but only two of the three
are `paid`: `665d872a` $2,500.00 and `9e355543` $100.00, both with `paid_at` set.
The third, `ba7a6159`, is `processing` at $2,500.00, so the trio's total exposure
is **$5,100.00**, not $2,600. Owner has since confirmed all amounts on this
database are demo figures and no real users exist yet, which settles the urgency
but not the reporting inconsistency above.

Also worth recording: only the *Checkout Session* pointers were cleared. Both paid
rows still carry a `stripe_payment_intent` (`pi_3TtG6J…` and `pi_3TtGM7…`), both
documented as 404 on this platform. The foundation's preflight only gates on
`stripe_checkout_session`, so this blocks nothing today — but any later worker that
keys off `stripe_payment_intent`, which is exactly the shape of the connected-payment
projection chain in the tail, will pick these rows up and get a 404.

## Provider contract verified against the live API

On 2026-08-17 the destination provider's exact create parameters were exercised
against Stripe in test mode at the pinned `2026-06-24.dahlia`, and the response
checked against what `inspectProviderSession` requires:

- `adaptive_pricing: { enabled: false }` is accepted and echoed back. This was
  the least certain parameter; presentment conversion staying off is what keeps a
  customer from being charged something other than the frozen gross.
- `payment_method_types` echoes back in the exact order sent, including the
  two-element ACH variant, which is what the index-wise comparison requires.
- `amount_subtotal` and `amount_total` are both populated and equal; the
  validator checks both against the frozen gross.
- `recovered_from` and `after_expiration` are both `null` on a fresh Session, and
  the validator rejects either being non-null.
- `expires_at` is echoed exactly, so the `expectedExpiresAt` equality check holds.
- `payment_intent` is `null` on a newly created Session. `inspectProviderSession`
  never reads it, so this is fine — worth recording because a validator that
  required it there would quarantine every Session the rail creates.

The unit fixture `sessionForContract` was compared field by field against that
capture and matches on everything the validator reads. That check exists because
the Price `currency_options` defect survived precisely by having a fixture assert
a shape Stripe never returns.

## Billing validators verified against a real test-clock subscription

Also 2026-08-17, at the same pinned version: a test clock, customer, saved card
and subscription on the real `solo` monthly Price, then the resulting invoice.
Both validators in `stripe-billing-subscription-events.ts` hold, and they hold for
a reason worth recording, because two fields have **moved** in this API version:

- `subscription.current_period_start` / `current_period_end` are **absent** from
  the subscription object. The periods live on the subscription item, and
  `normalizeSubscription` correctly reads `item?.current_period_*`. Code reading
  them off the subscription would silently get `undefined`.
- `invoice.subscription` is **absent** too. The link is
  `invoice.parent.subscription_details.subscription` with
  `parent.type === 'subscription_details'`, which is exactly what
  `normalizeInvoice` requires.

Everything else the validators demand was confirmed present in the real objects:
`automatic_tax.enabled === false` (as a populated object, not an absent one),
`application`, `application_fee_percent`, `on_behalf_of` and `transfer_data` all
present and null, `collection_method === 'charge_automatically'`, `currency` usd,
exactly one subscription item, and `price.product` as a plain product id.

Both were previously documentation-derived. They are now evidence-backed, and no
defect was found in either — unlike the two Price-validator defects, which is the
useful contrast: the same technique that found those confirms these.

All test-clock artifacts were deleted afterward; deleting the clock cascades to
the customer, subscription and invoice.

## The destination rail, proven against a real engine

`scripts/verify-destination-generation-contract.mjs` runs the foundation and its
RPCs against PostgreSQL 17 on a minimal stub. **Twenty-two** checks pass today
(`22/22`, and `verify-adoption-contract.mjs` is `20/20`). "Seventeen" was exact when
written — three later commits moved it: `e17d8060` added the three failure-side
checks (17→20), `69860e3f` added a null-`refunded_amount` check (→21), and `0253ace8`
replaced that one with two refund-scope checks (→22). Three of the checks were
previously reasoning rather than evidence:

- **The preflight fails closed.** With a destination Session pointer present the
  migration refuses to install, and refuses with `55000` — its intended domain
  error, not a syntax or missing-column failure that would look identical from
  outside. With the pointer cleared it installs. That is the ordering this
  document depends on.
- **The two-session race holds.** Two connections claiming the same payment
  concurrently: the second blocks on the payment row lock until the first
  commits, then returns `in_progress` rather than a second generation. One
  operation row, one generation, and the two provider idempotency keys distinct
  and suffixed `:ach` and `:card`. This is the claim that turns into a double
  charge if it is wrong.
- **A redelivery cannot settle twice.** The full lifecycle — claim, begin
  submission, complete, classify — marks the payment paid with both provider
  identities bound and the fee projected as dollars. Replaying the identical
  signed event returns `replay` with `projection_allowed = false`, and the
  payment remains settled exactly once.

### Which of those three are actually load-bearing

Each was mutation-tested by breaking the thing it is meant to catch, against a
scratch copy of the migration. The results are not uniform, and the difference
matters because these are the money-safety claims:

- **Preflight fails closed — REAL.** Deleting the arm that raises `55000` turned two
  checks red. Solid.
- **Two-session race — REAL, but carried by 2 of its 4 checks.** Removing only the
  payment-row `for update` aborts the run outright on a duplicate-key violation, so
  the unique constraints are an independent second line of defence — worth knowing.
  Removing the lock *and* the uniqueness backstops produced a true double-mint, and
  the two checks that caught it were "exactly one of two concurrent claims is
  granted" and "the race produced exactly one operation row, at one generation".
  The check named "the second concurrent claim blocks until the first commits"
  stayed **green** through that double-mint: `B` blocks on the write lock taken by
  the RPC's trailing `update public.payments set current_legacy_destination_checkout_operation_pk`,
  not on the read lock the check is meant to prove. Blocking is not a valid proxy
  for serialisation here.
- **A redelivery cannot settle twice — WEAKER THAN STATED, and this is the one to
  fix.** The check at `verify-destination-generation-contract.mjs:297` is a
  *disjunction*: `event_status === 'replay' || projection_allowed === false`. Flipping
  only `projection_allowed` to true left the suite fully green at `22/22`, printing
  `PASS ... {"status":"replay","allowed":true}`. The property this document asserts is
  the *conjunction*. And its companion check at `:301` counts
  `payments where id=$1 and status='paid'` — `id` is the primary key, so the result is
  0 or 1 by construction and it can **never** reveal a second settlement. A regression
  that keeps the `replay` label but lets `projection_allowed` become true, or that
  re-runs the settlement UPDATE and overwrites `paid_at` or re-binds a different
  PaymentIntent, ships with a green harness.

Two smaller gaps from the same pass: the idempotency-key check reads `rows[0]` with no
`rowCount === 1` assertion, so it silently inspects the first of however many operation
rows exist; and the preflight's *second* fail-closed arm (the
`current_checkout_operation_pk` cross-rail lineage guard) is never exercised, because
`reset()` leaves that column NULL in every fixture row — deleting that whole arm leaves
the suite at `22/22`.

None of this is a defect in the migrations, and none of it changed what was applied.
It was a defect in the *evidence*: the harness's headline replay claim was the one
property it did not robustly guard.

### Fixed, and the fixes are mutation-proven

All five are now applied to `verify-destination-generation-contract.mjs`, against a
throwaway PG17 rather than by inspection:

- `:297` `||` → `&&`, so a replay must be *both* labelled `replay` and refused
  projection. The real SQL satisfies both — it returns `{"status":"replay","allowed":false}`.
- `:301` no longer counts by primary key. It snapshots `status`, `paid_at`,
  `stripe_payment_intent`, `stripe_checkout_session` and `platform_fee` before the
  replay and asserts the row is untouched afterwards, which is what a second
  settlement would actually disturb.
- the idempotency-key check asserts `rowCount === 1`, so its label is true.
- a `reset({ withLineage: true })` variant seeds `current_checkout_operation_pk`, and
  two new checks exercise the preflight's second arm.
- the stub drops the invented `kind` default and every fixture insert names `kind`.

The suite went 22 → **24/24**. Then each repaired check was mutation-tested by
breaking exactly what it is meant to catch, with the repo copies untouched (a patched
harness reading the migration from `$MUT_FOUNDATION`, against mutated copies in a
scratchpad):

| Mutation | Before the fix | After |
|---|---|---|
| replay return yields `projection_allowed = true` | green 22/22 | **23/24 — red** |
| preflight lineage arm deleted entirely | green 22/22 | **22/24 — both red** |
| control, unmutated | 22/22 | 24/24 |

`verify-adoption-contract.mjs` is untouched and still `20/20`.

One thing deliberately **not** changed: neither stub declares `payments.job_id`,
`accounts.business_name` or `accounts.account_number`, all NOT NULL in production. Both
script headers disclose the minimalism — they declare only what these migrations read —
and adding a NOT NULL column whose FK target does not exist in the stub would be its
own kind of wrong. The `kind` default was different: a column the stub already declared,
declared *wrongly*, in the permissive direction.

Two naming subtleties, both of which cost a wrong first attempt:
`complete_legacy_destination_checkout_operation` completes the *provider create
call*, not the payment, so it only accepts an `open`/`unpaid` Session. And the
replay check compares the whole signed-event input including `observed_at`, so a
genuine redelivery must carry the original timestamp rather than a fresh one.

## Retracted: the `refunded_amount` guards were always fine

I reported that `v_payment.refunded_amount is distinct from 0` was a defect,
because it is true for null as well as for a non-zero amount and application
inserts never supply the column. That was wrong, and the correction is worth
keeping because of how it happened.

Production, read from the catalog on 2026-08-17:

| Column | Nullable | Default | Null rows |
|---|---|---|---:|
| `refunded_amount` | **NO** | `0` | 0 |
| `platform_fee_refunded` | **NO** | `0` | 0 |
| `eligible_service_refunded_amount` | YES | `0` | 0 |

With `refunded_amount` NOT NULL, `is distinct from 0` and a coalesced form are
identical, so the predicate was never reachable in the way I described. The
change has been reverted and the fifteen sibling guards across six migrations are
left exactly as written.

**The cause was my own stub.** It declared `refunded_amount` nullable when
production has it NOT NULL, so the harness could seed a state the database cannot
hold, and the "defect" was an artifact of the fixture rather than a property of
the migration. That is precisely the failure this document credits elsewhere for
letting the Price `currency_options` defect survive — a fixture asserting a shape
reality never produces — arrived at from the opposite direction. A stub that is
wrong permissively invents defects; one that is wrong strictly hides them.

Both harness stubs now mirror the real definitions — enums, nullability,
and the relevant CHECK constraints — and both suites pass against them. **Defaults
are the one exception, and it is the same permissive direction this section exists to
warn about:** the generation stub declares
`kind public.payment_kind not null default 'deposit'`
(`verify-destination-generation-contract.mjs:84`) while production has `kind` NOT NULL
with **no default**. `reset()` therefore inserts a payment without naming `kind` and
succeeds against the stub; the identical INSERT against production raises `23502`.
Enums match exactly for `payment_status` and `payment_kind` (labels and order), and
nullability is correct on every column either stub declares, including all three
refund columns the retraction below turns on.

Relatedly, neither stub is production-legal for inserts: `payments.job_id` (uuid NOT
NULL, no default), `accounts.business_name` and `accounts.account_number` exist in
production and in neither stub. Both script headers disclose the minimalism
deliberately, which is fine — but "mirrors the real definitions" needs that
qualifier, because the moment a check's subject is the *shape of a payment row*
rather than the behaviour of an RPC, it is being validated against a fixture
production cannot produce. That is precisely how the retracted `refunded_amount`
defect was manufactured.
The refund scope check is exercised in both directions instead: a payment at the
default refund state claims, and a partially refunded one is refused.

One residual, narrower than the original claim:
`eligible_service_refunded_amount` **is** nullable, and its CHECK explicitly
permits null. Nothing writes null to it today, and no row currently holds one, so
the guards reading it are safe in practice — but unlike the other two that is a
property of current behavior rather than of the schema.

## Confirmed independently: the skipped migration really is missing

The same catalog read shows production has neither `claim_token` nor
`submission_started_at` on `billing_payment_operations`, and lacks
`billing_payment_operations_one_checkout_per_payment`. Those are exactly the
artifacts `20260815224559` installs, so the hole documented above is confirmed
from the database side and not only from migration history.

## Before starting: check for drift

`20260815224559` uses `create or replace function` throughout, which will
silently overwrite a hand-patched function body. Given production has
selectively-applied history, hand-patching is not unthinkable. Before applying,
compare the live bodies against the migration:

```sql
select p.proname, md5(pg_get_functiondef(p.oid)) as body_md5
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in (
     'begin_one_off_direct_checkout_submission',
     'claim_one_off_direct_checkout_operation',
     'complete_one_off_direct_checkout_operation',
     'mark_one_off_direct_checkout_indeterminate',
     'protect_direct_checkout_session_identity'
   )
 order by p.proname;
```

Zero rows is the expected and clean result — it confirms the artifacts really are
absent. Any row means something installed those functions by another route, and
that must be understood before overwriting it. It returned zero rows on 2026-08-17,
checked again immediately before applying.

**This check is too narrow, and that is what let `194056` fail.** It covers five
functions and only asks whether they exist. `20260816194056` and `20260816213000`
rewrite twenty-five functions between them by exact source match, so for those the
relevant question is not "does it exist" but "is its stored body byte-identical to
what the patch expects" — which includes line endings. See "Line endings are
load-bearing". A drift check for those two migrations has to compare bodies, not
merely count rows.

## What the dependency audit does and does not prove

`node scripts/audit-migration-dependencies.mjs` reports `16/16` clean against the
live catalogue, and it locates the env file itself (it falls back to
`C:/dev/CLAUDE CODE FOLDER/.env.local`), so it needs no arguments. Its green result
is worth having but is narrower than it reads, and the documented mutation test does
not demonstrate what it appears to.

- `--without=20260815224559` does go red, but for the **wrong reason**: it flags a
  missing `billing_payment_operations_one_checkout_per_payment`, whose only
  reference in `20260816161844` is a `drop index if exists` — a statement that
  cannot fail. The two statements that genuinely abort without `224559` are that
  same file's bare `drop function complete_one_off_direct_checkout_operation(...)`
  and `drop function claim_one_off_direct_checkout_operation(...)`, and the audit
  reports both **clean**, because it computes each file's created-object set over
  the whole text with no statement ordering, so a file that drops and re-creates a
  name self-satisfies.
- It is not simply always-red: `--without=` on `220000`, `073000` and `161844` all
  return clean.
- It cannot see column-level or ordering dependencies at all — it matches only
  `public.<name>` — so the one indirect edge this document calls out by name
  (`221500`'s preflight reading `current_checkout_operation_pk`, added by `161844`)
  is invisible to it. Dropping `161844` leaves the audit fully green.

Treat a clean run as "no missing *object* in this order", which is what its own
final line says, and not as validation of the dependency graph above.

## Running the migrations at all

`.env.local` is **not** in this worktree; it lives in the sibling repo
`C:\dev\CLAUDE CODE FOLDER`. `scripts/run-migration.mjs` looks for `.env.local`
beside itself and will report `DATABASE_URL is not set`, so supply it from the
environment:

```powershell
$f="c:\dev\CLAUDE CODE FOLDER\.env.local"
$l=(Get-Content $f | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1)
$env:DATABASE_URL=$l.Substring($l.IndexOf('=')+1).Trim().Trim('"').Trim("'")
node scripts/run-migration.mjs <file>          # --check connects and runs nothing
```

The runner sets `lock_timeout = 5s` and `statement_timeout = 60s` and adds no
transaction of its own, because every file here supplies its own `begin`/`commit`.
Every migration applied this session took under 300ms.

`next build` has the same problem from the same cause, and it is worth knowing
before anyone reads a red build as a regression. Without the sibling `.env.local`
loaded it fails at the export step on `/demo/sites`, `/features`, `/field/offline`
and `/login` with "Check your Supabase project's API settings" — four pages that
prerender against Supabase. The stack trace unhelpfully cites `next` internals under
an unrelated `C:\Users\brett\Documents\Codex\...` path, which reads like a corrupt
install and is not one. Load every variable from the sibling `.env.local` into the
environment first and the build is clean. Verified this session: typecheck clean,
lint clean (pre-existing `<img>` warnings only), 419 test files / 7630 tests green,
`next build` green.

## After each step

```sql
-- Must be 0 before the foundation runs. It is 0 now.
select count(*) from public.payments
 where charge_model = 'destination' and stripe_checkout_session is not null;
```

The foundation will refuse at any non-zero count. That is the guard working, not
a failure to debug around.

**Correction.** This comment previously read "Should be 4 before the cleanup
script, 3 after, and 3 when the foundation runs." That contradicted the sentence
directly above it, and 3 was never a valid pre-foundation state: `20260816221500`
counts *pointers*, not *unadopted* pointers — it never calls
`legacy_destination_checkout_unadopted_pointer_count` — so recording an adoption
does not satisfy the preflight. Only nulling the pointer does. Anyone who trusted
the old comment would have applied the foundation at a count of 3, taken the
`55000` refusal, and then had no way to tell an intended guard from a defect.

The real count is **0**, confirmed three ways: the query above, the unadopted-count
helper, and a count of every `payments` row with any `stripe_checkout_session`. The
cleanup cleared all four pointers, not one — `scripts/prod-clean-destination-pointers.sql`,
a script this document did not previously reference, handled the three test ones
alongside `bf0df2cb`'s adoption.

## What must not happen

- Do not enable any gate. Every one stays absent or `0` through all of this.
- **Do not enable `LGQ_LEGACY_DESTINATION_CHECKOUT_PROJECTION_ENABLED` at all yet,
  in either order, with or without a drain.** The ordering advice elsewhere (generation
  first, drain, then projection) is necessary but not sufficient: the classifier that
  is supposed to take over settlement,
  `classifyLegacyDestinationCheckoutSignedEvent`, has **no production caller** —
  grep returns its definition and its unit test only. Meanwhile the gate stands the
  route's three write sites down unconditionally. Today it is a kill switch, not a
  switch: every destination payment would stop being settled or failed locally, with
  no write, no SMS, no job-feed event, no invoice reconciliation, no throw, no log,
  and a `200` back to Stripe. It becomes safe only once the webhook wiring slice
  lands and the classifier is actually called.
- Do not re-apply `20260816220000`. It is already applied and its bare
  `create table` aborts with `42P07`.
- Do not apply `20260816194056` or `20260816213000` before `20260817120000`. They
  will refuse with `<name> source contract drifted`, and that refusal is correct.
- **Do not answer a `source contract drifted` refusal by editing the needle or
  deleting the assertion.** The guard exists so a patch cannot silently rewrite a
  function whose shape changed. Fix the line endings — the read site — instead.
  Same rule as the CRLF test-assertion trap in this repo.
- Do not apply `20260816221500` before the pointer cleanup; it will fail closed,
  correctly, and the fix is the cleanup rather than the migration.
- Do not reorder within step 2. The direct-checkout chain is cumulative.
- Do not resolve a numeric version gap by inventing a history row. The high-water
  divergence above means version numbers are not a reliable identity here. Writing a
  row for a migration that genuinely ran is a different thing and is not prohibited;
  see "Migration history is not written by the runner".
