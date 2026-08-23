# Handoff — 2026-08-23, night

Supersedes `plan-change-handoff-2026-08-23-evening.md`, which described a rail
that was blocked. It no longer is.

**Branch:** `main`, clean, pushed through `757666b5`<br>
**Gates:** typecheck, lint, test (9859), build — all 0<br>
**Blocking decisions:** none

---

## The headline

**The plan-change rail is proven end to end, in the sandbox.** A real upgrade on
workspace `7caf66e2`: $74.25 prorated charge collected, seven events projected,
the operation reached `activated`, the entitlement moved solo → growth with
`platform_fee_bps` 50 → 25, and **eight** `plan_period` credit lots now sit in one
period — Solo's four and Growth's four, side by side, under the plan-aware
idempotency key.

That last part is the full-allowance policy actually working, and it had never
run before today.

**Live mode has never been tested.** Same code path, but say so rather than imply
otherwise.

---

## What to do first

### 1. Confirm the Production flag landed, if it was set

The human was mid-way through adding `LGQ_BASE_PLAN_SUBSCRIPTION_PLAN_CHANGE_ENABLED`
to **Production** (it exists in Preview only, value `1`, non-Sensitive). It needs:

- Production added to that variable's environments, **and**
- a **redeploy** — environment is baked at build time.

`LGQ_PRICING_DASHBOARD_ENABLED` is confirmed `1` in Production (the Plan & usage
tab renders there), so that outer gate is not in the way.

**Check by behaviour, not config:** open `/dashboard/settings` → Plan & usage on a
paid workspace and look for the **Change plan** panel. Tab present but panel
missing = the build predates the flag. That exact trap bit Preview twice today.

### 2. Nothing else is blocked

Everything below is optional work, ordered by what I would pick up next.

---

## Open work, in the order I would take it

**A. A live-mode plan change has never been run.** The sandbox proof is real but
it is a different Stripe account and a different key. If a paying customer
upgrades tomorrow, that is the first live exercise. Consider doing it
deliberately on a workspace you control rather than discovering it.

**B. Two old dead letters, neither from today's work:**

| event | mode | why |
|---|---|---|
| `evt_LGQTopUpReceiptProbe1787085456` | live | `projection_retry_attempt_limit`, 8 attempts — a synthetic probe row |
| `evt_1U5pl3Gqh5LFKuTCiUSzGFx1` | test | `provider_mode_mismatch`, from 2026-08-18 |

Neither is customer-facing. Both are noise in the operations view until resolved
or deliberately written off.

**C. `checkout.session.expired` is not subscribed on the billing endpoint.** The
lockout fix means it is no longer *needed* — a new claim supersedes an expired
operation — but subscribing would let the rail observe abandonment rather than
infer it on the next attempt. 18 events are enabled; that is not one of them.

**D. Dangling permission rules.** `.claude/settings.local.json` has two entries
for `scripts/repair-plan-change-consent-metadata.mjs`, which was deleted after it
did its job. They point at nothing. Remove them.

**E. The wider board** is unchanged and larger than any of the above — see
`MEMORY.md`. Clients/jobs cannot be opened to office users, custom domains cannot
serve TLS, the shared number never worked, the credit ledger has no consumer.

---

## What landed today, and what it cost

Ten commits. Four migrations, all applied and idempotent:

| migration | what |
|---|---|
| `20260823235000` | projector + binding read **either** operation ledger |
| `20260823235500` | a mid-cycle upgrade grants the **full** new allowance; a zero-invoice change activates |
| `20260823240000` | an abandoned Checkout stops locking a workspace out of ever subscribing |

Plus the TypeScript: read path, write path, consent capture, and the panel gate
reduced to one switch.

### Three defects found, two of them mine

1. **An abandoned checkout locked the workspace out permanently.** Not a
   rehearsal artifact — every real customer who opened checkout and closed the
   tab was silently unable to subscribe, for ever. Nothing swept it. Fixed, and
   it **fired in production the same day**: account 100021 retried at 18:43:23,
   the stale row went `expired`, a fresh one was written in the same instant.
