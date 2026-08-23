# Plan-change rail — handoff

**Branch:** `main`, clean<br>
**Gates:** schema ×2, typecheck, lint, test (9859), build — all 0<br>
**Blocking decision:** RESOLVED 2026-08-23 — **option A**, by the user

---

## RESOLVED: the fork, and what checking it changed

**Decided A** (make the projector table-agnostic). B was the standing
recommendation and it does not survive contact with the live catalogue. The
section below is kept because the *reasoning* was wrong in a way worth keeping,
not because the question is still open.

**What B's write-up missed.** The checkout table gives a plan change no legal
pre-activation state:

| state | why a plan change cannot sit there |
|---|---|
| `checkout_created` | `state_shape_check` demands a non-null `provider_object_id`, and `provider_mode_check` then demands it match `^cs_(test\|live)_`. A `subscriptions.update` produces no Session. |
| `indeterminate` | demands a fabricated `last_error`, and freezes entitlements |
| `activated` | provisions the new plan before the proration invoice is paid — the field contract already listed below as false |
| `submitted` | not in either function's accept list |

Both usable states also sit inside `billing_subscription_checkout_one_pending_per_account`,
a live partial `UNIQUE(account_id)` — so one unresolved plan change would lock a
workspace out of every further plan change *and* every new checkout, with nothing
sweeping it. And the `v_was_activated` gate encloses grace, restriction and
cancel-to-Flex either way, so B never saved the projector rework it claimed to.
`20260823210000`'s header made this argument before the fork was reopened; two of
its three reasons check out (the consent one is weak — the consent rail fits
either option).

**Also wrong in the write-up above:** the coupling is TWO functions, not one. The
binding does its own lookup with its own `%rowtype`, and refuses on
`checkout_expires_at is null` besides. And `v_operation` appears on 40 lines, not
30.

### What landed

`migrations/20260823235000_plan_change_projection_table_agnostic.sql` —
**APPLIED to production 2026-08-23**, and re-run afterwards as a clean no-op with
byte-identical bodies and ACLs on all four projection functions.

- Binding pair DROP+CREATEd to add an `operation_purpose` OUT column — a
  `create or replace` cannot change a return type. The TypeScript caller needs it:
  `loadExactSession` falls back to listing a subscription's Sessions when the
  binding carries none, and for a plan change that finds the *original* checkout
  at the *old* price and dies `checkout_session_ambiguous`.
- Projector source-patched at 11 anchors, each asserted to match exactly once.
  `v_operation` becomes a carrier populated from either ledger; all 40 read sites
  are untouched; the four state comparisons and three write-backs are forked.
- Activation binds to the exact `proration_invoice_id`, and only out of
  `provider_accepted` — the only legal predecessor of `activated` in the ledger's
  trigger.
- `20260823120000`'s entitlement escape re-pointed at the carrier, so it is live
  rather than dead.

Verify with `npm run verify:plan-change-agnostic`. It picks its phase from the
installed state: **before** the migration is applied it dry-runs and then breaks
each guarded property in turn, requiring the migration to refuse itself (17/17
when this landed); **after**, it dry-runs and asserts the live bodies instead
(28/28). The two are exclusive because the projector patch short-circuits on an
already-patched body, so post-apply eight mutants can never be reached — a run
that reported those as failures would just teach the next reader to ignore red.

**One regression this caught in my own patch:** relaxing the null-Session refusal
for plan changes relaxed it contract-wide, which would have let a *checkout*
operation activate with a null Session — and the activation UPDATE then writes
`provider_object_id = null` over a live paid row's recorded Session id, which the
state-shape CHECK permits. The narrowing is restated per-source now, and mutant
#4 exists to keep it there.

**Open, deliberately:** a plan change accepted with a NULL `proration_invoice_id`
has no invoice to bind to and never activates. `20260823230000` says to treat that
as "nothing to collect, never as collected", and the two readings differ on
whether such a change may provision with no paid invoice at all. The safe reading
is implemented. Deciding the other way is a product call.

---

## The original write-up of the fork, for the record

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
stalled billing rail is worse than an awkward state machine. **Rejected** — blast
radius points the other way once the state-shape CHECK and the one-pending index
are read. See the top of this file.

---

## What is applied and live in production

| Migration | What | Live effect today |
|---|---|---|
| `20260823190000` | Entitlement catalog currentness | **Real fix.** Ended a live outage — see below |
| `20260823200000` | `record_base_plan_plan_change_consent`, acceptances `purpose` widened | Inert; nothing calls it |
| `20260823210000` | `billing_subscription_plan_change_operations` | Inert; zero rows |
| `20260823220000` | `claim_stripe_billing_subscription_plan_change` | Inert; nothing calls it |
| `20260823230000` | Transition RPCs + protection trigger | Inert; nothing calls them |
| `20260823235000` | Projector + binding read either ledger | Inert; no plan-change row can exist yet |
| `20260823235500` | Upgrade grants the full new allowance; zero-invoice change activates | Inert for plan changes; the plan-aware lot key applies from the next renewal |

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
- **"Option B: the projector works unchanged."** It has no legal pre-activation
  state, needs three CHECK relaxations on the live money table, inherits a
  cross-rail lockout, and still needs the entitlement-gate rework it claimed to
  save. Added 2026-08-23 after the fork was decided the other way.
