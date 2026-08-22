# SignalWire messaging local implementation and readiness report

**Snapshot:** 2026-08-21

**Scope:** the eight messaging releases in the saved implementation plan, plus the deliberately separate AI Voice workstream as Phase 9

**Evidence boundary:** local worktree inspection and executable local verification only

## Decision

**Production is a no-go.** All nine phases are implemented and verified locally,
but this report does not establish that any new migration, route, worker, sender
record, provider setting, Vercel variable, or traffic gate is deployed. It does
not claim a successful SignalWire delivery or inbound reply.

The stabilized local worktree passed 550 test files / 9,476 tests, TypeScript
typecheck, Next.js build-time lint/type validation (warnings only), and a production
build using nonpersistent dummy Supabase build-time values. Six PostgreSQL 17
harnesses passed 236/236 checks,
including a top-to-bottom install into a fresh empty database. `schema.sql`
exactly mirrors the 41 ordered domain, pricing, messaging, and voice
runtime migrations selected by `scripts/sync-messaging-schema.mjs`, and the
schema-order check reports no foreign-key forward references. `git diff --check`
also passes. These results prove the local artifact, not deployment or carrier
behavior.

## Non-negotiable invariants

- Supabase Auth phone login and verification remain on Twilio. Nothing in these phases changes that integration.
- LGQ application SMS and Supabase Auth OTP are separate rails. The app's public lead-verification message is not Supabase Auth OTP.
- The existing shared LGQ Campaign/number is for approved LGQ-branded account, billing, and support traffic to opted-in account holders. It is **not** for contractor-branded homeowner traffic.
- Homeowner conversations require the contractor's vetted, active, dedicated number. A shared-number reply may never be assigned by “latest conversation,” “latest consent,” or another tenant guess.
- Crew/subcontractor dispatch stays dark until SignalWire confirms the exact traffic in writing or a separate LGQ dispatch Campaign is approved.
- Dedicated contractor numbers are currently unpriced private-beta infrastructure. There is no sellable entitlement, included allowance, or active billing product yet.
- A Campaign assignment order marked `Processed` is not activation. The last recorded external state for **+1 (947) 941-2323** is an individually **Failed** assignment; that is a release blocker until reverified successful.
- The SignalWire **Messaging** signature contract still requires a staging capture. AI Agent JSON receipts authenticated with dedicated HTTP Basic credentials are a different contract and cannot be used as evidence for Messaging callbacks.
- `SIGNALWIRE_SIGNING_KEY` must be the distinct Dashboard Signing Key proven by the Messaging capture, never an API-token fallback.
- No production environment variable or external provider resource was changed by this local implementation/report.
- Emergency outbound stop remains `LGQ_DISABLE_OUTBOUND_SMS=1`; rollback is not unregistered Twilio operational messaging.

## Phase-by-phase implementation map

### Phase 1 — durable delivery foundation

**Local status:** implemented as a dark database/runtime foundation; remote application is unverified.

Concrete implementation:

- `migrations/20260821180506_sms_delivery_foundation.sql`
  - creates `sms_sender_numbers`, sender-scoped `sms_sender_keyword_preferences`, `sms_delivery_tasks`, and append-only `sms_delivery_attempts`;
  - extends `sms_events` with provider/sender identity, stable idempotency, queue and terminal timestamps, and provider-message uniqueness;
  - exposes service-role-only `enqueue_sms_delivery`, `claim_sms_delivery_tasks`, `stage_sms_delivery`, `mark_sms_delivery_request_started`, `complete_sms_delivery`, `fail_sms_delivery`, `record_sms_delivery_provider_rejection`, and `defer_sms_delivery` RPCs;
  - uses bounded `FOR UPDATE SKIP LOCKED`, token-bound completion, send-time consent/sender checks, and `indeterminate` quarantine after the request boundary;
  - forces RLS and gives browser roles no queue/sender mutation path.