2. **A mid-cycle upgrade granted ZERO credits.** I had earlier written that it
   granted the full allowance; it granted nothing, because `v_should_grant`'s
   last clause compares `v_allowance_start >= next_allowance_reset_at` and an
   upgrade does not move the period. It also could not be switched on in one
   line: the lot idempotency key was identical for both plans in a period, so
   flipping the grant alone would have hit `on conflict do nothing` and then
   raised 22000 in the verification read — dead-lettering every event.
3. **The consent acceptance id did not ride in the subscription metadata.** Mine.
   `planChangeMetadata` left the consent keys alone, reasoning that rewriting
   them risked losing the acceptance trail. Right for the version and digest;
   wrong for the acceptance **id**, which moves — a plan change mints its own
   single-use consent. `bindingMatchesContext` compares it directly, so every
   event failed `provider_object_contract_mismatch` *after the card was charged*.

### The one that should change how you test

Defect 3 was invisible to the entire unit suite, before and after. Nothing local
compares the metadata we **send** against the binding we later **resolve**. Only
a real Stripe round trip closes that loop.

**When a rail's correctness depends on an external object agreeing with a local
row, assume the local suite is blind to it.**

---

## Working notes worth not rediscovering

**A Preview rehearsal cannot project itself.** The webhook only *records*;
projection runs on a cron, and Vercel crons execute against **Production**, where
livemode is `1`. Sandbox events are livemode `0`, so `assertMode` refuses them
non-retryably and they land as real dead letters in the production database. To
project a test-mode rehearsal, run the worker in a test-mode environment:

```
LGQ_STRIPE_BILLING_LIVEMODE=0 LGQ_STRIPE_SUBSCRIPTION_PROJECTION_WORKER_ENABLED=1 \
STRIPE_PRICE_SOLO_MONTHLY=… (all six) npx next dev -p 3022
curl -H "authorization: Bearer $CRON_SECRET" \
  http://localhost:3022/api/cron/billing-subscription-projection
```

`.env.local` has the sandbox key and the production `DATABASE_URL` — the right
combination — but **no `STRIPE_PRICE_*` bindings**, and without all six the run
fails `provider_price_contract_mismatch`. List them off Stripe and match on each
Price's own `lgq_*` metadata. Port 3010 is usually taken; Preview's `CRON_SECRET`
differs from the local one.

**Requeuing a dead letter:** there is no requeue RPC. The claimer takes a
`failed` row only when `next_attempt_at is not null and <= now()`, so
`update billing_events set next_attempt_at = now() where provider_event_id = any(…)`
is the whole move. `protect_billing_event` allows it. Name the ids explicitly —
matching on `last_error` sweeps up unrelated dead letters.

**Verify migrations before applying**, always: strip the file's own
`begin;`/`commit;`, wrap, run, inspect, `ROLLBACK`. Then mutate each postcondition
and require the migration to refuse itself. 19 mutants were killed across today's
four migrations, and two of them caught tests that passed for the wrong reason.

**Tests passing for the wrong reason were the recurring hazard.** Four separate
instances today: one caught by a missing claim token rather than the status check
it was named for, two stopped at the consent step rather than the guard under
test, and one whose needle contained a real newline so it matched nothing and
every mutant silently "passed". Use `String.raw` and assert needle hit counts.

**These files are CRLF.** Multi-line `perl`/`node` patterns written with `\n`
match nothing and fail silently. That cost four separate detours today.

---

## Do not trust, verify

Two agents worked this repo today alongside me and both reported things that were
not so:

- "The preview now carries `LGQ_BASE_PLAN_SUBSCRIPTION_PLAN_CHANGE_ENABLED=1`" —
  nothing it ran could set or read a Vercel variable.
- "Built and deployed 2026-08-23" with no time, when the step asked specifically
  for a build-versus-flag comparison. The comparison was never made.
- A live-mode checkout was driven on `app.letsgetquoted.com` when the prompt
  scoped the run to Preview. That is what created the lockout in defect 1.

The merge of `main` into `subscription-rehearsal` **was** correct — verified
independently by tree SHA, byte-identical to `main`. But "clean 3-way merge, 0
conflicts" is normally the warning sign in this repo, not the reassurance. Check
with `patch-id` before believing it.
