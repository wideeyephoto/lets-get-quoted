# Pre-Launch Handoff — 2026-08-23

**Branch:** `main`, clean, pushed through `341b5ce0`<br>
**Gates:** six of six at 0 (schema ×2, typecheck, lint, test, build)<br>
**For:** whoever picks this up next

---

## Where this came from

A seven-dimension adversarial audit ran on 2026-08-22 —
[pre-launch-audit-2026-08-22.md](pre-launch-audit-2026-08-22.md) — producing nine
must-fix items. **Eight are done. The ninth is contained but not finished.**

Two dimensions came back clean and are worth stating: no cross-tenant data leak
(a ~70-table sweep found every discrepancy in the *denial* direction) and no
exposed secret. The problems were all in the lifecycle *around* the sale.

---

## The one thing left

### Item 2 — a self-serve plan change charged the card and could not project

`ChangePlanPanel` is now **WITHHELD** — `PLAN_CHANGE_PANEL_WITHHELD` in
`settings/page.tsx` — so it can no longer charge for a change it cannot record.
Upgrades are handled by hand until the build below lands.

While it was live it called
`stripe.subscriptions.update` with `proration_behavior: 'always_invoice'`, so the
card is charged immediately — and then every event for that subscription fails
to project, permanently.

**The operation is now gated too** (`78a87549`).
`LGQ_BASE_PLAN_SUBSCRIPTION_PLAN_CHANGE_ENABLED`, default 0, checked in
`changeBasePlan` ahead of the subscription read. Withholding the panel hid the
button and not the endpoint: `ChangePlanPanel` is still imported by
`PlanUsageSection`, so `plan-change-actions.ts` is still compiled and its
server-action IDs are still POST-able by any authenticated owner. Same shape as
the cancellation flag that did not bite. Targeting Flex and
`clearScheduledPlanChange` stay ungated on purpose; the renewal worker skips due
rows and leaves them pending.

**"What remains is the TypeScript half" was wrong**, and
[plan-change-fix-design.md](plan-change-fix-design.md) has been rewritten. There
is no TypeScript-only path: writes to
`billing_subscription_checkout_operations` are revoked from `service_role`, and
both functions that could record a consent acceptance are hard-gated to an
active Flex workspace — `claim_stripe_billing_subscription_checkout` raises
`0A000` "existing subscription history requires the future plan-change flow".

Worse, the earlier field contract said `state: 'activated'`, which would have
opened the projector's entitlement gate on the first
`customer.subscription.updated` — provisioning the new plan **before** the
proration was paid. The obvious alternative, `'indeterminate'`, freezes grace,
restriction and cancel-to-Flex for the whole window. **The real blocker is that
the projector requires a `checkout_session_id` and a `subscriptions.update` has
none.** That question decides the whole shape and is not yet answered; see the
note.

`assertMetadataMatchesPrice` was the one item that could be closed alone, and it
is: deleted in `78a87549`. It compared three values the lookup key and a shared
import had already forced equal, and its unit tests passed hand-built
disagreeing pairs — proving the function worked while proving nothing about the
call site. The check that does read Stripe is `validatePrice` inside
`loadVerifiedStripePlanPrices`.

**The end-to-end test is what should gate turning the flag on** — not the
migration and not the design note. The PG17 harness covers the text edit only and
says so.

---

## What was fixed today