- `src/lib/sms-delivery.ts`: typed atomic enqueue adapter, sender-purpose mapping, and idempotency validation.
- `migrations/20260821191500_sms_usage_finalization.sql` binds each metered send
  to its exact credit reservation/overage evidence, commits or releases it at
  the same leased state transition, quarantines uncertain usage settlement,
  and provides a narrowly proved rollback when the pre-request marker committed
  but its response was lost before a provider socket opened.
- Durable sends hold their text reservation for 24 hours; the original 15-minute
  TTL remains for synchronous non-queued uses. Provider-indeterminate work keeps
  its hold and is reconciled without a duplicate send.
- `scripts/verify-sms-delivery-foundation.mjs`: PostgreSQL 17 concurrency, transition, consent, sender-readiness, and privilege harness.
- `test/sms-delivery-foundation-migration.test.ts`: dark/idempotent migration, queue identity, lease, CAS, RLS, and uncertainty invariants.

Remaining/dark:

- Prove the migration is in the target staging migration ledger, then rerun the PG17 harness against the final migration text.
- Seed only reviewed sender inventory; no environment variable alone may manufacture an active sender.
- Keep `npm run check:schema:messaging` and the schema-order check green on the
  exact release commit; remote staging application is still required.

### Phase 2 — delivery worker and producer conversion

**Local status:** implemented behind independent worker, provider, canary, global-stop, and traffic-lane gates; no live worker execution is claimed.

Concrete implementation:

- `src/lib/sms-delivery-worker.ts`: bounded claims, send-time consent and exact sender readiness, pre-request retry classification, no-return boundary, provider rejection handling, and post-request `indeterminate` quarantine.
- `src/lib/sms-delivery-cron.ts` and `src/app/api/cron/sms-delivery/route.ts`: `CRON_SECRET` boundary and exact-`1` `LGQ_SMS_DELIVERY_WORKER_ENABLED` gate.
- `vercel.json`: local cron declaration for `/api/cron/sms-delivery`; its presence is not proof of deployment or enablement.
- `src/lib/sms-provider.ts`: explicit Twilio/SignalWire selection, provider-specific send construction, kill switch, test/Preview suppression, and separate signing-key handling.
- `src/lib/sms.ts` and domain producers such as `arrival-sweep.ts`, `choice-reminder-sweep.ts`, `dunning.ts`, `followups.ts`, `reminders.ts`, `rebook.ts`, `reviews.ts`, `scheduling.ts`, dashboard offer/job actions, and `subcontractor-dispatch-data.ts`: ordinary sends enqueue with purpose and stable domain identity.
- Current direct-egress boundary: `sendProviderMessage()` remains only in the generic SMS delivery worker. `src/lib/billing/direct-payment-settlement-worker.ts` hands its notification off through the durable SMS queue; it does not call the provider directly. Supabase Auth OTP remains outside this application rail.
- `migrations/20260821194000_producer_sms_queue_projection.sql` gives remaining
  operational producers stable domain identities and projects subcontractor
  `queued`/`sent`/`delivered`/`failed` truth from the local event plus carrier
  facts. Local `sms_event_id` is never confused with a provider message ID.
- The specialized direct-payment settlement lane has the same exact-`1`
  contractor-messaging gate and account canary. Canary deferral occurs before
  sender staging/egress and does not consume its finite send-attempt budget.
- Delivery work and text-usage reconciliation run independently in the cron, so
  one failing concern cannot suppress the other.
- Release controls: `LGQ_SMS_CANARY_ACCOUNT_IDS`, `LGQ_SMS_SHARED_ENABLED`, `LGQ_SMS_DISPATCH_ENABLED`, and `LGQ_SMS_CONTRACTOR_MESSAGING_ENABLED`.
- Tests: `test/sms-delivery-worker.test.ts`, `test/sms-producer-queue-boundary.test.ts`, `test/sms-provider.test.ts`, plus SMS catalogue/billing/segment tests.

Remaining/dark:

- The final repository-wide egress search finds only the generic SMS delivery
  worker and the separately durable direct-payment settlement worker; rerun the
  guard on the exact release commit.
- Apply migrations, configure one staging sender/canary, and prove queue state from database rows before allowing provider I/O.
- Keep all three lane gates off until each lane's Campaign and sender are independently approved.

