# Overage migrations — apply order and what each one is for

Four migrations are written, verified against a real PostgreSQL 17, and **not
applied**. They must go in filename order. Three of them change the same two
functions, so applying them out of order leaves the wrong body installed and the
post-conditions will not catch it — each one only asserts about its own change.

Everything here is dark. `LGQ_USAGE_OVERAGE_ENABLED` is off, no meter grants or
spends against a cap, and nothing calls `close_overage_period`. Applying these
changes no customer-visible behaviour today. They land now because the
alternative is finding each one during a month-end.

## The order

| # | Migration | What it adds |
|---|---|---|
| 1 | `20260819260000_overage_settlement.sql` | `workspace_overage_settlements` + close/claim/complete/fail |
| 2 | `20260819290000_overage_accrual_idempotency.sql` | `workspace_overage_accrual_events`; rewrites both overage functions |
| 3 | `20260819300000_release_respects_settled_period.sql` | the release refuses on a settled period |
| 4 | `20260819310000_cap_counts_overlapping_periods.sql` | the cap counts overlapping buckets |

**2 does not depend on 1.** **3 does**: its post-condition asserts
`workspace_overage_settlements` exists, and its function body reads that table.
plpgsql resolves table references at call time rather than creation time, so
without 1 the function would be created happily and then fail on the first
release — the post-condition is what turns that into a refusal at apply time.

**4 restates `authorize_usage_overage` in full**, anchor included, because
`prosrc` holds whatever line endings the file was applied with and an exact-text
patch has already failed once on this database for that reason. So applying 4
before 2 does not error: 4 creates the seven-argument function, and then 2
replaces it with the version that matches by exact `period_start` — silently
undoing the cap fix. Nothing raises. **Filename order, always.**

## Why each exists

**1. The settlement snapshot.** Between the accrual ledger and any invoice there
has to be something frozen. Without it an invoicer would read live accrual rows —
rows a release can still decrement — and two runs of the same sweep would produce
two charges. Rounding is **down, always**, with the residual kept so the
arithmetic closes. A period worth less than a cent closes as `nothing_owed` and
**resolved**, so no sweep waits forever on a $0.00 Stripe call.

**2. The idempotency anchor.** `authorize_usage_overage` did a blind increment
with nothing recording *which* overrun it was. The retry is not hypothetical: the
RPC commits, the connection drops before the row comes back, the TypeScript side
answers `unavailable`, the caller refuses to send — and the workspace has paid for
work nobody did. Then it retries and pays twice.

A replay now **repeats the original answer** rather than recomputing it. A retry
that re-evaluated the cap would answer `cap_reached` for work already paid for,
and the caller would refuse to do it: customer charged, send withheld, worse than
either failure alone.

The release also changed shape — it names the charge by key and takes the amount
from the recorded event, instead of describing the charge in the caller's own
words and being believed.

**3. A settled period does not move.** `close_overage_period` freezes a snapshot;
`release_usage_overage` decrements the live rows it came from. A call admitted at
23:58 that fails at 00:02 releases into a period that closed in between. The
release now raises rather than returning 0 — zero already means "no open event",
and a duplicate release and money-owed-back-too-late want different things from a
person. The TypeScript logs it as `OWED BACK`, because nothing in the codebase
can issue that credit.

**4. The cap does not re-arm.** The cap is one number per workspace with no period
attached, and spend against it was summed by exact `period_start`. `period_start`
is not stable: the subscription projector writes it from Stripe's
`current_period_start` on every subscription event. So a Flex workspace spends
its $50 under `2026-08-01..09-01`, subscribes on the 15th, and the next overrun
sums `2026-08-15` exactly, finds nothing, and hands back the whole $50. One cap,
set once, spent twice, in the same month.

Spend is now the sum over every bucket that **overlaps** the period being charged
into. A genuine monthly roll still resets, and does so without waiting on a
settlement — which matters, because nothing settles anything yet.

## Verifying

```
npm run test:pg17:overage-settlement     # 54/54
npm run test:pg17:overage-idempotency    # 51/51, applies all four in order
```

Both spin up their own PostgreSQL 17 and exit 2 if `embedded-postgres` is not
installed. Neither touches the real database.

## After applying

Nothing to switch on. `LGQ_USAGE_OVERAGE_ENABLED` stays `0` until there is an
invoicer, and the invoicer is deliberately not built: writing to
`workspace_overage_settings` and charging a settlement are both out of scope
until somebody decides how a contractor authorizes a cap in the first place.