| Commit | Item |
|---|---|
| `1cbd5355` | "Edit & resend quote" destroyed a paid deposit — `payments.job_id` is ON DELETE CASCADE |
| `aef3d0b7` | The printable client statement was wrong three ways: rounding, refunds, a fee the customer was told was not credited |
| `43d44821` | A refunded customer was billed the full amount on the portal; the job page under-billed |
| `f7424ab5` | `/pricing` denied an overage mechanism that ships, under a consent citing rates no page printed |
| `41f54146` | An office seat granted read/write/**delete** on clients and jobs while the card said it granted nothing |
| `cda6d9b9` | Neither account-delete path could succeed; the admin one reported a GDPR erasure it had not performed |
| `41068f26` | `crew_user` was a live $5/month recurring SKU with no cancel path |
| `341b5ce0` | Cancelling was terminal — a workspace could never resubscribe |

Three migrations applied to production today: `20260823120000` (plan-change
projection), `20260823140000` (office capabilities), `20260823160000` (cancelled
returns to Flex). All verified against live function bodies, not migration files.

---

## Landmines, all hit at least once today

- **Mutation tests must land INSIDE the thing under test.** Three near-misses:
  a duplicate injected with different indentation, a comment appended *after* an
  anchor's trailing comma, and a drift outside the matched text. Each made a test
  pass while proving nothing.
- **A test can pin a claim that has gone false.** `top-up-card-says-the-cadence`
  *required* the pricing page to state "There is no automatic overage" — a green
  suite enforcing false advertising. A copy guard that pins a sentence outlives
  the fact the sentence asserted. Key guards on whether the code exists.
- **A source-level test fails against its own comments.** A comment quoting a
  removed claim reads exactly like the claim. Happened three times; the fix now
  lives in `test/helpers/source-text.ts` rather than being copied a fourth time.
- **`proname` is type `name`.** Comparing it to a >63-char literal silently
  truncates and appears to match. `..._v1_unchecked` is stored as `..._v1_unche`.
- **A shell heredoc eats backslashes**, and backticks inside a double-quoted
  `node -e` get expanded. Both corrupted work today. Use the Edit tool for
  anything containing escapes.
- **`git add -A` stages other people's untracked files.** It swept three in;
  backed out in `04b3a468`. Stage by path.
- **`globals-lite.css` is generated.** Editing `globals.css` without running
  `node scripts/build-css-subset.mjs` fails the suite.
- **The Next build can fail spuriously on Windows** with
  `Cannot find module './NNNN.js'` if a build follows `rm -rf .next` too closely.
  It survived one clean rebuild and passed on the next.

---

## Verifying anything here

```
npm run audit:applied              # migrations actually live in production
npm run verify:tenant-isolation    # passes
npm run inspect:cron-health        # 'idle' now means not-due, not silent
npm run verify:signalwire          # rows tagged [local env] are NOT production
npm run test:pg17:plan-change      # the plan-change source patch
npm run test:pg17:cancel-to-flex   # the cancellation revert
```

The PG17 harness needs a one-time install; the scripts print the command and
**exit 2**, which is not a pass:

```
npm install --no-save embedded-postgres@17.10.0-beta.17 @embedded-postgres/windows-x64@17.10.0-beta.17
(cd node_modules/@embedded-postgres/windows-x64 && node scripts/hydrate-symlinks.js)
export PATH="$PWD/node_modules/@embedded-postgres/windows-x64/native/bin:$PATH"
```

---

## Permissions

**Without asking:** commit, push (the push *is* the deploy), apply migrations,
read production, and drive the authenticated Chrome browser for Vercel.

**Never:** type an API token or signing key into a form field.

---

## The catalog-version bump, 2026-08-18 — half fixed today

### FIXED: the only paid workspace could not collect a card payment

`9cd072de`, migration `20260823190000`, **applied and verified in production**.

`workspace_entitlements` for `7caf66e2` still carried
`catalog_version = '2026-08-15-preview'`, and three live functions refuse on
exactly that column with `55000` — `claim_one_off_direct_checkout_operation`,
`prepare_one_off_direct_invoice_payment`, and
`require_direct_checkout_entitlement_snapshot`, the last reached from two
**enabled** triggers on `billing_payment_operations`. That workspace could not
take money from its own customers by any route. Never observed: its four
`payments` rows all have a NULL `fee_catalog_version`, so the direct rail had
never been tried there.

It was not a relabel — the row carried the old *limits* too, `office_users: 1`
and `dedicated_business_numbers: 1`, having missed both `20260820150000` and
`20260821010000`. `20260819040000` was meant to sweep it forward and skipped it:
its guard matched an eight-key `feature_limits` map and the row has ten.

**The distinction that matters, now documented at `PRICING_CATALOG_VERSION`
itself and guarded by `test/catalog-version-is-a-data-migration.test.ts`:**

| kind | where | rule when the constant moves |
|---|---|---|
| **EVIDENCE** — the version an agreement was signed under | operations, consent acceptances, `billing_subscriptions`, Stripe metadata | immutable; **widen the readers** |
| **CURRENTNESS** — "this row carries catalog X's limits and fee now" | `workspace_entitlements.catalog_version`, `payments.fee_catalog_version` | **move the rows**; never widen |

The 2026-08-18 bump did the first and not the second. Bumping the constant is a
data migration, and a bump is **not** required for an allowance change —
`20260820150000` and `20260821010000` both changed capacity under the same
version deliberately.

### STILL OPEN: that subscription's renewal will not project

`sub_1U5hxLPqTgiW6iRM2f12RKn0` carries `lgq_catalog_version: "2026-08-15-preview"`
in its Stripe metadata, and so does its Price and its original Checkout Session.
`exactMetadata` and the SQL projector both demand the current version, so the
2026-09-18 renewal lands `failed_terminal` on attempt 1.

Fixing it means widening the EVIDENCE readers in TypeScript *and* SQL, and the
harder part: the operation row immutably records the **old** Price ID, so
`loadVerifiedPrice` refuses whichever Price set the environment is bound to —
new set → id mismatch, old set → `validatePrice` rejects the Price's own stale
metadata. Both Price sets exist in the sandbox account and are pairwise
identical in amount.

That row is a *sandbox rehearsal*, not a customer (`PqTgiW6iRM` suffix; Preview
writes the production database), so it costs nothing today.

---

## Also open, lower priority

- **Text credits are in `measure`, not enforce** — the gate was dropped to 0 and
  redeployed today. Four other meters (AI writing, marketing email, AI intake,
  crew seat) are still enforcing; AI writing and marketing email never measured
  first. AI intake and crew seat are single-flag by design, so measure-first was
  never available for them.
- **`owner_alert` and `payment_message` are UNDECIDED** in
  `sms-billing-policy.ts` — deliberately exempt from text credits, awaiting a
  pricing decision.
- **The service-area gate suppresses high-value alerts.** A prune flag makes
  high-value impossible by construction. Disclosed on the Automations page
  (`b8c8ba19`); whether scoring should work that way is still open.
- **Everything in [two-way-messaging-readiness.md](two-way-messaging-readiness.md)**
  — the contractor texting lane is still blocked, and assignment `eaea6053` is
  still failed pending SignalWire.
- **The audit's FIX SOON list** (items 10–15) was never started: seat counts
  contradicting themselves, the Plan & usage tab claiming AI Voice, unpaginated
  reads capping at 1,000 rows, merges orphaning warranties, phone numbers
  silently NULLed.

---

## What none of this checked

Nothing in the audit or the fixes was **executed** end to end. No job was
deleted, no plan changed, no account deleted, no Stripe call made, no page
rendered in a browser. Consequences are derived from the live FK catalog, live
function bodies and source. Production is six internal workspaces in one ZIP with
zero office and zero crew memberships — nothing at scale has ever run here.