### Phase 3 — authenticated callbacks and tenant-safe routing

**Local status:** callback ingestion/routing is implemented locally, but final SignalWire Messaging authentication remains provisional until a real staging capture proves the contract.

Concrete implementation:

- `migrations/20260821182355_sms_webhook_safety.sql`
  - adds provider/sender/event identity to `sms_messages` and prevents browser spoofing;
  - creates deduplicated `sms_webhook_receipts` and service-only `sms_operator_review_items`;
  - implements `ingest_sms_inbound_webhook`, `apply_sms_delivery_status_webhook`, `record_sms_webhook_review`, `resolve_sms_operator_review_item`, and `reconcile_sms_unmatched_status`;
  - routes by authenticated provider plus exact active `To` number, never recency;
  - scopes STOP/START to sender number and safe account association;
  - applies provider-scoped monotonic status, closes terminal/indeterminate tasks from authoritative facts, and safely re-applies an early unmatched status without duplicate review rows.
- `src/lib/sms-webhook-ingress.ts`: raw-body hashing/parsing, provider-native IDs, stable callback and reply identity, and exact-sender queued replies.
- `src/app/api/sms/inbound/route.ts` and `src/app/api/sms/status/route.ts`: authenticate before parsing/mutation and return provider-compatible markup.
- `src/app/api/twilio/inbound/route.ts` and status alias: compatibility-only re-exports, not separate routing logic.
- Ordinary inbound replies and offer/reschedule responses enqueue. The one named synchronous exception is the minimum authenticated compliance TwiML response where STOP cannot pass the queue's opt-out gate; shared START/HELP use that exception only when no exact safe account association/consent exists.
- Tests/harness: `scripts/verify-sms-webhook-safety.mjs`, `test/sms-webhook-safety-migration.test.ts`, `test/inbound-routing.test.ts`, and the raw-body/signature cases in `test/sms-provider.test.ts`.
- `migrations/20260821192000_sms_inbound_action_outbox.sql` and
  `src/lib/sms-inbound-action-worker.ts` move estimate, reschedule, appointment,
  and subcontractor reply mutations behind a receipt-keyed leased outbox.
  Receipt storage and task creation are atomic; ambiguous replies mutate
  nothing; retry replay returns the stored outcome instead of repeating a
  domain effect. `/api/cron/sms-inbound-actions` is dark behind exact-`1`
  `LGQ_SMS_INBOUND_ACTION_WORKER_ENABLED`.
- `migrations/20260821210500_sms_purpose_aware_inbound_routing.sql` makes live
  account/roster state authoritative over append-only consent evidence:
  `lgq_shared` requires the current normalized alert phone plus enabled messaging,
  and `lgq_dispatch` requires a current active, nondeleted crew phone. Zero or
  multiple accounts fail closed to review.
- Dispatch STOP/START resolves that same current crew authority. A unique match
  updates the exact-sender preference and account consent ledger; ambiguity keeps
  the sender blocked, leaves account consent untouched, and creates review work.
- YES/NO domain effects require the exact linked outbound `sms_events` row to be
  provider-accepted (`sent` or `delivered`) with matching account, recipient,
  purpose, sender, provider identity, and pre-reply chronology. Queued, failed,
  cross-boundary, missing-provider, and reply-before-question evidence fails closed.
- JSON callback compatibility cannot be authenticated by a URL-only signature:
  it requires a matching `bodySHA256` query binding. SignalWire's exact-body
  signature path and the form-field path remain distinct.

Remaining/dark:

- Capture a real inbound and status callback from a non-production SignalWire Messaging number and prove the URL, body bytes, content type, header name, algorithm, and signing secret.
- Until that capture succeeds, support for `X-SignalWire-Signature`, form bodies, JSON bodies, and compatibility `bodySHA256` is tested code—not verified production-provider evidence.
- Prove duplicate, out-of-order, early, failed, STOP/START/UNSTOP/HELP, MMS, unknown-destination, and ambiguous-shared cases in staging.

### Phase 4 — owner and operator visibility

**Local status:** implemented locally; it has no authoritative production data until the migrations/routes are deployed and exercised.

