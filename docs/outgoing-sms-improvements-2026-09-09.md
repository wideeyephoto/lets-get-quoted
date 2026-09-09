# Outgoing SMS improvements

Implemented from the September 9, 2026 source/content audit, based on commit `33445f28ae257c71cb61b701aa3f656e70f0dbe1`. Work is isolated on branch `fix/outgoing-sms-improvements-20260909`. These changes have not been deployed or tested against live customer messaging.

## Customer-facing changes

- Ad-lead acknowledgements ask for a preferred day and explain that availability needs confirmation. They no longer invent tomorrow's slots, a nearby estimator, free visits, discount eligibility, or a staffed emergency response.
- Booking and post-call request receipts distinguish a request from a confirmed appointment. Intake ranges are preliminary and subject to review. Generic inquiry receipts explain the next step without promising a response shortly.
- Arrival messages without an ETA avoid promising arrival shortly. Card setup asks the customer to enable billing instead of implying setup is already complete.
- Quick Stop status messages and lien-waiver texts include the contractor's resolved business name.
- Quote reminders use distinct first, intermediate, and final wording, offering help before asking whether plans changed.

For example, the first quote reminder now says:

> Evergreen Lawn & Landscape: Karen, any questions about your quote? Reply here or review it: [actual link] Reply STOP to opt out.

## Segment usage and previews

Standard English system copy uses plain punctuation and fewer decorative emoji. Generated time labels receive targeted punctuation normalization. Names and meaningful non-English text remain intact; field confirmations no longer delete all non-ASCII characters. Owner-written campaigns, inbox replies, and custom arrival bodies retain their wording.

The preview uses the same `segmentSms` calculator as billing, including GSM extension characters and emoji boundaries. Quick Stop previews now include the opt-out envelope used by the sender.

The catalogue contains 68 examples, compared with 59 in the audit. Crew welcome, lien-waiver, post-call, booking-decision, Quick Stop, and owner estimate-outcome examples share real sending builders or constants. Sample links use realistic token lengths. The UI accurately describes common examples and selected variants, rather than claiming exhaustive coverage. Post-call examples reflect the arguments actually supplied by settlement and the existing enablement setting.

Measured with the application's segment calculator and the same fictional inputs:

| Message | Before | After |
|---|---:|---:|
| Actual crew subscription welcome | 4 | 2 |
| Quote-ready text with a full URL and 43-character token | 4 | 2 |
| Owner phone verification | 3 | 1 |
| Staff voice authorization code | 3 | 1 |

Only two updated catalogue examples contain Unicode: owner-written campaign and inbox-reply samples. These are sample measurements, not measured production savings. Real names, addresses, URLs, custom copy, and message frequencies affect usage. The generic post-call sample increases from one to two segments because it now includes a next step. Crew disclosure wording, STOP/HELP instructions, visit-fee disclosures, and payment amounts were retained.

## Quote follow-up behavior

The sweep checks tenant-scoped conversation records before minting a link or enqueueing a nudge. It pauses for 24 hours after the latest recorded contact and treats any recorded inbound customer message or portal question/note as unresolved until a later successful inbox reply. The check includes visible inbound SMS, portal questions and client notes, successful manual inbox replies, and client-visible owner updates. Generic automated texts do not count as answers.

Before a queued quote SMS enters provider staging, the worker rechecks the event's persisted quote identity, current automation enablement and channel, job/approval state, active share window, and conversation. A customer response, disabled SMS automation, or superseded quote can therefore stop a queued message before staging, billing, or provider requests. Read failures fail closed and may retry.

Existing cadence, stop dates, consent, duplicate prevention, and quiet-hour policy remain in effect. A paused nudge is not replayed beyond the configured follow-up window. No database migration is required.

Operational limits:

- There is no resolved-question field or question classifier. Even an acknowledgement such as "Thanks" can suppress reminders until a later successful inbox reply. Off-platform calls/email and generic owner portal updates cannot clear the guard. A portal question without a later successful inbox reply can suppress the rest of the cadence. An explicit resolve/snooze control would improve this.
- Prevented queued nudges use the existing claim-token-bound failure path. They appear as terminal failures with explicit `sms_quote_followup_*` reasons, rather than a new cancellation status. A suppressed queued stage remains counted in the cadence and is not retried automatically after the conversation clears. Data-read failures use the retryable `sms_quote_followup_unavailable` reason.
- The delivery check is an application recheck, not an atomic lock against a reply arriving immediately before dispatch.
- Conversation reads return at most one row each, but database scan performance has not been measured on production volumes.

## Validation

Completed checks:

- Selected SMS, quote follow-up, booking, scheduling, weather, ad-lead, neighborhood, estimate-offer, subcontractor, and Quick Stop regression suites: **1,889 tests passed across 112 files**.
- Full app and test TypeScript check: `tsc --noEmit -p tsconfig.test.json` passed.
- Changed-source Next.js lint: passed with four existing unused-import warnings in PaymentModals, payments/actions, sms, and weather-morning-alert.
- `git diff --check`: passed.

New coverage includes actual sender/preview parity, name preservation, segment boundaries, unanswered and recently answered conversations, tenant isolation, read failures, queued approval/settings changes, and share/stop-window boundaries. Tests mock provider delivery and database responses; no customer messages or live database mutations were performed. Browser rendering and production delivery are outside this verification.

## Remaining audit opportunities

Purpose-specific expiry/quiet-hour handling, explicit conversation resolve/snooze controls, live delivery/reply metrics, and broader waitlist/permit/field-message catalogue coverage remain follow-on work. This change does not claim exhaustive sender coverage or measured conversion improvements.
