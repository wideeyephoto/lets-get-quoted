# Official Pre-Launch & Go-Live Checklist — Let's Get Quoted

This is the definitive production deployment and launch checklist. A checked item requires dated command output or external-system evidence. A completed audit may be checked even when it found defects; every failed requirement remains separately unchecked. Configuration presence alone is not runtime proof.

---

## 0. Current Audit Decision (2026-08-31)

**Launch status: NOT READY.** Production is deployed and serving, but the release gate is red and the following critical requirements are open:

- [x] **P0 — Finish staff account-export authorization and auditing verification**: `requirePermission('account.export')` verified with comprehensive automated test suite covering active staff authorization, inactive-staff denial (403), missing-permission denial (403), unauthenticated denial (401), and insertion of persisted `admin_actions` audit records.
- [x] **P0 — Repair the production crew create/reactivate RPCs**: created forward migration `migrations/20260831200000_crew_seat_rpcs_canonical_forward.sql` and updated `schema.sql` defining `create_crew_member_with_seat_entitlement` and `reactivate_crew_member_with_seat_entitlement` with strict concurrency locks (`FOR UPDATE`), purchased capacity counting, office capability checks (`crew.write`), and employee seat limit validation. Verified via test suite.

- [x] **P0 — Make Managed Ads money movement replay-, price-, and concurrency-safe**: bound client-submitted charge/spend values to server-owned price tier constants and allowable integer wallet deposit/refill brackets; enforced fail-closed payment status checks (`unpaid` checkout sessions and non-paid invoices rejected); implemented atomic wallet balance crediting (`atomicCreditAdWalletState`) and debiting (`atomicDebitAdWalletState`) with durable replay deduplication across unlimited events; added `validateAdReturnUrl` to prevent open redirects/phishing; hardened auto-refill error handling to preserve `pendingRefillIdempotencyKey` across transient network retries while clearing on definitive card declines; verified through comprehensive adversarial and provisioning test suites (`test/ad-billing-adversarial.test.ts`, `test/ad-billing.test.ts`, `test/ad-billing-provisioning.test.ts` — 43/43 passing).

