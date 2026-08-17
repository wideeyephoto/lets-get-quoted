# Reviewed dry run: `scripts/remove-demo-data.mjs` — 2026-08-17

Read-only review against production, ahead of the first real contractor. Every
query below ran under `set default_transaction_read_only = on`, using the
script's own match predicates copied verbatim so this cannot report on a
different match than the one that would delete.

**Original verdict: do not run it as-is on any account.** Not because it deletes
too much. It deletes too little, and the arm that does fire silently damages data
it is supposed to preserve.

**Status: patched the same day.** All five items under "What the script needed"
are done, and `--rehearse` is clean on all five accounts — 264 of 264 seeded
payments removed, 0 unmarked payments touched, 0 survivors orphaned. The findings
below are kept as written, because they are the reasoning the patch rests on.
Nothing has been run with `--apply`.

## The shape of the account fleet

The script takes `--account` and never defaults, so it has to be run once per
account. Five accounts hold jobs or payments:

| account | payments | jobs | of those `J-DEMO-` | clients | crew |
| --- | --- | --- | --- | --- | --- |
| `831ab32c` My Business | 157 | 248 | **0** | 203 | 5 |
| `5676eb6a` My Business | 67 | 105 | **0** | 59 | 8 |
| `d3202ae8` Fences and Friends | 38 | 93 | 85 | 125 | 4 |
| `c63293b4` BIGFATPIPEGUYS | 6 | 40 | **0** | 43 | 11 |
| `c7632694` All is Bright Lighting | 0 | 1 | **0** | 2 | 0 |

Only one account has any `J-DEMO-` jobs at all. On the other four the entire
job-and-payment arm of the sweep is a no-op.

## 1. It reaches 32 of 264 demo payments

Nothing in the script matches payments. They are removed only as a cascade of
`delete from jobs where ref like 'J-DEMO-%'` (`payments.job_id` is ON DELETE
CASCADE). `payments.test_marker` — the column that actually identifies seeded
payments — is never consulted.

| | rows | amount |
| --- | --- | --- |
| demo-marked, on a `J-DEMO-` job → deleted | 32 | $105,375.00 |
| demo-marked, on a `J-1xxx` job → **survives** | **232** | **$76,150.00** |
| unmarked, on a real job → survives | 4 | $275.50 |
| unmarked but on a `J-DEMO-` job (over-broad) | 0 | — |

So the match is precise — it would delete nothing unmarked — and 88% blind. The
232 survivors are spread across all four transacting accounts, 171 of them with
status `paid`, and **none of them has a Stripe session**. They are database
fabrications, so this is fake revenue in reports rather than any drift against
Stripe. `test_marker` is uniform on all 264: `backfill-test-markers:demo job or
seeded client`.

## 2. The obvious fix would destroy the only real Stripe history

Payment `6e2e7689` — the live $0.50 capture and refund, on a `cs_live_` Session —
survives today, because its job ref is `J-1038` and the predicate wants
`J-DEMO-`.

But **job `J-1038` is itself marked demo** (`backfill-test-markers:demo job or
seeded client`), and its client is a seeded `@example.com` contact. So the
natural repair for finding 1 — widening the job predicate from
`ref like 'J-DEMO-%'` to `test_marker is not null` — deletes `J-1038` and
cascades the real payment away with it.

Any widening therefore needs an explicit carve-out. Prefer excluding *any job
that holds an unmarked payment* over hardcoding a UUID: that protects
`6e2e7689` by construction and protects the next real payment too.

## 3. The script's stated safety invariant does not hold on this data

`remove-demo-data.mjs:242-244` deletes demo clients last and explains why:

> Clients LAST of everything: `jobs.client_id` is SET NULL too, so a real job
> pointing at one of these would silently lose its customer instead of raising.
> By here the demo jobs are already gone, so nothing real can.

That holds only if demo clients own nothing but `J-DEMO-` jobs. They don't:

| account | surviving jobs that lose their client | of those, holding payments | not marked demo |
| --- | --- | --- | --- |
| `831ab32c` | 246 | 156 | 2 |
| `5676eb6a` | 102 | 66 | 1 |
| `c63293b4` | 39 | 5 | 0 |
| `d3202ae8` | 5 | 1 | 0 |
| **total** | **392** | **228** | **3** |

