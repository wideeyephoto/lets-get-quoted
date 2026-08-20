# Unapplied migrations — the real list, and why the last count was wrong

**Corrected 2026-08-20.** An earlier version of this file said four migrations
were outstanding. Nine are. The apply run that discovered this stopped at the
second file with a PL/pgSQL compile error about a missing relation, four
migrations away from the actual gap.

Run `npm run audit:applied` for the current answer. Do not trust this list on a
later date — trust the audit.

## Why nobody knew

`scripts/audit-migration-dependencies.mjs` reported a clean 62/62 the same
morning. It is an **ordering** audit: it checks that every object a migration
references either exists already *or is created by an earlier migration in the
sequence*. It assumes the whole sequence gets applied, so it is silent about a
database where the foundation of that sequence was never run.

`scripts/audit-applied-migrations.mjs` (new) answers the other question — what is
actually live — by comparing installed tables, functions, and function bodies
against the files.

## The nine, in filename order

Filename order satisfies every dependency. There is no reordering to do.

| Migration | What is missing in production |
|---|---|
| `20260819080000_usage_overage_authorization.sql` | the entire overage foundation: `workspace_overage_settings`, `workspace_overage_accruals`, `workspace_overage_authorizations`, and both overage functions |
| `20260819230000_remove_office_user.sql` | `remove_office_user` does not exist |
| `20260819240000_office_invitation_crew_conflict.sql` | `create_office_invitation` still has the pre-fix body |
| `20260819250000_office_seat_limit_includes_purchased_capacity.sql` | `office_seat_usage` still ignores purchased capacity |
| `20260819270000_refund_mode_after_partial.sql` | `compute_direct_charge_refund_plan` has no `when v_gross_before = 0` branch |
| `20260819280000_refund_reconciliation.sql` | `reconcile_direct_payment` and `direct_payments_pending_reconciliation` do not exist |
| `20260819290000_overage_accrual_idempotency.sql` | `workspace_overage_accrual_events` |
| `20260819300000_release_respects_settled_period.sql` | depends on 080000 and 290000 |
| `20260819310000_cap_counts_overlapping_periods.sql` | depends on 290000 |

`20260819260000_overage_settlement.sql` **is applied** (2026-08-20). Its
`close_overage_period` reads `workspace_overage_accruals`, which does not exist
yet, so it would fail if called. Nothing calls it. Applying 080000 resolves that.

## Which of these are money bugs, and which are actually firing

**Corrected 2026-08-20.** An earlier version of this section called the two
below "live money bugs" and said payments have been live since 2026-08-17.
Both mechanisms are real, but neither can fire today, and calling them live
overstated the urgency.

Both are scoped to `charge_model = 'direct'`
(`20260819280000` line 62 and line 100; `20260819270000` patches
`compute_direct_charge_refund_plan`). Production holds **four payments, all
`destination`, and zero `direct`** — the direct-charge Connect rail is fully
built and has no entry point in the app, so nothing can create one.

They are preconditions for turning that rail on, not active bleeding. Apply them
in the same run regardless; just do not treat them as an emergency. Re-check
with:

```sql
select charge_model, count(*) from public.payments group by 1;
```

What each would do once direct charges exist:

- **`20260819270000`** — a `full_combined` refund after a partial hands the wrong
  Application Fee to Stripe. Stripe prorates its refund against the *charge*
  while LGQ's fee is a percentage of the *eligible subtotal*, so the two
  disagree and LGQ keeps or loses money it should not.
- **`20260819280000`** — the refund gate requires `reconciliation_status =
  'reconciled'`, every refund sets it to `pending`, and nothing else has ever
  written `reconciled` after the original checkout projection. So **the first
  refund on a payment permanently blocks every later one.**

Both must land before the direct-charge rail is activated.

`20260819250000` is the same shape: `office_seat_usage` ignores purchased
capacity, so a $15/month office seat grants nothing — but `office_user` is in
`TOP_UPS_WITHHELD` and cannot be bought. Apply before that SKU is unwithheld.

**The one with a real deadline is `20260819230000`.** `remove_office_user` does
not exist, and the Team tab's Remove button calls it. That button ships with the
next deploy of this branch, so this migration must land before or with it.

## Order dependencies worth knowing

- **080000 before 290000/300000/310000.** `authorize_usage_overage` declares
  `%rowtype` against the overage tables, and `%rowtype` resolves at function
  *compile* time — so the file cannot even be created without them. 290000 now
  opens with a precondition that says this in one line instead.
- **290000 before 310000.** Both restate `authorize_usage_overage` in full. Out
  of order, 290000 overwrites 310000's body and silently undoes the cap fix.
  Nothing raises.
- **260000 before 300000.** Already satisfied — 260000 is applied.

## Verifying before and after

```
npm run audit:applied                    # what is live, with the gaps named
npm run audit:applied -- --unapplied     # only the gaps
npm run test:pg17:overage-settlement     # 54/54
npm run test:pg17:overage-idempotency    # 51/51, applies four in order
```

The `test:pg17:*` harnesses spin up their own PostgreSQL 17 and touch nothing
real. Note what they did **not** catch here: each builds its own fixture tables
rather than applying the migrations that create them, so they prove a migration
works *given* its dependencies, never that production has them. That is what the
audit is for.

## After applying

Nothing to switch on. `LGQ_USAGE_OVERAGE_ENABLED` stays `0` until there is an
invoicer, and the invoicer is deliberately not built. Applying 280000 does make
`LGQ_REFUND_RECONCILIATION_ENABLED` meaningful — that flag can be turned on once
the migration is live, and until then its cron route returns 404.