Concrete implementation:

- `src/lib/admin-messaging.ts` and `src/app/admin/messaging/page.tsx`: provider/sender state, exact queue and lifecycle counts, latest inbound/outbound evidence, failed/indeterminate details, webhook-failure count, text-usage reconciliation-failure count, review queue, canary, kill switch, and per-lane gates. Missing reads render as unavailable rather than healthy zeroes.
- `src/app/admin/messaging/actions.ts`: MFA-protected, audited review resolution and exact-event unmatched-status recovery; no blind retry control.
- `src/app/admin/AdminNav.tsx`: operations navigation.
- `src/app/dashboard/messages/page.tsx` and `MessagingSetup.tsx`: owner texting setup and consent disclosure on Messages.
- `src/app/dashboard/automations/page.tsx`: automation controls link back to the canonical Messages consent/setup section.
- Tests: `test/admin-messaging-operations.test.ts`, `test/admin-messaging-recovery-action.test.ts`, `test/owner-sms.test.ts`, and `test/messages-consent-boundary.test.ts`.

Remaining/dark:

- Deploy dark, verify staff authorization/MFA and owner isolation in staging, then inspect the page against deliberately seeded queue, failure, review, callback, and missing-read states.
- Operational visibility does not itself authorize sending, resolving an indeterminate provider outcome, or purchasing a number.

### Phase 5 — staging verification

**Local status:** complete local verification is green; the required live
staging and carrier evidence does not exist.

Concrete local evidence assets:

- PostgreSQL 17 harnesses: `verify-sms-delivery-foundation.mjs`,
  `verify-sms-webhook-safety.mjs`, `verify-sms-inbound-actions.mjs`,
  `verify-messaging-number-provisioning.mjs`, `verify-voice-event-inbox.mjs`,
  and `verify-messaging-schema.mjs`.
- Runtime/static suites for worker failures, producer boundaries, provider selection/auth, inbound routing, operator recovery, provisioning, and tenant-safe dispatch.
- `docs/signalwire-messaging-cutover-runbook.md`: dark-first staging matrix, database-proof requirements, cutover order, and rollback.
- Final post-rebase local aggregate: 551 test files / 9,497 tests, typecheck,
  build-time lint, production build, `git diff --check`, exact parity for the
  explicitly enumerated 41-migration messaging/voice runtime subset in
  `scripts/sync-messaging-schema.mjs` (not all 201 repository migrations), a
  clean install of `schema.sql` into a fresh PostgreSQL 17 database, and no FK
  forward references.
- The six disposable PostgreSQL 17 harnesses passed 236/236: delivery 25/25,
  webhook safety 24/24, inbound actions 29/29, number provisioning 44/44,
  voice inbox/retention 89/89, and fresh messaging schema 25/25.
- Focused local evidence includes the voice suite at 21 files / 276 tests, the
  final voice webhook boundary at 12/12, and routing/schema/retention at 27/27.

Still required in staging:

- A non-production SignalWire number and canary workspace.
- The measured Messaging webhook contract described below.
- Database evidence for successful send/delivery, definitive rejection, pre-request failure, post-request uncertainty, duplicate workers/callbacks, out-of-order callbacks, inbound/MMS, keyword scopes, dedicated/shared ambiguity, and Preview/test egress suppression.
- A final clean full-suite/typecheck/lint/build result on the release commit. An HTTP 2xx or provider dashboard screenshot alone is not acceptance.

### Phase 6 — SignalWire production cutover

**Local status:** provider abstraction, environment contract, dark routes/worker, and runbook are present; the production cutover itself is not performed and remains blocked.

Concrete implementation/readiness assets:

- `.env.example`: complete Twilio/SignalWire blocks, distinct `SIGNALWIRE_SIGNING_KEY`, worker/canary/lane gates, provisioning gates, and `LGQ_LEAD_VERIFICATION_SECRET` transition requirement.
- `src/lib/sms-provider.ts`: incumbent-safe selection and explicit `LGQ_SMS_PROVIDER=signalwire` cutover behavior.
- `src/lib/lead-phone-verification-readiness.ts` gives both code issuance and
  lead submission the same fail-closed decision: provider config, worker and
  contractor lane, kill/test/Preview suppression, canary, and an active matching
  dedicated sender must all agree. A dark lane cannot issue a code the user can
  never receive or make lead submission enforce a different answer.
