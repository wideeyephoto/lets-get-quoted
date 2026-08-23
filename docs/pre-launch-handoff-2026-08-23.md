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

**The SQL half is done and applied** (`ea92ed3d`, migration `20260823120000`),
verified 13/13 on a real PostgreSQL 17. It is **inert**: nothing writes the new
`base_plan_plan_change` purpose yet, so both relaxations evaluate exactly as
before.

**What remains is the TypeScript half.** The full design, field contract and the
ordering trap are in
[plan-change-fix-design.md](plan-change-fix-design.md). The short version:

1. Capture fresh recurring consent in `ChangePlanPanel`, mirroring
   `BasePlanSubscriptionCheckout`. Not optional — `recurring_consent_acceptance_id`
   is NOT NULL and UNIQUE, so the schema makes consent single-use, and the
   customer is agreeing to a *different* recurring amount.
2. **Write the operation row BEFORE calling Stripe.** A webhook can arrive before
   `subscriptions.update()` returns; a row written afterwards leaves the projector
   meeting an event with no operation to bind, which dead-letters it — the same
   bug from the other side. Writing first and letting Stripe fail leaves an
   orphaned row that is harmless.
3. Put the new `lgq_operation_id` in the subscription metadata, or the binding
   looks up the original checkout.
4. `assertMetadataMatchesPrice` is vacuous — all three comparisons are a value
   against itself. Dead guard, not an open hole (the real check is upstream), but
   the file's header rests its safety argument on it.

**The end-to-end test is what should gate turning the panel back on** — not the
migration and not the design note. The PG17 harness covers the text edit only and
says so.

Until then the safest state is a gated panel and upgrades by hand. There are no
real customers, so that costs nothing.

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
