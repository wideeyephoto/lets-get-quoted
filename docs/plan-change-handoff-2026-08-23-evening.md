# Plan-change rail — handoff

**Branch:** `main`, clean, pushed through `1d0e6e5f`<br>
**Gates:** schema ×2, typecheck, lint, test (9842), build — all 0<br>
**Blocking decision:** one, and it is at the top on purpose

---

## READ THIS FIRST: the fork that has to be resolved before any more SQL

The SQL foundation is built and applied, and then I found the thing that
invalidates the approach it was built on. **Do not write the projector patch
until this is decided**, because the answer determines whether three applied
migrations survive.

`project_stripe_billing_subscription_event_v1_unchecked` does **its own**
operation lookup, independent of the binding function:

```
 10:  v_operation public.billing_subscription_checkout_operations%rowtype;
310:  select o.* into v_operation
312:    from public.billing_subscription_checkout_operations o
313:   where o.account_id = v_account_id
314:     and o.operation_id = pg_catalog.btrim(v_operation_id)
```

`v_operation` is referenced on **30 lines** and there are **3 UPDATE statements**
writing back into that table with `returning * into v_operation` (lines 502, 517,
526). A plan-change operation living in a separate table is simply not found, and
the projector raises.

I built a separate ledger (`billing_subscription_plan_change_operations`) before
checking this. That was my error — I verified that the *binding* function is
called from TypeScript, concluded a sibling binding function would do, and did
not check whether the projector looked the operation up itself. It does.

### Option A — make the projector table-agnostic

Replace the `%rowtype` with scalars populated from either table; fork the three
UPDATEs. ~30 lines of invasive change **in the function every subscription event
in the product flows through**. Keeps the clean state machine already built and
applied (`submitted → provider_accepted → activated`), which avoids traps 1 and 2
below by construction.

### Option B — put plan-change operations in `billing_subscription_checkout_operations`

The projector's lookup, state machine and UPDATEs all work unchanged, and
`20260823120000`'s two relaxations become **live rather than dead** — which is
evidently what its author assumed. Still needs the null-session and
proration-invoice patches, but not the rowtype rewrite.

**Cost:** `20260823210000` (ledger), `20260823220000` (claim RPC) and
`20260823230000` (transitions) are largely superseded. They are applied and
inert, so nothing breaks by leaving them, but they would be dead weight.
`20260823200000` (consent recorder) survives either way.

**Also:** B inherits the checkout table's state machine, where `activated`
provisions before payment and `indeterminate` freezes grace, restriction and
cancel-to-Flex (traps 1 and 2). Those then have to be solved inside the projector
— most plausibly by keying the entitlement gate on the plan-change purpose rather
than on `v_was_activated`.

**My recommendation was B**, on the grounds that blast radius dominates: a
stalled billing rail is worse than an awkward state machine. It was not accepted
or rejected before this handoff was written, so it is genuinely open.

---

## What is applied and live in production

| Migration | What | Live effect today |
|---|---|---|
| `20260823190000` | Entitlement catalog currentness | **Real fix.** Ended a live outage — see below |
| `20260823200000` | `record_base_plan_plan_change_consent`, acceptances `purpose` widened | Inert; nothing calls it |
| `20260823210000` | `billing_subscription_plan_change_operations` | Inert; zero rows |
| `20260823220000` | `claim_stripe_billing_subscription_plan_change` | Inert; nothing calls it |
| `20260823230000` | Transition RPCs + protection trigger | Inert; nothing calls them |

Everything except `20260823190000` is dark. The panel is withheld at the render
site AND the operation is gated by
`LGQ_BASE_PLAN_SUBSCRIPTION_PLAN_CHANGE_ENABLED` (absent in every environment, so
off).

---

## The one real fix today: a workspace could not collect money

Not the renewal problem it was scoped as. `workspace_entitlements` for
`7caf66e2` carried `catalog_version = '2026-08-15-preview'`, and three live
functions refuse on exactly that column with `55000`:

- `claim_one_off_direct_checkout_operation`
- `prepare_one_off_direct_invoice_payment`
- `require_direct_checkout_entitlement_snapshot` — reached from **two enabled
  triggers** on `billing_payment_operations`

So the only paid workspace could not take a card payment from its own customers.
Never observed: its four `payments` rows all have NULL `fee_catalog_version`, so
the direct rail had never been exercised there.

It was **not a relabel** — the row carried the old *limits* too (`office_users: 1`,
`dedicated_business_numbers: 1`), having missed both `20260820150000` and
`20260821010000`. `20260819040000` existed to sweep such rows forward and skipped
it, because its guard matched an eight-key `feature_limits` map and the row has
ten.

**The distinction, now documented at `PRICING_CATALOG_VERSION` and guarded by
`test/catalog-version-is-a-data-migration.test.ts`:**

| kind | where | rule when the constant moves |
|---|---|---|
| EVIDENCE | operations, acceptances, `billing_subscriptions`, Stripe metadata | immutable → **widen the readers** |
| CURRENTNESS | `workspace_entitlements.catalog_version`, `payments.fee_catalog_version` | guards compare a literal → **move the rows** |

A bump is **not** required for an allowance change — `20260820150000` and
`20260821010000` both changed capacity under the same version deliberately.

---

## Still open on the catalog bump

