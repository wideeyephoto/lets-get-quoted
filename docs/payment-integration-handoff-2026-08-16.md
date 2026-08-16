# Payment integration handoff — 2026-08-16

This is the durable payment/billing integration checkpoint as of 2026-08-16 in `production-pricing-backend`. No payment feature was activated while producing this handoff.

## Executive state

- Implementation checkpoint HEAD before this handoff-only update: `34daea64b4fc190f7471a3b7b84dcb92aa91fa75` (`Add dark direct Checkout late-success reconciliation`)
- Branch: `codex/pricing-backend-20260815`
- Remote: `https://github.com/wideeyephoto/lets-get-quoted.git`
- At the implementation checkpoint, local `HEAD`, `origin/main`, and live GitHub `main` were identical (`0` ahead, `0` behind), with no local unpublished code commit.
- Latest production code deployment at checkpoint time: Vercel `dpl_E3B73FxNu6hvaVKtrxhoRWSJeNGc`, READY and aliased to `letsgetquoted.com`, commit `34daea64`.
- Implementation-checkpoint GitHub Actions run `31971274232` passed CI, including tests, SEO and stock-image contracts, typecheck, lint, and build.
- The admin readiness, legacy projection cutover, direct Checkout generation, and late-success reconciliation slices are committed separately, pushed, CI-green, and independently reviewed.
- All new Stripe Billing, Merchant direct-charge, and entitlement gates remain dark because the exact-`1` flags and required provider configuration are absent.
- Generation recovery, both admin Billing-operation summaries, and late-success reconciliation are installed on staging only. They are absent from production.
- No Stripe endpoint, Price, secret, Vercel environment, or production Supabase configuration was changed.

## Git status and ownership

Immediately before editing this handoff update, the index and worktree were clean, and `HEAD == origin/main == 34daea64b4fc190f7471a3b7b84dcb92aa91fa75`. This is a historical pre-publication assertion; publishing this document will intentionally create a newer documentation-only commit.

### Integrated admin Billing-operations readiness — commit `06e9874b`

The five-file commit includes the admin navigation, page, bounded loader, focused tests, and `20260816175955_admin_billing_operations_summary.sql`. It is a read-only admin surface exposing counts, ages, fixed schema-constrained error codes, and fail-closed `not_installed`/`unavailable` states. Direct-settlement aggregation uses one service-role-only SECURITY DEFINER RPC while direct table reads remain revoked. The page has no mutation, replay, requeue, or activation control. The summary migration is installed on staging only; production continues to fail closed as `not_installed` for that ledger.

### Integrated legacy payment projection webhook wiring — commit `5baa2949`

The six-file commit includes `.env.example`, the signed legacy webhook route, coordinator, and three test files. It adds exact-`1` cutover branches for legacy payment-plan and Quick Stop projection while preserving OFF behavior. It resolves Session-less PaymentIntent/Charge events to the exact Checkout Session before CAS, supports true off-session events, fails before mutation when an async-failure PaymentIntent is missing, and collapses unknown errors to fixed codes. Both legacy cutover flags remain `0`/absent.

### Integrated direct Checkout generation recovery — commit `3539df7c`

The six-file commit adds the dark append-only Checkout-generation foundation, cap five, one current attempt, exact predecessor lineage, signed expiration, and generation-aware replay. Review fixed a mutable-input TOCTOU and an overbroad destination-rail trigger. The schema is installed on staging only, with zero generation/direct-payment rows and no active caller. The later `34daea64` slice adds the fail-closed late-predecessor hold/neutralization path; final paid-truth/operator resolution remains an activation blocker below.

### Integrated direct Checkout late-success reconciliation — commit `34daea64`

The 16-file commit adds a dark, durable late-success task and an immutable per-payment hold before provider evidence reads. It preserves the predecessor's paid truth, fences Checkout presentation/new generations/normal new settlement/new refunds, and handles an exact successor outside database locks with connected-account GET, stable-idempotency expiration, and a fresh GET before classification. In-flight Session creation remains durably bound but its URL is withheld. Same-event replay is idempotent, while distinct additional paid truth becomes fixed manual review. Once eight provider leases are exhausted, the next due-selector pass atomically terminalizes the linked task and inbox event before any ninth provider attempt. Staff visibility is aggregate-only through a service-role-only SECURITY DEFINER summary. This slice deliberately does not reparent/project the predecessor as canonical paid, settle it, or resolve/release the hold; those operator-resolution steps and committed race evidence remain activation blockers.

## Commits pushed to `origin/main`

These payment/pricing-program commits are already pushed, in chronological order:

