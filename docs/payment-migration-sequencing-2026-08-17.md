# Payment backend migration sequencing

State of production as read on 2026-08-17. Every migration below is dark: none
creates a caller, route, scheduler, or network call, and every runtime gate stays
absent or OFF throughout. Applying them changes no behavior on its own.

## Where production actually is

| | |
|---|---|
| Project | `mfuvvtrkipkigwqqtcal` |
| History high-water | `20260816072239` `stripe_billing_subscription_projection_worker_20260816` |
| Local equivalent | `20260816070134_stripe_billing_subscription_projection_worker.sql` |
| Missing | **16** — one earlier hole plus a 15-file tail |

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

**Filling the hole out of timestamp order is safe.** It is purely additive:
`add column if not exists`, `create or replace function` on all five, and a
trigger and index that do not currently exist.

## Apply order

Staging first, in full, before production.

1. **`20260815224559`** — fill the hole.
2. **`20260816073000` → `20260816213000`** in timestamp order (13 files).
3. **`20260816220000`** — the adoption ledger. Independent of everything above:
   it touches only `public.accounts` and `public.payments`, both long present, so
   it may be applied at any point, including ahead of step 1.
4. **The `bf0df2cb` adopt-and-clear script** — requires step 3 only.
5. **`20260816221500`** — the foundation, **last**.

Step 5 must follow step 4. The foundation's preflight refuses to install while
any destination payment still carries a Checkout Session pointer. That refusal is
deliberate and was kept rather than amended: the four known pointers carry no
money, so clearing them is strictly better than teaching a fail-closed guard to
accept evidence.

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
that must be understood before overwriting it.

## After each step

```sql
-- Should be 4 before the cleanup script, 3 after, and 3 when the foundation runs.
select count(*) from public.payments
 where charge_model = 'destination' and stripe_checkout_session is not null;
```

The foundation will refuse at any non-zero count. That is the guard working, not
a failure to debug around.

## What must not happen

- Do not enable any gate. Every one stays absent or `0` through all of this.
- Do not apply `20260816221500` before the pointer cleanup; it will fail closed,
  correctly, and the fix is the cleanup rather than the migration.
- Do not reorder within step 2. The direct-checkout chain is cumulative.
- Do not resolve a numeric version gap by inventing a history row. The high-water
  divergence above means version numbers are not a reliable identity here.
