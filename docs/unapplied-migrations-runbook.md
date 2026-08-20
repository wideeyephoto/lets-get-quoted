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

## Which of these are live money bugs

Payments went live 2026-08-17, so these two are real exposure now, not
hypothetical:

- **`20260819270000`** — a `full_combined` refund after a partial hands the wrong
  Application Fee to Stripe. Stripe prorates its refund against the *charge*
  while LGQ's fee is a percentage of the *eligible subtotal*, so the two
  disagree and LGQ keeps or loses money it should not.
- **`20260819280000`** — the refund gate requires `reconciliation_status =
  'reconciled'`, every refund sets it to `pending`, and nothing else has ever
  written `reconciled` after the original checkout projection. So **the first
  refund on a payment permanently blocks every later one.**

These two should go first if the run has to be split.

**Not** currently at risk: `20260819250000`. A purchased office seat grants no
capacity in production, but `office_user` is in `TOP_UPS_WITHHELD`, so nobody
can buy one. It must be applied before that SKU is ever unwithheld.

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