```text
b69b935d Centralize production pricing catalog
921741b0 Make pricing ties and Voice comparisons explicit
27361851 Add dark-launched billing foundation
77964cd9 Add dark Plan and usage dashboard
1a2e5a72 Add crash-safe direct checkout orchestration
d58c833e Compile pricing entitlements and plan transitions
c64a1be4 Prorate plan upgrades safely
23904abd Anchor upgrades to monthly allowances
cde9f37b Add tenant-bound Stripe event inbox
b1d0562d Add crash-safe Stripe Merchant provisioning
cf98c27b Reject stale Merchant readiness evidence
c41989f8 Gate AI intake usage and bind plan prices
3b553c2d Make canonical entitlements the admin plan authority
72b66607 Add crash-safe subscription checkout foundation
9a421a0d Add exact direct refund foundation
e1c05654 Enforce crew seats behind dark gate
31aa109c Add dark office seat entitlement gate
10073e55 Bind recurring consent to subscription checkout
f63ed7b3 Project Stripe subscription lifecycle safely
aba52d12 Reset paid allowances on anchored months
da7f8249 Add dark Stripe Billing webhook intake
bcf8fca5 Add dark paid-plan Checkout entrypoint
45bd0eb6 Process paid allowance resets safely
d84115a5 Refresh pricing dashboard UI contracts
b7c1bb67 Process Stripe subscription events safely
28a2d092 Unify pricing copy across public surfaces
310e0da0 Update pricing copy contracts
5ec5aa74 Add dark connected payment webhook intake
3894c235 Schedule dark billing workers
fde575ac Add dark Stripe Merchant onboarding
f9b3ed7e Document dark Stripe rollout gates
9ce2ff47 Add dark direct payment preparation
436852b9 Add dark connected payment success projector
38996234 Block direct payments from legacy refunds
4f3eb02f Settle direct payments durably
d598145f Report direct payment fees accurately
76754382 Schedule dark direct payment settlement
5ba3233a Mirror settled payment texts durably
99db26d1 Keep direct payments off legacy rails
397a7b85 Schedule dark connected payment projection
dc02f061 Retry failed Stripe webhook writes
47261e17 Add dark payment plan projection foundation
a5331503 Add dark Quick Stop reconciliation foundation
fa23a2d3 Harden dark direct checkout replay
1c4ceabc Add dark payment plan payoff binding
16c81698 Schedule dark Quick Stop late refunds
992d347f Record dark connected Checkout expirations
31d79e79 Add dark legacy payment projection coordinator
06e9874b Add admin billing operations readiness
5baa2949 Wire legacy payment projection cutover
3539df7c Add dark direct checkout generation recovery
d26b9bb5 Update payment integration handoff
34daea64 Add dark direct Checkout late-success reconciliation
```

## Supabase state

- Staging project: `uydlabvgauzujdwuqzxq`
- Production project: `mfuvvtrkipkigwqqtcal`
- History versions below are Supabase deployment timestamps; the history names are the durable mapping to the repository migrations.

### Applied to both staging and production

| Database history name | Staging version | Production version |
|---|---:|---:|
| `pricing_entitlements_20260815` | `20260816020449` | `20260816024348` |
| `pricing_entitlements_hardening_20260815` | `20260816021005` | `20260816024410` |
| `stripe_merchant_readiness_scope_20260815` | `20260816021725` | `20260816024417` |
| `pricing_foreign_key_indexes_20260815` | `20260816022223` | `20260816024423` |
| `billing_audit_guards_20260815` | `20260816022528` | `20260816024431` |
| `direct_payment_readiness_gate_20260815` | `20260816022754` | `20260816024438` |
| `stripe_event_inbox_20260815` | `20260816034751` | `20260816035710` |
| `stripe_merchant_provisioning_operations_20260816` | `20260816035039` | `20260816035747` |
| `stripe_merchant_readiness_monotonic_20260816` | `20260816040348` | `20260816041135` |
| `stripe_billing_subscription_checkout_operations_20260816` | `20260816045907` | `20260816051247` |
| `stripe_billing_subscription_customer_fk_indexes_20260816` | `20260816050311` | `20260816051301` |
| `direct_charge_refund_operations_20260816` | `20260816051418` | `20260816052351` |
| `direct_refund_foreign_key_indexes_20260816` | `20260816051654` | `20260816052404` |
| `crew_seat_entitlement_gate_20260816` | `20260816051954` | `20260816052836` |
| `office_seat_entitlement_gate_20260816` | `20260816054504` | `20260816055417` |
| `base_plan_recurring_consent_evidence_20260816` | `20260816055111` | `20260816055945` |
| `stripe_billing_subscription_event_projection_20260816` | `20260816060617` | `20260816062911` |
| `stripe_billing_subscription_projector_hardening_20260816` | `20260816061509` | `20260816062942` |
| `paid_plan_monthly_allowance_reset_20260816` | `20260816062816` | `20260816063242` |
| `billing_allowance_reset_worker_foundation_20260816` | `20260816070014` | `20260816070828` |
| `stripe_billing_subscription_projection_worker_20260816` | `20260816071623` | `20260816072239` |

### Applied only to staging

| Database history name | Staging version | Repository migration |
|---|---:|---|
| `direct_checkout_operation_orchestration_20260815` | `20260816030406` | `20260815224559_direct_checkout_operation_orchestration.sql` |
| `terms_acceptance_prerequisite_20260816` | `20260816045522` | historical Terms prerequisite |
| `one_off_direct_payment_preparation_20260816` | `20260816162451` | `20260816073000_one_off_direct_payment_preparation.sql` |
| `stripe_connected_payment_event_projection_20260816` | `20260816162546` | `20260816080000_stripe_connected_payment_event_projection.sql` |
| `direct_payment_settlement_foundation_20260816` | `20260816162632` | `20260816083000_direct_payment_settlement_foundation.sql` |
| `direct_payment_settlement_sms_inbox_mirror_20260816` | `20260816162744` | `20260816084500_direct_payment_settlement_sms_inbox_mirror.sql` |
| `stripe_connected_payment_projection_worker_20260816` | `20260816162846` | `20260816090000_stripe_connected_payment_projection_worker.sql` |
| `legacy_payment_plan_projection_foundation_20260816` | `20260816162940` | `20260816091500_legacy_payment_plan_projection_foundation.sql` |
| `legacy_quick_stop_payment_reconciliation_20260816` | `20260816162943` | `20260816093000_legacy_quick_stop_payment_reconciliation.sql` |
| `stripe_connected_checkout_expiration_projection_20260816` | `20260816162945` | `20260816094500_stripe_connected_checkout_expiration_projection.sql` |
| `legacy_payment_plan_payoff_owner_binding_20260816` | `20260816162948` | `20260816100000_legacy_payment_plan_payoff_owner_binding.sql` |
| `direct_checkout_generation_recovery_20260816` | `20260816190316` | `20260816161844_direct_checkout_generation_recovery.sql` |
| `admin_billing_operations_summary_20260816` | `20260816204815` | `20260816175955_admin_billing_operations_summary.sql` |
| `direct_checkout_late_success_reconciliation_20260816` | `20260816204826` | `20260816194056_direct_checkout_late_success_reconciliation.sql` |

