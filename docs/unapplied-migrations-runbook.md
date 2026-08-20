# Unapplied migrations

**Run `npm run audit:applied -- --unapplied` for the current answer. Do not
trust this file's list on a later date — trust the audit.** A previous version
of this document said four migrations were outstanding when nine were, and the
apply run that discovered it stopped four files past the actual gap.

## Outstanding as of 2026-08-20

All three are money correctness, none is urgent, and each must land before a
specific thing is sold.

> **STALE, in part. Verified against production 2026-08-20.**
> `20260820120000` **IS APPLIED** — `voice_call_admissions.overage_key` exists and
> so does `settle_usage_overage()`. A column is created once, so that is
> dispositive. This file said otherwise and a code review took it at its word and
> filed a blocker that was not real.
> `20260820100000` and `20260820110000` are `create or replace` / text patches, so
> their applied state cannot be settled by asking whether an object exists; it was
> NOT re-verified here and this table should not be trusted for them either.
> **Ask the database, not this file.** `npm run audit:applied -- --unapplied`, or
> read `pg_get_functiondef` and look for the changed text. A migration runbook
> goes stale the moment somebody applies one, which is exactly what happened.

| Migration | What it fixes | Must precede |
|---|---|---|
| `20260820100000_scale_gets_the_allowance_it_is_sold.sql` | both grant tables spell Scale's monthly allowance as Growth's — half, on all four resources | selling **Scale** |
| `20260820110000_voice_allowance_survives_a_moved_period.sql` | a moved billing boundary grants a second month of voice minutes free | any **AI Voice** launch |
| `20260820120000_settle_a_voice_overage_for_what_was_used.sql` | an overage-admitted call is charged the full 60-minute cap and nothing trues it down, so a 20-second wrong number costs $21 | any **AI Voice** launch |

Filename order. `120000` needs `20260819290000` (already applied) for the accrual
event table; the other two are independent.

```
npm run test:pg17:scale-allowance    # 12/12
npm run test:pg17:voice-allowance    # 34/34
npm run test:pg17:overage-idempotency # 71/71, covers the settle path
npm run audit:applied -- --unapplied # before and after
```

The nine outstanding on the morning of 2026-08-20 are all applied.

## Why the audit exists, and what the other one does not do

`scripts/audit-migration-dependencies.mjs` reported a clean 62/62 the same
morning nine migrations were missing. It is an **ordering** audit: it checks that
every object a migration references either exists already *or is created by an
earlier migration in the sequence*. It assumes the whole sequence gets applied,
so it is silent about a database missing that sequence's foundation.

`scripts/audit-applied-migrations.mjs` asks the other question — what is actually
live — by comparing installed tables, functions, and function bodies against the
files. It exits non-zero on a gap and reports "undetermined" rather than guessing
for migrations it cannot judge. **Undetermined is not applied.**

## Things learned the expensive way

**A written list of outstanding migrations goes stale silently.** Run the audit.

**Two migrations restating the same function fail silently out of order.**
`20260819290000` and `20260819310000` both restate `authorize_usage_overage` in
full. Applied out of order, the earlier one overwrites the later one's fix and
nothing raises. After any apply run, verify the *content*:

```sql
select strpos(prosrc, 'a.period_end > p_period_start') > 0 as overlap_ok,
       strpos(prosrc, 'a.period_start = p_period_start') = 0 as equality_gone
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'authorize_usage_overage';
```

**The pg17 harnesses do not protect against unapplied dependencies.** Each builds
its own fixture tables rather than applying the migrations that create them, so
they prove a migration works *given* its dependencies, never that production has
them.

**A post-condition can pass against a comment.** `20260819280000` asserted the
refund gate by searching `plan_direct_charge_refund_operation` for
`reconciliation_status` — the wrong function, since the gate lives in
`compute_direct_charge_refund_plan` — and its harness stub satisfied it with the
word sitting in a comment. Assert the whole expression, not a column name every
refund path writes anyway.

**"Payments are live" is not "this code path is reachable."** Two migrations were
called live money bugs on the strength of payments having gone live. Both are
scoped to `charge_model = 'direct'`, and production has none — the direct-charge
rail is built with no entry point in the app. Check before calling anything on
that rail urgent:

```sql
select charge_model, count(*) from public.payments group by 1;
```