That subscription's **renewal still will not project**.
`sub_1U5hxLPqTgiW6iRM2f12RKn0` carries `lgq_catalog_version: 2026-08-15-preview`
in its Stripe metadata, and so do its Price and its original Checkout Session.
`exactMetadata` and projector line 170 both demand the current version, so the
2026-09-18 renewal lands `failed_terminal` on attempt 1.

The awkward part: the operation row immutably records the **old** Price ID, so
`loadVerifiedPrice` refuses whichever Price set the environment binds — new set →
id mismatch, old set → `validatePrice` rejects the Price's own stale metadata.
Both Price sets exist in the sandbox account and are pairwise identical in amount.

**Blocked on a fact I could not read:** `.env.local` has no `STRIPE_PRICE_*`
bindings, and production's are Vercel Sensitive vars, unreadable by anyone. The
binding-independent fix is to resolve the agreement's Price *by the ID the
agreement records* rather than by today's env-bound sales catalog — selling and
projecting are different jobs.

Deferred deliberately: today's only beneficiary is a sandbox rehearsal row, and
it destabilises the shared money rail.

---

## Things that were asserted and turned out false

Worth knowing, because the ratio matters when weighing any analysis in this area.

- **"The SQL half is done; what remains is the TypeScript half."** Wrong in both
  halves. There is no TypeScript-only path.
- **"`20260823120000` is inert."** It is **dead code** under a separate ledger —
  both relaxations query `billing_subscription_checkout_operations`, where
  nothing can ever write `base_plan_plan_change`.
- **The Scale-allowance trap.** False. `catalog_version` is a price-book label,
  not an allowance selector; there is one catalog keyed on `plan_code` alone.
- **"Annual subscribers have no immediate upgrade."** False. Annual→annual tier
  moves are `activate_after_payment`; only an *interval* change waits.
- **"No per-account unique on `billing_subscriptions`."** False. There is a
  partial one, `billing_subscriptions_one_live_per_account`, over six statuses —
  which is a better fact, and the claim RPC now uses it.
- **The field contract saying `state: 'activated'`.** Would have provisioned the
  new plan before the proration was paid.

---

## Landmines hit today

- **`pg_get_functiondef` raises `42809` on an aggregate.** An unfiltered
  `pg_proc` scan in a postcondition rolls the whole migration back. Filter
  `prokind = 'f'`. I reproduced this by accident in my own probe.
- **`pg_catalog.coalesce` does not exist.** `COALESCE`/`NULLIF`/`LEAST`/`GREATEST`
  are SQL constructs, not `pg_proc` entries. The live projector uses bare
  `least(` and `greatest(` for this reason.
- **Anchor indentation.** A postcondition of mine pinned 14 leading spaces where
  the live body has 13; it would have raised and rolled back a correct patch.
  Dump anchors as JSON and assert occurrence counts, not literal lines.
- **The default ACL grants `anon`.** `pg_default_acl` for `public` gives `anon`
  `EXECUTE` on every new function and **`arwdxtm` on every new table** — by name,
  not via `PUBLIC`. The `revoke` is the security. Assert it: removing the revoke
  from `20260823210000` makes it refuse itself with `anon still holds SELECT`.
- **Source tests fail against their own comments.** Hit twice more today. Use
  `stripComments` at the read site, never weaken the assertion.
- **A guard can be unreachable.** My first version of the plan-change gate had
  three check sites, two of which could never fire. Mutation testing does not
  catch this — killing an unreachable guard changes no behaviour.
- **Applying migrations is NOT authorized in this directory.** The permission
  rule lives in `operator-resolution-worktree`'s `settings.local.json`. In
  `c:\dev\CLAUDE CODE FOLDER` the classifier blocks `run-migration.mjs` until the
  user explicitly approves.

---

## How to verify a migration before applying it

DDL and `CREATE OR REPLACE FUNCTION` are transactional. Strip the file's own
`begin;`/`commit;`, wrap it, run it, inspect, `ROLLBACK`. This exercises every
postcondition against the real installed bodies and changes nothing. It is how
the 14-space bug and the state machine were both caught. Use savepoints for
per-probe isolation, or the first error poisons the transaction.

```
npm run audit:applied
npm run verify:tenant-isolation
npm run inspect:cron-health
```

---

## Sequencing from here

1. **Resolve the A/B fork above.** Nothing else should be written first.
2. Projector patches: re-point the entitlement escape; accept a NULL
   `checkout_session_id` for a plan-change operation; re-tighten
   `checkout_session_paid` on `v_checkout_session_id is null` **not** only on
   purpose; bind payment evidence to the proration invoice id.
3. TypeScript write path — row before the Stripe call, new `lgq_operation_id` in
   the subscription metadata without dropping the other keys, consent capture in
   `ChangePlanPanel` reusing `base-plan-checkout-consent` /
   `base-plan-checkout-affirmation` (a new class forces a `globals-lite.css`
   rebuild).
4. `always_invoice` does **not** throw on a declined proration —
   `payment_behavior` defaults to `allow_incomplete`. Read `latest_invoice`.
5. Grant the prorated credit lots. `proratedPlanUpgradeCreditDeltas` computes
   them and nothing reads the result.
6. End-to-end projection test in test mode. **This gates the flag**, not the
   migrations and not a design note.

**Ceiling:** steps 2–5 are code and SQL. Step 6 and the flag flips need a real
test-mode Stripe purchase and a Vercel redeploy — `vercel-env-is-baked-at-build`
means a Production flag does nothing until one happens.