Plus **155 leads** pointing at a client the sweep deletes (`leads.client_id` is
SET NULL as well).

The reason this is invisible in the script's own dry run is that the dry run
counts clients — `demo clients` / `clients being KEPT` — and never asks what
still points at them. The over-broad match the file was written to make visible
is not the failure mode present here.

## 4. RESTRICT foreign keys now sit between the sweep and the payments

35 foreign keys reference `public.payments`; **29 of them are RESTRICT**, nearly
all from tables installed on 2026-08-17: `billing_payment_operations`,
`billing_direct_refund_authorizations`,
`billing_direct_checkout_late_success_tasks`,
`billing_direct_payment_settlement_tasks`,
`stripe_connected_checkout_expirations`,
`legacy_destination_checkout_operations`,
`legacy_destination_checkout_session_adoptions`, plus the pre-existing
`quick_stop_payment_tasks`. Two more RESTRICT FKs point straight at `jobs`.

RESTRICT is not NO ACTION: it fires immediately, even when the referencing row
would have been deleted by the same statement. So one row in any of those tables
for a payment on a `J-DEMO-` job aborts the whole sweep with `23503`.

Today nothing blocks it — every one of those tables is empty except
`legacy_destination_checkout_session_adoptions`, which holds 1 row pointing at a
non-`J-DEMO-` payment. But the script's comment ("cascades their own costs, feed,
tasks, tracking, invoices, payments, customer links") predates all of them, and
the failure would land halfway through a teardown.

`--rehearse` would catch this, and is the right thing to run first. It is also
the reason `--rehearse` exists.

## What the script needed — all five done

1. ~~Widen the job predicate to `test_marker is not null`, excluding any job that
   holds an unmarked payment.~~ `JOB_MATCH` now does both.
2. ~~Stop orphaning survivors.~~ The client delete carries a guard, and a
   post-delete check rolls the transaction back if a survivor loses its customer.
3. ~~Report what points at the clients.~~ The dry run now lists the held-back jobs
   and the kept clients with their job refs.
4. ~~Preflight the RESTRICT tables.~~ Enumerated from `pg_catalog`, not
   hardcoded, and run before `begin`.
5. ~~`loadEnv` reads `../.env.local`, which does not exist in this worktree.~~ A
   missing file is no longer fatal, so `DATABASE_URL` from the environment works.

### The one invariant worth stating on its own

> **No payment without a `test_marker` is ever deleted.**

That is what the held-back rule buys, and it is stronger than protecting
`6e2e7689` by id: it protects the next real payment too. The script asserts it
before opening the transaction and aborts if it fails.

The assertion is a tautology given the two predicates as written — a job only
matches when nothing unmarked hangs off it, so nothing unmarked can reach the
delete set by either route. Its value is as a regression guard, because the
tempting simplification (`JOB_MATCH` → just `test_marker is not null`) makes the
script delete *more* demo data, keeps every rehearsal green, and cascades the one
real payment out of the ledger. `test/remove-demo-data-guards.test.ts` fails the
build if the carve-out is removed; that assertion was mutation-tested.

### Rehearsal results, all five accounts

`--rehearse` runs every delete and rolls back. Projections matched the actual
delete counts exactly on every account:

| account | jobs | held back | payments cascaded | deleted directly | kept | clients | leads | orphaned |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `831ab32c` | 244 | 0 | 156 | 0 | 1 | 188 | 100 | **0** |
| `5676eb6a` | 100 | **1** (J-1038) | 65 | 0 | 2 | 42 | 100 | **0** |
| `d3202ae8` | 90 | 0 | 34 | **3** | 1 | 106 | 103 | **0** |
| `c63293b4` | 39 | 0 | 6 | 0 | 0 | 26 | 11 | **0** |
| `c7632694` | 0 | 0 | 0 | 0 | 0 | 1 | 1 | **0** |

(Client counts are after the SET NULL fix below; 23 clients that the first draft
would have deleted are now held back because a recurring plan still points at
them. The orphan column is checked across all five parent tables.)

261 cascaded + 3 direct = **264 of 264** marked payments, and the 4 unmarked ones
survive. Before the patch: 32 of 264, with 392 jobs and 155 leads orphaned.

The three deleted directly are on account `d3202ae8`, on job `J-1001` — an
*unmarked* job holding marked payments, which is the case the job cascade alone
can never reach.