- `docs/signalwire-messaging-cutover-runbook.md`: kill-switch-first deployment, signed-callback proof, one-account canary, delivery/inbound/keyword evidence, gradual expansion, and rollback.

External blockers:

- Resolve and reverify the failed individual assignment for **+1 (947) 941-2323**.
- Obtain written Campaign approval for the exact first production lane.
- Capture and verify the Messaging signing contract and Dashboard Signing Key.
- Apply the final migrations, deploy dark, and point the registered inbound/status resource to production only after the handlers exist.
- Add Production SignalWire variables and change provider/gates only during an approved cutover. **No production environment change is part of this local work.**
- Preserve Supabase Auth/Twilio phone login and prove it before and after cutover. Set `LGQ_LEAD_VERIFICATION_SECRET` before removing any application Twilio secret.

### Phase 7 — LGQ contractor dispatch Campaign

**Local status:** the secure dispatch product workflow and isolated `lgq_dispatch` queue lane exist; carrier authorization, Campaign/number provisioning, and live lane activation do not.

Concrete implementation:

- `src/lib/subcontractor-dispatch.ts`: opaque signed offer tokens, privacy-safe offer view, status model, and explicit acceptance/decline semantics.
- `src/lib/subcontractor-dispatch-data.ts`: account-scoped send/accept/decline/cancel/reopen/choose operations and stable per-offer SMS idempotency (`offer`, `cancelled`, `won`, `covered`).
- `src/app/sub/[token]/*`: public offer UI/actions; viewing does not accept or decline.
- `src/lib/sms.ts`: crew/subcontractor messages bind to `senderPurpose: 'lgq_dispatch'`.
- `src/lib/sms-delivery-worker.ts`: exact-`1` `LGQ_SMS_DISPATCH_ENABLED` gate.
- Tests: `test/subcontractor-dispatch.test.ts`, `test/subcontractor-acceptance.test.ts`, and the dispatch assertions in `test/sms-producer-queue-boundary.test.ts`.

Remaining/dark:

- SignalWire must confirm in writing that the current LGQ Brand/Campaign covers this traffic, or approve a separate dispatch Campaign.
- Provision and verify a separate dispatch sender if required, then complete Phase 5 evidence for this lane.
- Never place homeowner messaging on this lane or infer that the existing shared LGQ Campaign authorizes it.

### Phase 8 — dedicated contractor numbers

**Local status:** a manual/private-beta registration and dark provisioning state machine is implemented. It is not a sellable paid add-on.

Concrete implementation:

- `migrations/20260821182357_signalwire_dedicated_number_provisioning.sql`
  - owner-readable applications, append-only registration events, leased provider operations/attempts, candidate expiry, one-hour post-purchase hold, exact inbound verification, and individual-assignment activation;
  - authorized contact, HELP/STOP support contact, and required HTTPS opt-in evidence;
  - service-only compliance verification storing EIN last four—not a full EIN—bound to the current application revision; approval fails closed without it;
  - service-only provisioning RPCs and owner select-only RLS.
