# SMS setup gap audit — 2026-09-12

A read of the messaging code as it stands on `claude/sms-setup-gaps-vnwkwx`
(base `a0e6833`), looking for what the SMS setup does **not** do. Scope: the
outbound producers in `src/lib/sms.ts`, the durable queue and worker
(`sms-delivery.ts`, `sms-delivery-worker.ts`, `sms-delivery-cron.ts`), the
provider boundary (`sms-provider.ts`), inbound and status ingress
(`sms-webhook-ingress.ts`, `/api/sms/inbound`, `/api/sms/status`), consent
(`sms_consent`, `sms_consent_scopes`, `sms_consent_evidence`), templates and the
catalogue, number provisioning, and the SMS-relevant environment surface.

**What this audit is.** Static evidence: source, migrations, tests and
`.env.example`. Nothing here was executed against production, no provider API
was called, and no configuration was changed. Where an item needs a live
observation to close, it says so.

**What this audit is not.** It does not re-open the carrier registration gates
already tracked in *§3. Telephony, SMS & Carrier 10DLC Approval* and in
*SignalWire completion and remaining launch gates — 2026-09-06*. Contractor
brand/campaign registration, number assignment and carrier acceptance remain
open there and are not restated here. Items below are gaps that no existing
checklist line covers, plus three that sharpen an existing line and say so.

Findings are ordered by what they would cost if they went live unfixed.

---

## A. Consent and TCPA

### A1. The quiet-hours gate covers one billing category out of five

`src/lib/sms-delivery.ts:113` defers a send past TCPA quiet hours only when
`billingCategory === 'customer_message'`:

```ts
if (!availableAt && !input.bypassQuietHours && input.billingCategory === 'customer_message') {
```

`payment_message` is the category used by `sendCardSetupSms`,
`sendCardUpdateSms` and the payment producers (`src/lib/sms.ts:1030-1056`).
Those go to **homeowners** — a pay link or a dunning card-update prompt — and
they are not deferred. Neither is `verification` (lead phone codes, which are
user-initiated and defensible) nor `crew_message` (employees, a different
argument but not one anybody has written down).

The two producer-level checks that exist (`src/lib/sms.ts:626` and `:2319`)
cover speed-to-lead and intake confirmation specifically, not the payment path.

**Why it matters.** A card-update text at 11:40pm local is a consumer-facing
message inside the 9pm–8am window. The quiet-hours contract is already claimed
as complete on the checklist (*Quiet-Hours Delivery Contract, 2026-09-01*), and
that claim is narrower than it reads.

**Closed when** the category exemptions are an explicit, reviewed list in one
place (as `sms-billing-policy.ts` did for billing), payment traffic to consumer
numbers is deferred or deliberately exempted with a stated reason, and a test
asserts the table.

### A2. Quiet hours are decided at enqueue and never re-checked at send

`availableAt` is computed once, when the row is written. The worker
(`src/lib/sms-delivery-worker.ts`) has no quiet-hours logic at all — it claims a
due task and sends it.

Three ways a message therefore lands inside the window:

- A task enqueued at 8:50pm is due immediately, then fails retryably. The retry
  backoff schedule (`attempt_number` up to 8,
  `migrations/20260821180506_sms_delivery_foundation.sql:275`) can put the next
  attempt past 9pm.
- The worker is disabled (`LGQ_SMS_DELIVERY_WORKER_ENABLED=0`) or the cron is
  stalled across the boundary; everything queued flushes when it resumes.
- A deferred task released at 8:01am recipient-local that then fails retryably
  hits the same path in reverse the following evening.

**Closed when** the final egress gate re-evaluates the recipient-local hour
before the provider request, and a test proves a retry crossing 9pm is held
rather than sent.

### A3. The recipient time zone is guessed from the area code

`resolveRecipientTimeZone` (`src/lib/phone-timezone.ts:553`) tries, in order:
explicit time zone, **phone area code**, recipient address/city/state, account
time zone, then `America/New_York`.

