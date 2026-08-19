# AI Voice Receptionist V1 — decisions

Decided 2026-08-19. This is the decision record, not the plan. It exists so that
an implementer six weeks from now can tell what was chosen from what was merely
convenient, and so a later provider swap does not have to re-litigate any of it.

## 1. Partner, not build

LGQ resells a hosted voice-AI agent. It does not run its own STT/LLM/TTS media
pipeline, and specifically does not build one on Twilio in this phase.

**First provider: SignalWire AI Agents**, because the phone numbers and messaging
infrastructure already run on SignalWire. That is an integration-cost argument,
not a quality one, and it is the only reason SignalWire is first.

Because the reason is that weak, the implementation is **provider-agnostic by
construction**: a `VoiceProvider` adapter interface, with SignalWire as one
implementation. Replacing SignalWire, or adding Retell or Vapi alongside it, must
not require rebuilding billing or the product UI. If a change to the provider
forces a change to either, the seam is in the wrong place.

## 2. Who owns what

The split is the whole architecture, so it is written down rather than inferred:

| LGQ owns | The provider owns |
| --- | --- |
| Provisioning state and configuration | Live telephony |
| Subscription and entitlement | Speech recognition |
| Included-minute allowance | LLM and TTS |
| The usage ledger | Interruption handling |
| Overage and spending caps | Call media |
| Concurrency limits | |
| Retention settings | |
| Call history | |
| Customer-facing pricing | |

Everything in the left column is a promise LGQ made to a contractor and must be
able to keep across a provider change. Everything in the right column is what is
actually being bought.

## 3. What a minute costs, and what it sells for

Provider cost, inbound call on a local SignalWire number with standard TTS:

| Component | Per minute |
| --- | --- |
| AI runtime | $0.1600 |
| Inbound local PSTN transport | $0.0066 |
| Recording, when enabled | $0.0020 |
| **Expected total** | **$0.1666**, or **$0.1686** with recording |

Standard STT, LLM and TTS are included at that price. Premium voices and a
separate transcription API cost more and are **out of V1** for exactly that
reason.

**Internal reserve estimate: $0.18/minute.** Deliberately above the expected
cost. It is never exposed as a customer price and never appears in customer-
facing copy — it exists so a reservation made before a call's length is known
errs against LGQ rather than against the contractor.

Retail:

| SKU | Price | Margin at expected cost |
| --- | --- | --- |
| Flex add-on, 100 min | $69/mo | 75.9% |
| Solo add-on, 100 min | $59/mo | 71.8% |
| Growth add-on, 200 min | $55/mo | **39.4%** |
| Scale, 100 min | included | — |
| Top-up, 100 min | $35 one-time | 52.4% |
| Approved overage | $0.35/min | 52.4% |

```ts
OVERAGE_RATE_MILLICENTS.voice_minutes = 35_000; // 1/1000 of a cent; $0.35
```

The top-up rate and the overage rate are deliberately **equal** here, where the
other meters set overage from the smaller pack's rate. The invariant is the same
one: buying a top-up must never be worse than overrunning. Equal satisfies it.

**Growth is the thin one, at 39.4% before support and infrastructure if every
minute is used.** Workable at launch, flagged here so it is watched rather than
rediscovered.

Overage always requires explicit approval and a spending cap. That is not new
policy — it is the rail built in 3.2, which cannot accrue without both.

## 4. Billing invariants

Invariants, not preferences. Violating any one produces a number a contractor is
charged that cannot be reconstructed later.

1. **An immutable per-call usage ledger is authoritative.** Billing is never
   computed from call-history rows, because those are mutable — a transcript is
   appended, a disposition corrected, a recording deleted on request — and a bill
   derived from a row that can change is a bill that cannot be defended.
2. **Provider usage is reconciled against the ledger, never trusted as it.** The
   provider's number is evidence. Ours is the record.
3. **Minutes are reserved before the call and settled after**, because a call's
   length is unknown at admission. Same reserve/commit/release shape as the three
   existing meters, with the $0.18 estimate sizing the reservation.
4. **Two allowances, not one.** Only time while the AI agent is connected
   consumes AI minutes. A continuing PSTN transfer leg is recorded **separately**
   against the forwarding-minute allowance and the provider-cost ledger. Billing
   one as the other would be wrong in both directions.