- **"Only the projector does its own lookup."** The binding does too, with its
  own `%rowtype` and its own `checkout_expires_at is null` refusal.
- **`20260823230000`'s header: "the transition RPCs are the only way a row moves,
  and the trigger is what stops anything ELSE moving it."** The trigger constrains
  *what* changes and *which* transitions are legal — not *who* writes. The
  projector updates the ledger directly, which is what makes option A work at
  all. Read the trigger, not the sentence above it.

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

1. ~~Resolve the A/B fork above.~~ **Done — A.**
2. ~~Projector patches.~~ **Done and APPLIED** (`20260823235000`).
3. TypeScript.
   **(a) read path** — ~~done~~. `operation_purpose` is threaded through
   `StripeSubscriptionProjectionBinding`; `loadExactSession` returns null for a
   plan change **branching on the purpose, not on the null** (an unrecovered
   `indeterminate` checkout also has no Session id and DOES want the recovery
   path); `paymentEvidence` can no longer return `checkout_session_paid` without
   a Session; the projection sends `checkout_session_id: null`. `parseBinding`
   now keys the state accept-list off the purpose — the two ledgers share only
   `activated` and `indeterminate`, and merging the lists would let either row
   present the other's state — and mirrors the SQL's two cross-refusals rather
   than trusting them.

   That parser had **no row-level coverage at all** before this; it does now, via
   `SupabaseStripeBillingSubscriptionProjectionStore` with a mocked `rpc`. The
   headline test asserts the contrast directly: same null `checkoutSessionId`,
   and the plan change calls neither `listCheckoutSessions` nor
   `retrieveCheckoutSession` while the indeterminate checkout still calls both.
   All five source mutations were killed.
   **(b) write path** — ~~done~~. `changeBasePlan` now records consent as the
   signed-in owner, claims the ledger row, calls Stripe, then records
   `provider_accepted` with the proration invoice id. Order is the point: the row
   lands BEFORE the Stripe call, because the webhook can overtake the response. A
   Stripe error carrying a `statusCode` means Stripe decided and the change did
   not apply → `abandon`; no status means nobody knows → `indeterminate`, which
   is reconciliation-only. `lgq_operation_id` rides in the subscription metadata,
   which is what stops every event binding to the original checkout at the old
   price. `livemode` comes from the subscription row and is then checked against
   the configured mode, so a test-mode deployment cannot aim a live subscription
   id at a test key.

   **Consent is a real tick, not a server-side assumption.** The first cut minted
   the acceptance unconditionally — evidence of an agreement nobody saw. The
   guard now sits at the one site that mints, and compares the RENDERED version
   and text digest rather than a boolean, so a stale tab cannot authorise today's
   price under a disclosure it never displayed. A retry whose operation already
   carries an acceptance is not asked again: consent is single-use, and demanding
   a fresh tick would strand an otherwise idempotent replay. `ChangePlanPanel`
   renders the disclosure and disables confirm until it is ticked, reusing
   `.base-plan-checkout-consent` and `.base-plan-checkout-affirmation` — two
   components on that same page already use them, so no `globals-lite.css`
   rebuild.

   Eight source mutations killed. **Watch for tests that start passing for the
   wrong reason**: two here were being stopped at the consent step rather than by
   the guard under test, and one earlier by a missing claim token rather than by
   the status check it was named for.

4. ~~`always_invoice` does not throw on a declined proration.~~ Handled: the
   ledger records `provider_accepted` plus `latest_invoice`, and only the
   projector may move it to `activated`.
5. ~~Grant the prorated credit lots.~~ **Decided: FULL allowance — and it was
   worse than "not prorated".** `v_should_grant`'s last clause is
   `v_allowance_start >= next_allowance_reset_at`, and a mid-cycle upgrade does
   not move the billing period, so all three disjuncts were false and the
   contractor got **nothing**. They paid the proration, moved to the new plan's
   limits and platform fee, and kept sending texts against the old plan's
   segments until renewal. The one thing they upgraded for was the one thing
   they did not get.

   It could not be switched on alone. The lot idempotency key was identical for
   both plans inside one period, so the insert would hit `on conflict do nothing`
   and the verification read beneath it would find the old plan's `granted_units`
   where the loop now expects the new plan's — raising 22000 and dead-lettering
   every event for that subscription. `20260823235500` moves the grant and both
   key sites together.

   Policy: the new plan's FULL monthly lots, added on top of whatever is left,
   with no clawback. Self-limiting by construction — the new disjunct compares
   against `v_entitlement.plan_code` read BEFORE the entitlement update, so a
   second event for the same change finds them equal and cannot re-grant.

   Same migration: a change Stripe never invoiced now activates instead of
   stranding the contractor until renewal, but only while no invoice on that
   subscription is open or uncollectible. The TypeScript half is
   `expand: ['latest_invoice']` — without it a null id could mean "the response
   omitted it" rather than "nothing was owed", and the projector would provision
   a plan nobody paid for.

6. End-to-end projection test in test mode. **This gates the flag**, not the
   migrations and not a design note.

**Ceiling:** every migration on this rail is APPLIED. Step 6 and the flag flips
need a real
test-mode Stripe purchase and a Vercel redeploy — `vercel-env-is-baked-at-build`
means a Production flag does nothing until one happens.