For a customer record that has an address, the address is the better signal and
it is consulted second. Area-code inference has been unreliable for mobile
numbers since local number portability — a `+1 313` handset in Seattle gets
Eastern quiet hours, three hours wrong in the direction that sends too early.

**Closed when** address-derived zone outranks area-code inference wherever an
address exists on the record, the resolution source is persisted next to the
message so a complaint can be reconstructed, and the fallback chain is tested.

### A4. There is no marketing consent scope; campaigns ride transactional consent

`sms_consent_scopes.consent_scope` admits `customer`, `crew`, `owner`
(`migrations/20260901070000_crew_sms_consent_evidence.sql:16`). There is no
promotional/marketing scope.

`sendCampaignSms` (`src/lib/sms.ts:2122`) — the seasonal-offer blast composed in
`/dashboard/marketing` — enqueues as `billingCategory: 'customer_message'` on
that same `customer` scope. A homeowner who ticked the intake box to get quote
and appointment texts is, by the data model, eligible for a promotional blast.

Two separate exposures:

- **TCPA.** Marketing texts require prior express *written* consent; informational
  ones do not. One scope cannot represent two standards.
- **10DLC.** The comment in `src/app/api/sms/inbound/route.ts` records the
  registered use case as `LOW_VOLUME_MIXED / CUSTOMER_CARE + ACCOUNT_NOTIFICATION`
  with a TCR description stating that no MARKETING is carried. Campaign traffic
  on that campaign contradicts a carrier-audited field.

**Closed when** marketing consent is its own scope with its own capture, the
campaign sender requires it, and the campaign registration either covers
marketing or the composer is fenced off from registered-transactional senders.

### A5. Consent evidence is captured for crew only

`sms_consent_evidence` is the table that would answer "what exactly did this
person agree to" — `disclosure_text`, `disclosure_hash`, `disclosure_version`,
`consented_at`, `source`, `source_page`.

It has exactly one writer in the entire application: `src/lib/sms.ts:1232`, on
the crew path, at `consent_scope: 'crew'`.

Customer and lead consent — the intake checkbox, the portal link request, the
missed-call text-back (`ensureSmsConsentBaseline`, `src/lib/sms.ts:921`) — writes
`sms_consent` and `sms_consent_scopes` rows and **no evidence row**. There is no
stored record of the disclosure wording shown, its version, the page, or the
timestamp of the presentation.

Homeowner traffic is the traffic that draws TCPA complaints and carrier consent
audits. It is the traffic with no evidence.

**Closed when** every consent-establishing path writes an evidence row with the
versioned disclosure text and its hash, and the contractor-facing surface can
produce that record for one phone number on demand.

### A6. Free-form message bodies bypass the opt-out guard

`test/sms-catalogue.test.ts:126` is a good guard: every `SMS_CATALOGUE` entry
whose audience is `customer` or `lead` must contain "reply STOP to opt out",
with two argued exemptions (`verification-code`, `inbox-reply`).

It guards the catalogue. Three customer-facing bodies are composed at runtime
from operator-typed text and are not constrained by it:

| Path | Function | In catalogue | Carries opt-out |
| :--- | :--- | :--- | :--- |
| Lead detail → Private text | `formatPrivateSmsText` (`sms-templates.ts:644`) | **No** | **No** |
| Inbox reply | `inboxReplyText` (`sms-templates.ts:557`) | Yes, exempt by decision | No |
| Marketing campaign body | `campaignText` (`sms-templates.ts:566`) | Yes (sample body) | Yes, appended |

`formatPrivateSmsText` is the one to fix: it is absent from the catalogue
entirely, so it appears in neither the guard nor the outgoing-text catalogue the
messages page renders, and it prefixes a business name onto arbitrary operator
text with no opt-out line.

Separately, no free-form path validates what the operator typed — no segment
count shown before send, no check for content the registered campaign excludes.

**Closed when** `formatPrivateSmsText` is in the catalogue and under the guard,
the free-form composers show segment count and append the opt-out line where the
thread has no recent one, and the exemption list stays argued rather than
implicit.

---

## B. Carrier and 10DLC operations

### B1. Provider error codes are stored and never read