The three latest staging-only migrations—generation recovery, the admin summary, and late-success reconciliation—are absent from production. The production admin panel therefore continues to fail closed as `not_installed` for both private aggregate RPCs.

Production has the Terms columns and the later consent migration, but it does not have a `terms_acceptance_prerequisite_20260816` history row. Reconcile that historical prerequisite; do not blindly reapply it.

### Live data readiness

Staging currently has one account and one current entitlement, but zero Merchant accounts, zero recently verified Merchant accounts, zero Billing events, zero direct payments, zero direct Checkout operations, zero generation-v2 operations, zero Checkout-expiration rows, zero current Checkout-operation pointers, zero late-success tasks, zero held payments, zero settlement tasks/attempts, zero subscriptions, zero subscription Checkout operations, zero allowance-reset attempts, zero Quick Stop tasks, zero payment plans, zero invoices with line items, and zero requested invoice payments with line items. Generation, admin-summary, and late-success schemas/functions are installed, but staging is not ready for a real direct Checkout E2E without creating a Stripe Test Merchant and eligible fixture.

Production has six accounts/entitlements, zero Merchant accounts/readiness, zero Billing events/subscriptions/subscription Checkout operations, and one payment plan. That plan has a timestamp-only payoff lock, is not active, and has two unresolved plan payments. `payoff_payment_id` is absent because the binding migration is staging-only. There are no plan/Quick Stop target rows among the older destination payments missing PaymentIntent IDs. Production does not have the Checkout-generation schema, either admin summary, the late-success task/hold schema, or their history rows.

## Stripe configuration

No Stripe configuration was changed during this checkpoint.

### Test/Sandbox

- The LETS GET QUOTED Stripe Test/Sandbox account has zero webhook destinations.
- Workbench shows one live endpoint available to import, but the import was not executed.
- There is no Test Billing endpoint and no Test connected-payment endpoint.

### Live

- One visible endpoint exists: `https://letsgetquoted.com/api/stripe/webhook`.
- Stripe shows that endpoint subscribed to seven event types.
- The authenticated read-only view did not expose the exact seven names. Do not infer them from the route handler; reconcile and record the actual Stripe subscription before any cutover.
- No dedicated `/api/stripe/billing/webhook` or `/api/stripe/connected-payments/webhook` endpoint is configured.

### Code allowlists, not live configuration

- Connected payment inbox: Checkout completed/async succeeded/async failed/expired; PaymentIntent processing/succeeded/failed/canceled; Charge succeeded/failed/refunded/refund.updated; dispute created/updated/closed/funds reinstated/funds withdrawn.
- Billing inbox: subscription created/updated/deleted/paused/resumed/pending-update-applied/pending-update-expired/trial-will-end; invoice created/updated/finalized/finalization-failed/paid/payment-succeeded/payment-failed/payment-action-required/marked-uncollectible/voided.
- The connected worker currently projects successful direct Checkout only. Signed expiration has a projector but no due-selector/worker/cron.

## Vercel configuration

No environment variable or deployment configuration was changed during this checkpoint. Secret values were not read or recorded.

### Present