### What an adversarial review of the patch found

Five independent reviewers, then a refuter per finding instructed to default to
"refuted". Seven findings survived. **All five lenses independently found the
same one**, and it was the worst:

**The client guard knew two of the five SET NULL parents of `clients`.** They are
`jobs`, `leads`, `recurring_plans`, `warranties` and `extra_stop_requests`. I
enumerated the first two by hand — then wrote the post-delete orphan check from
the same hand-written pair, so the check agreed with the guard by construction
and verified nothing. **23 recurring plans across three accounts** would have
been silently detached from their customer while the run printed a clean bill.

That is precisely the failure this document accuses the *original* script of, one
table over: the dry run counted clients and never asked what pointed at them.
`src/app/dashboard/clients/actions.ts:210` already knew the answer — its merge
path repoints four of the five before deleting a duplicate.

The fix is not a longer list. Both the guard and the post-check now read the
parents from `pg_catalog`, and a child table the script does not delete from
counts as a survivor whenever it holds any row — so a sixth one added later holds
clients back by default instead of losing them.

The other six:

- **`recurring_plans` is never swept**, and nothing else deletes it. 23 seeded
  plans keep their schedule, so the cron re-creates seeded visit jobs and fresh
  `@example.com` clients afterwards. The sweep does not leave the account clean;
  it leaves it able to regrow. Now reported loudly, with amount, frequency,
  next run date and whether a card is attached — *not* deleted, because removing
  a billing schedule is a different decision from removing seeded history.
- **The preflight treated `NO ACTION` as `RESTRICT`.** The one such key here,
  `payment_plans_payoff_payment_same_plan_fkey`, is `DEFERRABLE INITIALLY
  DEFERRED`: a plan and its payoff payment on the same seeded job both vanish
  inside step 4, so there is nothing to violate at COMMIT. Aborting would have
  refused a run that would have committed, and sent the operator to hand-edit a
  live billing pointer. RESTRICT now aborts; NO ACTION warns. (A refuter
  confirmed this on a throwaway PG17 with the same FK topology, including that
  `--rehearse` can never exercise a deferred key, because it rolls back before
  the only point at which that key is checked.)
- **The held-back report said marked payments "also survive on it"** — step 5
  deletes exactly those. My sentence, and the opposite of the truth.
- **The kept-client report counted every job and lead**, including the ones about
  to be deleted. The row *filter* was survivor-aware; the numbers next to it were
  not, so a client held back by one surviving job was listed with six.
- **The `empty pay periods` delete had no dry-run line**, and its `period_id`
  cascade removes roughly twice the append-only pay events the run reports.
- **A kept crew member's labor costs on a seeded job** are destroyed by the
  widened cascade with no count and no rule of their own. Zero rows today, but
  the widening is what made it possible.

The last three are now reported under a "Collateral (deleted, but not by a rule
of its own)" heading. One finding was refuted and dropped.

Known limitation, left in deliberately: the preflight looks one level deep, at
foreign keys into `payments` and `jobs`. A RESTRICT key on a *grandchild* — say
something referencing `invoices`, which cascades from `jobs` — is not counted.
Those constraints are immediate rather than deferred, so `--rehearse` does
surface them, which is one more reason the rehearsal is not optional.

### Two bugs the patch introduced, and how they surfaced

Both were mine, both were caught by running the thing rather than reading it,
and both were the same shape — a predicate that means one thing when it reports
and another when it deletes, which is the exact failure this file's header warns
about.

- The client guard asked whether *anything* referenced the client. Correct at
  delete time; at report time nothing has been deleted yet, so the dry run
  announced `demo clients 0` for an account where `--apply` would then have
  removed 52. Fixed by projecting the job delete into the predicate, which makes
  one spelling correct in both places.
- The "these are NOT demo jobs, their costs will drop" warning still filtered on
  `ref not like 'J-DEMO-%'`, which meant "not a demo job" only while that prefix
  was the whole match. It listed 64 jobs that step 4 was itself about to delete.

## Incidental

The one real-format phone number in the audit subagent transcripts appears on 3
client rows across 3 accounts (`BEN`, `Ben Whopper`, `Sarah white`) — a reused
test contact, not a third party's number. Every other contact value in those
transcripts is `@example.com` seed data. See the transcript audit note in
`docs/go-live-2026-08-17.md`.
