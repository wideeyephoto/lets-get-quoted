# SignalWire Messaging Implementation Plan

**Decided:** 2026-08-21<br>
**Status:** Local code, migrations, tests, and runbooks implemented; live staging/cutover evidence remains gated and unverified<br>
**Scope:** LGQ operational SMS, inbound replies, delivery tracking, and later dedicated contractor numbers<br>
**Out of scope for the first production release:** changing Supabase Auth OTP delivery, activating contractor-to-homeowner texting, and activating AI Voice

## Implementation outcome

The local implementation now covers every buildable component of the nine-phase
design, including the dedicated-number and AI Voice foundations. Release 5's
real-number staging matrix and Release 6's production cutover were not executed;
they require the external approvals and measured carrier evidence listed below.
The implementation remains deliberately dark:
no migration was applied remotely, no provider or Vercel setting changed, no
number was purchased or attached, and no live message or call was triggered.

Local completion evidence and the remaining external release gates are recorded
in `docs/signalwire-messaging-implementation-report-2026-08-21.md`. Production
activation is still a no-go until the measured SignalWire Messaging signature
contract, Campaign approval, individual number assignment, staging canary, and
pricing/entitlement gates in that report are satisfied.

## 1. Objective

Move Let’s Get Quoted operational messaging from the currently selected Twilio transport to SignalWire without changing the working Supabase/Twilio phone-login flow.

The target separation is:

```text
Supabase Auth -> Twilio
  Login and phone-verification codes only

LGQ automations/messages -> durable SMS queue -> SignalWire
  LGQ account alerts and approved dispatch traffic

SignalWire callbacks -> production webhook -> delivery ledger/inbox
  Delivery receipts, replies, STOP/START/HELP

Future paid add-on -> contractor registration -> dedicated number
  Contractor-to-homeowner conversations
```

## 2. Current verified state