- `src/lib/messaging-number-provisioning.ts`: validation/readiness, application/review adapters, dark operation orchestration, and exact active-dedicated-sender requirement.
- `src/lib/signalwire-number-provisioning.ts`: scoped SignalWire search, purchase, inbound update, Campaign assignment, and individual-status adapter with origin/pagination safety.
- The adapter's current HTTP contract was cross-checked against SignalWire's
  official [search](https://signalwire.com/docs/apis/rest/phone-numbers/search-available-phone-numbers),
  [purchase](https://signalwire.com/docs/apis/rest/phone-numbers/purchase-phone-number),
  [update](https://signalwire.com/docs/apis/rest/phone-numbers/update-phone-number),
  and [assignment-list](https://signalwire.com/docs/apis/rest/campaign-registry/phone-number-assignments/list-number-assignments)
  documentation on 2026-08-21.
- `migrations/20260821195147_signalwire_dedicated_number_hardening.sql` and
  `migrations/20260821204404_signalwire_dedicated_number_adversarial_hardening.sql`
  require fresh carrier-complete Brand/Campaign evidence bound to the exact legal
  business revision, the exact production HTTPS webhook path plus POST method,
  and the exact purchased phone resource. Newly purchased US 10DLC numbers may
  be voice-only until assignment, so SMS capability is required from a fresh
  live phone read at final activation—not at purchase.
- Carrier spend uses one service-only database policy, immutable per-operation
  price snapshots, and an advisory-lock-protected aggregate ceiling. Carrier
  downgrades suspend the sender, and approved identity/compliance evidence cannot
  be silently replaced or resubmitted. Indeterminate recovery reads provider
  inventory before importing success or recording confirmed absence; it never
  blindly repeats the carrier mutation.
- Owner UI/action: `src/app/dashboard/messages/dedicated-number/*`.
- MFA/audited admin review, compliance verification, explicit purchase confirmation, and reconciliation: `src/app/admin/messaging/registrations/*`.
- Tests/harness: `scripts/verify-messaging-number-provisioning.mjs`, `test/messaging-number-provisioning-migration.test.ts`, `test/messaging-number-provisioning.test.ts`, and `test/signalwire-number-provisioning.test.ts`.

Remaining/dark:

- `LGQ_SIGNALWIRE_PROVISIONING_ENABLED` must remain `0` until CSP/API permissions, operator procedure, and staging evidence are complete.
- Submit/vet real downstream businesses manually first; no provider call or purchase is implied by the local forms.
- Define pricing, billing, subscription entitlement, included quantity, cancellation/release policy, and support ownership before sale. Today the dedicated-number allowance remains zero/unpriced and the UI is private beta.
- A number is unusable until purchase, exact inbound configuration, Campaign
  assignment, and a final live read verifies the individual assignment, exact
  provider resource/E.164, SMS capability, LaML handler, POST method, and
  production webhook URL.

### Phase 9 — separate AI Voice workstream

**Local status:** local voice admission, receipt, settlement, and hardening code exists and is dark. It is intentionally not part of the SMS cutover.

Concrete implementation:

- `docs/ai-voice-v1-decisions.md`: measured scratch-agent JSON receipt, dedicated HTTP Basic receipt authentication, provider/cost decisions, and number separation.
- `migrations/20260821190000_voice_runtime_hardening.sql`: token-bound finite receipt processing, retry/exhaustion behavior, stable lead identity, and unsupported-setting guards.
- `migrations/20260821191000_voice_admission_concurrency.sql`: atomic bounded
  concurrency admission, token-bound finalization/release, duplicate provider
  call reuse, and immediate seat release from a completed receipt.
- `migrations/20260821221223_voice_dedicated_number_invariant.sql`: binds
  admission to the exact active dedicated-number revision instead of accepting
  account ownership alone.
- `migrations/20260821230000_voice_transcript_retention.sql`: keeps one normalized
  `call_log` in `voice_calls`, strips transcript keys from `voice_events`,
  recomputes the payload hash, bounds owner visibility by entitlement retention,
  and exposes only a service-role purge that preserves active/retryable work.
- `src/lib/voice/{auth,provider,signalwire,admission,entitlement,receipt-processing,settlement}.ts` and `src/app/api/voice/{ai,ai/status,receipt}/route.ts`.
- Tests/harness: `test/voice-webhook-auth.test.ts`, `test/voice-signalwire-adapter.test.ts`, `test/voice-admission.test.ts`, `test/voice-receipt-processing.test.ts`, `test/voice-settlement.test.ts`, `test/voice-runtime-hardening-migration.test.ts`, `test/voice-retention-migration.test.ts`, `test/voice-retention.test.ts`, and `scripts/verify-voice-event-inbox.mjs` (89/89 database checks).

Remaining/dark:

- Keep `LGQ_AI_VOICE_ENABLED`, voice metering/gating, and the allowance worker off until the separate voice runbook passes.
- Do not attach a production number or the shared LGQ messaging number to an AI Agent.
- Voice JSON/Basic evidence cannot satisfy the Phase 3 Messaging signature gate. Sharing one contractor-dedicated number for voice and SMS is allowed only after that contractor's messaging registration is active.
- Withheld/unpriced voice SKUs and missing purchased entitlement remain product blockers; local capacity values are not entitlement.

## Release-evidence checklist

### 1. Freeze and verify the final local artifact

Run on the exact commit proposed for staging, not a moving worktree:

```powershell
git status --short
git diff --check
npm run test:pg17:sms-delivery
npm run test:pg17:sms-webhooks
npm run test:pg17:sms-inbound-actions
npm run test:pg17:number-provisioning
npm run test:pg17:voice-inbox
npm run test:pg17:messaging-schema
npm run check:schema:messaging
npm run check:schema:order
npx vitest run test/sms-delivery-worker.test.ts test/sms-producer-queue-boundary.test.ts test/sms-provider.test.ts test/inbound-routing.test.ts test/sms-purpose-aware-inbound-routing-migration.test.ts test/messaging-schema-parity.test.ts test/voice-retention-migration.test.ts test/voice-retention.test.ts test/admin-messaging-operations.test.ts test/admin-messaging-recovery-action.test.ts test/messaging-number-provisioning-migration.test.ts test/messaging-number-provisioning.test.ts test/signalwire-number-provisioning.test.ts
npm test
npm run typecheck
npm run lint
npm run build
rg -n "sendProviderMessage\(" src --glob "!src/lib/sms-provider.ts"
npx supabase --version
npx supabase migration list --help
npx supabase migration list --local
```

The `sendProviderMessage` egress search must show only the generic SMS delivery
worker. Direct-payment settlement must hand off through the same durable queue;
any second provider-egress caller is a stop condition.

Before remote application, use the installed Supabase CLI's own help/version and
compare local migration history. Do not invent or rename migration timestamps.
Local `schema.sql` parity and migration-order review are complete; remote
migration-ledger comparison is still required.

### 2. Retain database proof in staging

For every canary, retain IDs and timestamps—not message-body dumps—for these joins:

```sql
-- Exact sender eligibility; `Processed` order state is not enough.
select id, provider, e164_number, purpose, account_id, campaign_id,
       assignment_id, assignment_state, provisioning_status,
       inbound_ready, inbound_webhook_url, activated_at, last_verified_at
from public.sms_sender_numbers
where e164_number = '<staging E.164>';

-- One enqueue, one task, bounded attempts, and monotonic carrier lifecycle.
select e.id, e.account_id, e.status, e.provider, e.provider_id,
       e.sender_number_id, e.sender_purpose, e.idempotency_key,
       e.text_usage_kind, e.text_usage_state,
       e.text_credit_reservation_id, e.text_overage_reservation_id,
       e.queued_at, e.send_started_at, e.provider_accepted_at,
       e.delivered_at, e.failed_at, e.indeterminate_at,
       t.task_state, t.attempt_count, t.request_started_at,
       t.last_error_code
from public.sms_events e
join public.sms_delivery_tasks t on t.sms_event_id = e.id
where e.id = '<event uuid>';

select sms_event_id, attempt_number, request_started_at, outcome, error_code,
       leased_at, finished_at
from public.sms_delivery_attempts
where sms_event_id = '<event uuid>'
order by attempt_number;

-- Receipt-keyed action tasks prove that an inbound retry did not repeat the
-- associated estimate/reschedule/appointment/subcontractor mutation.
select webhook_receipt_id, action_kind, target_id, task_state,
       attempt_count, outcome_code, completed_at, exhausted_at
from public.sms_inbound_action_tasks
where webhook_receipt_id = '<receipt uuid>';

-- Authenticated callback dedupe/routing/review evidence.
select provider, webhook_kind, receipt_key, provider_event_id,
       processing_state, disposition, account_id, sender_number_id,
       sms_event_id, sms_message_id, received_at, processed_at
from public.sms_webhook_receipts
where provider_event_id = '<provider message id>'
order by received_at;

select reason, review_state, account_id, sender_number_id, sms_event_id,
       resolution_actor, resolved_at
from public.sms_operator_review_items
where webhook_receipt_id = '<receipt uuid>';

-- One provider-scoped inbound inbox row; omit message bodies from evidence exports.
select id, account_id, direction, provider, provider_id,
       sender_number_id, sms_event_id, created_at
from public.sms_messages
where provider = 'signalwire' and provider_id = '<provider message id>';

-- STOP/START must affect only the exact sender-number scope.
select sender_number_id, phone_number, status, source, opted_out_at, updated_at
from public.sms_sender_keyword_preferences
where sender_number_id = '<sender uuid>' and phone_number = '<recipient E.164>';
```

Acceptance evidence must demonstrate:

- exactly one `sms_events` row and task per idempotency key;
- one exact text-usage reservation/overage disposition per metered event, with
  every `reconciliation_failed` row operator-visible;
- no duplicate `sms_messages` row for a retried inbound provider ID;
- no duplicate domain mutation for a retried inbound receipt;
- no status regression from `delivered` or another terminal fact;
- terminal carrier facts close an indeterminate task without making it retryable;
- unknown/ambiguous shared routing creates review rather than a tenant row;
- STOP cancels queued/future sends for the correct sender scope, START/UNSTOP restores only valid prior consent, and HELP does not mutate consent;
- dedicated routing resolves only through that account's active `contractor_dedicated` inventory row;
- compliance verification exists for the current registration revision before approval, without exporting or logging a full EIN.

### 3. Capture the actual SignalWire Messaging webhook contract

Use a request logger or staging endpoint with a non-production number. For inbound, accepted/sent, delivered, and failed deliveries, retain:

- HTTP method;
- complete request URL, including scheme, host, path, port, and query string;
- every request header verbatim, especially `Content-Type`, every `X-SignalWire-*`, `X-Twilio-*`, `Authorization`, and `Signature` header;
- the exact raw body bytes before parsing or newline/encoding normalization;
- provider message ID, `From`, `To`, status, error code, and the relationship between retries/transitions;
- the Dashboard field that supplies the proven signing secret, recording its location/name but never its value.

Then prove locally and in staging that the untouched request verifies, while one changed URL byte, body byte, signature byte, or wrong provider secret fails before any receipt/message/event mutation. Record whether the body is form or JSON and whether authentication is signature-based or Basic. Do not infer Messaging behavior from the AI Voice JSON/Basic capture.

### 4. External gates and production go/no-go

All boxes must be satisfied with dated evidence:

- [ ] Final migrations applied in staging, PG17 harnesses and complete repository checks green, and `schema.sql` reconciled.
- [ ] Real SignalWire Messaging raw callback contract captured and invalid-signature tests proven.
- [ ] **+1 (947) 941-2323** individual assignment is successful/assigned, not merely order `Processed`.
- [ ] SignalWire written approval names the exact enabled traffic lane.
- [ ] Sender inventory is active, assigned, inbound-ready, unsuspended, and points at the expected staging/production endpoint.
- [ ] Staging canary reaches provider-accepted and `delivered`; one reply, STOP, START/UNSTOP, HELP, duplicate, out-of-order, ambiguous, and tenant-isolation cases have database proof.
- [ ] The staging matrix, canary observation, production-environment validation, and cutover evidence are complete and retained.
- [ ] Production SignalWire environment block, distinct signing key, `CRON_SECRET`, and `LGQ_LEAD_VERIFICATION_SECRET` have been reviewed without exposing their values.
- [ ] Supabase Auth/Twilio phone login succeeds before and after the cutover; its provider configuration remains unchanged.
- [ ] Operations has rehearsed the kill switch, callback-preserving rollback, indeterminate reconciliation, and admin health/review surfaces.
- [ ] Dedicated-number pricing/entitlement exists before any public sale; AI Voice completes its separate gate before any number is attached.

Until every applicable box is complete, keep `LGQ_DISABLE_OUTBOUND_SMS=1` for any attempted production cutover, keep worker/lane/provisioning/voice gates dark, and make no production provider or number change.