What does **not** consume AI minutes: ringing, rejected calls, blocked spam, and
all time after the AI completes a transfer.

The published pricing FAQ already commits to limit behaviour, so it is a
specification rather than an open question: the active call may finish its
current interaction and transfer or fall back, with up to **15 grace minutes**
and a **60-minute total-call safety cap**; new calls then follow the configured
forwarding or voicemail rule unless paid extra minutes were explicitly enabled.

## 5. V1 scope — inbound only

**In:** answer missed and after-hours calls; business greeting with an explicit
disclosure that the caller is speaking with an AI assistant; collect name, phone,
address, service requested, urgency and preferred appointment time; answer
approved business FAQs; create and update leads; notify the contractor; transfer
to the contractor or a backup number; produce a call summary, transcript,
disposition and follow-up tasks.

**Out, deliberately:** outbound AI calling. Not "later in V1" — not in V1. Also
out: premium voices, a separate transcription API, and non-local inbound numbers.
Recording is **off by default** and enabling it requires the disclosure.

## 6. Standard vs. advanced routing

Defined as an LGQ feature, not as whatever a provider happens to label advanced.

**Standard** — Flex, Solo, Growth:
business-hours and after-hours behaviour; one primary transfer destination; one
fallback destination or voicemail; lead capture when a transfer fails;
configurable ring timeout; basic call outcome and audit history.

**Advanced** — Scale:
multiple destinations and ring groups; routing by caller intent or requested
service; routing by urgency; routing by ZIP, service area or operating location;
business-hours, after-hours and on-call schedules; ordered, simultaneous or
round-robin destinations; timeout, overflow and multi-step failover rules; an
emergency escalation route; route-decision and transfer-attempt audit history.

Three simultaneous calls is a **separate Scale capacity entitlement**. It is not
part of the definition of advanced routing, and conflating them would let a
concurrency change silently alter what "advanced" means.

Gated behind the existing `voice_advanced_routing` flag — but **not displayed
publicly as "Advanced routing" until at least multi-destination conditional
routing and failover actually work.**

## 7. Number rules

- A contractor's AI receptionist is **never** attached to the shared LGQ
  account-notification number. That number carries LGQ's own transactional
  messages; an AI agent answering it would be answering for the wrong party.
- Use a dedicated contractor number, or forward/port the contractor's existing
  business number.
- A paid contractor may eventually use one dedicated number for both voice and
  texting — but only after that contractor's messaging registration is approved.

## 8. Product surface

Status and phone number; business hours; greeting and personality; services and
service area; FAQs; escalation and transfer rules; emergency-call handling;
booking and lead-collection behaviour; recording/transcription settings and the
disclosure that goes with them; a test-call button; call history with summaries,
outcomes, minutes used and estimated charges; pause service; spending and
concurrency limits.

## 9. Build order

Provider adapter, billing meter, entitlements and webhook contracts **first**.
The SignalWire hosted agent is connected **after** those exist, so the first
provider is proved replaceable by being added to a seam that already works.

Nothing deploys and no billing activates until provider webhook verification,
idempotent usage metering, spending caps, grace behaviour and end-to-end call
tests all pass.

## 10. The pricing page, until it ships

AI Voice stays visible for demand capture, labelled **Coming soon**. Until the
production agent, provisioning, usage ledger, checkout SKU, limits and fallbacks
all work:

- remove it from the interactive pricing calculator;
- remove it from plan crossover calculations;
- disable every purchase and select control;
- do not say it is currently included on Scale;
- do not present $69/$59/$55 as presently purchasable — replace those active
  claims with **"Planned launch pricing from $55/month"**;
- add a waitlist or notify-me action if that flow exists.

On verified readiness, restore: Flex $69/100 min; Solo $59/100 min; Growth
$55/200 min; Scale 100 min included; 100-minute top-up $35; approved overage
$0.35/min; standard routing on Flex/Solo/Growth; advanced routing and three-call
concurrency on Scale.

> Superseded: an earlier instruction on 2026-08-19 was to leave the page exactly
> as it stood. It was reversed the same day, before any work was done under it.
> Recorded because the reversal is the decision a reader needs, and because
> nothing in the repo should suggest the first answer is still live.