- Vercel Production currently resolves operational SMS to Twilio.
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_MESSAGING_SERVICE_SID` are present in Vercel Production.
- The complete SignalWire credential block and `LGQ_SMS_PROVIDER` are absent from Vercel Production.
- `SIGNALWIRE_SIGNING_KEY` is absent.
- Supabase Auth phone OTP is a separate integration and currently works through Twilio.
- The SignalWire Brand is complete and the LGQ account/support Campaign is active.
- The assignment order for `+1 (947) 941-2323` is `Processed`, but the individual number assignment is `Failed`.
- The SignalWire number currently sends inbound messages to the `staging-db` Supabase Edge Function, not the production Vercel webhook.
- Production has no recorded successful delivered SMS and no recorded inbound SMS.
- Production still runs the previously verified synchronous/Twilio path. In the
  local implementation, ordinary application SMS is converted to an atomic
  event/task queue and all provider egress, including direct-payment messages,
  is confined to the one generic durable worker.

## 3. Messaging boundaries

These are invariants rather than implementation preferences.

1. Twilio remains configured inside Supabase Auth for login and phone-verification codes.
2. The current SignalWire Campaign is limited to LGQ-branded account and support notifications sent to opted-in contractor account holders.
3. The shared LGQ number is not a contractor's business number.
4. Homeowner conversations remain off the shared LGQ number.
5. Crew or subcontractor dispatch uses the current LGQ Brand only after written SignalWire confirmation that the campaign covers it, or after approval of a separate LGQ dispatch Campaign.
6. Contractor-branded homeowner messaging requires downstream registration and a dedicated number.
7. A `Processed` assignment order is insufficient; the individual phone-number assignment must be successful before sending.
8. The production rollback is `LGQ_DISABLE_OUTBOUND_SMS=1`. It is not a fallback to unregistered Twilio messaging.
9. No production number, provider setting, database schema, or Vercel variable changes until the relevant release gate explicitly allows them.

## 4. Release 1: durable delivery foundation

This release is dark. It adds no route, cron, provider egress, or production feature activation.

### 4.1 Preserve the ledger

Keep `sms_events` as the authoritative record of what LGQ intended to send and what happened to it.

Extend it with:

- provider;
- sender-number reference;
- stable idempotency key;
- provider message ID uniqueness when present;
- lifecycle states for `queued`, `sending`, `sent`, `delivered`, `failed`, `indeterminate`, and `opted_out`;
- timestamps required to explain each transition.

State transitions must be monotonic. A late `sent` callback must never replace `delivered`, and terminal failure must not be silently reset to pending.

### 4.2 Add sender-number inventory

Add `sms_sender_numbers` containing only non-secret provisioning metadata:

- provider;
- E.164 number;
- provider number/resource ID;
- purpose: `lgq_shared`, `lgq_dispatch`, or `contractor_dedicated`;
- optional contractor account;
- Brand, Campaign, assignment, and inbound-resource identifiers;
- provisioning status;
- inbound readiness;
- activation and suspension timestamps.

API credentials remain in environment variables and never enter this table.

### 4.3 Add the delivery queue

Add a service-only `sms_delivery_tasks` table with a one-to-one reference to `sms_events`:

- `queued`, `leased`, `completed`, `failed`, `indeterminate`, or `cancelled`;
- attempt count;
- next-available time;
- lease token and expiration;
- request-started timestamp;
- fixed, privacy-safe failure code;
- created and updated timestamps.

Create one atomic database operation that inserts the ledger event and delivery task together. No caller may create one without the other.

### 4.4 Queue safety

- Claim bounded batches with `FOR UPDATE SKIP LOCKED`.
- Commit the claim before making an external HTTP request.
- Never hold a database transaction open during provider network activity.
- Use partial indexes for due queued work and expired leases.
- Recheck current consent immediately before provider egress.
- If a request may have reached the provider but its result is unknown, mark it `indeterminate`; do not blindly retry.
- Keep queue tables and mutation functions inaccessible to `anon` and `authenticated` roles.
- Permit tenant-scoped read access only to the delivery history appropriate for that account.

### 4.5 Release 1 verification

- Migration is idempotent and can be applied twice safely.
- RLS and grants are explicitly tested.
- Two workers cannot claim the same task.
- A lease can be recovered without duplicating a completed delivery.
- Consent withdrawal cancels a queued task before egress.
- Invalid state transitions fail at the database boundary.
- No provider host is contacted in tests or Preview.

## 5. Release 2: delivery worker and enqueue conversion

Add:

- `src/lib/sms-delivery-worker.ts`;
- `/api/cron/sms-delivery`;
- an atomic claim operation;
- bounded batch processing;
- lease recovery;
- cron authentication with `CRON_SECRET`;
- fixed operational metrics and error codes.

The worker must:

1. claim a small due batch;
2. recheck consent and sender readiness;
3. record which provider and sender will be used;
4. mark the provider attempt started;
5. call the provider outside the database transaction;
6. finalize the event and task with a lease-token compare-and-set;
7. classify an uncertain result as `indeterminate` rather than resending.

Refactor every operational producer to enqueue instead of synchronously calling `sendProviderMessage()`:

- owner alerts;
- crew notifications;
- subcontractor dispatch;
- payment messages;
- appointment reminders;
- Messages-page replies;
- automation-generated texts.

Message composition, consent checks, segment accounting, and existing business idempotency rules remain reusable. Only the final delivery boundary changes.

Add a temporary SignalWire canary allowlist keyed by account ID. When populated, only those accounts may leave the queue for a real provider. `LGQ_DISABLE_OUTBOUND_SMS=1` remains the unconditional global stop.

## 6. Release 3: callbacks and tenant-safe routing

### 6.1 Capture the actual SignalWire Messaging contract

Before finalizing production verification, capture one real SignalWire Messaging webhook in staging and retain:

- the complete URL;
- content type;
- exact form body;
- all signature headers;
- the secret that successfully verifies it.

The measured AI Voice JSON and HTTP Basic behavior is a separate contract and must not be applied to Messaging webhooks.

### 6.2 Delivery-status callback

- Authenticate before parsing or mutating delivery state.
- Deduplicate callback events.
- Resolve the event by provider and provider message ID.
- Reject unknown sender numbers and provider mismatches.
- Apply monotonic status transitions.
- Record provider failure codes without exposing secrets or unnecessary message content.

### 6.3 Inbound callback

Routing order:

1. Authenticate the callback.
2. Normalize `From` and `To`.
3. Handle STOP, START, UNSTOP, and HELP before ordinary intent processing.
4. Resolve the SignalWire sender-number record from `To`.
5. For a dedicated number, route directly to its contractor account.
6. For the shared LGQ number, require `From` to identify exactly one current opted-in LGQ account holder.
7. If no account or multiple accounts match, create an operator-review item; never use "most recent message wins."
8. Store the inbound message in `sms_messages`.
9. Invoke only the permitted intent handlers.
10. Return valid provider markup without causing duplicate auto-replies on retry.

STOP suppression must be enforced at send time as well as enqueue time. A queued message may not escape after a later STOP.

### 6.4 Dispatch replies

Secure, job-specific links remain the primary dispatch response mechanism.

- A page visit never accepts or declines a job.
- Accept and Decline are explicit mutations.
- Tokens are opaque, expiring, offer-specific, and single-decision.
- Full homeowner information remains behind authentication until the appropriate workflow permits access.
- Bare YES/NO is actionable only when exactly one compatible pending question exists.
- Multiple pending dispatches produce a dashboard/digest response rather than a guessed job selection.

## 7. Release 4: product and operator visibility

Add a compact messaging-health area on Messages or the admin surface showing:

- active operational provider;
- shared sending number;
- Campaign and number-assignment state;
- inbound webhook destination;
- latest successful outbound delivery;
- latest inbound message;
- queued, failed, and indeterminate counts;
- outbound kill-switch and canary status.

Add an operator-review queue for:

- ambiguous shared-number replies;
- unknown sender numbers;
- unmatched callbacks;
- indeterminate deliveries;
- signature failures;
- failed Campaign or number provisioning.

Keep owner consent capture on Messages and retain the link from Automations.

## 8. Release 5: staging verification

Apply the dark foundation to staging and use only a non-production test number.

The test matrix must cover:

- consent granted, absent, stale, and withdrawn;
- successful send;
- delivered callback;
- provider rejection;
- failure before provider request;
- process interruption after request begins;
- duplicate worker invocation;
- duplicate and out-of-order callbacks;
- ordinary inbound reply;
- STOP, START, UNSTOP, and HELP;
- photo-only MMS;
- missing and invalid signatures;
- dedicated-number routing;
- ambiguous shared-number routing;
- tenant-isolation attempts;
- Preview and test environments attempting provider egress.

Acceptance requires database evidence for every transition. A successful HTTP response by itself is not proof of delivery.

## 9. Release 6: SignalWire and production cutover

### 9.1 External readiness

1. Ask SignalWire to resolve the failed assignment for `+1 (947) 941-2323`.
2. Confirm the individual assignment is successful, not merely that its order is `Processed`.
3. Confirm in writing that the Campaign covers the exact first-release traffic.
4. Determine the correct Messaging signing secret from the staging capture.
5. Configure the SignalWire inbound resource for the production Vercel endpoint only after the production handler is deployed dark.

### 9.2 Environment preparation

Before eventually removing Vercel's Twilio auth token, set `LGQ_LEAD_VERIFICATION_SECRET` to preserve the existing stateless lead-verification token contract.

Leave Supabase Auth's Twilio provider configuration untouched.

Add the complete SignalWire Production block:

- `SIGNALWIRE_SPACE_URL`;
- `SIGNALWIRE_PROJECT_ID`;
- `SIGNALWIRE_API_TOKEN`;
- `SIGNALWIRE_NUMBER_GROUP_ID` or `SIGNALWIRE_FROM_NUMBER`;
- explicit `SIGNALWIRE_SIGNING_KEY`;
- `LGQ_SMS_PROVIDER=signalwire` only at the controlled cutover step.

### 9.3 Cutover sequence

1. Set `LGQ_DISABLE_OUTBOUND_SMS=1`.
2. Add the SignalWire variables scoped to Production.
3. Deploy the production handler and worker dark.
4. Point SignalWire inbound messaging at the production endpoint.
5. Prove valid callbacks authenticate and invalid callbacks fail.
6. Set `LGQ_SMS_PROVIDER=signalwire`.
7. Enable the internal canary account only.
8. Send one opted-in outbound message.
9. Require `sent` and then `delivered` evidence.
10. Reply and require one correctly routed inbound `sms_messages` row.
11. Exercise STOP and START and prove the queue respects both.
12. Remove the canary restriction.
13. Monitor queue age, failure codes, signature failures, and inbound routing.
14. Retain Vercel's Twilio operational variables briefly for delayed callback validation, then remove them after the migration window.

Emergency rollback is always `LGQ_DISABLE_OUTBOUND_SMS=1`.

## 10. Release 7: LGQ contractor dispatch Campaign

After the account-alert lane is stable:

1. Obtain SignalWire's written decision on LGQ-branded crew and subcontractor dispatch.
2. If required, register `LGQ Contractor Dispatch & Scheduling` under the existing LGQ Brand.
3. Purchase and assign a separate number only after Campaign approval.
4. Limit it to opted-in contractor, crew, and subcontractor recipients.
5. Activate secure job links and multiple-open-dispatch digests.
6. Keep homeowner messages outside this Campaign.

## 11. Release 8: paid dedicated contractor numbers

Build a provisioning state machine:

```text
application
-> internal review
-> Brand submitted
-> Campaign submitted
-> approved
-> number purchased
-> assignment pending
-> inbound resource configured
-> active
```

Collect and retain in the owner-readable application:

- legal business identity, but never a full EIN;
- website plus the authorized contact's name, title, email, and E.164 phone;
- use case and message samples;
- an HTTPS opt-in page or screenshot as evidence;
- Terms and Privacy URLs;
- monitored email and E.164 phone contacts for HELP and STOP support.

LGQ intentionally deviates from retaining the full EIN in the application: an MFA-authorized operator verifies the tax identity out of band, then a service-only record retains only the EIN last four, verification timestamp/operator, a nonsecret verification reference, and the exact application revision. Owners cannot read that record, direct table writes are denied, and approval fails closed when current-revision verification is absent. The owner and admin UIs must say not to enter or email a full EIN.

Start with human approval and provider submission behind an admin workflow. Automate registration and number purchasing only after SignalWire confirms LGQ's CSP/API permissions and the manual workflow has produced repeatable successful registrations.

A paid contractor number is not usable until its Campaign assignment and inbound configuration are verified.

The shared LGQ number never carries contractor-branded homeowner conversations.

## 12. Separate AI Voice workstream

AI Voice follows messaging stabilization and retains its existing provider-adapter and receipt design.

- Use a dedicated contractor voice number.
- Do not attach an agent to the shared LGQ notification number.
- Use the measured JSON receipt contract and dedicated HTTP Basic credentials.
- Settle only calls LGQ admitted and match by `call_id`.
- Keep replay protection, project/space validation, usage reservations, and the immutable billing ledger.
- Sharing one contractor number for voice and SMS is allowed only after that contractor's messaging registration is approved.

## 13. Production definition of done

The first SignalWire messaging release is complete only when all of the following are true:

- the individual SignalWire number assignment is successful;
- the inbound resource points to production;
- the exact Messaging webhook signature contract is captured and tested;
- the complete SignalWire Production configuration is present;
- one canary message reaches `delivered` with a SignalWire provider ID;
- one reply creates exactly one inbound `sms_messages` row in the correct tenant;
- STOP suppresses queued and future sends;
- START restores only the intended consent scope;
- duplicate workers and callbacks create no duplicate customer messages;
- ambiguous shared-number replies enter review rather than crossing tenants;
- queue age, failed, indeterminate, and signature-failure states are visible to operations;
- Supabase/Twilio phone login still works;
- the global outbound kill switch is tested and documented.

## 14. Initial implementation sequence (completed locally)

The first local implementation change contained only:

1. the sender-number and delivery-task migration;
2. atomic enqueue and claim database operations;
3. RLS and grants;
4. queue state-machine and concurrency tests;
5. no provider calls, webhook changes, cron, deployment, or feature activation.

That gives the rest of the implementation a durable, reviewable boundary without changing any live behavior.