`extractStatusWebhook` parses `ErrorCode` (`src/lib/sms-webhook-ingress.ts:277`)
and `applyStatusWebhook` persists it as `p_provider_error_code`. Nothing in
`src/` ever branches on its value — a grep for `21610`, `30007`, `30003`,
`30006` across the application finds nothing but a marketing paragraph in
`resources.ts`.

The four that matter:

| Code | Meaning | What should happen | What happens |
| :--- | :--- | :--- | :--- |
| `21610` | Recipient opted out at the carrier | Write the opt-out; stop sending | Stored; next send still attempted |
| `30007` | Carrier filtered as spam | Alert — campaign health | Stored; silent |
| `30003` | Handset unreachable | Backoff, eventually suppress | Retried |
| `30006` | Landline or unreachable carrier | Suppress; flag the record | Retried |

`21610` is the serious one: the carrier is telling us a person opted out through
a path our inbound webhook never saw, and the ledger does not learn it.

**Closed when** terminal error codes map to a suppression decision, filtering
codes raise an operator alert, and the mapping is tested against recorded
payloads from both providers.

### B2. No brand or campaign lifecycle tracking

Campaign approval is treated as a one-time event. Nothing in the schema or the
provisioning library tracks:

- brand re-vetting or campaign renewal dates (TCR campaigns renew; `expires_at`
  in `messaging-number-provisioning.ts` is on a provisioning operation lease,
  not the campaign),
- the assigned-number count against the approved per-campaign ceiling (49, per
  the Carrier Operations limits recorded on the checklist),
- daily or per-minute volume against the approved caps (75 AT&T SMS/min, 50 AT&T
  MMS/min, 2,000 T-Mobile/day at brand level).

Those numbers exist in the checklist as prose. They are not in code, not
measured, and nothing warns as they are approached.

**Closed when** the approved limits are recorded as data, current usage is
measured against them, and an operator sees a warning before a ceiling is hit
rather than after carrier filtering starts.

### B3. No throughput governor, and a low hard ceiling

`vercel.json:132` runs `/api/cron/sms-delivery` once a minute. `BATCH_SIZE = 20`
(`src/lib/sms-delivery-cron.ts:10`), and `runSmsDeliveryBatch` claims one task at
a time in a loop (`sms-delivery-worker.ts:448`).

Platform-wide outbound is therefore capped at roughly **20 messages per minute**,
shared across every workspace, minus whatever the payment producer takes from
the same budget. There is no per-account fairness rule, so one workspace's
campaign starves everyone else's appointment reminders, and there is no
per-carrier rate limiting on the other side.

**Closed when** the intended sustained rate is stated, the batch size and cadence
are set from it, queue depth and oldest-task age are measured, and a per-account
share stops one sender from consuming the whole window.

### B4. No outbound MMS

`buildSendRequest` (`src/lib/sms-provider.ts:404`) sets `To`, `Body`, a sender,
and `StatusCallback`. There is no `MediaUrl` parameter, and no producer takes an
attachment.

Inbound MMS is handled — `mediaUrls()` parses up to ten parts
(`sms-webhook-ingress.ts:228`), `sms-media-fetch.ts` downloads them, and
`/api/messages/media/[messageId]` serves them. The direction that matters for a
contractor — texting a customer a photo of the work, a marked-up diagram, a
signed form — cannot be done.

The provisioned numbers report `["voice","fax","sms","mms"]` and the campaign
carries an approved AT&T MMS rate limit, so the capability is registered and paid
for and unused.

**Closed when** outbound MMS is either implemented (media parameter, per-segment
billing, size and type limits, a test) or explicitly deferred with the customer
claims checked for anything that implies it.

### B5. No number release path, and recycled numbers inherit consent

`messaging-number-provisioning.ts` (1,965 lines) purchases and assigns numbers.
It has no function to release, deprovision, unassign or relinquish one.

Two consequences:

- A cancelled workspace's number keeps billing.
- Consent and opt-out rows are keyed on `(account_id, phone_number)` and
  `(provider, campaign_id, phone_number)`. A **recipient** number released by its
  owner and reassigned by the carrier to a stranger arrives carrying the previous
  holder's `opted_in` row — and the new holder gets texts they never agreed to.
  This is the standard reassigned-number exposure; the FCC's safe harbour depends
  on checking the Reassigned Numbers Database, which nothing here does.

**Closed when** there is a release path for numbers we own, and consent rows
carry a last-affirmed date with a policy for what happens to a phone number that
has been silent past a threshold.

---

## C. Configuration and operations

### C1. `StatusCallback` is attached conditionally and fails open

```ts
const origin = trustedProviderCallbackOrigin();
if (origin) data.set('StatusCallback', `${origin}/api/sms/status`);
```
— `src/lib/sms-provider.ts:415`

`trustedProviderCallbackOrigin` (`src/lib/app-origin.ts:49`) returns `null` for
anything that is not a bare HTTPS origin inside `NEXT_PUBLIC_ROOT_DOMAIN`. A
preview deployment URL, a port, a trailing path, a changed root domain — each
returns `null`, and the send proceeds **without a status callback**, with no
throw, no log line, and no alert.

Every message sent in that state is delivered or not with no durable evidence
either way, and the checklist's own standard ("durable delivery evidence
distinguishes provider acceptance from delivery") silently stops being met.

**Closed when** a missing callback origin fails the send or raises an operator
alert, and a startup or health check asserts the origin resolves in production.

### C2. No destination-country allowlist

`normalizeUsPhone` (`src/lib/phone.ts:1`) returns `+<digits>` for **any** input
starting with `+` between 10 and 15 digits. `enqueueSmsDelivery` validates the
shape only: `/^\+[1-9][0-9]{7,14}$/`.

Nothing anywhere restricts the destination to NANP. A `+44`, `+234` or `+880`
number entered into a lead form, a crew roster or the private-text box is
accepted and handed to the provider. High-cost international destinations are the
standard SMS-pumping target, and the campaign is registered US-only, so these
sends fail at the carrier after we have paid for the attempt.

The public verification endpoint is well defended on volume
(`/api/public/leads/verify-phone`: 5/min per IP, 5/min and 10/day per number,
fail-closed) — but the destination itself is unconstrained.

**Closed when** outbound destinations are restricted to an explicit country
allowlist at the enqueue boundary, with a clear operator-facing refusal.

### C3. No per-workspace outbound volume or spend ceiling

Text credits meter what a workspace is *billed* for
(`billing/text-credit-usage.ts`), and three categories are exempt from metering
by policy (`sms-billing-policy.ts`: `payment_message`, `verification`). Exempt
traffic still costs real money at the carrier and has no ceiling.

Ad spend has a hard monthly cap (`ad-billing-shared.ts:263`), Neighborhood Halo
has one (`neighborhood-halo-service.ts:347`). Messaging has none.

**Closed when** a per-workspace daily message ceiling exists — including exempt
categories — with an alert before it is reached.

### C4. The legacy Twilio signing key is a second live credential with no sunset

`/api/twilio/inbound` and `/api/twilio/status` re-export the SignalWire handlers
as permanent aliases, and the reasoning for keeping them is sound and written
down. But `validateWebhookSignature` (`src/lib/sms-provider.ts:789`) selects its
verification key from the *request header*: an `x-twilio-signature` is verified
against `TWILIO_AUTH_TOKEN`, on every SMS webhook route, for as long as that
variable is set.

`TWILIO_AUTH_TOKEN` is still required for phone verification and the voice bridge
(`voice-call-bridge.ts:95`), so it is not going away on its own. The result is
two independent signing keys authenticating the same endpoints indefinitely,
with no dated review of whether the Twilio one is still needed.

**Closed when** there is a dated decision on the Twilio credential's scope — with
the verification-token and voice-bridge dependencies separated from the webhook
signing key — and a review date rather than an indefinite dual-key posture.

### C5. `.env.example` carries three divergent Twilio blocks

`TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` are each declared three times
(lines 326-327, 883-884, 894-895). The sending number is declared as
`TWILIO_FROM_NUMBER` in the first block and `TWILIO_PHONE_NUMBER` in the other
two — and both names are real, used by different subsystems
(`sms-provider.ts:294` reads `TWILIO_FROM_NUMBER`; `voice-call-bridge.ts:63`
reads `TWILIO_PHONE_NUMBER`, falling back to a literal `+18005550199`).
`SIGNALWIRE_SPACE_ID` is declared twice (522, 723).

Nothing is broken by this today. It is how a variable gets set to the wrong value
in a console by somebody reading the wrong block, and the master environment
checklist (§7) inherits the ambiguity.

**Closed when** each variable is declared once, the two number variables are
documented as the distinct things they are, and the voice-bridge literal fallback
is removed or justified.

### C6. The SMS health signal reports configuration, not reachability

`uptime-monitoring.ts:119-131` reports the SMS gateway as `configured` when
credentials are present, `degraded` when they are not. This is honest by
construction — it was deliberately introduced as `SubsystemStatus = 'configured'`
under item **T7** so the badge could not claim a probe it had not run.

The gap is what has not been built since: there is no synthetic send-and-receive
canary, so nothing detects a provider outage, an expired credential, a revoked
campaign, or a broken callback until a human notices missing texts. The existing
open checklist item on alert thresholds (*numeric thresholds for … SMS stalls …*)
is the adjacent gap; this is the probe underneath it.

**Closed when** a scheduled canary sends to a controlled number, confirms the
status callback, and drives the badge and an alert.

### C7. Registry-callback signature enforcement is tracked only in the runbook

`LGQ_SIGNALWIRE_REGISTRY_REQUIRE_SIGNATURE` ships unset, so
`/api/sms/registry-status/[token]` records a signature verdict and rejects
nothing (`route.ts:205`). That is a deliberate measure-first posture, and the
runbook tracks turning it on — but the item lives in
`docs/signalwire-messaging-cutover-runbook.md:217` and has never appeared on the
launch checklist, so it is not visible at the gate where it would be read.

Until it is enforced, the path-segment token is the only authentication on that
endpoint.

**Closed when** the pending flag is on the checklist with the observation count
that would justify flipping it.

---

## Summary

| # | Gap | Area | Weight |
| :--- | :--- | :--- | :--- |
| A1 | Quiet hours skip payment/verification/crew categories | TCPA | High |
| A2 | No quiet-hours re-check at send; retries cross the boundary | TCPA | High |
| A3 | Recipient time zone inferred from area code before address | TCPA | Medium |
| A4 | No marketing consent scope; campaigns ride transactional consent | TCPA + 10DLC | High |
| A5 | Consent evidence captured for crew only, not customers | TCPA | High |
| A6 | Free-form bodies bypass the opt-out guard; one is uncatalogued | Compliance | Medium |
| B1 | Provider error codes stored, never interpreted (`21610` especially) | Carrier | High |
| B2 | No brand/campaign renewal, number-count or volume-cap tracking | Carrier | Medium |
| B3 | ~20 msg/min platform ceiling, no fairness, no carrier rate limit | Capacity | Medium |
| B4 | No outbound MMS despite registered and paid-for capability | Product | Medium |
| B5 | No number release path; recycled numbers inherit consent | Carrier + TCPA | Medium |
| C1 | `StatusCallback` fails open — sends proceed with no delivery evidence | Operations | High |
| C2 | No destination-country allowlist | Fraud | Medium |
| C3 | No per-workspace message volume or spend ceiling | Fraud | Medium |
| C4 | Twilio signing key live on every SMS webhook with no sunset | Security | Low |
| C5 | Three divergent Twilio blocks in `.env.example` | Configuration | Low |
| C6 | SMS health badge reports configuration, not reachability | Observability | Medium |
| C7 | Registry signature enforcement tracked only in the runbook | Tracking | Low |

Eighteen gaps. Six are consent or quiet-hours correctness (A1, A2, A4, A5, B5,
and C1 by way of losing the evidence), and those are the ones that carry
regulatory rather than operational cost.