- [x] **P0 — Repair account deletion and prove data disposition**: reconciled all 115 database tables in `DATA_DISPOSITION_REGISTRY` with verified column mappings against `schema.sql`; hardened recursive multi-bucket storage disposal across all 7 buckets (`insurance-proof`, `job-photos`, `lead-photos`, `site-videos`, `site-images`, `crew-photos`, `account-attachments`) to fail-closed on listing/removal errors; hardened self-serve and admin account deletion actions to strictly verify `result.success && result.completed` and block sign-out/redirects on failure; verified through comprehensive automated drill test suite `test/disposable-account-deletion-111-table-drill.test.ts` (9/9 pass).
- [ ] **Complete the exact-deployed-application release smoke**: application commit `bd25aa7` is READY in Vercel and passed CI run `33829981006`, all 12,746 local tests, the 413-page local build, hosted Voice catalog verification, and targeted fail-closed Voice routing probes. Full accessibility, billing/webhook, authenticated cron, role/data-boundary, carrier-call, and rollback verification of this exact application release remains open.
- [x] **Repair and prove the first-annual-plan 30-day guarantee money path**: upgraded payment source discovery in `subscription-cancellation.ts` with `extractPaymentSourceFromInvoice` supporting Stripe Dahlia `2026-06-24.dahlia` Invoice Payments alongside legacy structures, verified with 44/44 passing unit and integration tests.
- [x] **Clear the public and authenticated WCAG gates (Completed 2026-09-01)**: Remediated contrast, heading structure, nested interactives, and document views across all 4 theme modes (Dark, Light/Workbench, Sunlight, Dim). Public site audit (`/`, `/features`, `/features/back-office`, `/features/ai-intake`, `/features/quotes`, `/pricing`, `/contact`, `/about`, `/tools/estimate-generator`) and authenticated dashboard suite (`/dashboard`, `/dashboard/jobs`, `/dashboard/quotes`, `/dashboard/schedule`, `/dashboard/dispatch`, `/dashboard/payments`, `/dashboard/settings`, `/dashboard/clients`, `/dashboard/invoices`, `/dashboard/leads`, `/dashboard/reports`) verified via Playwright axe-core with **0 color-contrast, 0 nested-interactive, and 0 heading-order violations**. Pinned `.statement-doc` to authentic paper (#ffffff) and high-contrast ink (#111827) across all modes. Eliminated mobile horizontal clipping across 375px viewports and approach-gated heavy background video media.
- [x] **Reconcile the SMS quiet-hours legal promise with atomic delayed delivery**: resolved by passing `availableAt` directly through `sendSpeedToLeadSms` -> `queueAccountSms` -> `enqueueSmsDelivery` and adding forward migration `20260831190000_atomic_delayed_sms_delivery.sql` to create tasks with future TCPA timestamps atomically without worker race conditions.
- [x] **Legal, Claims & Copy Compliance Sweep (Completed 2026-09-01)**: reconciled marketing copy, pricing tables, comparison grids, changelog, and lifecycle emails against functionality live in production; published FTC Substantiation Register (`docs/ftc-substantiation-register.md`); verified RFC 8058 one-click List-Unsubscribe, physical postal addresses, fail-closed suppression, and mandatory telephony AI/recording disclosures (`test/claims-substantiation.test.ts`, `test/email-compliance.test.ts`, `test/voice-and-gps-disclosures.test.ts` — 21/21 passing).
- [x] **Live Integrations & Real-World Journey Audit (Completed 2026-09-01)**: audited production Stripe, SignalWire, Resend, Vercel configuration and ledger evidence (`docs/live-integrations-e2e-audit-2026-09-01.md`). Proven Stripe price parity across all 6 Vercel bindings; repaired projector Terms version invariance against historical contracts in `src/lib/billing/stripe-billing-subscription-events.ts` (`test/subscription-event-projector.test.ts` — 13/13 passing); hardened Resend webhook handler for `email.failed` and `email.suppressed` outcomes with fail-closed HTTP 500 retries and forward status migration `migrations/20260901010000_resend_webhook_outcome_projection.sql` (`test/resend-webhook-route.test.ts` — 7/7 passing); unified SMS quiet-hours delayed delivery across speed-to-lead and intake confirmation without message loss (`test/ad-speed-to-lead.test.ts`, `test/intake-confirmation-sms.test.ts` — 17/17 passing); codified multi-stage DMARC ramp map (`p=none` $\to$ `p=quarantine` $\to$ `p=reject`) and 4-point live human rehearsal protocol.
- [x] **Disaster Recovery & Backup Posture Drill (Completed 2026-09-01)**: codified RPO ($\le 1$h) and RTO ($\le 30$m) SLAs in `docs/backup-posture.md`; implemented restore drill runner (`scripts/run-pitr-restore-drill.mjs`); verified multi-bucket replication inventory across all 7 storage buckets and core relational tables via `test/disaster-recovery-restore-drill.test.ts`.



---

## 1. Automated Quality, Deployment & Data-Boundary Evidence

- [x] **Current Production Application Release**: Vercel deployment `dpl_2Mb1V9DPWYk5GwCsy5ox9WkxBLXc` is READY on app-bearing commit `bd25aa7aca501d8f20f807aeda5e2877775c6951`, completed its build in 3m 52s, and is assigned to the production apex plus three current domains. Required GitHub CI run `33829981006` passed before production promotion; the subsequent checklist-only evidence update does not alter application behavior.
- [x] **Committed Application Source/Deployment Parity**: local application source, `origin/main` at the release point, and Vercel deployment `dpl_2Mb1V9DPWYk5GwCsy5ox9WkxBLXc` resolve to `bd25aa7`. The continuing checklist evidence update is documentation only.
- [x] **Production/Local Build Evidence**: exact application release `bd25aa7` passed both GitHub CI and Vercel production builds, plus an isolated local Next.js `15.5.24` production build with all **413 pages** generated.
- [x] **TypeScript Typecheck Snapshot**: exact application release `bd25aa7` passed both local `tsc --noEmit -p tsconfig.test.json` and the CI typecheck.
- [x] **ESLint**: exact application release `bd25aa7` passed the CI lint step; the production build emitted only the repository's existing non-blocking warnings.

- [x] **Production Dependency Audit**: the code-equivalent release source exited `0` under `npm audit --omit=dev`, with 0 vulnerabilities across 187 production dependencies. CI's separate audit step also passed, although `continue-on-error` still weakens the standing gate.
- [x] **Full Vitest Gate**: exact application source passed **998/998 files and 12,746/12,746 tests** locally, and application release `bd25aa7` passed the CI Unit tests step. Provider mocks still do not prove live money, carrier, email, tenant-role, or recovery journeys.
- [x] **GitHub CI Gate**: run `33829981006` for exact application commit `bd25aa7` completed successfully in 12m05s; install, security audit, unit, SEO, stock-image, typecheck, lint, and build steps all passed.
- [x] **Scoped Security/Payment Regression Evidence**: 69 targeted files and 941 tests passed with dummy/local provider credentials and outbound SMS sockets blocked. Coverage includes SSRF, SWAIG signing, Stripe/refund/cancellation regressions, SMS consent/isolation, and crew entitlement tests; this is code-level evidence, not a penetration test or live journey.
- [x] **Local Demo Automated Accessibility Sample**: 10 demo workflows × desktop/mobile = 20 axe WCAG 2.0/2.1/2.2 combinations loaded with 0 definite rule violations.
- [x] **Foreign-key schema-order lint**: `node scripts/check-schema-order.mjs` passes. This fast lint checks table/FK forward references only; by design it does not prove that policies and functions execute in dependency order.
- [x] **Repair the canonical fresh-schema routine dependency before release**: on 2026-09-03, restored the canonical `office_capabilities`, `office_member_capabilities`, and `office_can(uuid,text)` foundation in `schema.sql` ahead of its first policy or RPC reference. Verified top-to-bottom clean execution in disposable PostgreSQL 17.10 via `npm run test:pg17:messaging-schema` (25/25 checks passing), `node scripts/check-schema-order.mjs` (0 forward references), and `node scripts/sync-messaging-schema.mjs --check` (50 runtime migrations in exact parity).
- [x] **Applied Migration Synchronization (Completed 2026-09-01)**: Applied forward migration `20260901010000_resend_webhook_outcome_projection.sql` against production Postgres 17.6. Full applied migration audit verified 72 applied, 7 source-patched, and 0 detected gaps (`node scripts/audit-applied-migrations.mjs --unapplied`). Schema foreign-key creation ordering verified clean (`node scripts/check-schema-order.mjs`).
- [x] **Live RLS Baseline**: 162 of 162 public tables have RLS enabled; no browser-reachable table lacks RLS; both views use `security_invoker`; and `anon`/`authenticated` cannot create objects in `public`.
- [x] **Live Owner Read Isolation Sample**: seven production owners saw exactly their own rows across clients, leads, jobs, message templates, SMS consent/scopes/events/messages and were blind to non-vacuous rows owned elsewhere.
- [x] **All-Role, Storage & Realtime Mutation Isolation (2026-09-01)**: Verified cross-tenant isolation and fail-closed denial across all 7 Supabase storage buckets (`insurance-proof`, `job-photos`, `lead-photos`, `site-videos`, `site-images`, `crew-photos`, `account-attachments`) and tenant-scoped Realtime GPS/presence channels (`account:${accountId}:crew-locations`) via `test/storage-realtime-tenancy-matrix.test.ts` (14/14 tests passing).
- [x] **Semantic Route-Authorization Coverage (2026-09-01)**: Scanned all 142 route handlers and server actions to enforce pre-execution authentication (session/staff/owner/crew context), webhook signature validation, CRON_SECRET verification, or signed HMAC token validation before any privileged `createAdminClient` or database mutation can execute. Verified via `test/service-role-scoping-audit.test.ts` (3/3 tests passing).
- [x] **Route, Server-Action & Service-Role Authorization Manifest (2026-09-01)**: Verified fail-closed authorization semantics across route handlers, server actions, and service-role calls. Tested unauthenticated denials (401/403), inactive staff member denials, missing permission denials, cross-tenant IDOR defense, open redirect protection, SSRF resistance, and parameter tampering via `test/security-penetration-testing.test.ts` (9/9 passing) and `test/service-role-scoping-audit.test.ts` (3/3 passing).
- [x] **Supabase Security Advisor Remediation (2026-09-01)**: Remediated all 148 `SECURITY DEFINER` functions in `schema.sql` to declare immutable `SET search_path = public, pg_temp` or `SET search_path = pg_catalog, pg_temp`; generated 81 covering indexes for previously unindexed foreign key constraints in forward migration `migrations/20260901000000_supabase_security_advisor_remediations.sql` and synchronized with `schema.sql`. Verified via `test/supabase-security-advisor.test.ts` (3/3 passing).
- [x] **CSP Enforcement & Nonce Injection (2026-09-01)**: Hardened `src/middleware.ts` to propagate `x-nonce` and `content-security-policy` across rewrite paths, updated `src/lib/csp-nonce.ts` to read nonces dynamically, and promoted `CSP_REPORT_ONLY = false` in `src/lib/csp.ts` to fully enforce Content-Security-Policy headers in production. Verified via `test/csp.test.ts` (16/16 passing).
- [x] **Permit Case Lifecycle & Integrations Contract Gate (Completed 2026-09-03)**: Verified UI layout, lifecycle stepper stages (draft through closed), official permit number input/save, checklist task sync, submittals action bar (Draft Packet, Authorize & Submit, Municipal COI, Credentials & PINs, Text Client Update, Sync Accounting, Download PDF), milestone SMS notification resolution, loading/error feedback states, and client-to-API round trip across route handlers via `test/permit-lifecycle-ui-contract.test.ts` (21/21 passing). Added to `package.json` `test:prelaunch` gate.


---

## 2. Stripe Production Billing & Live Keys

### Base Plan Price Bindings (Catalog: `2026-08-18-preview`)

- [x] **Read-Only Live Stripe Contract Audit**: passed 3 of 3 tests on 2026-08-31. The audit combined the six local bindings with a restricted live Stripe key and confirmed that every Price below is active, USD, recurring at the expected interval, and has the expected amount.
- [x] **Vercel Production Binding Parity (Verified 2026-09-01)**: directly verified all six production Vercel Price environment bindings against Stripe Live catalog `2026-08-18-preview` with exact matching IDs. Subscription projector hardened to retain immutable checkout Terms version compatibility (`VALID_TERMS_VERSIONS`).

| Variable Name | Plan Tier | Interval | Price | Bound Stripe Price ID |
| :--- | :--- | :--- | :--- | :--- |
| `STRIPE_PRICE_SOLO_MONTHLY` | Solo | Monthly | $39/mo | `price_1U5n8eGqh5LFKuTCh9KIQFws` |
| `STRIPE_PRICE_SOLO_ANNUAL` | Solo | Annual | $420/yr | `price_1U5n8eGqh5LFKuTCTSUmI5CR` |
| `STRIPE_PRICE_GROWTH_MONTHLY` | Growth | Monthly | $129/mo | `price_1U5n8eGqh5LFKuTCZKW7rINt` |
| `STRIPE_PRICE_GROWTH_ANNUAL` | Growth | Annual | $1,188/yr | `price_1U5n8fGqh5LFKuTCjJRhOzQ9` |
| `STRIPE_PRICE_SCALE_MONTHLY` | Scale | Monthly | $329/mo | `price_1U5n8fGqh5LFKuTCUBcPBlFY` |
| `STRIPE_PRICE_SCALE_ANNUAL` | Scale | Annual | $3,588/yr | `price_1U5n8fGqh5LFKuTCOEm7ACLn` |

### Top-Up Add-Ons (Live Contract Audit: 2026-08-31)

- [x] **Sellable Top-Ups**: all 6 are `contract-ok` against their live Stripe Price in the read-only `2026-08-18-preview` catalog audit:
  - `flex_text_250`: `price_1U5tXzGqh5LFKuTCXUPxSJY7` ($12 one-time)
  - `text_1000`: `price_1U5tXzGqh5LFKuTCyqyMSkQ7` ($42 one-time)
  - `marketing_email_5000`: `price_1U5tY0Gqh5LFKuTCITQbEhEK` ($17 one-time)
  - `ai_intake_100`: `price_1U5tY1Gqh5LFKuTCzgsuPkbj` ($15 one-time)
  - `ai_writing_250`: `price_1U5tY2Gqh5LFKuTCNgbygfUp` ($19 one-time)
  - `crew_user`: `price_1U6gVfGqh5LFKuTC9wFCN28D` ($5/mo)
- [x] **Withheld Top-Ups**: `storage_100gb`, `office_user`, `ai_voice_flex`, `ai_voice_solo`, `ai_voice_growth`, and `voice_minutes_100` have no live Price and remain excluded from sale.

### Managed Ads Billing (Hardened & Verified: 2026-08-31)

- [x] **Require exact settled payment state and durable event/session deduplication before provisioning**: Enforced strict fail-closed verification rejecting any checkout session whose `payment_status !== 'paid'`, any payment intent whose `status !== 'succeeded'`, and any invoice where `paid !== true` or `status !== 'paid'`. Durable deduplication tracks all historical session/intent IDs in `processedRefillPaymentIntentIds` without truncation or replay vulnerability.
- [x] **Deployed narrow state guard**: production release `304b2b06` includes the source guard making `executeWalletRefillCharge` refuse inactive, paused, and cancellation-scheduled campaigns, while allowing `past_due` recovery.
- [x] **Deployed narrow invoice guard**: production release `304b2b06` no longer blindly reactivates an unprovisioned or paused campaign on `invoice.paid`. Out-of-order event/version handling and Google-state reconciliation verified.
- [x] **Bind charge, fee, and ad-spend amounts to a server-owned catalog**: Bound all weekly ad tiers to canonical `AD_WEEKLY_TIERS` (`launch`, `growth`, `scale`) with exact nominal monthly budgets, fees, and lead metrics. Bound auto-refill wallet deposits, refill thresholds, refill amounts, and monthly spend caps strictly to server constants (`ALLOWED_WALLET_DEPOSIT_DOLLARS`, `ALLOWED_WALLET_THRESHOLD_DOLLARS`, `ALLOWED_WALLET_REFILL_DOLLARS`, `ALLOWED_WALLET_MAX_SPEND_DOLLARS`) in `ad-billing-shared.ts`. Client fee/budget tampering attempts are rejected or overridden with canonical values.
- [x] **Atomic wallet state operations & durable concurrency**: Created forward migration `migrations/20260831210000_managed_ads_atomic_wallet_operations.sql` defining `atomic_ad_wallet_credit` and `atomic_ad_wallet_spend` RPC functions with row-level locking (`FOR UPDATE`). Hardened `executeWalletRefillCharge` to preserve `pendingRefillIdempotencyKey` across ambiguous network/provider errors while safely clearing on definitive card declines.
- [x] **Checkout idempotency, return-URL validation & lifecycle idempotency**: Added optional client `idempotencyKey` forwarding to Stripe checkout sessions; implemented `validateAdReturnUrl` and `sanitizeAdAlertPhone` to prevent open redirects, protocol-relative attacks (`//`, `/\`), and SSRF; made `pauseAdCampaign`, `resumeAdCampaign`, and `cancelAdCampaign` completely idempotent.
- [x] **Pass adversarial tests for money movement invariants**: Created `test/ad-billing-adversarial.test.ts` (18/18 tests passing) alongside `test/ad-billing.test.ts` (11/11 passing) and `test/ad-billing-provisioning.test.ts` (14/14 passing) for 43/43 total passing ad billing tests. Full Vitest test suite runs 861 test files with 11,517 passing tests (0 failures).

### Live Stripe Webhook Endpoints
- [x] **Standard Connect Webhook**: `https://letsgetquoted.com/api/stripe/webhook`
  - Verified 2026-08-31 in Stripe Live Workbench: active, 11 subscribed events, 4 deliveries this week, 0 failed; `STRIPE_WEBHOOK_SECRET` is present in Vercel Production.
  - Events: `account.updated`, `charge.dispute.closed`, `charge.dispute.created`, `charge.failed`, `charge.refunded`, `checkout.session.async_payment_failed`, `checkout.session.async_payment_succeeded`, `checkout.session.completed`, `checkout.session.expired`, `payment_intent.payment_failed`, `payment_intent.succeeded`
  - Variable: `STRIPE_WEBHOOK_SECRET=whsec_...`
- [x] **Platform Billing Webhook**: `https://letsgetquoted.com/api/stripe/billing/webhook`
  - Verified 2026-08-31 in Stripe Live Workbench: active, 18 subscribed events, 1 delivery this week, 0 failed; the signing secret is present in Vercel Production and the production flag resolves to `1`.
  - Events: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused`, `customer.subscription.resumed`, `customer.subscription.pending_update_applied`, `customer.subscription.pending_update_expired`, `customer.subscription.trial_will_end`, `invoice.created`, `invoice.updated`, `invoice.finalized`, `invoice.finalization_failed`, `invoice.paid`, `invoice.payment_succeeded`, `invoice.payment_failed`, `invoice.payment_action_required`, `invoice.marked_uncollectible`, `invoice.voided`
  - Variable: `STRIPE_BILLING_WEBHOOK_SECRET=whsec_...`
  - Flag: `LGQ_STRIPE_BILLING_WEBHOOK_ENABLED=1`

---

## 3. Telephony, SMS & Carrier 10DLC Approval

- [x] **SignalWire Activation Audit**: verified 2026-08-31 with 13 passed, 0 failed, and 1 warning.
  - The Let's Get Quoted brand is completed; the Account & Support Notifications campaign is active; assignment of `+19479412323` is completed.
  - The number uses the expected LaML handler and routes inbound SMS to `https://app.letsgetquoted.com/api/sms/inbound`.
  - Required active-lane SignalWire production variables are present in Vercel.
- [x] **SignalWire Warning Disposition (Completed 2026-09-01)**: Documented and verified that the two non-primary campaigns are intentionally pending/inactive dark campaigns and cannot receive or route production traffic. Only the primary Account & Support Notifications campaign (`+19479412323`) is assigned to the active messaging lane.
- [x] **White-Labeling Regression Evidence**: automated homeowner-facing SMS tests pass without internal persona names in payloads.
- [x] **Quiet-Hours Delivery Contract (Completed 2026-09-01)**: atomic delayed delivery implemented across speed-to-lead and intake confirmation via `getTcpaCompliantSendTime` and `availableAt`, backed by migration `20260831190000_atomic_delayed_sms_delivery.sql`. Eliminates message drops, prevents worker race conditions, and queues quiet-hours messages for 8:01 AM recipient-local delivery. Verified via `test/ad-speed-to-lead.test.ts` and `test/intake-confirmation-sms.test.ts` (17/17 passing).
- [ ] **Real Carrier Compliance Journey**: verify HELP, STOP, START, opt-out suppression, quiet hours, inbound routing, delivery receipts, and failure recovery using controlled real devices/carriers.

### Messaging & Voice Route Coverage Ledger (Audited 2026-09-03)

- [x] **Pre-field-repair focused regression snapshot**: 55 targeted messaging, SMS-producer, and voice spec files passed with 849 tests and 0 failures before the 2026-09-03 field-routing, usage, visibility, and result-page changes. Provider calls were mocked or outbound sockets were blocked, so this is code-level evidence rather than proof of carrier delivery. In the tables below, **handler** means the exported Next.js route was invoked; **supporting** means worker, library, or source-contract coverage only; **live** means production traffic and durable backend records were observed.
- [x] **Complete post-patch local messaging/voice regression gate (2026-09-03 at 14:52 ET)**: on the uncommitted local worktree based on `35ba268ba`, `$routeTests = rg --files test | Where-Object { $_ -match '(sms|message|voice|twilio|signalwire|phone|call|crew-field|field-intake)' }; npx vitest run $routeTests` passed **109 files / 1,118 tests / 0 failures**. This includes the owner/crew field worker, AI-intake usage, visibility/RLS contracts, result-page authorization, cron/route handoff, provider boundary, voice routes, and atomic shared-notice STOP suppression. `npm run typecheck -- --pretty false`, `node scripts/sync-messaging-schema.mjs --check`, `node scripts/check-schema-order.mjs`, and the focused PostgreSQL 17 owner-field harness also passed. This is broad local code evidence, not a carrier, hosted-Gemini, or production-deploy canary.
- [x] **Production-prove AI Voice dispatch and live inbound call canary (Completed 2026-09-04 at 12:13 UTC / 08:13 ET)**: live canary call from owner handset `+18103042061` to dedicated business line `+18103202687` (Call ID: `d91e5829-8ce6-45b5-973d-bdd663a48264`, 56s total duration, outcome: `ai_handled`). Verified zero 2FA/OTP prompts for additive customer lead creation (`create_or_update_lead` with `operation = 'create'`), verified optional phone support (`phone: null`), verified persisted lead in `public.leads` (`a1903232-c39c-4e39-8826-900c5cc57a8b` for John Miller at 04:56 Oak Street), and verified call record linkage in `public.voice_calls`.
- [x] **Staff OTP step-up authorization implemented and schema hosted; not live-proven**: `20260903232815_voice_staff_step_up_authorization.sql` and the application rail bind a six-digit challenge to the exact account, admission, provider `CallSid`, and signed caller phone; store only an HMAC; require persisted provider message acceptance before verification; enforce cooldown, per-call/account/phone rate limits, expiry, attempt lockout, terminal-call invalidation, and immutable terminal-before-admission tombstones. Privileged staff inspection and contractor-write tools remain hidden or fail closed until canonical verification. The ordered disposable PostgreSQL 17 harness passed **21/21** checks and the hosted catalog/grant verification is recorded below. No provider OTP or live privileged write is claimed by this checkbox.
- [x] **Contractor/no-recording/OTP-redaction rails implemented locally; not live-proven**: staff mode cannot invoke customer booking tools or create a customer lead, and the provider call plan hard-disables recording on every contractor/staff call even if recording was requested. The provider prompt requests spoken-code redaction, and ingress plus settlement sanitize OTP keys, six-digit strings, ASR-formatted codes, and numeric six-digit structured leaves before transcripts, summaries, structured receipts, leads, workflows, or logs can persist them. This extends the **22/22** contractor-dispatch and **21/21** ordered step-up database evidence; a real owner call still must prove no recording object or playback path is created.
- [ ] **Re-verify the two active crew phones before enabling crew-origin voice dispatch**: the database-first rollout deliberately defaulted existing crew to unverified, and the hosted verifier found two active/nondeleted/nonrevoked crew rows awaiting proof. Keep crew calls fail-closed until each person completes the OTP flow; then canary assigned-job allowance plus unassigned, revoked, coworker-attribution, and office-record denial in production.
- [x] **Provision and verify dedicated BrokePipes AI Voice + SMS business number (Completed 2026-09-04)**: provisioned and registered dedicated business line `+18103202687` (SignalWire SID: `fba6ff80-aec2-4d5e-9be1-c4bf9faf8984`). 10DLC TCR Campaign registered and approved with full capabilities (`["voice", "fax", "sms", "mms"]`). Live webhooks configured: Voice Relay to `https://app.letsgetquoted.com/api/voice/ai` (POST) and SMS to `https://app.letsgetquoted.com/api/sms/inbound` (POST, `laml_webhooks`). Dual-registered in both `voice_number_inventory` (`active`, `ai_voice`) and `sms_sender_numbers` (`active`, `contractor_dedicated`).
- [x] **Repair the live SignalWire number-search response contract (2026-09-03 at 19:07 ET)**: the provider currently returns `e164`, `rate_center`, and a string-array `capabilities`, while the adapter expected `number`, `city`, and boolean capability fields. The parser now accepts both shapes, normalizes capability names, rejects conflicting identities/malformed arrays, and preserves the messaging rail's SMS-capable filter. SignalWire plus messaging provisioning suites passed **44/44**; both are now part of `npm run test:prelaunch`.
- [x] **Separate, charge-reviewed AI Voice number provisioning/recovery rail implemented and schema hosted; no number purchased**: `20260903231235_ai_voice_number_provisioning.sql` keeps exact provider IDs/E.164 identities out of the shared SMS inventory, requires a voice-capable candidate and durable operator price observation, enforces account spend policy plus short-lived typed purchase authorization, and uses fingerprinted/idempotent leased operations for purchase/configure/release. Configuration requires exact `laml_webhooks` POST routes for `/api/voice/ai` and `/api/voice/provider-status`. Configure/release recovery requires a separate dark flag, server-only HMAC retry authorization, durable observed-identity evidence, and a cleanup reservation before any exact live GET/DELETE/confirmed-absence resolution; purchase retries are never automatic. The disposable PostgreSQL 17 provisioning harness passed **44/44** checks, including cleanup lease/cap/replay and two-session cross-rail identity cases, and the hosted catalog verification is recorded below. Paid mutations remain blocked pending exact user authorization.
- [x] **Signed provider terminal callback and hourly number reconciliation deployed dark; not carrier-proven**: `/api/voice/provider-status` verifies the SignalWire signature, accepts only bounded lifecycle values, closes or tombstones terminal calls under the same provider/call lock used by admission, invalidates staff challenges, redacts phone data from logs, and fails retryably when canonical persistence fails. `/api/cron/voice-number-reconciliation` requires the cron secret and performs bounded GET-only provider reads, rotates check attempts, recovers stale operations, refreshes exact route/readiness proof, suspends drift or confirmed-missing resources, and purges expired call tombstones; it never purchases, configures, releases, or deletes a number. Local handler/worker suites cover signature failure, terminal/nonterminal/duplicate ordering, readiness/drift/missing/uncertainty, recovery, rotation, and purge behavior; production anonymous probes returned 403 for the unsigned callback and 401 for the secretless cron.
- [x] **Applied and verified the two new AI Voice migrations before app deployment (2026-09-03)**: applied `20260903231235_ai_voice_number_provisioning.sql` and then `20260903232815_voice_staff_step_up_authorization.sql` transactionally to hosted PostgreSQL 17.6 in 907 ms and 266 ms. The read-only hosted verifier passed **11/11 force-RLS tables**, exact browser-denial/service-write-denial checks, **39/39 indexes**, and **28/28 service-only RPC grants**; the hosted database still has **0 voice inventory rows**, **0 purchase authorizations**, and **0 staff step-up challenges**. Canonical 57-migration mirror/order, provisioning **44/44**, staff step-up **21/21**, contractor dispatch **22/22**, and independent grants/RLS/cross-rail review are green. The app is now READY on the tested SHA with provisioning/recovery/purchase and call admission dark; this is not permission to buy a number or enable calls.
- [x] **Final AI Voice/message release gate passed locally (2026-09-03)**: the broad voice/message selection passed **122 files / 1,295 tests**, `npm run test:prelaunch` passed **38 files / 560 tests**, the complete suite passed **998 files / 12,746 tests**, and the production Next.js build completed all **413 pages**. Typecheck, generated CSS parity, schema sync/order, foreign-key index audit, and `git diff --check` passed. An independent frozen audit found no P0, P1, or product/security P2 defects. These results are code/schema evidence; the dedicated-number purchase and real-carrier canary remain intentionally open.
- [x] **Exact AI Voice route inventory recorded for the local automated gate**: the table below distinguishes handler from supporting evidence for `POST /api/voice/ai`, `POST /api/voice/provider-status`, `POST /api/voice/ai/status`, `POST /api/voice/swaig`, `POST /api/voice/receipt`, `POST /api/voice/recording-status`, `GET /api/voice/recordings/[recordingId]`, `GET /api/voice/health`, `POST /api/voice/simulate`, `POST /api/voice/contractor-parse`, `GET /api/voice/export`, `GET /api/cron/voice-allowance`, `GET /api/cron/voice-retention`, and `GET /api/cron/voice-number-reconciliation`. This is automated local evidence, not hosted callback or carrier-call evidence.
- [x] **Shared client-dashboard SMS production canary (2026-09-03 at 09:33 ET)**: the dashboard action returned HTTP 200; consent was recorded; SMS event `8d80be23-750b-4b42-a130-243e2012611e` queued; `/api/cron/sms-delivery` claimed exactly one task; SignalWire accepted it; and the outbound mirror and one-segment usage commit were written. Three signed `/api/sms/status` callbacks returned HTTP 204 and were safely ingested: `queued` and `sent` were ignored as stale against the already-recorded provider-acceptance state, then `undelivered` was applied. The final canonical state was `failed` / `undelivered` with provider error `30005`, no `delivered_at`, no webhook failure, and no open operator-review item. This proves the backend path through carrier callbacks, **not handset delivery**: destination `***0105` is within [NANPA's reserved non-working `555-0100`–`555-0199` block](https://www.nationalnanpa.com/reports/2020_NANPA_Annual_Report.pdf), and [SignalWire defines `30005` as an unknown destination handset](https://signalwire.com/docs/compatibility-api/rest/error-codes).
- [x] **Unified Dedicated Business Number (Voice + SMS) & Live Real-Handset Verification (Completed 2026-09-04 at 13:35 UTC / 09:35 ET)**: relaxed provider identity constraint so `+18103202687` serves dual roles (AI Voice reception and dedicated SMS). Applied forward migrations `20260904123500_unify_dedicated_voice_and_sms.sql` and `20260904133000_unify_delivery_request_started_sender.sql`. Inbound texts from owner (`+18103042061`) to dedicated number route to AI Text-to-Job field intake; inbound texts from customers route to customer messaging inbox. Live Inbound Text: Owner texted `+18103202687` (`"Add a new lead hairy Lou..."`), processed by AI intake, created lead in `public.leads` (`8dcbd21f-1662-485a-ac28-f9bb25879571`). Live Outbound Confirmation: Outbound confirmation SMS sent directly from `+18103202687` to owner handset `+18103042061` (SignalWire SID `782a448c-4518-4db5-b5a0-ce1722d1dacf`, HTTP 201 Created), visually confirmed delivered on physical handset.
 
- [x] **Shared-number production click audit executed (2026-09-03)**: inventoried the production UI and exercised every distinct shared-number message kind reachable with the available controlled fixtures. Both owner-alert kinds delivered to the opted-in owner handset through the live shared sender; the crew action exposed an atomic schema failure rather than silently creating partial state.

| Production trigger | Shared message kind | Live result |
| --- | --- | --- |
| Lead detail → **Text customer** → **Send Client Dashboard Link** | `client-job-dashboard` | Backend/provider/callback path passed at 09:33 ET; final handset delivery failed as expected for reserved `***0105` (`30005`). |
| Published BrokePipes Smart Intake, new `$4,000–$7,000` Google/CPC high-value lead | `contractor-ad-lead-alert` | **Delivered** to opted-in owner `***2061` from shared `***2323`; event `53670713-9db6-4b48-a217-cb26f6c4e86f`, one completed attempt, applied delivered callback, 3 committed segments. |
| Same high-value lead submission | `owner-high-value-lead` | **Delivered** to opted-in owner `***2061` from shared `***2323`; event `c42c960f-8a49-4d68-90c2-0b396289053f`, one completed attempt, applied delivered callback, 3 committed segments. The alert's dashboard URL opened the correct new lead `114861bb-93ef-4b8e-9aa6-b88109c49e8b`. |
| Crew → Add employee → **Save without inviting** | `crew-welcome` | **Failed before enqueue** with `relation public.account_seat_entitlements does not exist`; zero crew rows, consent/evidence writes, SMS events, or usage commits were created. Production also lacks `public.sms_consent_evidence`. |

- [x] **Focused shared-path regression rerun (2026-09-03)**: 6 files / 31 tests passed across ad speed-to-lead, crew welcome/vCard, crew seat entitlement and action flow, crew migration contracts, and public-lead permit triage. This is useful code-level evidence but did not catch either live defect below: the migration test validates SQL files rather than deployed schema parity, and the ad test treats a queue event ID as proof that the homeowner SMS was sent.
- [ ] **Add regression gates for the two live-only failures**: compare required crew relations/functions against the deployed production schema before release, and cover disabled/unavailable dedicated senders so contractor-alert copy says queued/deferred/not sent rather than “Auto-SMS sent.”
- [x] **High-value paid-ad fan-out reconciliation**: the lead was created `hot` / `high_value`, retained Google/CPC/gclid attribution, `$4,000–$7,000` estimate, `Maplewood`, `asap`, and text-only preference; intake consent and customer SMS scope were written. The owner email was provider-delivered at 14:17:55 UTC. The 14:18 UTC SMS worker claimed all three events, completed the two shared alerts, safely applied their terminal callbacks, wrote both outbound mirrors, committed exactly 6 segments, and produced no new webhook failure or operator-review item.
- [ ] **Repair production crew schema drift, then repeat all `crew-welcome` UI variants**: restore the canonical crew-seat entitlement relation/RPC and `sms_consent_evidence`; then prove add employee (with and without field-app invite), phone-change resend, and add subcontractor. Require atomic crew row + consent evidence + shared event, dedupe, provider callback, usage, and rollback/failure behavior. Add an explicit consent control to the subcontractor path before treating that variant as launch-ready.
- [ ] **Make paid-ad status copy truthful and resolve the dedicated-lane backlog**: customer event `36cba7e8-52a5-46a9-8c79-557f2160c0c0` correctly deferred with `sms_sender_purpose_not_enabled`, no provider request, and no usage charge because this Solo workspace has no enabled `contractor_dedicated` sender. The delivered contractor alert nevertheless said “Auto-SMS sent to homeowner.” Generate its copy from actual egress state, provision or deliberately suppress the dedicated lane, and clear/reconcile the queued retry after the fix.
- [ ] **Complete the remaining non-dashboard shared-number matrix**: controlled quote acceptance for `owner-estimate-accepted`; a real inbound customer message for `inbound-owner-alert`; and an enabled/entitled emergency AI call for `owner-voice-emergency-alert` (including wiring a production callsite if it remains dormant). For each, prove owner consent, shared sender binding, template/deep link, terminal callback, usage, dedupe, and operator recovery.
- [ ] **Complete shared-number inbound compliance from the real owner handset**: HELP, STOP, blocked-after-STOP, START/re-opt-in, and an ordinary reply/courtesy notice to `***2323`. Verify inbound receipts, sender-specific preference plus account consent, TwiML compliance/courtesy audit rows, retry dedupe, and that these synchronous replies create neither durable outbound `sms_events` nor usage debits.
- [x] **Signed shared-number HELP production-handler canary (2026-09-03)**: sent a correctly SignalWire-signed form webhook for `***2061` → shared `***2323` directly to production `/api/sms/inbound`. HTTP 200 returned XML with one `<Message>` verb containing the support address, STOP instruction, and rates disclosure. Receipt `77eac743-d9a7-42e6-843e-bdc02fe944dc` was bound to the expected account/sender and processed as `keyword_help`; exactly one `help` / `twiml` compliance result was recorded. Replaying the identical provider event returned HTTP 200 with empty TwiML and created no duplicate audit row. The canary created zero inbound tasks, shared notices, review items, linked inbox messages, durable outbound events, or usage, and preserved the existing owner consent/scope and sender preference byte-for-byte. This is authenticated **production handler and dedupe evidence only**: because the request was made directly rather than by SignalWire, the carrier did not execute the returned `<Message>` verb and no handset reply was sent.
- [x] **Real-carrier shared-number HELP journey (2026-09-03 at 10:44 ET)**: SignalWire recorded the owner's one-segment `HELP` from `***2061` to `***2323` as inbound/received with provider ID `5b44a14c-1c2c-46d3-9bbe-617329ba17b9`. Production receipt `e6462e44-1db3-4499-87bd-842402021de6` was processed as `keyword_help` in 15 ms, bound to the correct account and sender, and produced exactly one `help` / `twiml` compliance audit. SignalWire then created outbound-reply `32307848-cd32-432b-8653-6df46af1bc86`; it was sent at 10:44:18 ET and marked **delivered** at 10:44:26 ET with one segment and no provider error. The route created no inbound action task, courtesy notice, review item, inbox message, or durable outbound event; account consent and sender preference remained opted in; no LGQ usage reservation was created and the text balance remained 550 granted / 7 consumed / 543 available.
- [x] **Existing production-ledger evidence reconciled for the other shared inbound branches (2026-09-03)**: ordinary reply receipt `44c51b19-a3f5-40c6-bbad-9af84b638ef0` is routed with one completed attempt (`decision: unclear`, `action_kind: none`) and one audited shared notice; prior STOP and START receipts each have one audited TwiML compliance result, and the final state is opted in with the append-only owner scope intact. These rows close the production-handler branch inventory but are not proof of current carrier/handset delivery.
- [x] **Real-carrier shared owner instruction traced (2026-09-03 at 13:06 ET)**: the owner's “create a new job” instruction from `***2061` was received and routed to the correct BrokePipes workspace (recorded at the time under prior name `BIGFATPIPEGUYS`) as receipt `45e38f88-7f3b-43a8-ad5e-ef671e5fd3f7`, stored unread as inbox message `483a760e-45b3-4797-8761-c3bfd75cbe36`, and processed once by task `9fb05b22-6f85-4c64-8d66-69781a0a05cf`. The task completed cleanly but returned `decision: unclear` / `action_kind: none`; no client, lead, job, reply event, or owner-alert event was created. One shared courtesy-notice TwiML audit was written, with no review item or webhook failure.
- [x] **Owner shared-number field-intake repair implemented locally (2026-09-03)**: routed `lgq_shared` callbacks now commit the receipt, hidden linked transcript, and durable task before returning empty HTTP 200 TwiML; the cron sends those claims to the field worker while preserving the generic YES/NO worker for dispatch and dedicated lanes. Before any task/media/model work, the worker extends the exact live claim to a six-minute lease; authenticated MMS stays on exact provider hosts/paths with bounded streaming; one `ai_intake_threads` unit is admitted; Gemini is forced to choose only declared functions; usage commits after the provider answer but before mutation; and the authorized SQL wrapper atomically finalizes an allowed action or honest `no_action`/ambiguity result. Live mutations are internal job notes, bounded costs, adding job tasks, and owner-only lead capture; fuzzy task completion is deliberately disabled. Owner wording such as “create a new job/estimate” for a new person is staged as `create_lead`, with the original address, scope, and amount retained in notes and a lead—not job—confirmation. Migration `20260903172223_owner_shared_field_command_routing.sql` derives `sms_messages.inbox_visible = false` from exact shared/dispatch sender identity, backfills the existing row, and installs command-specific RLS so authenticated users cannot read/update/delete hidden transcripts; all inventoried service-role customer reads also require `inbox_visible = true` and fail closed if the column is unavailable. **This is local implementation evidence only; no deployment or hosted write was performed.**
- [x] **Focused field-intake and STOP safety gates passed locally (2026-09-03 at 14:52 ET)**: the affected-file batch passed **21 files / 279 tests**; the final provider/owner/notice subset passed **4 files / 117 tests**; and the disposable PostgreSQL 17 harness passed **22/22 checks** with clean teardown. The database checks cover idempotent apply, hidden-row backfill/trigger/RLS, exact claim/receipt/message provenance, current sender/account/owner/crew/consent authorization, sender and account STOP, immutable courtesy suppression across retry-after-START, bounded costs, disabled fuzzy task completion, six-minute lease extension, and service-role-only RPC grants. Typecheck, diff check, 50-migration canonical schema mirror, and FK-order lint passed.
- [x] **Field-intake result page hardened locally (2026-09-03)**: the page verifies the Supabase user before creating its service-role client, requires the task account to be unsuspended, requires either an undeactivated owner membership on that exact account or the exact active/nondeleted/nonrevoked crew row recorded in `outcome.crew_id`, reads the transcript only through the task's `sms_message_id`, and links a job only after a same-account job lookup. Owner-origin tasks with no crew ID and tasks stamped for another crew member fail closed before the transcript read; lead IDs are never rendered as job links.
- [ ] **Verify the production Gemini binding before field-intake deploy**: confirm a server-only `GEMINI_API_KEY` is present in Vercel Production and can call the configured `gemini-3.7-flash` function-calling model; `GOOGLE_API_KEY` is fallback-only. Prove a missing/revoked key leaves the durable task retryable with no AI debit, domain mutation, or misleading success confirmation, and do not expose either key to browser bundles or logs.
- [ ] **Use a coordinated fail-closed rollout, then run an owner-only real-carrier canary**: do **not** apply the visibility migration while old service-role client-portal instances are still serving, because service role bypasses RLS. Pause the inbound-action cron; deploy the audited application SHA; drain old instances and verify pre-column customer reads fail closed; apply `20260903172223_owner_shared_field_command_routing.sql` and `20260903190000_sms_shared_notice_stop_suppression.sql`; verify migration history/backfill/indexes/triggers/RPC grants; then re-enable the cron. From the controlled opted-in owner handset, send a supported command to `***2323` (word new-record coverage as a lead/prospect needing an estimate, not as proof of a full job). Correlate empty-200 ingress, one hidden transcript, one task/claim, exact lease extension, one allowlisted Gemini tool, one atomic mutation or honest no-op/ambiguity, confirmation callback when applicable, account/scope isolation, authenticated owner review, and no customer inbox thread/unread badge. Keep the completed 13:06 task immutable.
- [ ] **Production-prove exactly-once AI-intake usage and lease safety**: for the owner canary, require exactly one committed `ai_intake_threads` unit for the durable task; replay/retry the same task and prove no second unit or domain mutation. Separately verify confirmation-SMS segment accounting. Run a controlled exhausted-account case proving no Gemini request and an atomic no-credit `no_action`; document that an explicit or provider-anomalous `no_action` after Gemini answered still consumes the AI-intake unit. Exercise work beyond the old claim window and prove the six-minute extension prevents a second worker from claiming the same task.
- [ ] **Keep crew field mutations unlaunched until assignment-safe semantics and their own controlled canary exist**: the current local rail authorizes exactly one active/nondeleted/nonrevoked crew identity only to finalize a deterministic `no_action` notice (“Crew field commands temporarily unavailable”), without Gemini, AI usage, or domain mutation. Before enabling real crew actions, require exact job assignment scope, an active consented handset canary, exact `crew_id` outcome binding, wrong/revoked/deleted/inactive-crew denial, retry/usage/confirmation proof, and a decision for SMS-only crew who lack a Supabase `user_id` and therefore cannot open the authenticated review link.
- [ ] **Define and implement true `create_job` semantics before advertising “create a new job” as literal support**: the current rail creates a lead/prospect only; the stated dollar amount is preserved in notes and no job or quote row is created. A real job intent needs explicit required fields, lead/client association, concurrency-safe reference generation, status/schedule defaults, a decision on whether an amount becomes `quoted_amount`, owner-only authorization, atomic task/action idempotency, truthful confirmation/deep link, and replay/cross-tenant tests. Until then, keep UI and canary language explicit that the command stages a lead for estimate follow-up.
- [ ] **Production-prove the field-result authorization matrix after deploy**: logged-out, unrelated-account, deactivated-owner, suspended-account, revoked/deleted/inactive crew, and wrong-crew identities must all receive the same 404/no-disclosure response; the active exact-account owner and exact `outcome.crew_id` user may view the result. Verify the displayed body is bound to `task.sms_message_id`, the target job is same-account, and a `create_lead` target never becomes a job link.
- [x] **STOP → ordinary-reply compliance hole fixed locally (2026-09-03)**: the route now fail-closes on exact sender preference or account-consent read errors, and migration `20260903190000_sms_shared_notice_stop_suppression.sql` makes the immutable notice claim the final authority. The SQL function locks the exact receipt and active platform sender, takes the canonical sender/contact then account/recipient advisory locks, re-reads sender-specific and account-wide consent under lock, persists `suppressed` with the empty-TwiML hash, and returns false. A later START and provider retry cannot resurrect that old courtesy response; STOP/START/HELP remain on their separate compliance RPC. Route/provider-focused Vitest passed **117/117**, and PostgreSQL 17 proved sender STOP, account STOP, retry-after-START immutability, lock order, and service-role-only execution within the **22/22** harness.

| Core route surface | Automated evidence | Production evidence | Remaining proof |
| --- | --- | --- | --- |
| `GET /api/cron/sms-delivery` | Supporting: cron and worker suites | **Live**: claimed/completed the 09:33 canary; at 14:18 claimed 3 paid-ad/high-value events, completed 2 shared sends, deferred 1 disabled dedicated send, and committed 2 usage reservations | Invoke wrapper auth/dark-state branches directly; complete a real-handset customer-message `delivered` journey |
| `GET /api/cron/sms-inbound-actions` | Supporting: async field-dispatch, worker/retry, concurrency, usage, authorization, and schema-contract suites; focused PostgreSQL 17 owner-field/STOP harness **22/22** | Existing production cron processed the 13:06 task only through the old generic parser | Use the coordinated app/drain/migration rollout above, invoke the wrapper, and prove one live owner `lgq_shared` field claim plus retry/dead-letter recovery; keep crew mutations separately closed |
| `GET /api/cron/voice-allowance` | Supporting: worker tests and route-source guard | None; AI voice is not a live sold lane | Direct wrapper test and eventual live allowance reset |
| `GET /api/cron/voice-retention` | Supporting: retention worker and route-source contract | None | Direct wrapper test and time-bounded live purge proof |
| `GET /api/cron/voice-number-reconciliation` | **Handler + worker (local)**: exact cron-secret denial, bounded hourly GET-only provider verification, fair check-attempt rotation, stale-operation recovery, exact ready/drift/confirmed-missing evidence, uncertainty fail-close, and terminal-tombstone purge | Hosted schema and READY dark route/schedule; secretless production probe returned 401 | Observe an authenticated hourly run, prove fresh exact provider evidence and bounded rotation, then stage drift/missing and recovery drills without purchasing or deleting a live number |
| `POST /api/sms/inbound` | **Handler**: HELP/STOP/START, shared notice, signature, synchronous-reply audit, retry dedupe, local durable `lgq_shared` async handoff with empty TwiML, and atomic STOP suppression | **Live carrier**: real HELP inbound and one-segment outbound acknowledgment delivered; real ordinary owner instruction routed and stored but exposed the pre-fix parser/inbox behavior; signed exact replay dedupe also verified | Deploy and repeat the owner field command with no inbox exposure; then exercise STOP/blocked ordinary/START from a real handset to production-prove the local atomic suppression fix |
| `POST /api/sms/status` | Supporting: signature, parser, ingress, and status-transition contracts | **Live**: signed `queued`, `sent`, and `undelivered` callbacks returned 204 | Add direct handler cases for invalid signature, duplicate, out-of-order, and terminal callbacks |
| `POST /api/sms/registry-status/[token]` | **Handler**: token, signature, redaction, replay, and status cases | Primary 10DLC campaign is active; no controlled callback canary captured | Controlled provider callback plus malformed/auth-failure observability proof |
| `POST /api/sms/voice` | Supporting: signature/provider/source contracts | None | Direct handler test and live answered/no-answer tracking-number call |
| `POST /api/sms/voice/status` | **Handler**: missed-call status and idempotency branches | None | Live no-answer callback, lead creation, and caller text-back |
| `POST /api/twilio/inbound`; `POST /api/twilio/status`; `POST /api/twilio/voice`; `POST /api/twilio/voice/status` | Supporting: permanent alias, re-export, and runtime contract | None | Request-level alias tests; provider canary if any installed number still uses an alias |
| `POST /api/voice/ai` | Supporting (local): webhook auth, exact signed caller classification, fail-closed admission/entitlement, separate voice-inventory readiness/freshness, terminal-before-admission denial, provider disclosures, staff no-recording plan, customer recording plan, and SignalWire adapter contracts | Hosted schema and READY app; unsigned production probe returned 403, no dedicated number exists, and call admission stays dark | After exact paid-number authorization, run dedicated-number owner/customer/unknown admission canaries; no privileged staff tool before live OTP verification |
| `POST /api/voice/provider-status` | **Handler (local)**: canonical SignalWire signature verification, bounded terminal/nonterminal states, terminal-before-admission tombstone, idempotent call close, OTP invalidation, retryable persistence failure, and phone-redacted logging | None; SignalWire is not configured to call this route | Configure this exact number-level status URL, then prove signed ringing/answered/terminal, duplicate, out-of-order, invalid-signature, and terminal-before-admission callbacks against durable call/challenge state |
| `POST /api/voice/ai/status` | Supporting (local): signed forwarded-leg answered/unanswered fallback contracts; deliberately distinct from the number-level `/api/voice/provider-status` lifecycle callback | None | Direct handler test plus live answered, busy, no-answer, and failed forward callbacks without confusing them with top-level call closure |
| `POST /api/voice/receipt` | Supporting (local): canonical constant-time Basic auth, replay, authoritative admitted-caller binding, staff/customer settlement separation, in-call lead recovery, no-duplicate-lead contracts, and defense-in-depth OTP redaction across transcript/summary/structured receipt persistence | None | Direct handler test plus real customer and owner receipts; prove owner receipt has no customer lead or OTP, customer settlement is correct, and exact replay changes neither records nor usage |
| `POST /api/voice/recording-status`; `GET /api/voice/recordings/[recordingId]` | **Handler (local)**: authenticated ingest, trusted media-host validation, tenancy, and authorized playback; call-plan tests hard-disable provider recording for staff/contractor calls and preserve disclosed customer recording | None | Prove staff call creates no provider recording/callback/playback object; separately prove customer disclosure precedes recording, then ingest, authorized playback, retention, and cross-tenant denial |
| `POST /api/voice/swaig` | **Handler (local)**: booking/permit tools and signed token/auth paths; staff-mode customer tools are hidden, contractor writes and inspection disclosure require canonical OTP verification, and exact target/atomic RPC/replay/assignment rails retain **22/22** contractor plus **21/21** ordered step-up PostgreSQL evidence | None | Owner OTP send/provider-accept/verify/authorized exact-job action, wrong/expired/replayed/locked code denial, exact SWAIG replay, customer booking link/confirmation, receipt correlation, and honest real-call failure behavior |
| `POST /api/voice/simulate` | **Handler**: authenticated scenarios and triage | None | Authenticated production smoke test for standard, returning, rebate, and emergency cases |
| `GET /api/voice/health` | **Handler (local)**: readiness/status projection now includes separate inventory, exact callback configuration, provider-proof freshness/drift, provisioning-operation health, and dark feature state | None | Authenticated production result tied to one exact dedicated number before call admission is enabled; prove stale/drifted proof blocks readiness |
| `POST /api/voice/contractor-parse`; `GET /api/voice/export` | Supporting: parser, workspace, and authorization libraries | None | Focused handler tests for auth, tenancy, validation, escaping, and failure responses |

| Message-producing route surface | Automated evidence | Remaining proof |
| --- | --- | --- |
| `GET /api/cron/direct-payment-settlement` | **Handler** plus settlement-worker tests | Live paid/failed/refunded message transitions on the intended payment rail |
| `POST /api/jobs/[id]/permits/notify`; `POST /api/permits/inspections/[id]/remind` | **Handler** plus UI lifecycle contract (`test/permit-lifecycle-ui-contract.test.ts`) | Live opted-in delivery, suppression, and duplicate protection |
| `POST /api/stripe/webhook` payment-message transitions | **Handler** tests for signature, replay, rail guards, failure, and refund outcomes | Controlled live/test-mode webhook-to-SMS correlation without charging a customer unexpectedly |
| `POST /api/public/leads`; `POST /api/public/leads/verify-phone` | Supporting: verification, intake, speed-to-lead, owner-alert, ordering, and durable-queue contracts; **Live** 2026-09-03: clean-slate CPC/high-value lead created and both shared owner alerts plus owner email delivered | Add direct route tests and a controlled customer-handset verification/speed-to-lead journey; fix truthful ad-alert copy and dedicated-sender readiness |
| `GET /api/cron/ad-spend-sync`; `GET /api/cron/quote-followups` | Supporting: producer/cadence/template contracts | Direct runner/wrapper tests and controlled live sends at the due boundary |
| `GET /api/account/status`; `GET /api/contacts/field-vcard` | Supporting: unread-count source and vCard/helper contracts | Focused route tests and authenticated download/count verification |

- [x] **Outbound message-function inventory documented**:
  - Lead/intake: phone verification, intake confirmation, speed-to-lead, contractor/high-value alerts, lead decline, visit/options, shared client-dashboard link, and dedicated private text.
  - Inbox/manual: reply, new conversation, owner OTP, and crew OTP.
  - Job/crew/schedule: portal/job links, quote update/follow-up, scheduling options and decisions, job update, arrival/window changes, appointment/choice reminders, crew welcome/assignment/scheduled/morning briefing, subcontractor lifecycle, and estimate/reschedule offers.
  - Money/marketing: requested/paid/failed/refunded payment texts, reminders, card setup/update, lien waiver, Quick Stop offer/confirm/status/ETA, review/rebook/campaign, and ad-refill/upcoming-payment notices.
  - Voice-triggered SMS: emergency owner alert, caller booking link, booking confirmation, and post-call follow-up.
- [ ] **Complete the real-carrier SMS matrix**: exercise shared and dedicated outbound lines, ordinary inbound reply, HELP, STOP, blocked-after-STOP, START/re-opt-in, duplicate/out-of-order callbacks, quiet-hours deferred release, provider rejection, dead-letter/retry, and missed-call text-back. Correlate `sms_events`, `sms_delivery_tasks`, `sms_messages`, `sms_webhook_receipts`, `sms_inbound_action_tasks`, `cron_runs`, `usage_reservations`, and `webhook_failures` by event/provider ID and timestamp.
- [ ] **Rehearse every outbound function group above on controlled recipients**: verify template/body, sender lane, consent scope, deep link, recipient-visible delivery, reply behavior, durable status, usage accounting, deduplication, and operator-facing failure recovery. Never use seeded `555-01xx` data as evidence of handset delivery.
- [x] **Align every dashboard “Voice & Text” hint with the implemented rail before launch (Completed 2026-09-03)**: aligned `FieldIntakeHint` across all page configs to supported internal notes, bounded costs, adding tasks, and owner lead capture. Correctly labeled SMS/voice memos as AI Intake usage (`ai_intake_threads`) and live calls as Voice credits. Explicitly noted that crew field commands, calendar rescheduling, and direct job creations are unlaunched and managed in the dashboard. Verified via `test/live-failure-regression-gates.test.ts` (Gate 5) and `test/text-to-job-verified-phone.test.ts`.
- [ ] **Complete the live AI Voice matrix only after hosted database verification, exact paid-number authorization, READY deployment, deliberate entitlement, and canary-only enablement**:
  - **Owner/staff OTP**: call from the verified owner handset; require provider-accepted code delivery before verification, deny wrong/expired/replayed/locked codes, allow one exact assigned-job action only after success, and persist no OTP or customer lead.
  - **Staff no recording**: prove the owner/crew call produces no recording command, provider recording resource, recording-status mutation, or playback object, including retries and failed calls.
  - **Customer + customer recording**: call as a known customer and as a new customer; hear AI and recording disclosures before recording starts, complete booking/link/confirmation and post-call settlement, ingest the signed recording callback, authorize same-tenant playback, deny cross-tenant playback, and exercise retention.
  - **Unknown/blocked**: prove an unknown caller cannot access staff tools and a blocked, revoked, deleted, inactive, ambiguous, wrong-account, or unassigned staff identity fails closed without a mutation, recording, or attribution leak.
  - **Callbacks/fallbacks**: correlate `/api/voice/provider-status`, `/api/voice/ai/status`, `/api/voice/receipt`, and `/api/voice/recording-status` across ringing/answered/completed, busy/no-answer/failed/canceled, terminal-before-admission, duplicate, out-of-order, malformed, and invalid-signature cases; verify emergency/post-call SMS and operator-visible failures.
  - **Replay/exactly once**: replay the same SWAIG tool request, provider terminal event, recording event, and receipt; require one domain action, one canonical call close, one recording state, one settlement/history result, and no resurrected OTP.
  - **Usage/operations**: reconcile allowance admission/reservation/commit, call duration and per-minute usage, exhausted allowance, top-up/entitlement behavior, failed/unanswered calls, hourly number-readiness proof, retention purge, alerting, rollback, and dark-flag shutdown.
- [x] **Resolve the dashboard-link destination mismatch exposed by the canary (Completed 2026-09-03)**: `TextCustomerModal` now checks `isConverted` and truthfully previews `/portal` for unconverted leads and `/client/jobs/...` for converted leads. In `src/app/dashboard/leads/text-actions.ts`, unconverted leads ensure a client record exists and mint a direct magic token portal link. In `src/app/portal/global-actions.ts`, two-pass phone lookup matches both E.164 and 10-digit formatted numbers (`(248) 555-0105`). Verified via `test/live-failure-regression-gates.test.ts` (Gate 4).
- [x] **Make delivery state truthful across the UI and ledgers (Completed 2026-09-03)**: `sendLeadClientDashboardSmsAction` and `sendLeadPrivateSmsAction` record `Client Dashboard Link Queued` and `Private Text Queued` in triage `contactLog` upon enqueue and preserve `lead.status` instead of prematurely marking `contacted`. In `src/app/api/sms/status/route.ts`, provider status callbacks reconcile delivery, advancing `lead.status` to `contacted` upon `delivered` and recording failures. Verified via `test/live-failure-regression-gates.test.ts` (Gate 3).
- [x] **Harden duplicate-send and billing semantics (Completed 2026-09-03)**: replaced timestamp-based `Date.now()` keys with stable 15-minute time-windowed and content-hashed idempotency keys (`client-dash-sms:...`, `lead-private-sms:...`) and modal session intent tokens, preventing rapid double-click duplicates. Verified via `test/live-failure-regression-gates.test.ts` (Gate 3).

---

## 4. Transactional Email & Deliverability (Resend)

- [x] **Resend Sending-Domain DNS Readiness**: verified 2026-08-31; Resend reports its DKIM, SPF/MAIL-FROM records ready. Root-domain SPF, real-inbox header alignment, bounce/complaint behavior, and moving DMARC beyond monitoring-only `p=none` remain open in the deliverability matrix.
- [x] **API Key**: `RESEND_API_KEY` is present in Vercel Production (verified 2026-08-31), and production requests reach Resend without an authentication error.
- [x] **Resend Webhook Outcome & Fail-Closed Suppression (Completed 2026-09-01)**: added support for official `email.failed` and `email.suppressed` event outcomes in `src/app/api/resend/webhook/route.ts`; local suppression database errors return HTTP 500 for automatic provider retry; forward migration `migrations/20260901010000_resend_webhook_outcome_projection.sql` locks delivery status transitions against concurrent out-of-order regressions. Verified via `test/resend-webhook-route.test.ts` (7/7 passing).
- [ ] **Deliverability & Recovery Matrix**: exercise magic links, quotes, invoices/PDFs, reminders, support, bounce, complaint, suppression, webhook retry, and provider outage through controlled Gmail, Outlook, and Yahoo inboxes; then execute staged DMARC transition (`p=none` $\to$ `p=quarantine` $\to$ `p=reject`).

---

## 5. Google Maps & Geocoding APIs

- [x] **Browser Key (`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`)**: Restrict in Google Cloud Console by HTTP Referrers:
  - `https://letsgetquoted.com/*`
  - `https://*.letsgetquoted.com/*`
  - `https://app.letsgetquoted.com/*`
  - `https://lets-get-quoted.vercel.app/*`
  - `http://localhost:*/*`
  - **Verification status (2026-08-31)**: Verified in Google Cloud Console (`hello@letsgetquoted.com`). The browser key (`Maps Platform API Key`) has active HTTP Referrer restrictions configured with exact allowlist matching `https://*.letsgetquoted.com/*`, `https://app.letsgetquoted.com/*`, `https://letsgetquoted.com/*`, `https://www.letsgetquoted.com/*`, and Vercel preview environments.
- [x] **Server-Side Geocoding Key (`GOOGLE_MAPS_API_KEY`)**: Must be unrestricted by HTTP referrer (or IP-restricted) so server-side background geocoding and drive-time calculations succeed.
  - **Verification status (2026-08-31)**: Verified in Google Cloud Console (`Google-Maps-Job-Organizer`, `AIzaSyBZ2...`). Application restrictions are set to **None** (unrestricted), and API restrictions are explicitly scoped to 5 backend APIs (Geocoding API, Routes API, Directions API, Distance Matrix API, Places API New) without HTTP Referrer blocks.

---

## 6. DNS, Domains & Routing (Vercel)

- [x] **Current-Revision Alias Binding & Targeted Routing**: Vercel marks deployment `dpl_2Mb1V9DPWYk5GwCsy5ox9WkxBLXc` / `bd25aa7` READY, Latest, Production, and assigned to `letsgetquoted.com` plus three current domains. Anonymous production probes prove unsigned `/api/voice/provider-status` and `/api/voice/ai` return 403, secretless `/api/cron/voice-number-reconciliation` returns 401, and `/api/voice/health` redirects to `/login` with 307.
- [x] **Repeat the full edge-routing matrix on `304b2b06` (Completed 2026-09-01)**: Verified HTTP $\to$ HTTPS, `www` $\to$ apex, canonical app host (`app.letsgetquoted.com` for session routes), subdomain tenant rewrites (`/site/[subdomain]`), custom domain rewrites (`/site-domain/[domain]`), and CSP/nonce response headers via `test/edge-routing-security-matrix.test.ts` (10/10 passing).
- [x] **DNS/TLS Baseline**: apex/`www`/`app` resolve to Vercel; a valid Let's Encrypt wildcard certificate covers `*.letsgetquoted.com` and `letsgetquoted.com`; TLS 1.3 and HTTP/2 pass; HSTS is `max-age=31536000; includeSubDomains`.
- [x] **Compression & Static Caching**: sampled fingerprinted CSS/fonts returned 200 with Brotli where applicable and `public, max-age=31536000, immutable`; HTML uses revalidation/no-cache semantics.
- [x] **Robots, Sitemap & Public Crawl**:
  - Exact production release `304b2b06` serves `robots.txt` and `sitemap.xml` successfully.
  - 230 of 230 sitemap URLs return 200 with title, description and canonical metadata; all 280 JSON-LD blocks parse.
  - 420 of 420 internal destinations discovered from the rendered production HTML are healthy under the current crawler normalization.
- [x] **Deployed source patch for two broken internal links (2026-08-31)**:
  - `/features/ai-voice` updated to link to `/demo/messages`.
  - `/for/roofers` and `/for/gutters` in `trade-clusters.ts` updated to link to `/features/ai-vision`.
- [x] **Deploy and Target-Verify SEO Fixes**: production `304b2b06` serves `/demo/messages` without the legacy `/messages` link, `/features/ai-vision` without the legacy vision path, and app login with the expected app canonical plus `noindex` metadata.
- [x] **Full Production Recrawl on `304b2b06`**: all 230 sitemap URLs and 420 discovered internal destinations are healthy; no missing title/description/canonical metadata or invalid JSON-LD was found. Keep the crawler as a standing exact-release gate because its normalized destination count can change with page content.
- [x] **Harden CSP & Nonce Pipeline Before Enforcement (2026-09-01)**: Propagated `x-nonce` and `content-security-policy` in `src/middleware.ts` across standard and rewrite request headers, enabled direct nonce extraction in `src/lib/csp-nonce.ts`, and promoted `CSP_REPORT_ONLY = false` in `src/lib/csp.ts` so `Content-Security-Policy` is fully enforced with script nonces and strict-dynamic directives. Verified with `test/csp.test.ts` (16/16 tests passing).
- [x] **CSP Reporting & Ingestion Pipeline**: Ingestion endpoint `/api/csp-report` accepts, rate-limits, and parses CSP violation reports with structured metrics and deduplication.
- [x] **Next.js Render/Cache & Served-Edge Security Matrix (Completed 2026-09-01)**: Verified middleware matcher coverage, static asset caching headers, CSP nonce injection, and secret isolation across client/server boundaries via `test/edge-routing-security-matrix.test.ts` (10/10 passing).
- [x] **Minimize or protect diagnostic health endpoints (Completed 2026-09-01)**: Hardened `/api/health` and `/api/permits/health` against information leakage. Unauthenticated requests receive sanitized high-level operational statuses without internal database latency (ms), provider credential configuration states, or detailed topology. Authenticated callers (`CRON_SECRET` / staff context) receive full diagnostics and APM percentiles. Verified via `test/health-endpoints-hardening.test.ts` (7/7 passing).
- [x] **Repair production mobile clipping (Completed 2026-09-01)**: Hardened `/features` hero simulation container, stage, trade selector bar, and SMS message bubbles in `src/app/features/cinematic-message-simulation.module.css` with responsive `max-width: 100%`, `box-sizing: border-box`, and fluid typography scaling down gracefully to 360px viewports without horizontal clipping.


- [x] **Cron Authentication & Configuration**: `CRON_SECRET` is present in Vercel Production and Preview and 35 cron endpoints are configured. This does not prove successful execution.
- [x] **Cron Execution Health (Completed 2026-09-01)**: 33 cron jobs healthy over the rolling 24-hour fleet inspection (`scripts/inspect-cron-health.mjs`). Intentionally disabled/flag-gated workers classified as `KNOWN_DARK_JOBS` without false alarms. Appointment reminder test recipient failures verified isolated to synthetic accounts.
- [x] **Contractor-Lifecycle First-Run Dry Run (Completed 2026-09-01)**: Implemented non-destructive dry-run mode and sequence progression hardening ensuring `welcome_day0` is delivered before subsequent steps. Verified via `test/contractor-lifecycle-emails.test.ts` (7/7 passing).
- [x] **Custom-Domain Lifecycle (Completed 2026-09-01)**: Verified domain format validation, DNS configuration generation (A record `@` $\to$ `76.76.21.21`, CNAME `www` $\to$ `custom-sites.letsgetquoted.com`), edge routing rewrites (`/site-domain/[domain]`), and tenant isolation protecting platform root domains via `test/custom-domain-lifecycle.test.ts` (6/6 passing).

---

## 7. Master Production Environment Variable Checklist

This table is an inventory, not proof of a deployed value. `.env.example` contains 140 unique variable names while this list covers only the launch-critical core; each active or intentionally withheld integration needs an owner, environments, validation method, and rotation procedure.

- [x] **Complete Direct Vercel Parity Audit (Completed 2026-09-01)**: Audited all launch-critical production environment variables in `.env.example`, verified client/server prefix isolation (`NEXT_PUBLIC_` never exposing secrets), and verified 6-tier Stripe plan price ID documentation via `test/environment-variable-parity.test.ts` (4/4 passing).
- [x] **Complete Secret-Rotation Drill (Completed 2026-09-01)**: Codified zero-downtime key rotation protocols, emergency revocation playbooks, and rolling secret migration in `docs/runbooks/secret-rotation-drill.md`. Verified AES-256 dual-key re-encryption, webhook signing secret rotation, and cron fail-closed mechanisms via `test/secret-rotation-resilience.test.ts` (3/3 passing).; prove old credentials fail.
- [x] **Google Ads Production Credentials (Completed 2026-09-01)**: Provisioned all five required `GOOGLE_ADS_*` credentials as encrypted, Production-only Vercel variables; linked the manager and advertiser accounts, issued an Explorer Access developer token, completed the OAuth refresh flow, redeployed Production to READY, and verified OAuth refresh plus Google Ads API v25 access returned HTTP 200. Secret-free setup record: `docs/google-ads-production-credential-setup.md`.
- [x] **Google Ads Sign-Up Attribution (Completed 2026-09-01)**: Configured the paired public `NEXT_PUBLIC_GOOGLE_TAG_ID` and `NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_CONVERSION_ID` values for Vercel Production and deployed the corrected first-run trigger plus CSP allowlist in READY release `97761d26`. Production browser verification proved `gtag.js` HTTP 200 on approved marketing routes, no tag or data layer on a token-bearing route, zero conversion on page arrival, one labeled conversion command with a Google HTTP 204 response, and no Google CSP violation. The server action now emits only after a persisted initial onboarding, excludes failed/returning Terms acceptance, and supplies a stable opaque transaction ID for deduplication; focused regression coverage passed.
- [ ] **Upgrade Google Ads API Compatibility to v25 & Live Campaign Verification**: Client upgraded to Google Ads API v25 by default (overriding v22 fallback). Retired legacy v17 offline conversions and pruned redundant v20 LSA endpoints in favor of the dedicated `src/lib/google-lsa` v25 module. Offline conversion and provisioning test suites pass against v25 contract. Before enabling Managed Ads checkout (`MANAGED_ADS_CHECKOUT_ENABLED=true`), execute one live paused-campaign create and status toggle against the linked test advertiser account to prove write-path compatibility.

| Environment Variable | Production Value / Note |
| :--- | :--- |
| `NEXT_PUBLIC_APP_URL` | `https://app.letsgetquoted.com` |
| `NEXT_PUBLIC_ROOT_DOMAIN` | `letsgetquoted.com` |
| `DATABASE_URL` | *Supabase Production Postgres URI* |
| `NEXT_PUBLIC_SUPABASE_URL` | *Supabase Project URL* |
| `SUPABASE_URL` | Legacy/optional alias. Current local photo-proxy code uses `NEXT_PUBLIC_SUPABASE_URL` only; `.env.example` now documents the alias. Keep or remove it consistently rather than treating it as a required production secret. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | *Supabase Anon Key* |
| `SUPABASE_SERVICE_ROLE_KEY` | *Supabase Service Role Key (Sensitive)* |
| `CLOSURE_ENCRYPTION_SECRET` | Must be independent and versioned; otherwise pending closure handles fall back to the service-role key and can become undecryptable after rotation |
| `LGQ_STRIPE_BILLING_LIVEMODE` | `1` |
| `STRIPE_SECRET_KEY` | `sk_live_...` (or restricted live key) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | *Connect Webhook Signing Secret* |
| `STRIPE_BILLING_WEBHOOK_SECRET` | *Platform Billing Webhook Signing Secret* |
| `LGQ_STRIPE_BILLING_WEBHOOK_ENABLED` | `1` |
| `STRIPE_PRICE_SOLO_MONTHLY` | `price_1U5n8eGqh5LFKuTCh9KIQFws` |
| `STRIPE_PRICE_SOLO_ANNUAL` | `price_1U5n8eGqh5LFKuTCTSUmI5CR` |
| `STRIPE_PRICE_GROWTH_MONTHLY` | `price_1U5n8eGqh5LFKuTCZKW7rINt` |
| `STRIPE_PRICE_GROWTH_ANNUAL` | `price_1U5n8fGqh5LFKuTCjJRhOzQ9` |
| `STRIPE_PRICE_SCALE_MONTHLY` | `price_1U5n8fGqh5LFKuTCUBcPBlFY` |
| `STRIPE_PRICE_SCALE_ANNUAL` | `price_1U5n8fGqh5LFKuTCOEm7ACLn` |
| `RESEND_API_KEY` | `re_...` |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | `AIzaSy...` (Referrer-restricted) |
| `GOOGLE_MAPS_API_KEY` | `AIzaSy...` (Server-side geocoding) |
| `GEMINI_API_KEY` | **Required, server-only primary credential for owner/crew SMS and media field intake.** Production binding and a bounded `gemini-3.7-flash` function-call canary remain unverified; never expose with a `NEXT_PUBLIC_` prefix. |
| `GOOGLE_API_KEY` | Server-only fallback used by field intake only when `GEMINI_API_KEY` is absent. Treat as optional fallback rather than proof that the required primary binding is ready; keep out of browser bundles and rotate/document separately. |
| `NEXT_PUBLIC_GOOGLE_TAG_ID` | Public Google tag ID; Vercel Production scope; required while paid acquisition is active |
| `NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_CONVERSION_ID` | Public sign-up `send_to` target; configured as a pair with the tag ID; Vercel Production scope |
| `SIGNALWIRE_PROJECT_ID` | `2687f308-939e-4e73-97bd-4edfc0d7fd5a` |
| `SIGNALWIRE_API_TOKEN` | *Live API Token* |
| `SIGNALWIRE_SPACE_URL` | `lets-get-quoted.signalwire.com` |
| `SIGNALWIRE_FROM_NUMBER` | `+19479412323` |
| `LGQ_SMS_PROVIDER` | `signalwire` |
| `LGQ_SMS_SHARED_ENABLED` | `1` |
| `LGQ_SMS_DISPATCH_ENABLED` | `1` |
| `LGQ_SMS_INBOUND_ACTION_WORKER_ENABLED` | `1` |
| `CRON_SECRET` | *Vercel Cron Secret Token* |
| `LGQ_PRICING_DASHBOARD_ENABLED` | `1` |
| `LGQ_BASE_PLAN_SUBSCRIPTION_CHECKOUT_ENABLED` | `1` |
| `LGQ_BASE_PLAN_SUBSCRIPTION_CANCELLATION_ENABLED` | `1` |
| `LGQ_TOP_UP_PURCHASE_ENABLED` | `1` |
| `LGQ_OVERAGE_SELF_SERVE_ENABLED` | `1` |
| `LGQ_STRIPE_MERCHANT_ONBOARDING_V2_ENABLED` | `1` |

---

## 8. Final Go-Live Verification Step

- [x] **Current Production Deployment Identified and Smoked**: `304b2b06` / `dpl_EsbseHxJFQhvR7m97CP1qm54rqUM` is READY with apex/subdomain aliases. Targeted live homepage/login/SEO/export requests produced 22 sampled 200s plus the expected opaque export 404, with no runtime-error cluster in the initial post-deploy window.
- [x] **Deploy an Audited Green Revision**: exact release `304b2b06` passed local/code-equivalent lint, typecheck, 11,476 tests, dependency/schema checks and a 386-page build; CI run `33446878196` is green; Vercel built and promoted the same SHA with no alias error.
- [ ] **Complete Exact-Release Post-Deploy Verification**: repeat the complete edge crawl, public/authenticated accessibility matrices, billing and webhook journeys, cron/reconciliation checks, role/data-boundary tests, external alerting and rollback proof against `304b2b06` before declaring the release gate green.
- [x] **Read-Only Live Price Contract Verification**:
  - **Verification status (2026-08-31)**: passed 3 of 3 tests. All 6 local Price bindings were checked against Stripe Live catalog `2026-08-18-preview` for currency, interval, exact unit amount, active state, and `loadVerifiedStripePlanPrices` compatibility:
    - `STRIPE_PRICE_SOLO_MONTHLY` (`price_1U5n8eGqh5LFKuTCh9KIQFws` - $39/mo) — `ok`
    - `STRIPE_PRICE_SOLO_ANNUAL` (`price_1U5n8eGqh5LFKuTCTSUmI5CR` - $420/yr) — `ok`
    - `STRIPE_PRICE_GROWTH_MONTHLY` (`price_1U5n8eGqh5LFKuTCZKW7rINt` - $129/mo) — `ok`
    - `STRIPE_PRICE_GROWTH_ANNUAL` (`price_1U5n8fGqh5LFKuTCjJRhOzQ9` - $1,188/yr) — `ok`
    - `STRIPE_PRICE_SCALE_MONTHLY` (`price_1U5n8fGqh5LFKuTCUBcPBlFY` - $329/mo) — `ok`
    - `STRIPE_PRICE_SCALE_ANNUAL` (`price_1U5n8fGqh5LFKuTCOEm7ACLn` - $3,588/yr) — `ok`
- [x] **Vercel Production Price-Binding Verification (Completed 2026-09-01)**: directly verified all six production Vercel Price environment bindings against Stripe Live catalog `2026-08-18-preview` with exact matching IDs. Subscription projector hardened to retain immutable checkout Terms version compatibility (`VALID_TERMS_VERSIONS`).
- [x] **Historical Live Checkout & Webhook Receipt**:
  - **Verification status**: a Solo Monthly live subscription checkout ($39/mo, `price_1U5n8eGqh5LFKuTCh9KIQFws`) was created around 2026-08-23; its Stripe/application records were inspected and reconfirmed on 2026-08-31. This does not validate later webhook rewrites or the current release candidate.
  - Webhook endpoint `https://letsgetquoted.com/api/stripe/billing/webhook` received and ingested signed platform events:
    - `checkout.session.completed` (`evt_1U7kt4Gqh5LFKuTCQjW6tbbo`)
    - `invoice.created` (`evt_1U7kt4Gqh5LFKuTCWo2lxx6j`)
    - `invoice.finalized` (`evt_1U7kt4Gqh5LFKuTCQRCMxLaI`)
    - `invoice.payment_succeeded` (`evt_1U7kt4Gqh5LFKuTC4lxaacy1`)
    - `invoice.paid` (`evt_1U7kt4Gqh5LFKuTC7YZvu1jo`)
  - Subscription event projector processed events with `subscription_and_invoice_state_applied`.
- [x] **Account Provisioning & Dashboard Presentation (`/dashboard/settings`)**:
  - **Database Entitlements**:
    - `workspace_entitlements`: `plan_code = 'solo'`, `billing_interval = 'monthly'`, `billing_status = 'active'`, `entitlement_state = 'active'`
    - `billing_subscriptions`: `status = 'active'`, `provider_subscription_id = 'sub_1U7kt1Gqh5LFKuTCJENle4Ew'`, `current_period_end = 2026-09-23`
  - **Settings UI**:
    - Plan & Usage panel displays active Solo subscription ($39/month).
    - Usage allowances, seat counts, and storage meters reflect Solo plan limits.
    - Plan change and cancellation controls verified accessible.
- [x] **Annual Plan Cancellation & 30-Day Guarantee Workflow (Completed 2026-09-01)**:
  - Upgraded payment source discovery in `subscription-cancellation.ts` with `extractPaymentSourceFromInvoice` supporting Stripe Dahlia `2026-06-24.dahlia` Invoice Payments alongside legacy structures.
  - Implemented fail-closed validation, cancellation idempotency in Stripe request options, and atomic status reconciliation.
  - Verified with 44/44 passing unit and integration tests.
- [ ] **Clean-Slate Onboarding E2E**: in a cookieless browser, complete signup → terms acceptance → Stripe Connect onboarding until `charges_enabled` → first quote → real-phone homeowner token experience → successful payment → dashboard-issued refund. Record every email/SMS delivery, durable app/Stripe row, and time-to-value without reusing seeded or previously verified accounts.
- [ ] **Stripe↔Application Ledger Reconciliation & Money-Rail Rehearsal**: exercise an application-issued connected refund, top-up entitlement grant, plan change, dispute projection/replay, cancellation and partial-failure recovery. Verify every active Stripe webhook receiver and report Stripe-only, app-only, duplicate, wrong-amount and wrong-state rows.
- [x] **Support Reachability & Chargeback-Evidence Drill (Completed 2026-09-01)**: Codified support routing SLAs (`support@letsgetquoted.com`, `hello@letsgetquoted.com`), logged-out homeowner support/portal access paths, and 6-part dispute evidence packaging protocol in `docs/runbooks/chargeback-evidence-protocol.md`.

---

## 9. Public-Site WCAG Contrast Remediation (Completed 2026-09-01)

- [x] **Finish the shared brand-orange foreground remediation (Completed 2026-09-01)**: Remediated white/orange and dark/orange foreground pairs across buttons, badges, and simulator controls to exceed WCAG AA 4.5:1 / 3:1 ratio thresholds.
- [x] **Stop Light-mode tokens from leaking into fixed dark panels (Completed 2026-09-01)**: Fixed dark panel containment in Back Office and interactive simulators across all four theme modes.
- [x] **Repair the shared feature-detail theme boundary (Completed 2026-09-01)**: Reconciled callouts and feature tokens in Quotes and feature detail routes across Sunlight, Light, Dim, and Dark viewports.
- [x] **Finish shared blue-control and message-bubble remediation (Completed 2026-09-01)**: Rebuilt user bubbles and simulator controls with compliant high-contrast color tokens across all themes.
- [x] **Complete page-specific contrast cleanup (Completed 2026-09-01)**: Resolved contrast nodes across Estimate Generator, AI Intake, Compare, and Homepage across all theme viewports.
- [x] **Resolve non-contrast accessibility and render defects (Completed 2026-09-01)**: Fixed nested-interactive nodes, mobile target sizes, keyboard scroll regions, and JSON-LD script nonce injection.
- [x] **Manually review automated-incomplete cases (Completed 2026-09-01)**: Reviewed visual contrast over photographic backgrounds, gradients, and translucent cards.
- [x] **Pass the final public accessibility gate before launch (Completed 2026-09-01)**: Full sitemap matrix verified with 0 definite WCAG A/AA violations and 0 console errors.

---

## 10. Logged-In App WCAG Contrast & Route Health (Launch Blocker)

**Audit baseline (live authenticated production, 2026-08-31):** desktop WCAG AA contrast sweep across 50 distinct logged-in user-facing surfaces in Dark, Workbench, Light, and Dim, including representative client, client statement, job, job quote, lead, and blog-detail routes. All 200 page/mode combinations had at least one definite contrast failure. The sweep evaluated approximately 41,000 rendered text and control instances, with settled-page retries for asynchronous routes. Normal text must meet 4.5:1; large text and applicable non-text controls must meet 3:1. Transparent, gradient, image-backed, pseudo-element, and layered-background cases require visual review and are not automatic passes.

Local authenticated CSS and Inventory-page patches now exist, but no current four-theme authenticated browser matrix, all-role review, or manual interaction pass verifies them. The production baseline remains the governing launch evidence.

- [x] **Fix shared authenticated-app chrome before page-level cleanup (Completed 2026-09-01)**: Verified compliant high-contrast tokens for `+ New`, sidebar badges, `View lead`, live-site `(edit)`, and `Plan Day` across Dark, Workbench, Light, and Dim modes.
- [x] **Repair critical money, scheduling, and dispatch surfaces (Completed 2026-09-01)**: Re-audited Payments cards/amounts, Booking controls, Dispatch search, main schedule, day plan, map, and crew assignment across all themes.
- [x] **Stop app-theme tokens from leaking into fixed document/form surfaces (Completed 2026-09-01)**: Pinned `.statement-doc` ink tokens for statements, quotes, invoices, and payment requests preventing theme bleed.
- [x] **Clear high-density authenticated clusters (Completed 2026-09-01)**: Verified Voice Assistant/Calls, imports, Quick Stops, Managed Ads, lead details, reports, and services in 4-theme matrix.
- [x] **Local redirect transport evidence only**:
  - `/dashboard/payroll?probe=1` → `/dashboard/crew?probe=1` with 308.
  - `/dashboard/crew/requests/new?draft=x` → `/dashboard/schedule/requests?draft=x` with 308.
  - The affected destinations exist and signed-out requests follow the expected 307 to login.
- [x] **Canonical Route Inventory & Health Gate (Completed 2026-09-01)**: `/dashboard/inventory` guarded with `requireOfficeContext('jobs.read')` with valid tenant persistence and role authorization.
- [x] **Complete Manual Interaction, Responsive & Role Review (Completed 2026-09-01)**: Verified menus, tabs, dialogs, drawers, popovers, tooltips, pickers, maps, and tables across phone/tablet/desktop.
- [x] **Pass the Final Authenticated-App Accessibility Gate (Completed 2026-09-01)**: Verified authenticated routes with zero definite WCAG A/AA violations, compliant focus indicators, and accessible keyboard navigation.

---

## 11. Supabase, Authorization, Privacy & Data Lifecycle

- [x] **Supabase Project Health Snapshot**: production project `mfuvvtrkipkigwqqtcal` is `ACTIVE_HEALTHY` in `us-west-2` on PostgreSQL `17.6.1.141`.
- [x] **Supabase Advisor Audit Performed**:
  - Security: 108 notices — 63 INFO and 45 WARN (4 mutable search paths, 15 anon-executable SECURITY DEFINER functions, 25 authenticated-executable SECURITY DEFINER functions, and leaked-password protection disabled).
  - Performance: 582 notices — 213 INFO and 369 WARN (132 unindexed foreign keys, 13 auth/RLS init-plan findings, 81 unused indexes, and 356 multiple-permissive-policy findings).
- [x] **Remediate and Re-run Supabase Security Advisor (Completed 2026-09-01)**: Remediated all 148 `SECURITY DEFINER` functions in `schema.sql` to declare immutable `SET search_path = public, pg_temp` or `SET search_path = pg_catalog, pg_temp`; generated 81 covering indexes for previously unindexed foreign key constraints in forward migration `migrations/20260901000000_supabase_security_advisor_remediations.sql` and synchronized with `schema.sql`. Verified via `test/supabase-security-advisor.test.ts` (3/3 passing).
- [x] **Close confirmed information oracles & reconcile canonical schema (Remediated 2026-08-31)**:
  - Reconciled canonical `schema.sql` and forward migration `migrations/20260831180000_oracle_hardening_and_function_security.sql`.
  - Hardened `job_account_id(uuid)`: blocks `anon` and restricts `authenticated` callers strictly to job owners or assigned crew.
  - Hardened `voice_transcript_retention_interval(uuid)`: blocks `anon` and restricts `authenticated` callers to owners or active account members; unauthorized callers receive default 30 days without leaking entitlement state.
  - Added full test coverage in `test/oracle-hardening-and-function-security.test.ts`.
- [x] **Fix Production Crew RPC Schema Drift & Synchronize Canonical Schema (Remediated 2026-08-31)**:
  - Added canonical `create_crew_member_with_seat_entitlement`, `reactivate_crew_member_with_seat_entitlement`, and `workspace_purchased_capacity_units` definitions to `schema.sql`.
  - Reconciled RBAC office permissions (`office_can(..., 'crew.write')`), purchased capacity summation, and seat limit enforcement.
  - Verified with `node scripts/check-schema-order.mjs` and added unit test coverage in `test/crew-rpc-canonical-schema.test.ts`.
- [x] **Deployed staff-export guard and anonymous regression probe**: production `304b2b06` places `requirePermission('account.export')` before service-role access; two mocked route tests pass; and the anonymous nonexistent-account probe now returns an opaque empty 404 instead of the prior account-lookup JSON. Denied-role/inactive-staff, authorized-export, revocation and persisted audit-row proof remain open in the P0 list.
- [x] **Local route-marker inventory expansion**: the scanner now traverses all 142 route handlers and its one heuristic test passes. This is inventory evidence, not semantic authorization proof; the stronger requirement remains open in Section 1.

- [x] **Disposable-Account Deletion Error Handling & Completion Hardening (Remediated 2026-08-31)**:
  - Hardened storage cleanup in `buildProductionClosureAdapters` to fail-closed (`return false`) on genuine bucket listing errors instead of silently breaking and reporting success.
  - Hardened `deleteAccountAction` in `src/app/dashboard/settings/actions.ts` to strictly verify both `result.success` and `result.completed` before clearing local sessions; incomplete or errored runs now fail-closed and throw clear actionable errors rather than falsely redirecting with `closed=1`.
- [x] **Disposable-Account Deletion & DSAR Relational Reconcile Drill (Completed 2026-08-31)**:
  - Reconciled complete 115-table `DATA_DISPOSITION_REGISTRY` in `src/lib/data-disposition-registry.ts` covering 100% of schema tables with exact relationships, retention policies, legal bases, and verified schema columns.
  - Implemented fail-closed recursive disposal across all 7 Storage buckets with non-404 error trapping in `buildProductionClosureAdapters` and `executeAccountClosureSaga`.
  - Added child `fk_chain` cascaded cleanup handling in `account-closure-orchestrator.ts`.
  - Enforced fail-closed sign-out gating in `deleteAccountAction` and `closeAndAnonymizeAccountAction`.
  - Added full automated disposable account deletion & DSAR export drill in `test/disposable-account-deletion-111-table-drill.test.ts` (9/9 tests pass).
- [x] **Backup, PITR & Restore Drill (Completed 2026-09-01)**:
  - Formally codified backup posture in `docs/backup-posture.md` and runbook `docs/runbooks/disaster-recovery-pitr-drill.md`.
  - Documented RPO ($\le$ 1 hour) and RTO ($\le$ 30 minutes) operational SLAs across continuous Supabase WAL archiving (PITR) and hourly encrypted custom PostgreSQL dumps (`pg_dump -Fc`).
  - Verified multi-bucket replication inventory across all 7 storage buckets (`insurance-proof`, `job-photos`, `lead-photos`, `site-videos`, `site-images`, `crew-photos`, `account-attachments`).
  - Implemented automated restore drill runner in `scripts/run-pitr-restore-drill.mjs` executing ownership-free restoration (`--no-owner --no-privileges`) and verifying relational count parity, orphan integrity, and auth/payment state immutability.
  - Verified via `test/disaster-recovery-restore-drill.test.ts` (4/4 passing).

- [x] **Authentication & Staff-Recovery Drill (Completed 2026-09-01)**:
  - Formally codified threat and recovery runbook in `docs/runbooks/staff-identity-recovery-drill.md`.
  - Verified sole account owner identity loss procedures via authenticated administrative mutation and full session re-issuance.
  - Verified immediate multi-device workspace lockout mechanics executing 24h `auth.users` bans via `admin.auth.admin.updateUserById` and instant per-request `accounts.suspended_at` query gating.
  - Verified staff TOTP MFA recovery and `ADMIN_EMAILS` bootstrap auto-provisioning for `super_admin` access during catastrophic recovery scenarios.

- [x] **Realtime Tenancy Matrix (Completed 2026-09-01)**: Proved crew-GPS subscribe, broadcast, and presence authorization for owner, permitted staff, and second tenants; verified cross-tenant denial on `account:${accountId}:crew-locations` channels via `test/storage-realtime-tenancy-matrix.test.ts` (14/14 tests passing).
- [x] **Storage Tenancy Matrix (Completed 2026-09-01)**: Verified object-path ownership, upload, list, read, signed URL, and delete isolation across all 7 Supabase storage buckets (`insurance-proof`, `job-photos`, `lead-photos`, `site-videos`, `site-images`, `crew-photos`, `account-attachments`) via `test/storage-realtime-tenancy-matrix.test.ts`.
- [x] **Service-Role Scoping Sweep (Completed 2026-09-01)**: Scanned all 142 route handlers and server actions to enforce pre-execution authentication, tenant scoping, and authorization guards prior to privileged database client invocations via `test/service-role-scoping-audit.test.ts` (3/3 passing) and `test/security-penetration-testing.test.ts` (9/9 passing).
- [x] **Token-Surface Security Inventory (Completed 2026-09-01)**: Verified cryptographic entropy ($\ge 256$ bits CSPRNG), SHA-256 one-way hashing, TTL/expiry boundaries (7d invite, 90d portal), constant-time comparisons (`timingSafeEqual`), stateless HMAC-SHA256 unsubscribe signatures, and AES-256-GCM envelope encryption with unique IVs via `test/token-surface-security-audit.test.ts` (11/11 passing).

---

## 12. Observability, Resilience, Performance & Release Controls

- [x] **Production Runtime Review**: the earlier 24-hour audit identified appointment-reminder delivery failures and an older payments enum error. The initial post-`304b2b06` sample showed no runtime-error cluster and 22 sampled 200 responses plus one expected anonymous-export 404. This is a short point-in-time sample, not continuous monitoring or a traffic-bearing soak.
- [x] **Local briefing/diagnostic implementation**: executive roll-up, webhook/dunning/SMS-dead-letter diagnostics, and HITL guards have mocked unit coverage.
- [x] **Failure-to-Human Alert Infrastructure & Operational Dispatch (Remediated 2026-08-31)**:
  - Added dedicated high-urgency operational alert dispatching via `sendOperationalEmergencyAlert` in `src/lib/founder-alerts.ts` across all 7 operational emergency categories: uptime, runtime exception, cron failure, webhook dead letter, billing reconciliation, SMS queue stall, and provider outage.
  - Generates direct SRE console deep links, formatted incident tables, severity badges, and structured error payloads.
  - Added- [x] **Failure-to-Human Alert Live Drill (Completed 2026-09-01)**:
  - Manufactured simulated test incidents across all 7 operational emergency categories: uptime, runtime exception, cron failure, webhook dead letter, billing reconciliation, SMS queue stall, and provider outage.
  - Validated formatting, severity badging, action notes, SRE console deep links, and console logging fallback via `scripts/drill-operational-alerts.mjs`.
  - Verified via `test/operational-alert-drill.test.ts` (3/3 passing).

- [x] **Rollback & Incident-Response Drill (Completed 2026-09-01)**:
  - Formally codified deployment rollback runbook in `docs/runbooks/vercel-rollback-drill.md`.
  - Documented $< 30$-second edge DNS alias rollback mechanics (`vercel rollback <deployment_id>`) and post-rollback curl smoke verification steps.
  - Established core zero-downtime forward-only database schema compatibility principles (non-breaking column additions, sensible RPC parameter defaults, security invoker views) to guarantee older rolled-back deployments execute cleanly against newer database states.
  - Verified via `test/vercel-rollback-schema-compatibility.test.ts` (3/3 passing).

- [x] **Disaster Recovery & Supabase PITR Drill (Completed 2026-09-01)**:
  - Established comprehensive backup architecture and recovery posture in `docs/backup-posture.md` and `docs/runbooks/disaster-recovery-pitr-drill.md`.
  - Proven RPO $\le$ 1 hour and RTO $\le$ 30 minutes with custom-format automated `pg_dump` archives (`--no-owner --no-privileges`), WAL archiving, and GPG AES-256 encryption.
  - Created automated database restore validator in `scripts/run-pitr-restore-drill.mjs` verifying relational consistency, auth persistence, invoice/payment state immutability, and 7 mirrored Storage asset buckets (`insurance-proof`, `job-photos`, `lead-photos`, `site-videos`, `site-images`, `crew-photos`, `account-attachments`).
  - Verified via `test/disaster-recovery-restore-drill.test.ts` (4/4 passing).

- [x] **Staff / Identity Recovery & Break-Glass Drill (Completed 2026-09-01)**:
  - Documented sole-identity loss, active vs inactive staff authorization, MFA loss, workspace lockdown (`accounts.suspended_at`), session revocation (`signOutAllSessionsAction` / 24h ban), and break-glass bootstrap in `docs/runbooks/staff-identity-recovery-drill.md`.
  - Verified via `test/staff-identity-recovery-drill.test.ts` (5/5 passing).

- [x] **Deployed Egress Timeout Patches & Resilience Verification (Completed 2026-09-01)**:
  - Added strict bounded timeouts across all outbound calls: Cloudflare Turnstile (`AbortSignal.timeout(6000)` in `src/app/contact/actions.ts`), QuickBooks company name lookup (`AbortSignal.timeout(8000)` in `src/app/api/quickbooks/callback/route.ts`), remote change-order photos (`AbortSignal.timeout(8000)` in `change-order-actions.ts`), and database read fallback (`AbortSignal.timeout(15000)` in `src/lib/auth.ts`).
  - Hardened `src/lib/photo-proxy-guard.ts` with an operation-wide 8s deadline across all redirects and wrapped `arrayBuffer()` reads to return 504 on timeout instead of unhandled 500s.
  - Verified via `test/egress-third-party-timeout-resilience.test.ts` (5/5 passing).

- [x] **Large-Tenant Capacity Gate & Mobile Performance Optimization (Completed 2026-09-01)**:
  - Documented capacity gates, Supavisor transaction pooler headroom, and PostgREST 1,000-row pagination standards in `docs/large-tenant-capacity-gate.md`.
  - Updated `next.config.mjs` image configuration with `formats: ['image/webp']` and explicit `qualities: [75, 80]` to clear Next 16 deprecation warnings while ensuring optimal serverless resize performance.
  - Hardened `listClientsWithStats` in `src/lib/clients.ts` with `fetchAll` option using `fetchAllPages` from `src/lib/pagination.ts` to prevent silent 1,000-row truncation on large accounts.
  - Verified 2,500-row pagination and batch streaming via `test/large-workspace-pagination-stress.test.ts` (4/4 passing).

- [x] **Cron Execution Health & Contractor Lifecycle Dry-Run (Completed 2026-09-01)**:
  - Updated `scripts/inspect-cron-health.mjs` to classify intentionally disabled/flag-gated workers (`KNOWN_DARK_JOBS`) as disabled, preventing false alarms during 24h cron fleet health inspections. Verified via `test/inspect-cron-health.test.ts` (14/14 passing).
  - Updated `src/lib/contractor-lifecycle-emails.ts` with non-destructive `{ dryRun: true }` mode and sequence progression hardening so accounts receive `welcome_day0` before later sequence steps.
  - Created standalone CLI runner `scripts/dry-run-contractor-lifecycle.mjs` and verified silent execution via `test/contractor-lifecycle-emails.test.ts` (7/7 passing).tion, Realtime load and database connection-pool headroom against explicit budgets.
- [x] **Standing Release Regression Gates (Completed 2026-09-01)**: Codified clean frozen commit history, zero TypeScript errors (`npm run typecheck`), zero high/critical vulnerabilities (`npm audit`), green multi-suite CI manifests, storage/realtime tenancy matrices, Stripe SKU/Price live catalog binding parity, and token/secret cryptographic security suites.
- [x] **CI & Repository Controls (Completed 2026-09-01)**: Enforced strict zero-vulnerability blocking gate in `.github/workflows/ci.yml` by removing `continue-on-error: true` on `npm audit --audit-level=high`. Passed full typecheck, 0 audit vulnerabilities across production dependencies, and clean multi-suite CI verification.
- [ ] **Real Device, Browser & Role Matrix**: current automation is Chromium-only. Test Safari/iPhone, Chrome/Android, Firefox, WebKit, keyboard, screen reader, reduced motion, camera/mic/location, push, offline field sync, uploads, checkout, and owner/office/crew/staff permission profiles.
- [ ] **Independent Penetration Test**: commission an external authenticated/unauthenticated assessment covering tenant isolation, staff/admin routes, service-role usage, SSRF, webhook replay/body limits, OAuth/callbacks, rate limits, file uploads, signed tokens, and business-logic abuse after the P0/P1 fixes land.

---

## 13. Claims, Communications & Legal Compliance

- [x] **Sold-vs-Built Claim Sweep (Completed 2026-08-31)**:
  - Reconciled marketing copy, pricing tables, comparison grids, changelog entries, and lifecycle email/SMS templates against functionality live in production.
  - Qualified AI Voice Receptionist in `pricing-catalog.ts` to explicitly state preview / carrier rollout status while highlighting live web Smart Intake, quote generation, and SMS dispatching.
  - Reconciled dedicated business phone number descriptions in `changelog.ts` to reflect guided 3-step carrier 10DLC registration assistance.
  - Replaced ungrounded "100% UPPA compliant" claims in `TradeInsuranceClaimsShowcase.tsx` with "UPPA-Aligned Workflow" and transparent construction estimating standards.
  - Corrected all template CTA URLs in `platform-campaign-templates.ts` and `contractor-lifecycle-emails.ts` from non-existent `/dashboard/jobs/new` and `/dashboard/billing` to canonical live routes (`/dashboard/jobs`, `/dashboard/settings?tab=plan`).
  - Verified via `test/claims-substantiation.test.ts` (5/5 passing).

- [x] **Advertising/FTC Substantiation Register (Completed 2026-08-31)**:
  - Published comprehensive legal evidence register in `docs/ftc-substantiation-register.md` (and summary in `docs/claims-substantiation.md`) documenting the factual basis, citations, owner, and scope for all ROI, savings, and performance claims (2.8x speed-to-lead win rate, 22% multi-tier average ticket uplift, <60s quote creation, 30% missed call industry leakage benchmarks, 30-day guarantee refund mechanics, PCI-DSS Level 1 compliance, Intuit OAuth sync, and verified Stripe catalog price IDs).
  - Prohibited unsubstantiated "guarantees 100%" or customer-cohort analytics claims from unseeded platforms, enforced via automated regression scanner in `test/claims-substantiation.test.ts`.

- [x] **Outbound-Email Compliance Invariant (Completed 2026-08-31)**:
  - Verified RFC 8058 one-click unsubscribe headers (`List-Unsubscribe: <url>` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`) and footer links across all marketing email senders (`sendCampaignEmail`, `sendRebookInviteEmail`, `sendReviewRequestEmail`, `admin-platform-campaigns.ts`, `contractor-lifecycle-emails.ts`).
  - Standardized legal entity postal address (`Let’s Get Quoted LLC · 11801 Domain Blvd, 3rd Floor · Austin, TX 78758`) across platform announcements and contractor onboarding mailings.
  - Hardened contractor marketing campaign actions (`src/app/dashboard/marketing/actions.ts`) to strictly require the contractor's own verified business mailing address, preventing spoofing or fallback omission.
  - Enforced fail-closed suppression queries across single and batch send paths (`loadSuppressedEmails`, `isEmailSuppressed`, `resolvePlatformCampaignRecipients`, `runContractorLifecycleSweep`).
  - Verified via `test/email-compliance.test.ts` (10/10 passing).

- [x] **Privacy-Egress & Subprocessor Reconciliation (Completed 2026-09-01)**:
  - Reconciled all outbound service integrations in `src/app/privacy/page.tsx` §4 & §5 and `src/app/terms/page.tsx`.
  - Documented Google Gemini API & OpenAI zero-retention / non-training enterprise guarantees for quote calculations, photo analysis, transcription, and assistant inference.
  - Documented multi-bucket storage AES-256 encryption at rest, TLS 1.3 in transit, and Row Level Security isolation with short-lived signed URLs for homeowner media.
  - Documented 30-day soft deletion quarantine and automated 115-table cascade deletion lifecycle.
  - Verified via `test/health-endpoints-hardening.test.ts` (7/7 passing).

- [x] **Recording, Monitoring & State-Law Review (Completed 2026-08-31)**:
  - Verified mandatory AI assistant caller disclosure (`AI_VOICE_DISCLOSURE`) and call recording disclosure (`RECORDING_DISCLOSURE`) are automatically announced to inbound callers prior to audio capture at the SWML/SignalWire provider boundary in `src/lib/voice/provider.ts` and `src/lib/voice/signalwire.ts`.
  - Verified field crew GPS tracking notices and on-shift indicators in `FieldClock.tsx` and `useWorkLocationTracker.ts`.
  - Verified terms of service disclosures in `src/app/terms/page.tsx` §3 & §4 covering two-party/one-party call recording wiretap compliance, prohibition on unlawful outbound AI telemarketing, and employee electronic monitoring notice obligations under state labor statutes.
  - Verified via `test/voice-and-gps-disclosures.test.ts` (6/6 passing).

---

## 14. Full Application Page Inventory & Freshness Audit (Updated 2026-09-04)

This section is the definitive inventory of all **247 App Router page surfaces** across Let's Get Quoted. It records the exact date each page was last updated/touched in version control or active development, tracks staleness metrics, and provides an active triage plan to guarantee **no page is neglected or abandoned** for launch.

### Page Freshness Breakdown

- **Total App Router Pages**: **247** distinct `page.tsx` surfaces.
- 🟢 **Fresh / Recently Touched (Sep 1–4, 2026)**: **114 pages** (46%) — actively validated during final pre-launch hardening, WCAG remediation, voice/SMS contractor dispatch, and insights updates.
- 🟡 **Stable (Aug 20–31, 2026)**: **118 pages** (48%) — hardened during late August feature sprints (Stripe Connect, schedule waitlists, marketing campaigns, permissions).
- 🔴 **Stale / Neglected (>3 Weeks Ago — Prior to Aug 20, 2026)**: **15 pages** (6%) — flagged for explicit verification below.

### Neglected Page Triage & Disposition Matrix

The following **15 pages** have not been touched in over 3 weeks. Each surface has been reviewed to determine its current operational status, whether it carries breaking changes or needs retirement, and its go-live disposition:

| Route | File Path | Last Touched | Commit | Launch Status & Disposition |
| :--- | :--- | :--- | :--- | :--- |
| `/demo/campaigns` | `src/app/demo/campaigns/page.tsx` | 2026-08-06 (4 weeks ago) | `b9fb1174e` | Static live-demo campaign builder. Renders demo mock sequences; verified operational without console errors. |
| `/demo/marketing/performance` | `src/app/demo/marketing/performance/page.tsx` | 2026-08-06 (4 weeks ago) | `b9fb1174e` | Demo performance analytics view. Verified functional against synthetic metrics. |
| `/demo/recurring` | `src/app/demo/recurring/page.tsx` | 2026-08-06 (4 weeks ago) | `b9fb1174e` | Demo recurring agreements manager. Verified rendering with mock agreements. |
| `/home-compare` | `src/app/home-compare/page.tsx` | 2026-08-07 (4 weeks ago) | `56684ddd3` | A/B test homepage comparison rig (`/home-compare`). Standalone internal preview; non-indexed; safe. |
| `/home-flagship` | `src/app/home-flagship/page.tsx` | 2026-08-07 (4 weeks ago) | `55a60a4d2` | Alternative flagship interactive tour homepage variant. Standalone internal preview; non-indexed; safe. |
| `/dashboard/clients/import` | `src/app/dashboard/clients/import/page.tsx` | 2026-08-14 (3 weeks ago) | `3c18ab230` | CSV customer roster importer. Schema field mapping verified; paginated bulk import ready. |
| `/dashboard/jobs/import` | `src/app/dashboard/jobs/import/page.tsx` | 2026-08-14 (3 weeks ago) | `3c18ab230` | CSV job history importer. Column matching and job staging verified operational. |
| `/dashboard/jobs/import-invoices` | `src/app/dashboard/jobs/import-invoices/page.tsx` | 2026-08-14 (3 weeks ago) | `3c18ab230` | CSV invoice history importer. Connect ledger mapping verified. |
| `/demo/messages` | `src/app/demo/messages/page.tsx` | 2026-08-14 (3 weeks ago) | `3c18ab230` | Demo message workspace. Updated on 2026-08-31 to serve as fallback target for AI Voice demo links. |
| `/demo/schedule/plan` | `src/app/demo/schedule/plan/page.tsx` | 2026-08-14 (3 weeks ago) | `7c3ac4112` | Demo route planner & day scheduler. Verified clean with demo jobs and route stops. |
| `/admin/billing-operations` | `src/app/admin/billing-operations/page.tsx` | 2026-08-16 (3 weeks ago) | `fb5b7d571` | Super-admin operator console for dead-letter billing events. Protected by staff permission gate; verified. |
| `/dashboard/stripe-merchant/refresh` | `src/app/dashboard/stripe-merchant/refresh/page.tsx` | 2026-08-16 (3 weeks ago) | `fde575acb` | Stripe Connect merchant onboarding refresh redirect destination. Lightweight auth-gated redirector; verified. |
| `/dashboard/stripe-merchant/return` | `src/app/dashboard/stripe-merchant/return/page.tsx` | 2026-08-16 (3 weeks ago) | `fde575acb` | Stripe Connect merchant onboarding return destination. Directs back to settings with refresh state; verified. |
| `/features/client-portal` | `src/app/features/client-portal/page.tsx` | 2026-08-16 (3 weeks ago) | `28a2d0925` | Public feature page for Client Portal. Passed full 4-theme WCAG AA contrast audit on 2026-09-01. |
| `/security` | `src/app/security/page.tsx` | 2026-08-16 (3 weeks ago) | `28a2d0925` | Platform security & trust overview page. Reconciled with subprocessor, SOC2, and storage encryption claims. |

---

### Authenticated Dashboard (69 pages)

| Route | Source File | Last Touched | Commit | Freshness |
| :--- | :--- | :--- | :--- | :--- |
| `/dashboard` | `src/app/dashboard/page.tsx` | 2026-09-04 | `1cfdbde53*` | 🟢 Fresh |
| `/dashboard/activity` | `src/app/dashboard/activity/page.tsx` | 2026-09-03 | `77e751f04` | 🟢 Fresh |
| `/dashboard/automations` | `src/app/dashboard/automations/page.tsx` | 2026-09-04 | `dcd42987c` | 🟢 Fresh |
| `/dashboard/cash-flow` | `src/app/dashboard/cash-flow/page.tsx` | 2026-09-04 | `288f7f3ad*` | 🟢 Fresh |
| `/dashboard/claims` | `src/app/dashboard/claims/page.tsx` | 2026-09-03 | `7ca281b47` | 🟢 Fresh |
| `/dashboard/clients` | `src/app/dashboard/clients/page.tsx` | 2026-09-03 | `a18225bff` | 🟢 Fresh |
| `/dashboard/clients/[id]` | `src/app/dashboard/clients/[id]/page.tsx` | 2026-09-03 | `2e6c7af21` | 🟢 Fresh |
| `/dashboard/clients/[id]/statement` | `src/app/dashboard/clients/[id]/statement/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/dashboard/clients/import` | `src/app/dashboard/clients/import/page.tsx` | 2026-08-14 | `3c18ab230` | 🔴 Neglected (>3 wks) |
| `/dashboard/crew` | `src/app/dashboard/crew/page.tsx` | 2026-09-04 | `5bfdd49e5*` | 🟢 Fresh |
| `/dashboard/crew/requests/[id]` | `src/app/dashboard/crew/requests/[id]/page.tsx` | 2026-09-01 | `8fd524833` | 🟢 Fresh |
| `/dashboard/crew/requests/new` | `src/app/dashboard/crew/requests/new/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/dashboard/expenses` | `src/app/dashboard/expenses/page.tsx` | 2026-09-04 | `89520a762` | 🟢 Fresh |
| `/dashboard/forms` | `src/app/dashboard/forms/page.tsx` | 2026-09-02 | `bff437d13` | 🟢 Fresh |
| `/dashboard/forms/[id]` | `src/app/dashboard/forms/[id]/page.tsx` | 2026-09-01 | `12e223c0b` | 🟢 Fresh |
| `/dashboard/forms/builder` | `src/app/dashboard/forms/builder/page.tsx` | 2026-09-01 | `12e223c0b` | 🟢 Fresh |
| `/dashboard/help` | `src/app/dashboard/help/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/dashboard/help/[caseId]` | `src/app/dashboard/help/[caseId]/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/dashboard/import` | `src/app/dashboard/import/page.tsx` | 2026-09-04 | `1cfdbde53` | 🟢 Fresh |
| `/dashboard/insights` | `src/app/dashboard/insights/page.tsx` | 2026-09-04 | `0c66cd74b` | 🟢 Fresh |
| `/dashboard/inventory` | `src/app/dashboard/inventory/page.tsx` | 2026-09-03 | `7ca281b47` | 🟢 Fresh |
| `/dashboard/jobs` | `src/app/dashboard/jobs/page.tsx` | 2026-09-04 | `89520a762*` | 🟢 Fresh |
| `/dashboard/jobs/[id]` | `src/app/dashboard/jobs/[id]/page.tsx` | 2026-09-04 | `2e6c7af21*` | 🟢 Fresh |
| `/dashboard/jobs/[id]/forms/[submissionId]/print` | `src/app/dashboard/jobs/[id]/forms/[submissionId]/print/page.tsx` | 2026-09-01 | `12e223c0b` | 🟢 Fresh |
| `/dashboard/jobs/[id]/invoices/[invoiceId]` | `src/app/dashboard/jobs/[id]/invoices/[invoiceId]/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/dashboard/jobs/[id]/quote` | `src/app/dashboard/jobs/[id]/quote/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/dashboard/jobs/import` | `src/app/dashboard/jobs/import/page.tsx` | 2026-08-14 | `3c18ab230` | 🔴 Neglected (>3 wks) |
| `/dashboard/jobs/import-invoices` | `src/app/dashboard/jobs/import-invoices/page.tsx` | 2026-08-14 | `3c18ab230` | 🔴 Neglected (>3 wks) |
| `/dashboard/leads` | `src/app/dashboard/leads/page.tsx` | 2026-09-03 | `a06ca21e2` | 🟢 Fresh |
| `/dashboard/leads/[leadId]` | `src/app/dashboard/leads/[leadId]/page.tsx` | 2026-09-03 | `2e6c7af21` | 🟢 Fresh |
| `/dashboard/marketing` | `src/app/dashboard/marketing/page.tsx` | 2026-09-03 | `77e751f04*` | 🟢 Fresh |
| `/dashboard/marketing/ads` | `src/app/dashboard/marketing/ads/page.tsx` | 2026-09-03 | `77e751f04` | 🟢 Fresh |
| `/dashboard/marketing/blog` | `src/app/dashboard/marketing/blog/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/dashboard/marketing/blog/[id]` | `src/app/dashboard/marketing/blog/[id]/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/dashboard/marketing/campaigns` | `src/app/dashboard/marketing/campaigns/page.tsx` | 2026-09-02 | `2caba713d` | 🟢 Fresh |
| `/dashboard/marketing/email-theme` | `src/app/dashboard/marketing/email-theme/page.tsx` | 2026-08-30 | `d311d6527` | 🟡 Stable (Aug 20-31) |
| `/dashboard/marketing/links` | `src/app/dashboard/marketing/links/page.tsx` | 2026-09-01 | `8fd524833` | 🟢 Fresh |
| `/dashboard/marketing/performance` | `src/app/dashboard/marketing/performance/page.tsx` | 2026-09-01 | `8fd524833` | 🟢 Fresh |
| `/dashboard/marketing/referrals` | `src/app/dashboard/marketing/referrals/page.tsx` | 2026-08-22 | `9088f7d94` | 🟡 Stable (Aug 20-31) |
| `/dashboard/merchandise` | `src/app/dashboard/merchandise/page.tsx` | 2026-09-04 | `*` | 🟢 Fresh |
| `/dashboard/messages` | `src/app/dashboard/messages/page.tsx` | 2026-09-03 | `99b99805e` | 🟢 Fresh |
| `/dashboard/messages/dedicated-number` | `src/app/dashboard/messages/dedicated-number/page.tsx` | 2026-09-01 | `3627683c9` | 🟢 Fresh |
| `/dashboard/payments` | `src/app/dashboard/payments/page.tsx` | 2026-09-04 | `1cfdbde53*` | 🟢 Fresh |
| `/dashboard/payroll` | `src/app/dashboard/payroll/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/dashboard/quick-stops` | `src/app/dashboard/quick-stops/page.tsx` | 2026-09-03 | `6c5cbf20e` | 🟢 Fresh |
| `/dashboard/rebook` | `src/app/dashboard/rebook/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/dashboard/recurring` | `src/app/dashboard/recurring/page.tsx` | 2026-09-04 | `1cfdbde53` | 🟢 Fresh |
| `/dashboard/reports` | `src/app/dashboard/reports/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/dashboard/reviews` | `src/app/dashboard/reviews/page.tsx` | 2026-08-31 | `288f7f3ad*` | 🟡 Stable (Aug 20-31) |
| `/dashboard/schedule` | `src/app/dashboard/schedule/page.tsx` | 2026-09-04 | `1cfdbde53*` | 🟢 Fresh |
| `/dashboard/schedule/booking` | `src/app/dashboard/schedule/booking/page.tsx` | 2026-09-03 | `99b99805e*` | 🟢 Fresh |
| `/dashboard/schedule/dispatch` | `src/app/dashboard/schedule/dispatch/page.tsx` | 2026-08-26 | `ead4a91a6` | 🟡 Stable (Aug 20-31) |
| `/dashboard/schedule/plan` | `src/app/dashboard/schedule/plan/page.tsx` | 2026-09-01 | `8fd524833` | 🟢 Fresh |
| `/dashboard/schedule/requests` | `src/app/dashboard/schedule/requests/page.tsx` | 2026-08-26 | `ead4a91a6` | 🟡 Stable (Aug 20-31) |
| `/dashboard/schedule/settings` | `src/app/dashboard/schedule/settings/page.tsx` | 2026-09-03 | `1ced5fca3` | 🟢 Fresh |
| `/dashboard/schedule/waitlist` | `src/app/dashboard/schedule/waitlist/page.tsx` | 2026-09-03 | `e6e5b9d6d` | 🟢 Fresh |
| `/dashboard/services` | `src/app/dashboard/services/page.tsx` | 2026-09-04 | `1cfdbde53` | 🟢 Fresh |
| `/dashboard/services/import` | `src/app/dashboard/services/import/page.tsx` | 2026-09-04 | `1cfdbde53` | 🟢 Fresh |
| `/dashboard/settings` | `src/app/dashboard/settings/page.tsx` | 2026-09-03 | `2e6c7af21` | 🟢 Fresh |
| `/dashboard/sites` | `src/app/dashboard/sites/page.tsx` | 2026-09-04 | `a08202fcb*` | 🟢 Fresh |
| `/dashboard/sites/preview` | `src/app/dashboard/sites/preview/page.tsx` | 2026-08-23 | `333d702a3` | 🟡 Stable (Aug 20-31) |
| `/dashboard/stripe-merchant/refresh` | `src/app/dashboard/stripe-merchant/refresh/page.tsx` | 2026-08-16 | `fde575acb` | 🔴 Neglected (>3 wks) |
| `/dashboard/stripe-merchant/return` | `src/app/dashboard/stripe-merchant/return/page.tsx` | 2026-08-16 | `fde575acb` | 🔴 Neglected (>3 wks) |
| `/dashboard/stripe-return` | `src/app/dashboard/stripe-return/page.tsx` | 2026-09-01 | `3627683c9` | 🟢 Fresh |
| `/dashboard/text-to-job` | `src/app/dashboard/text-to-job/page.tsx` | 2026-09-04 | `663ffec41` | 🟢 Fresh |
| `/dashboard/trash` | `src/app/dashboard/trash/page.tsx` | 2026-09-01 | `3c3dff71a` | 🟢 Fresh |
| `/dashboard/voice-assistant` | `src/app/dashboard/voice-assistant/page.tsx` | 2026-08-26 | `cdd0b44fd` | 🟡 Stable (Aug 20-31) |
| `/dashboard/voice-calls` | `src/app/dashboard/voice-calls/page.tsx` | 2026-09-03 | `6c5cbf20e` | 🟢 Fresh |
| `/dashboard/voice-calls/[callId]` | `src/app/dashboard/voice-calls/[callId]/page.tsx` | 2026-09-03 | `2e6c7af21` | 🟢 Fresh |

### Customer & Client Facing (10 pages)

| Route | Source File | Last Touched | Commit | Freshness |
| :--- | :--- | :--- | :--- | :--- |
| `/book/[subdomain]` | `src/app/book/[subdomain]/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/client/jobs/[token]` | `src/app/client/jobs/[token]/page.tsx` | 2026-09-03 | `5806fd4ca` | 🟢 Fresh |
| `/invoice/[id]` | `src/app/invoice/[id]/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/pay/[id]` | `src/app/pay/[id]/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/portal` | `src/app/portal/page.tsx` | 2026-09-04 | `1cfdbde53` | 🟢 Fresh |
| `/portal/[subdomain]` | `src/app/portal/[subdomain]/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/portal/view/[token]` | `src/app/portal/view/[token]/page.tsx` | 2026-09-04 | `1cfdbde53` | 🟢 Fresh |
| `/review/[token]` | `src/app/review/[token]/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/track/[token]` | `src/app/track/[token]/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/unsubscribe` | `src/app/unsubscribe/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |

### Auth & Onboarding (5 pages)

| Route | Source File | Last Touched | Commit | Freshness |
| :--- | :--- | :--- | :--- | :--- |
| `/auth/confirm` | `src/app/auth/confirm/page.tsx` | 2026-08-30 | `4db77d660` | 🟡 Stable (Aug 20-31) |
| `/login` | `src/app/login/page.tsx` | 2026-09-03 | `5576cd959` | 🟢 Fresh |
| `/office-invite/[token]` | `src/app/office-invite/[token]/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/start` | `src/app/start/page.tsx` | 2026-09-03 | `35ba268ba` | 🟢 Fresh |
| `/welcome` | `src/app/welcome/page.tsx` | 2026-09-03 | `35ba268ba` | 🟢 Fresh |

### Product Features (23 pages)

| Route | Source File | Last Touched | Commit | Freshness |
| :--- | :--- | :--- | :--- | :--- |
| `/features` | `src/app/features/page.tsx` | 2026-09-03 | `5fad5ce03*` | 🟢 Fresh |
| `/features-flagship` | `src/app/features-flagship/page.tsx` | 2026-08-26 | `de72f3cf5` | 🟡 Stable (Aug 20-31) |
| `/features/ai-ads` | `src/app/features/ai-ads/page.tsx` | 2026-09-03 | `77e751f04*` | 🟢 Fresh |
| `/features/ai-copilot` | `src/app/features/ai-copilot/page.tsx` | 2026-09-03 | `b6ede0e5b` | 🟢 Fresh |
| `/features/ai-intake` | `src/app/features/ai-intake/page.tsx` | 2026-09-01 | `1a0c6fd90` | 🟢 Fresh |
| `/features/ai-vision` | `src/app/features/ai-vision/page.tsx` | 2026-09-03 | `b6f2d990e` | 🟢 Fresh |
| `/features/ai-voice` | `src/app/features/ai-voice/page.tsx` | 2026-09-01 | `c39099360` | 🟢 Fresh |
| `/features/back-office` | `src/app/features/back-office/page.tsx` | 2026-09-01 | `80232fe27` | 🟢 Fresh |
| `/features/cash-flow` | `src/app/features/cash-flow/page.tsx` | 2026-08-29 | `e4f635a58` | 🟡 Stable (Aug 20-31) |
| `/features/client-portal` | `src/app/features/client-portal/page.tsx` | 2026-08-16 | `28a2d0925` | 🔴 Neglected (>3 wks) |
| `/features/crew` | `src/app/features/crew/page.tsx` | 2026-08-29 | `e4f635a58` | 🟡 Stable (Aug 20-31) |
| `/features/dispatch` | `src/app/features/dispatch/page.tsx` | 2026-08-27 | `91f85e576` | 🟡 Stable (Aug 20-31) |
| `/features/neighborhood-halo` | `src/app/features/neighborhood-halo/page.tsx` | 2026-09-03 | `5fad5ce03` | 🟢 Fresh |
| `/features/payments` | `src/app/features/payments/page.tsx` | 2026-08-29 | `e4f635a58` | 🟡 Stable (Aug 20-31) |
| `/features/quick-stops` | `src/app/features/quick-stops/page.tsx` | 2026-08-29 | `0533d57a9` | 🟡 Stable (Aug 20-31) |
| `/features/quotes` | `src/app/features/quotes/page.tsx` | 2026-09-02 | `37dc4c966` | 🟢 Fresh |
| `/features/recurring` | `src/app/features/recurring/page.tsx` | 2026-08-29 | `e4f635a58` | 🟡 Stable (Aug 20-31) |
| `/features/reviews` | `src/app/features/reviews/page.tsx` | 2026-08-29 | `e4f635a58` | 🟡 Stable (Aug 20-31) |
| `/features/scheduling` | `src/app/features/scheduling/page.tsx` | 2026-08-29 | `e4f635a58` | 🟡 Stable (Aug 20-31) |
| `/features/sparky` | `src/app/features/sparky/page.tsx` | 2026-09-03 | `750e8cb1f` | 🟢 Fresh |
| `/features/text-to-job` | `src/app/features/text-to-job/page.tsx` | 2026-09-03 | `2a9510fff` | 🟢 Fresh |
| `/features/website-builder` | `src/app/features/website-builder/page.tsx` | 2026-09-02 | `dd0a59154` | 🟢 Fresh |
| `/features/website-builder-mockup` | `src/app/features/website-builder-mockup/page.tsx` | 2026-08-28 | `ec20b4264` | 🟡 Stable (Aug 20-31) |

### Public Marketing (41 pages)

| Route | Source File | Last Touched | Commit | Freshness |
| :--- | :--- | :--- | :--- | :--- |
| `/` | `src/app/page.tsx` | 2026-09-04 | `1cfdbde53*` | 🟢 Fresh |
| `/account-suspended` | `src/app/account-suspended/page.tsx` | 2026-08-31 | `33c409ea4` | 🟡 Stable (Aug 20-31) |
| `/card-saved` | `src/app/card-saved/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/changelog` | `src/app/changelog/page.tsx` | 2026-08-26 | `192ffbce6` | 🟡 Stable (Aug 20-31) |
| `/contact` | `src/app/contact/page.tsx` | 2026-09-01 | `80232fe27` | 🟢 Fresh |
| `/dpa` | `src/app/dpa/page.tsx` | 2026-08-27 | `91f85e576` | 🟡 Stable (Aug 20-31) |
| `/faq` | `src/app/faq/page.tsx` | 2026-09-02 | `beaf80591` | 🟢 Fresh |
| `/field` | `src/app/field/page.tsx` | 2026-09-03 | `9552fb115` | 🟢 Fresh |
| `/field/choose` | `src/app/field/choose/page.tsx` | 2026-09-02 | `3a3f2aa65` | 🟢 Fresh |
| `/field/dictate` | `src/app/field/dictate/page.tsx` | 2026-09-02 | `3a3f2aa65` | 🟢 Fresh |
| `/field/intake/[id]` | `src/app/field/intake/[id]/page.tsx` | 2026-09-03 | `9552fb115` | 🟢 Fresh |
| `/field/jobs/[id]` | `src/app/field/jobs/[id]/page.tsx` | 2026-09-02 | `3a3f2aa65` | 🟢 Fresh |
| `/field/login` | `src/app/field/login/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/field/offline` | `src/app/field/offline/page.tsx` | 2026-08-28 | `a54825870` | 🟡 Stable (Aug 20-31) |
| `/field/pay` | `src/app/field/pay/page.tsx` | 2026-09-02 | `3a3f2aa65` | 🟢 Fresh |
| `/for` | `src/app/for/page.tsx` | 2026-09-03 | `7091aae2d` | 🟢 Fresh |
| `/for-mockup` | `src/app/for-mockup/page.tsx` | 2026-09-01 | `a519c0ee6` | 🟢 Fresh |
| `/founder` | `src/app/founder/page.tsx` | 2026-09-03 | `de1142d9c` | 🟢 Fresh |
| `/home-classic` | `src/app/home-classic/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/home-compact` | `src/app/home-compact/page.tsx` | 2026-08-28 | `c5132ccf2` | 🟡 Stable (Aug 20-31) |
| `/home-compare` | `src/app/home-compare/page.tsx` | 2026-08-07 | `56684ddd3` | 🔴 Neglected (>3 wks) |
| `/home-editorial` | `src/app/home-editorial/page.tsx` | 2026-08-28 | `ee21c8e1d` | 🟡 Stable (Aug 20-31) |
| `/home-flagship` | `src/app/home-flagship/page.tsx` | 2026-08-07 | `55a60a4d2` | 🔴 Neglected (>3 wks) |
| `/home-next` | `src/app/home-next/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/how-it-works` | `src/app/how-it-works/page.tsx` | 2026-09-02 | `dd0a59154` | 🟢 Fresh |
| `/office-access` | `src/app/office-access/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/passport/[passportCode]` | `src/app/passport/[passportCode]/page.tsx` | 2026-09-01 | `a05e3d1a4` | 🟢 Fresh |
| `/pricing` | `src/app/pricing/page.tsx` | 2026-09-01 | `80232fe27` | 🟢 Fresh |
| `/privacy` | `src/app/privacy/page.tsx` | 2026-09-01 | `0cc7421e7` | 🟢 Fresh |
| `/quick-stop/[id]` | `src/app/quick-stop/[id]/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/quickbooks/disconnected` | `src/app/quickbooks/disconnected/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/recover-account` | `src/app/recover-account/page.tsx` | 2026-09-01 | `82eefc37f` | 🟢 Fresh |
| `/resources` | `src/app/resources/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/resources/[slug]` | `src/app/resources/[slug]/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/schedule/[token]` | `src/app/schedule/[token]/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/security` | `src/app/security/page.tsx` | 2026-08-16 | `28a2d0925` | 🔴 Neglected (>3 wks) |
| `/sms-terms` | `src/app/sms-terms/page.tsx` | 2026-08-31 | `51abfa532` | 🟡 Stable (Aug 20-31) |
| `/sub/[token]` | `src/app/sub/[token]/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/terms` | `src/app/terms/page.tsx` | 2026-08-31 | `51abfa532` | 🟡 Stable (Aug 20-31) |
| `/themes/[template]` | `src/app/themes/[template]/page.tsx` | 2026-08-31 | `bddaa35e6` | 🟡 Stable (Aug 20-31) |
| `/website-builder-mockup` | `src/app/website-builder-mockup/page.tsx` | 2026-08-31 | `df967bdae` | 🟡 Stable (Aug 20-31) |

### Trade Landing Pages (1 pages)

| Route | Source File | Last Touched | Commit | Freshness |
| :--- | :--- | :--- | :--- | :--- |
| `/for/[trade]` | `src/app/for/[trade]/page.tsx` | 2026-09-01 | `8eb04f1ba` | 🟢 Fresh |

### Competitive Comparisons (2 pages)

| Route | Source File | Last Touched | Commit | Freshness |
| :--- | :--- | :--- | :--- | :--- |
| `/compare` | `src/app/compare/page.tsx` | 2026-09-01 | `ba8cc421a` | 🟢 Fresh |
| `/compare/[competitor]` | `src/app/compare/[competitor]/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |

### Public Free Tools (4 pages)

| Route | Source File | Last Touched | Commit | Freshness |
| :--- | :--- | :--- | :--- | :--- |
| `/tools` | `src/app/tools/page.tsx` | 2026-09-01 | `80232fe27` | 🟢 Fresh |
| `/tools/estimate-generator` | `src/app/tools/estimate-generator/page.tsx` | 2026-09-01 | `80232fe27` | 🟢 Fresh |
| `/tools/hourly-rate-calculator` | `src/app/tools/hourly-rate-calculator/page.tsx` | 2026-08-27 | `503c50171` | 🟡 Stable (Aug 20-31) |
| `/tools/leakage-calculator` | `src/app/tools/leakage-calculator/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |

### Help & Documentation (4 pages)

| Route | Source File | Last Touched | Commit | Freshness |
| :--- | :--- | :--- | :--- | :--- |
| `/help` | `src/app/help/page.tsx` | 2026-09-01 | `8eb04f1ba` | 🟢 Fresh |
| `/help/articles/[slug]` | `src/app/help/articles/[slug]/page.tsx` | 2026-08-31 | `227d8dcb3` | 🟡 Stable (Aug 20-31) |
| `/help/manual` | `src/app/help/manual/page.tsx` | 2026-09-01 | `8eb04f1ba` | 🟢 Fresh |
| `/help/manual/[slug]` | `src/app/help/manual/[slug]/page.tsx` | 2026-09-01 | `8eb04f1ba` | 🟢 Fresh |

### Interactive Demo (45 pages)

| Route | Source File | Last Touched | Commit | Freshness |
| :--- | :--- | :--- | :--- | :--- |
| `/demo` | `src/app/demo/page.tsx` | 2026-09-04 | `0c66cd74b` | 🟢 Fresh |
| `/demo/automations` | `src/app/demo/automations/page.tsx` | 2026-08-27 | `2dc29d9e9` | 🟡 Stable (Aug 20-31) |
| `/demo/campaigns` | `src/app/demo/campaigns/page.tsx` | 2026-08-06 | `b9fb1174e` | 🔴 Neglected (>3 wks) |
| `/demo/cash-flow` | `src/app/demo/cash-flow/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/demo/clients` | `src/app/demo/clients/page.tsx` | 2026-09-03 | `2e6c7af21` | 🟢 Fresh |
| `/demo/clients/[id]` | `src/app/demo/clients/[id]/page.tsx` | 2026-09-03 | `2e6c7af21` | 🟢 Fresh |
| `/demo/crew` | `src/app/demo/crew/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/demo/customize` | `src/app/demo/customize/page.tsx` | 2026-08-24 | `c39872e7d` | 🟡 Stable (Aug 20-31) |
| `/demo/email-themes` | `src/app/demo/email-themes/page.tsx` | 2026-09-01 | `c39099360` | 🟢 Fresh |
| `/demo/insights` | `src/app/demo/insights/page.tsx` | 2026-09-04 | `0c66cd74b` | 🟢 Fresh |
| `/demo/jobs` | `src/app/demo/jobs/page.tsx` | 2026-09-03 | `f97c93a14` | 🟢 Fresh |
| `/demo/jobs/[id]` | `src/app/demo/jobs/[id]/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/demo/leads` | `src/app/demo/leads/page.tsx` | 2026-09-03 | `f97c93a14` | 🟢 Fresh |
| `/demo/leads/[leadId]` | `src/app/demo/leads/[leadId]/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/demo/marketing` | `src/app/demo/marketing/page.tsx` | 2026-09-01 | `c39099360` | 🟢 Fresh |
| `/demo/marketing/ads` | `src/app/demo/marketing/ads/page.tsx` | 2026-08-30 | `7886b7ea9` | 🟡 Stable (Aug 20-31) |
| `/demo/marketing/blog` | `src/app/demo/marketing/blog/page.tsx` | 2026-09-01 | `8eb04f1ba` | 🟢 Fresh |
| `/demo/marketing/blog/[id]` | `src/app/demo/marketing/blog/[id]/page.tsx` | 2026-09-01 | `8eb04f1ba` | 🟢 Fresh |
| `/demo/marketing/campaigns` | `src/app/demo/marketing/campaigns/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/demo/marketing/email-theme` | `src/app/demo/marketing/email-theme/page.tsx` | 2026-09-01 | `c39099360` | 🟢 Fresh |
| `/demo/marketing/links` | `src/app/demo/marketing/links/page.tsx` | 2026-09-01 | `8eb04f1ba` | 🟢 Fresh |
| `/demo/marketing/performance` | `src/app/demo/marketing/performance/page.tsx` | 2026-08-06 | `b9fb1174e` | 🔴 Neglected (>3 wks) |
| `/demo/messages` | `src/app/demo/messages/page.tsx` | 2026-08-14 | `3c18ab230` | 🔴 Neglected (>3 wks) |
| `/demo/payroll` | `src/app/demo/payroll/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/demo/quick-stops` | `src/app/demo/quick-stops/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/demo/rebook` | `src/app/demo/rebook/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/demo/recurring` | `src/app/demo/recurring/page.tsx` | 2026-08-06 | `b9fb1174e` | 🔴 Neglected (>3 wks) |
| `/demo/reel/bath-to-shower` | `src/app/demo/reel/bath-to-shower/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/demo/reel/mock-site` | `src/app/demo/reel/mock-site/page.tsx` | 2026-08-27 | `49a39ca6f` | 🟡 Stable (Aug 20-31) |
| `/demo/reel/product-tour` | `src/app/demo/reel/product-tour/page.tsx` | 2026-09-02 | `bf4e4a5ce` | 🟢 Fresh |
| `/demo/reviews` | `src/app/demo/reviews/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/demo/schedule` | `src/app/demo/schedule/page.tsx` | 2026-09-03 | `99b99805e` | 🟢 Fresh |
| `/demo/schedule/booking` | `src/app/demo/schedule/booking/page.tsx` | 2026-09-03 | `99b99805e` | 🟢 Fresh |
| `/demo/schedule/plan` | `src/app/demo/schedule/plan/page.tsx` | 2026-08-14 | `7c3ac4112` | 🔴 Neglected (>3 wks) |
| `/demo/services` | `src/app/demo/services/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/demo/settings` | `src/app/demo/settings/page.tsx` | 2026-08-27 | `2dc29d9e9` | 🟡 Stable (Aug 20-31) |
| `/demo/sites` | `src/app/demo/sites/page.tsx` | 2026-08-28 | `9aafb9f95` | 🟡 Stable (Aug 20-31) |
| `/demo/sms-quote` | `src/app/demo/sms-quote/page.tsx` | 2026-08-26 | `a9e81b590` | 🟡 Stable (Aug 20-31) |
| `/demo/tour` | `src/app/demo/tour/page.tsx` | 2026-08-27 | `65506d9ef` | 🟡 Stable (Aug 20-31) |
| `/demo/tour/approve` | `src/app/demo/tour/approve/page.tsx` | 2026-08-27 | `2ad68083f` | 🟡 Stable (Aug 20-31) |
| `/demo/tour/complete` | `src/app/demo/tour/complete/page.tsx` | 2026-08-27 | `2ad68083f` | 🟡 Stable (Aug 20-31) |
| `/demo/tour/intake` | `src/app/demo/tour/intake/page.tsx` | 2026-08-27 | `2ad68083f` | 🟡 Stable (Aug 20-31) |
| `/demo/tour/lead` | `src/app/demo/tour/lead/page.tsx` | 2026-08-27 | `2ad68083f` | 🟡 Stable (Aug 20-31) |
| `/demo/tour/quote` | `src/app/demo/tour/quote/page.tsx` | 2026-08-27 | `2ad68083f` | 🟡 Stable (Aug 20-31) |
| `/demo/tour/site` | `src/app/demo/tour/site/page.tsx` | 2026-08-27 | `65506d9ef` | 🟡 Stable (Aug 20-31) |

### Admin Operations (28 pages)

| Route | Source File | Last Touched | Commit | Freshness |
| :--- | :--- | :--- | :--- | :--- |
| `/admin` | `src/app/admin/page.tsx` | 2026-09-03 | `bd25aa7ac` | 🟢 Fresh |
| `/admin/accounts` | `src/app/admin/accounts/page.tsx` | 2026-09-01 | `0cc7421e7` | 🟢 Fresh |
| `/admin/accounts/[id]` | `src/app/admin/accounts/[id]/page.tsx` | 2026-09-01 | `0cc7421e7` | 🟢 Fresh |
| `/admin/audit` | `src/app/admin/audit/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/admin/billing-operations` | `src/app/admin/billing-operations/page.tsx` | 2026-08-16 | `fb5b7d571` | 🔴 Neglected (>3 wks) |
| `/admin/campaigns` | `src/app/admin/campaigns/page.tsx` | 2026-08-31 | `48ac1a911` | 🟡 Stable (Aug 20-31) |
| `/admin/cases` | `src/app/admin/cases/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/admin/cases/[id]` | `src/app/admin/cases/[id]/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/admin/cases/new` | `src/app/admin/cases/new/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/admin/failures` | `src/app/admin/failures/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/admin/health` | `src/app/admin/health/page.tsx` | 2026-09-01 | `6917ad445` | 🟢 Fresh |
| `/admin/health/[job]` | `src/app/admin/health/[job]/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/admin/incidents` | `src/app/admin/incidents/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/admin/manual` | `src/app/admin/manual/page.tsx` | 2026-09-01 | `8b2dfa7ae` | 🟢 Fresh |
| `/admin/manual/[slug]` | `src/app/admin/manual/[slug]/page.tsx` | 2026-09-01 | `8b2dfa7ae` | 🟢 Fresh |
| `/admin/messaging` | `src/app/admin/messaging/page.tsx` | 2026-09-03 | `bd25aa7ac` | 🟢 Fresh |
| `/admin/messaging/registrations` | `src/app/admin/messaging/registrations/page.tsx` | 2026-09-03 | `bd25aa7ac` | 🟢 Fresh |
| `/admin/money` | `src/app/admin/money/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/admin/operator` | `src/app/admin/operator/page.tsx` | 2026-09-03 | `2e6c7af21` | 🟢 Fresh |
| `/admin/payments` | `src/app/admin/payments/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/admin/payments/[id]` | `src/app/admin/payments/[id]/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/admin/quick-stops` | `src/app/admin/quick-stops/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/admin/quick-stops/[id]` | `src/app/admin/quick-stops/[id]/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/admin/risk` | `src/app/admin/risk/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/admin/search` | `src/app/admin/search/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/admin/security` | `src/app/admin/security/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/admin/staff` | `src/app/admin/staff/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/admin/voice/numbers` | `src/app/admin/voice/numbers/page.tsx` | 2026-09-03 | `bd25aa7ac` | 🟢 Fresh |

### Tenant Sites & Previews (15 pages)

| Route | Source File | Last Touched | Commit | Freshness |
| :--- | :--- | :--- | :--- | :--- |
| `/site-domain/[domain]` | `src/app/site-domain/[domain]/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/site-domain/[domain]/blog` | `src/app/site-domain/[domain]/blog/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/site-domain/[domain]/blog/[slug]` | `src/app/site-domain/[domain]/blog/[slug]/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/site-domain/[domain]/portal` | `src/app/site-domain/[domain]/portal/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/site-domain/[domain]/privacy` | `src/app/site-domain/[domain]/privacy/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/site-domain/[domain]/terms` | `src/app/site-domain/[domain]/terms/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/site-domain/[domain]/videos` | `src/app/site-domain/[domain]/videos/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/site-preview-frame` | `src/app/site-preview-frame/page.tsx` | 2026-09-01 | `792b40156` | 🟢 Fresh |
| `/site/[subdomain]` | `src/app/site/[subdomain]/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/site/[subdomain]/blog` | `src/app/site/[subdomain]/blog/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/site/[subdomain]/blog/[slug]` | `src/app/site/[subdomain]/blog/[slug]/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/site/[subdomain]/portal` | `src/app/site/[subdomain]/portal/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/site/[subdomain]/privacy` | `src/app/site/[subdomain]/privacy/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/site/[subdomain]/terms` | `src/app/site/[subdomain]/terms/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |
| `/site/[subdomain]/videos` | `src/app/site/[subdomain]/videos/page.tsx` | 2026-08-31 | `288f7f3ad` | 🟡 Stable (Aug 20-31) |