- `STRIPE_SECRET_KEY`: Sensitive, Production.
- `STRIPE_WEBHOOK_SECRET`: Sensitive, Production.
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`: Production.
- `CRON_SECRET`: Sensitive, Production and Preview.

### Absent

- `STRIPE_BILLING_WEBHOOK_SECRET`
- `STRIPE_CONNECTED_PAYMENT_WEBHOOK_SECRET`
- `LGQ_STRIPE_BILLING_LIVEMODE`
- All six `STRIPE_PRICE_{SOLO,GROWTH,SCALE}_{MONTHLY,ANNUAL}` bindings.
- `LGQ_STRIPE_MERCHANT_ONBOARDING_V2_ENABLED`
- `LGQ_STRIPE_BILLING_WEBHOOK_ENABLED`
- `LGQ_STRIPE_CONNECTED_PAYMENT_WEBHOOK_ENABLED`
- `LGQ_PRICING_DASHBOARD_ENABLED`
- `LGQ_BASE_PLAN_SUBSCRIPTION_CHECKOUT_ENABLED`
- `LGQ_AI_INTAKE_USAGE_GATE_ENABLED`
- `LGQ_CREW_SEAT_ENTITLEMENT_GATE_ENABLED`
- `LGQ_OFFICE_SEAT_ENTITLEMENT_GATE_ENABLED`
- `LGQ_STRIPE_SUBSCRIPTION_PROJECTION_WORKER_ENABLED`
- `LGQ_STRIPE_CONNECTED_PAYMENT_PROJECTION_WORKER_ENABLED`
- `LGQ_PAID_PLAN_ALLOWANCE_RESET_WORKER_ENABLED`
- `LGQ_DIRECT_PAYMENT_SETTLEMENT_WORKER_ENABLED`
- `LGQ_LEGACY_QUICK_STOP_LATE_REFUND_WORKER_ENABLED`
- `LGQ_LEGACY_PAYMENT_PLAN_PROJECTION_ENABLED`
- `LGQ_LEGACY_QUICK_STOP_RECONCILIATION_ENABLED`

The gates require the exact string `1`; absent/malformed values are OFF.

### Deployed cron schedules

| Route | Schedule | Gate | Live check |
|---|---|---|---|
| `/api/cron/billing-subscription-projection` | `*/5 * * * *` | `LGQ_STRIPE_SUBSCRIPTION_PROJECTION_WORKER_ENABLED` | empty 404 |
| `/api/cron/billing-allowance-resets` | `*/15 * * * *` | `LGQ_PAID_PLAN_ALLOWANCE_RESET_WORKER_ENABLED` | empty 404 |
| `/api/cron/connected-payment-projection` | `*/5 * * * *` | `LGQ_STRIPE_CONNECTED_PAYMENT_PROJECTION_WORKER_ENABLED` | empty 404 |
| `/api/cron/direct-payment-settlement` | `*/5 * * * *` | `LGQ_DIRECT_PAYMENT_SETTLEMENT_WORKER_ENABLED` | empty 404 |
| `/api/cron/legacy-quick-stop-late-refunds` | `*/5 * * * *` | `LGQ_LEGACY_QUICK_STOP_LATE_REFUND_WORKER_ENABLED` | empty 404 |

The OFF check occurs before `CRON_SECRET`, database, provider, or heartbeat work. The connected webhook returned an empty 404 on an earlier safe POST check while off; GET is method-not-allowed.

After deployment `dpl_E3B73FxNu6hvaVKtrxhoRWSJeNGc`, the homepage returned 200 and all five worker-route GET checks above again returned empty 404 responses. No provider or database work was triggered.

## Canonical product decisions

### Pricing catalog

- Catalog version: `2026-08-15-preview`.

| Plan | Monthly | Annual | Platform fee | Included allowance summary |
|---|---:|---:|---:|---|
| Flex | $0 | $0 | 1.25% / 125 bps | one-time: 1 office, 2 crew, 50 texts, 100 marketing emails, 30 AI Intake, 25 AI Writing, 5 GB |
| Solo | $39 | $420 | 0.50% / 50 bps | monthly: 1 office, 2 crew, 500 texts, 500 emails, 250 Intake, 50 Writing, 10 GB, 100 forwarding minutes |
| Growth | $129 | $1,188 | 0.25% / 25 bps | monthly: 5 office, 10 crew, 1,500 texts, 2,500 emails, 500 Intake, 250 Writing, 100 GB, 100 forwarding minutes |
| Scale | $329 | $3,588 | 0.10% / 10 bps | same core non-voice allowances as Growth; Voice includes 100 minutes, 3 concurrent calls, advanced features, 90-day history |

Voice pricing: Flex $69/month for 100 minutes; Solo $59/month for 100; Growth $55/month for 200; Scale includes the stated 100-minute bundle. Reference Enterprise price is $799/month; a two-workspace full Scale reference is $1,099/month. These are catalog/reference facts, not an activated Enterprise checkout.

Canonical add-ons include: 250 texts for $12 one-time; 1,000 texts for $42; 5,000 emails for $17; 100 AI Intake credits for $15; 250 AI Writing credits for $19; 100 GB for $15/month; office seats $15/month and crew seats $5/month on Solo+.

### Fee basis and rounding

- Platform fee applies only to the discount-adjusted eligible service subtotal before tax and tips, not to gross receipts.
- Use integer cents and basis points, `Math.round`, cumulative proportional allocation across partial payments, and an exact final reconciliation allocation.
- Every direct payment freezes plan, catalog version, bps, decimal rate, gross cents, eligible-service-basis cents, and expected application-fee cents.
- Stripe processing fees are separate.
- Direct reporting recognizes the platform fee as earned only after exact ApplicationFee and BalanceTransaction reconciliation.
- Direct refunds use an immutable, trusted gross/eligible allocation: create the connected Charge refund with `refund_application_fee=false`, then refund the exact platform ApplicationFee amount separately. No authorization writer/caller is active yet.

### Recurring consent

- Terms version: `2026-08-16`.
- Recurring-consent artifact: `base-plan-recurring-2026-08-16`.
- SHA-256: `f39aeedb379d397f941d3c5fc48357703b4cc97148d8b1bb3c2f55b04e449c75`.
- Evidence is bound to authenticated owner, workspace, stable operation, plan, cadence, catalog, amount, USD, Terms version, consent version/hash, actor, and acceptance time.
- Unclaimed evidence expires after 30 minutes; one acceptance is single-use, while the same exact immutable operation may replay.
- Paid subscriptions are prepaid, auto-renew on the same cadence, and cancel at renewal.
- First-annual guarantee: once per verified business, within 30 days, refund the annual prepayment minus one normal monthly charge. It does not retroactively recalculate platform fees and excludes consumed add-ons, Voice/carrier costs, Stripe fees, taxes, and custom work.

### Charge models

- Active legacy rail remains `destination`: Recipient-era `accounts.stripe_connect_id`, destination charges, `application_fee_amount` and `transfer_data`. The legacy route can offer ACH on qualifying large one-offs.
- New direct rail is `payments.charge_model='direct'` with Stripe metadata `lgq_charge_model=merchant_direct_v1`, Accounts v2 `stripe_merchant_account_id`, full Dashboard, `fees_collector=stripe`, `losses_collector=stripe`, card-only Checkout, connected-account object retrieval, and an LGQ application fee.
- Once a payment row is direct, it must never fall back to the destination rail. A rollback flag may stop only new direct preparation; existing direct rows must retain their direct runtime until resolved.
- Platform subscription Billing is platform-only, card-only, and must not use `transfer_data` or `application_fee_percent`.
- Top-up inbox ingestion is deliberately disabled: endpoint/type alone did not prove business purpose. It must remain off until a provider object is durably bound to a trusted top-up purchase/fulfillment operation.

## Verification completed

### Integrated commit gates

- Admin readiness commit `06e9874b`: exact five-file staged diff reviewed; focused/related tests, full typecheck, scoped Next lint, and cached diff checks passed. GitHub Actions run `31964443318` and Vercel deployment `dpl_AKGWv6WYfQ3AMtYEAGEUMZCskNPP` passed/are READY.
- Legacy projection commit `5baa2949`: exact six-file staged diff reviewed; final relevant gate passed 188/188 tests, full typecheck, scoped Next lint, and cached diff checks. GitHub Actions run `31965702228` and Vercel deployment `dpl_2UJ6zQYjmUkPTe8dNeTj1qsor3ok` passed/are READY.
- Checkout-generation commit `3539df7c`: exact six-file staged diff reviewed; focused suites passed 43/43 and the exact nine-suite adjacent gate passed 91/91, plus full typecheck, scoped Next lint, and cached diff checks. GitHub Actions run `31966151221` and Vercel deployment `dpl_FyXuYUfguFRS6TJBKJV5MJnZWRcJ` passed/are READY.
- Late-success commit `34daea64`: exact 16-file staged diff independently reviewed with no unrelated hunk; 23 suites/338 tests, full no-incremental typecheck, official scoped Next lint, and cached diff checks passed. GitHub Actions run `31971274232` and Vercel deployment `dpl_E3B73FxNu6hvaVKtrxhoRWSJeNGc` passed/are READY. The deployment is sourced from Git `main` at the exact commit, has no alias error, and serves `letsgetquoted.com`.
- At the implementation checkpoint, `HEAD == origin/main == 34daea64b4fc190f7471a3b7b84dcb92aa91fa75`. Immediately before editing this handoff update, the index and worktree were clean.

### Transactional and staging evidence

- Before permanent generation apply, the full migration had executed inside `BEGIN/ROLLBACK`; dynamic replacements, triggers, RLS, and ACLs were asserted. A synthetic gen1 create, signed expiration, gen2 successor/replay/begin, gen3-blocked-while-submitted flow passed, and a real requested destination payment accepted a Session assignment under the migrated trigger. Rollback removed all probe artifacts.
- Immediately before permanent apply, staging had zero Checkout operations, expiration rows, direct payments, connected events, current Checkout pointers, and generation history/schema.
- `20260816161844_direct_checkout_generation_recovery.sql` was then applied permanently to staging only through the authenticated Supabase connector as history `20260816190316 direct_checkout_generation_recovery_20260816`.
- Post-apply catalog verification found all 9 expected columns, 9 constraints, 5 valid/ready unique indexes, 9 targeted generation trigger bindings enabled, 16 function/security/search-path/ACL contracts, RLS/table-ACL boundaries, dynamic-source patches, and old-overload/index removals in the expected state, with zero mismatches. The long payment-truth trigger name is PostgreSQL-truncated to `guard_stripe_connected_checkout_expiration_payment_truth_trigge` and points to the correct function.
- A rollback-only, no-Stripe negative body smoke produced `generation_negative_smoke_passed`. Post-smoke counts remained zero for Checkout operations, generation-v2 operations, expirations, direct payments, current pointers, and connected success/expiration events.
- Of 53 total staging security-advisor notices, the only generation-relevant findings were the intended deny-all `rls_enabled_no_policy` INFO notices for the two service-only ledgers. Performance advisors reported unindexed referencing FKs for the new Checkout-expiration, successor, and current-operation-pointer links, plus two pre-existing expiration composite FKs; no advisor fix was applied.
- Production was checked read-only and still has neither the generation history nor schema. No production database mutation occurred.
- There is no checked-in reusable positive post-apply generation fixture or two-connection concurrency harness. Do not describe the permanent install as having a fresh post-apply lineage/race E2E; the positive lineage evidence above is the earlier rollback probe. Build the durable positive/concurrency probe on a disposable PG17 preview branch before activation.
- Direct preparation/success, settlement, monthly allowance reset, subscription projection/hardening, direct-refund, and the staging-only 0730–1000 batch retain their earlier successful rollback/preflight evidence. The generation apply did not change their ledgers.
- Before permanent late-success apply, the complete 2,828-line migration was replayed against staging with its final `COMMIT` replaced by catalog, SQL-null-validator, ACL/RLS, attempt-cap, and rollback assertions. PostgreSQL parsed and installed the full migration, all assertions passed, and rollback removed the task table, payment hold, and summary RPC.
- `20260816175955_admin_billing_operations_summary.sql` and `20260816194056_direct_checkout_late_success_reconciliation.sql` were then applied permanently to staging only through the authenticated Supabase connector as histories `20260816204815 admin_billing_operations_summary_20260816` and `20260816204826 direct_checkout_late_success_reconciliation_20260816`.
- Post-apply staging verification found the late-success task table FORCE-RLS/private, its payment hold and critical columns present, constraints/indexes/triggers healthy, the attempt-cap patch installed, all 15 guarded consumer definitions containing the hold predicate exactly once, and all new service RPCs `SECURITY DEFINER`/empty-search-path/service-role-only where intended. The two initial mismatch counts were verifier false positives caused by comparing the `timestamptz` alias text against PostgreSQL's canonical `timestamp with time zone`; OID-based checks passed, so no remedial database change was required.
- Both aggregate RPCs return a single bounded zero-valued row. Final staging counts remain zero for direct payments, Checkout operations, generation-v2 operations, expirations, current Checkout pointers, late-success tasks, held payments, and connected success/expiration events. Both new migration histories have exactly one row.
- The refreshed staging advisor set has 54 security notices and 253 performance notices overall. The only new security finding attributable to this slice is the intended INFO-level `rls_enabled_no_policy` notice for the deny-all late-success task table. Relevant performance INFO notices report five composite referencing FKs without a full covering index, the simple task `account_id` FK without a covering index, and seven new zero-use indexes on the empty task/hold schema. No new scoped WARN finding appeared, and no advisor fix was auto-applied; review query plans and index shape before scale.
- Production migration history was rechecked read-only and contains none of generation recovery, the admin summary, or late-success reconciliation. No production database mutation occurred.
- This Supabase organization does not currently provide a disposable preview branch for the required committed two-session races. Shared staging and a single rollback transaction cannot honestly prove those interleavings; obtain a disposable PG17 environment before activation.

## Known unresolved issues

The four integrated dark slices have no commit/deploy blocker. The following are program-level activation blockers and hardening debt.

### P0 — do not activate until resolved

1. There are no Test webhook destinations, no dedicated Billing/connected secrets, no six Price bindings, no Billing mode value, and no activation flags in Vercel.
2. Staging has no Merchant account/readiness or eligible real invoice/payment fixture. Synthetic DB probes are not a Stripe Test-clock E2E.
3. Production lacks `direct_checkout_operation_orchestration_20260815`, the staging-only 0730–1000 direct/legacy projection batch, generation recovery, the admin summary, and late-success reconciliation. Reconcile Terms history before any production migration sequence.
4. Direct homeowner dispatch does not exist. The active `/pay` path safely refuses direct rows. Do not bypass this with a global rail flip.
5. Signed Checkout expiration has a projector but no due selector/worker/cron. Generation recovery is installed on staging only and has no active caller, so an expired direct payment still cannot advance through the deployed product.
6. Direct-native refund, dispute, failure, cancellation, abandonment, manual-settlement, and operator reconciliation lifecycles are incomplete. The legacy webhook is intentionally forbidden from mutating direct rows.
7. Subscription activation lacks configured webhook/Prices/workers, portal/cancel UI, upgrade/downgrade/resubscription/current-subscription precedence, dunning/grace/recovery operations, operator dead-letter/requeue, and real Stripe duplicate/out-of-order/test-clock E2E.
8. Legacy plan/Quick Stop projection flags must stay off until the production 0915/0930/1000 migrations are present, the one timestamp-only payoff lock is explicitly bound or cleared, the exact live webhook event subscription is proven, saved-card behavior is tested, and Quick Stop late-refund monitoring is operational.
9. Late direct success now fails closed through a durable task and immutable payment hold established before provider reads. The worker can verify the predecessor's paid truth and either neutralize the exact open/unpaid successor through state-first connected-account expiration or place the case in fixed manual review; Checkout presentation, new generations, settlement, and new refunds remain blocked. The slice intentionally does not reparent/project/settle the predecessor or clear the hold, and it lacks committed two-session/Stripe Test race evidence plus a reviewed operator-resolution transition. Keep the connected projection worker OFF until those gaps are closed and monitored.
10. Legacy Checkout replacement is not serialized by an expected-old-Session CAS. Two overlapping callers can disclose two valid replacement Sessions; the last writer becomes current, and settlement from the other disclosed Session becomes a fixed webhook contradiction. Keep both legacy projection flags OFF until replacement is serialized/idempotent or every disclosed Session is durably tracked.
11. Before generation or late-success migration apply to production, Checkout-operation, immutable expiration, direct-payment, current-pointer, late-task, and held-payment ledgers must satisfy the reviewed zero/compatibility preflight. Staging passed and remains zero; query production immediately before apply and stop for explicit reconciliation if any predicate is nonzero or ambiguous.

### P1 — activation/product gaps

1. Direct preparation deliberately supports only a pristine requested, invoice-linked one-off deposit/stage/final payment equal to the full outstanding balance on a sent/signed invoice. It excludes partial/draft payments, plans, recurring/installments/imported rows, Quick Stop/no-invoice payments, ACH, competing/open provider work, and prior direct rows. Card/ACH parity remains a deliberate decision.
2. Direct refund authorization has no trusted writer, caller, or submitted/indeterminate/external reconciliation worker.
3. Direct cancellation, stale-open/indeterminate reconciliation, generation-cap handling, and customer/operator copy/runbooks are not implemented.
4. Merchant provisioning and payment operations still need operator resolution for submitted/indeterminate states.
5. Subscription paid-plan changes, cancel-at-renewal fulfillment, annual allowance monitoring, dunning messaging, and current-subscription precedence are unspecified or inactive. A late event from historical subscription A must never overwrite subscription B.
6. Top-ups have no purpose-bound purchase/fulfillment ledger and must remain disabled.
7. Entitlement coverage remains incomplete: office seats have no caller; text/email/AI Writing/storage/domain/number/Voice/QBO/top-up enforcement or fulfillment is incomplete.
8. Production's timestamp-only payoff lock and two unresolved plan payments need an explicit owner-binding/cutover decision; do not infer the owner from timing alone.
9. The exact seven event names on the live legacy Stripe endpoint are unknown and must be reconciled before relying on the new projection branches.
10. Late-success cases have no reviewed operator action that projects the preserved paid predecessor, settles its invoice/effects, records any required refund decision, and advances the current write-once hold into an auditable one-way resolved/released state. The design may retain the pointer as evidence and change consumer guards; it must not assume an existing clear operation. Successor neutralization alone is intentionally not payment resolution.

### P2 — hardening and operational debt

1. Generation entrypoint mismatch: the preparation wrapper currently requires fresh Merchant readiness and a currently matching entitlement even for an already-created open Session, while the read-only replay contract is designed to survive later Merchant/entitlement changes. The future public entrypoint must bypass re-preparation for an exact succeeded/open replay or otherwise reconcile this contract.
2. Reserve all generation metadata keys centrally. `lgq_checkout_generation` is overwritten, but a server caller could currently inject `lgq_checkout_predecessor_session_id` on generation one; it is fingerprint-bound and has no present external exploit.
3. Generation recovery currently accepts signed irreversible expiration evidence plus a fresh unpaid object whose `expires_at` is past even if the fresh object still reports `open`. Requiring fresh provider `status=expired` would be stricter.
4. Restore the broader direct Checkout replay-verifier/error matrix removed during generation test refactoring: wrong Session fields/metadata, untrusted URLs, complete-paid presentation, begin-RPC refusal, and dual provider/persistence errors.
5. `protect_direct_checkout_session_identity()` is SECURITY DEFINER, so its `current_user` branch does not observe the invoker role. Exact per-payment GUC fencing plus revoked service-role table writes currently protect it; use invoker/JWT-role semantics if that defense is intended.
6. Legacy payment replay repairs payment plans and Quick Stop, but a crash after the primary paid CAS and before invoice/SMS/feed effects can still leave secondary effects unrepaired.
7. Saved-card provider retrieval remains best-effort and can leave a deposit active without a reusable payment method.
8. The admin readiness page performs 22 bounded table reads plus private aggregate-only summary RPCs on a fully installed schema. Both summaries are installed on staging only; production remains fail-closed for them. The page still has no deployed authenticated visual check or requeue/control surface.
9. Worker dead-letter inspection, requeue, retention, alerting, and count-only heartbeat operations need an operator workflow.
10. AI Intake can waste a provider attempt on a stale unswept 15-minute reservation; a distributed attacker can still drain tenant credits despite per-site/IP limits; rate-limit retention/cleanup is needed.
11. Office-seat staging historically lacked the production one-owner-per-user index. Recheck parity before any office-seat activation.
12. Several SQL suites are static contract tests. There is no durable positive post-apply generation/late-success fixture or two-connection race harness. Create one on a disposable PG17 environment; the current Supabase organization has no preview-branch entitlement. Production has not been probed/applied for the staging-only batch.
13. Add a truthful post-Stripe return-state banner before paid-plan Checkout activation.
14. Existing Stripe app keys are Production-only rather than Preview; `CRON_SECRET` is the only reviewed value present in both Production and Preview.
15. Generation's nonempty-environment upgrade path is inconsistent: preflight can admit some canonical v1 operations, but backfill does not upgrade their metadata and an existing immutable-expiration trigger can block row upgrades. Continue to require empty ledgers, or implement an explicit audited v1-to-v2 migration before applying anywhere nonempty.
16. Supabase performance advisors flag the generation-era `billing_payment_operations_checkout_expiration_fk`, `billing_payment_operations_checkout_successor_fk`, and `payments_current_checkout_operation_fk`, plus the pre-existing expiration operation/payment composite FKs. The late-success slice adds INFO notices for five composite referencing FKs without full covering indexes, the simple task `account_id` FK without a covering index, and seven unused indexes on its currently empty schema. Review real query plans and add only justified focused indexes before scale; no automatic advisor fix was applied.
17. Local `gh auth status` reported the stored CLI token invalid during the final read-only audit, although the authenticated GitHub connector/browser and public Actions checks worked and the authorized push had already completed. Re-authenticate `gh` before a future write that depends on CLI credentials.

## Activation order

1. **Completed:** integrate admin readiness, legacy webhook wiring, generation recovery, and late-success reconciliation as four exact-scope commits; push them and require green CI/Vercel while every flag remains absent/OFF.
2. **Completed on staging only:** run zero-ledger preflights and install generation recovery (`20260816190316`), the admin summary (`20260816204815`), and late-success reconciliation (`20260816204826`); verify catalog, dynamic sources, triggers, RLS/ACLs, aggregate privacy, negative behavior, and zero-ledger preservation. No caller or provider configuration was enabled.
3. Add a reviewed operator-resolution transition for held late-success cases and a durable positive lineage/destination/ACL probe plus committed two-session race harness on a disposable PG17 environment. The current Supabase organization cannot provide the required preview branch. After its local/preview gates pass, apply that additive migration to staging only in a separately reviewed operation and reverify catalog, ACL/RLS, zero/fixture cleanup, and immutable evidence before proceeding.
4. Fix concurrent legacy Checkout replacement with an expected-old-Session CAS/idempotency design or a durable record for every disclosed Session, plus equivalent two-session race coverage.
5. Reconcile production Terms history. Then, only after explicit production authorization and immediate preflights, apply in order: `20260815224559`, `20260816073000`, `080000`, `083000`, `084500`, `090000`, `091500`, `093000`, `094500`, `100000`, `20260816161844`, `20260816175955`, and `20260816194056`, followed by the future reviewed operator-resolution migration and any database migration required for serialized legacy replacement. Use their eventual repository order; never invent a timestamp in advance. Stop on any nonzero unexpected ledger or ambiguity predicate.
6. In Stripe Test, create a Merchant through the v2 flow and verify monotonic readiness. Create all six test Prices with exact catalog amount/cadence/currency/tax behavior/metadata.
7. Create separate Test Billing and connected-payment webhook destinations with distinct secrets. Reconcile the legacy Test event list, including `charge.refunded` where required. Keep all Vercel gates OFF.
8. Exercise signed inbox delivery, duplicates, out-of-order events, retries, expiration, late success, generation two, successor neutralization, operator hold resolution, settlement, direct refunds, Quick Stop late refunds, annual reset, and test-clock subscription flows.
9. Enable ingestion first; then connected/subscription projection; then settlement; then allowance reset; then Quick Stop refund worker. Require monitoring/dead-letter/requeue readiness at each step.
10. Enable Merchant onboarding and the pricing dashboard before any Checkout entrypoint. Enable subscription Checkout only after its complete lifecycle is operational.
11. Direct homeowner Checkout remains blocked until a separate exact-`1` dispatcher is implemented. It must choose the rail before mutation and route persisted direct rows by `charge_model`, never by the new-preparation flag.

## Rollback order

1. Turn off new preparation/Checkout/UI exposure flags first.
2. Keep webhook ingestion, projectors, generation/expiration handling, settlement, refund, and reset workers running until every already-created operation/payment/subscription is terminal or explicitly operator-resolved.
3. For subscription rollback, stop new subscription Checkout but retain Billing webhook/projection/reset/dunning processing for existing subscriptions.
4. Legacy coordinator cutover can return to OFF without a schema rollback, provided no required projection work is abandoned.
5. Never send an existing direct row to the legacy rail. Direct rollback is drain-only.
6. Never down-migrate while rows/events/operations depend on the new schema. Use a reviewed compensating migration only after reconciliation; generation has no down migration.
7. A Vercel code rollback is safe only if the previous deployment can still process every row created by the newer schema. Do not roll worker code back before draining those rows.

## Conversation-only findings that must not be lost

- A global direct-payment flip is unsafe. Direct eligibility must be selected before any mutation; Quick Stop, partial/draft payments, plans/installments, ACH, and existing provider state remain legacy or unavailable.
- One logical payment and frozen amount/fee snapshot spans all direct Checkout generations. Cancel-return is navigation, not failure; reuse an open Session. Complete/paid-pending, submitted, or indeterminate blocks replacement. Generation six and beyond is manual.
- Stripe `after_expiration.recovery` must remain disabled/unset and `recovered_from` must be rejected because Stripe-managed recovery would bypass the durable generation claim.
- An expired predecessor's late paid fact must never be discarded. The late-success task now preserves it and blocks or manualizes the exact successor, but the payment hold must remain until a reviewed operator transition projects/settles the paid truth; successor neutralization alone is not final reconciliation.
- A Checkout Session pointer is not a safe generation boundary when replacement creation lacks an expected-old-Session CAS: overlapping legacy callers can disclose multiple valid Sessions. Serialize/idempotently claim replacement or track every disclosed Session before enabling legacy projection.
- Direct rollback is drain-only: disable new preparation while keeping connected ingestion, success/expiration projection, settlement, and recovery alive.
- Annual allowance Policy A is fail-closed: grant one exact anchored monthly window. If more than one boundary is overdue, write `blocked_catchup`, grant zero, and require reconciliation—no silent skip or retroactive grant manufacture.
- Subscription projection supports the first subscription/first activation path. Paid plan changes/resubscription require explicit current-subscription precedence before activation.
- The direct refund authorization writer intentionally does not exist; never infer a partial refund's gross/service split.
- Office-seat RPC intentionally has no grant/caller because the product has no additional-office-user invitation lifecycle.
- Top-up ingestion was removed because an accountless platform PaymentIntent plus an endpoint label did not establish top-up purpose.
- The live Stripe endpoint reports seven subscribed events, but their exact names were not visible in the read-only audit. This is configuration debt, not evidence that the code allowlist is configured.

## Exact next task

Design and implement one isolated dark late-success operator-resolution/release transition for the now-durable task and write-once payment hold. It must preserve immutable paid and successor evidence, project/settle the predecessor exactly once or require a bounded manual decision, retain an auditable resolution record, change consumer guards only through explicit terminal semantics, and check in a PG17 two-session harness covering expiration-versus-success, completion-versus-hold, duplicate/additional paid facts, and stable replay. Run committed races only on a disposable environment; do not improvise them on shared staging.

After that isolated slice is green, address concurrent legacy Checkout replacement with an expected-old-Session CAS/idempotency design or durable tracking of every disclosed Session, including replacement-versus-replacement and delayed-settlement race coverage. Keep every gate OFF. No production migration, Stripe endpoint/Price mutation, Vercel environment change, secret change, or activation is authorized by this handoff.
