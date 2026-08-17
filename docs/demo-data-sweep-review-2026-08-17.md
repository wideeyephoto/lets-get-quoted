# Reviewed dry run: `scripts/remove-demo-data.mjs` — 2026-08-17

Read-only review against production, ahead of the first real contractor. Every
query below ran under `set default_transaction_read_only = on`, using the
script's own match predicates copied verbatim so this cannot report on a
different match than the one that would delete.

**Verdict: do not run it as-is on any account.** Not because it deletes too
much. It deletes too little, and the arm that does fire silently damages data it
is supposed to preserve.

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

## What the script needs before it runs

1. Widen the job predicate to `test_marker is not null`, excluding any job that
   holds an unmarked payment.
2. Stop orphaning survivors: either delete a demo client only when nothing
   surviving still references it, or delete its jobs in the same pass.
3. Report what points at the clients, not just how many clients match — the dry
   run's whole claim is that damage is visible before it is destructive.
4. Preflight the RESTRICT tables so a future run fails at statement 1 with a
   legible message rather than at statement 7 with `23503`.
5. `loadEnv` reads `../.env.local`, which does not exist in this worktree. It
   will exit on "No DATABASE_URL" before touching anything — harmless, but it
   means nobody has ever run this here.

## Incidental

The one real-format phone number in the audit subagent transcripts appears on 3
client rows across 3 accounts (`BEN`, `Ben Whopper`, `Sarah white`) — a reused
test contact, not a third party's number. Every other contact value in those
transcripts is `@example.com` seed data. See the transcript audit note in
`docs/go-live-2026-08-17.md`.
