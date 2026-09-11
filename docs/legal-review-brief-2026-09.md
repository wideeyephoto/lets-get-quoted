# Legal review brief — G6

Prepared for outside counsel ahead of launch. This is the assembly step of
[G6 in the gap closure plan](prelaunch-gap-closure-plan-2026-09-11.md#g6--legal-counsel-review-has-no-line-item-and-it-is-the-longest-pole):
gathering what exists, in one place, with exact sources, so counsel's time goes
to judgment rather than discovery.

**This is not a legal opinion and contains none.** Every claim below is either a
direct quote from shipped code or copy (cited by path), or is explicitly marked
as a question this document cannot answer. Record counsel's disposition on each
numbered question in [legal-review-2026-09.md](legal-review-2026-09.md), which
is the tracking companion to this brief.

**Company:** Let's Get Quoted LLC. Registered address per `src/lib/company.ts`
and repeated on `/privacy`, `/terms`: `2222 W GRAND RIVER AVE STE A, OKEMOS, MI
48864`. The §13 entity address referenced elsewhere in this codebase's audit
trail (`Austin, TX`) is the payments-catalog tax discussion in
[G2](prelaunch-gap-closure-plan-2026-09-11.md#g2--sales-tax-is-enabled-in-code-and-may-be-registered-nowhere)
and appears to be a different, unreconciled address — flagged as its own
question below (Q9) rather than assumed.

**Product, in one paragraph.** A SaaS platform for home-service trade
contractors: quoting, scheduling, dispatch, invoicing/payments (via Stripe
Connect), customer SMS/email, and an AI phone receptionist and web copilot.
Contractors' own customers (homeowners) interact through quote links, payment
pages, SMS, and phone calls. Contractors can also generate legal documents —
mechanic's lien notices, lien waivers — and insurance-claim correspondence
directly from the product.

---

## What already exists (read this first)

| Document | Covers |
| --- | --- |
| `src/app/terms/page.tsx` | 14 sections: account authority; data/privacy; SMS/email/workforce compliance; AI tools & telephony; payments/Stripe Connect; subscriptions/billing; contractor professional responsibilities & FTC review rules; IP/DMCA; disclaimers of professional advice; warranty/liability/indemnity; term/termination/retention; governing law/dispute resolution/jury waiver; entire agreement; contact. |
| `src/app/privacy/page.tsx` | Privacy policy, including the AI-inference-tier sentence under separate review as [G1](prelaunch-gap-closure-plan-2026-09-11.md#g1--the-ai-inference-tier-claim-is-published-as-verified-and-the-verification-is-still-an-open-task), and the 30-day account-closure grace period (line 142). |
| `src/app/dpa/page.tsx` | 11 sections: definitions/roles; scope/purpose; CCPA/state-privacy service-provider restrictions; confidentiality/security; subprocessors; incident notification; data subject requests; deletion/return; audits; precedence; contact. |
| `docs/ftc-substantiation-register.md` | 13 registered marketing claims (CLM-001–013) with tier-of-evidence and a prohibited-copy list. Enforced by `test/claims-substantiation.test.ts`. |
| `docs/unrun-prelaunch-audits-2026-08-31.md:311` | The line that named this cluster "Lawyer, not an agent" and is the origin of this brief. |

None of the above has been read by an attorney. §7 of the Terms
("Contractor Professional Responsibilities & FTC Review Rules") and the DPA's
§3 in particular are worth counsel's first pass, since they are the sections
making the most specific regulatory claims on the company's behalf.

---

## Numbered questions for counsel

Each question names the code or copy it is about, quotes the relevant text
exactly, and states what is and is not verified. Disposition goes in
[legal-review-2026-09.md](legal-review-2026-09.md).

### Q1 — Mechanic's lien Notice of Intent and lien waivers: validity per state

`src/lib/noi-generator.ts` generates a "STATUTORY NOTICE OF INTENT TO FILE
MECHANIC'S LIEN" with a hardcoded default 10-day cure period
(`generateNoiDocumentData`, default `curePeriodDays = 10`) and boilerplate
demand language. `src/lib/lien-waiver.ts` generates four waiver types
(conditional/unconditional × progress/final) with fixed release language.

**Verified from source: neither function takes a state, or any
jurisdiction-derived parameter, of any kind.** The same demand letter and the
same waiver wording are produced whether the job is in California — which
mandates specific statutory waiver wording in its Civil Code, not open-ended
company boilerplate — or in a state with a 90-day pre-lien notice period, or a
state that requires the notice be sent by certified mail to the owner *and*
the general contractor *and* the construction lender. This is a single
one-size-fits-all template standing in for what is, in reality, 50 different
statutory regimes.

Both are wired into `src/app/dashboard/payments/actions.ts` and
`src/app/api/jobs/[id]/lien-waiver/route.ts` and are reachable today by any
contractor on the platform, in any state, generating a document titled
"STATUTORY NOTICE" that asserts specific legal deadlines and consequences.

**Question:** Is shipping a generic, non-jurisdictional lien notice and lien
waiver generator — labeled "statutory" — to contractors nationwide a defensible
posture, or does it need per-state templates (or a state selector with a
clear "this is not legal advice, consult local counsel" gate) before it can
stay live?

### Q2 — Public-adjusting exposure in the insurance-claims workflow

`src/lib/insurance-claims.ts` builds "UPPA-compliant Adjuster Supplement
Justification" letters a contractor sends directly to an insurance adjuster,
disputing the adjuster's estimate and requesting specific additional line-item
payment. The generated letter carries this disclaimer verbatim
(`generateAdjusterLetterDraft`, `src/lib/insurance-claims.ts:532`):

> *Notice & Contractor Scope Disclaimer: This scope clarification and
> supplement request is prepared solely as a contractor estimate for
> construction, material specifications, and labor in accordance with
> applicable building codes and manufacturer requirements. It does not
> constitute legal advice, insurance adjusting, or public insurance adjuster
> representation. Scope items must be verified against actual physical
> property conditions prior to execution.*

The marketing register (`docs/ftc-substantiation-register.md`, CLM-011)
independently asserts: *"Software provides itemized construction estimating
tools, building code citations (IRC, IICRC, ANSI), and scope review templates
without acting as a licensed public adjuster or negotiating claim settlement
amounts on behalf of policyholders."*

**Not verified:** whether the disclaimer text, its placement (bottom of an
outbound letter to the adjuster, not to the homeowner/policyholder), and its
wording are sufficient in the states with the strictest unlicensed-
public-adjusting statutes and penalties. The tool is scoped by trade
(`src/lib/trade-insurance.ts`, `INSURANCE_ELIGIBLE_TRADE_SLUGS`) but not by
state.

**Question:** Does this disclaimer, as worded and placed, keep the workflow on
the "contractor estimate" side of the public-adjusting line in every state
this product operates in? Several states' unlicensed-adjusting statutes carry
criminal penalties, not just civil ones.

### Q3 — Card surcharge advice given directly to contractors, with an unbacked disclosure claim

`src/app/dashboard/payments/PaymentModals.tsx` (the "Credit Card Surcharge &
Fee Strategy Lab," lines 2457–2551) shows contractors this text as a factual
assertion, not a caveat:

> **"State Surcharge Compliance Rules"**
> - *"Permitted in 48+ States: Card surcharging is compliant nationwide
>   provided rates do not exceed actual card acceptance costs (capped at
>   3.0%)."*
> - *"Debit Card Exclusion: Surcharges cannot legally apply to debit or
>   prepaid cards."*
> - *"Clear Customer Disclosure: Let's Get Quoted automatically displays
>   clear itemized fee disclosure before checkout."*

Three findings from source, not inference:

1. **The third bullet is false as written.** A repository-wide search for any
   surcharge-related field (`surcharge_percent`, `surcharge_pct`,
   `card_surcharge`, `surcharge_enabled`, and variants) found **zero results**
   in `schema.sql` or any file under `migrations/`. A precise, cent-rounding
   `calculateSurchargeCents` function does exist
   (`src/lib/financial-precision.ts:124`), but its only caller anywhere in the
   repository is its own unit test — it is not called from checkout, invoicing,
   or any payment path. There is no automatic disclosure anywhere in the
   codebase, because there is no live surcharge feature to disclose: the
   modal's advisory copy, an orphaned calculator, and a unit test for that
   calculator are the entire feature.
2. **The "Apply Policy to Checkout" button does nothing.** Its handler
   (`onSuccess(...); onClose();`) shows a success toast and closes the modal.
   It does not call a server action, does not write to any table, and nothing
   in the checkout or payment path reads a surcharge setting. A contractor who
   clicks it has changed nothing, but has been told they configured a live
   policy.
3. **The "48+ states" framing omits card-network rules that apply in all 50.**
   Visa and Mastercard both require merchants to register their intent to
   surcharge and give 30 days' advance notice to the network and to acquirers
   before surcharging, and to post specific signage, regardless of state law.
   None of that is mentioned.

**Question:** Advising contractors that surcharging is broadly legal and that
the platform is handling their disclosure obligation — when neither is true
and no surcharge mechanism exists — is a distinct exposure from a working
feature having a compliance gap. Should this UI be pulled or rewritten before
launch, independent of whether a real surcharge feature ever ships?

### Q4 — All-party-consent recording states vs. the current disclosure design, and a text mismatch worth flagging on its own

Federal law (18 U.S.C. § 2511) and a number of states (California, Florida,
Illinois, Pennsylvania, and others) require **all parties'** consent to record
a call, not just one party's. The current design announces two fixed
disclosures at the start of every AI-answered call
(`src/lib/voice/provider.ts`):

```
export const AI_VOICE_DISCLOSURE = "Your personal Let's Get Quoted AI Assistant is loading.";
export const RECORDING_DISCLOSURE = 'This call may be recorded for quality and training purposes.';
```

`greetingWithAiDisclosure` plays `AI_VOICE_DISCLOSURE` before any recording
starts, and appends `RECORDING_DISCLOSURE` only `if (options.recordingEnabled)`.
`src/lib/voice/signalwire.ts:273` comments that "the deterministic disclosure
must finish before recording begins," so the sequencing is deliberate.

**A discrepancy independent of the legal question:**
`docs/ftc-substantiation-register.md` §4.4 states the mandatory disclosure is
the sentence *"You are speaking with an AI assistant."* — but that is not what
the code says today. `greetingWithAiDisclosure` (`src/lib/voice/provider.ts:62`)
still contains logic to *rewrite* that exact older sentence, and *"Hi, I'm your
AI assistant,"* into the current one, meaning the disclosure text changed at
some point and the compliance register was never updated to match. Whether
"Your personal Let's Get Quoted AI Assistant is loading" adequately
communicates "you are talking to a machine, not a person, and it may be
recorded" to an ordinary caller — versus reading as a system status
message — is worth counsel's ear literally, not just on paper. This document
takes no position on which wording is better; it flags that the register and
the running code disagree, and that fact alone should be fixed regardless of
counsel's answer on wording.

**Question:** Is the current disclosure sequence and wording sufficient for
two-party/all-party-consent states, and should the exact required wording be
fixed by counsel and then pinned by a test (the way `test/claims-
substantiation.test.ts` pins other legal text)?

### Q5 — Sufficiency of the employee electronic-monitoring notice for crew GPS

`src/app/field/jobs/[id]/FieldClock.tsx:241` shows crew members this indicator
while location is being shared: *"Work location sharing active while this app
is open."* Sharing is gated by a persisted per-person flag
(`can_share_work_location`, `src/lib/crew-location.ts:403`) and, per
`src/app/features/live-eta/page.tsx:48`, requires *both* an employer policy
setting and the individual crew member's own permission before any coordinate
is broadcast, and only during active shift hours per
`docs/ftc-substantiation-register.md` §4.5.

**Not verified:** several states with electronic-monitoring statutes (New
York's Civil Rights Law § 52-c is the one already cited in the substantiation
register; Connecticut and Delaware have similar statutes) require *written
notice at or before hiring*, acknowledged by the employee, not only a
persistent in-app UI indicator shown while tracking is active. Whether an
in-app banner satisfies that separate, advance, written-acknowledgment
requirement has not been assessed.

**Question:** Does the in-app indicator discharge the notice obligation on
its own, or does the platform need a separate onboarding-time acknowledgment
step (and does that belong to Let's Get Quoted, as the software vendor, or to
each contractor as the employer)?

### Q6 — State privacy rights (CA, CO, CT, VA, and the rest) against the DSAR and deletion flow

`src/app/privacy/page.tsx:142` states account closure carries "a 30-day soft
[grace period]" before deletion. `src/app/dpa/page.tsx` §3 addresses CCPA/US
state privacy service-provider restrictions and §7 addresses data subject
request assistance. `privacy@letsgetquoted.com` is published as the DSAR
intake address (also tracked separately for actual mailbox liveness under
[G3](prelaunch-gap-closure-plan-2026-09-11.md#g3--nobody-has-proven-a-human-receives-mail-at-any-of-the-14-addresses)).

**Not verified:** whether the mechanics behind that 30-day window and the DSAR
process actually satisfy each applicable state's specific timelines and
required response contents (California's CCPA/CPRA, Colorado, Connecticut,
Virginia, and the others now in force) — this brief only confirms the *copy*
exists, not that counsel has checked it against each statute's actual
deadlines and required disclosures.

**Question:** Does the current DPA and privacy-page language meet each
applicable state's specific requirements, or does it need to be
jurisdiction-specific?

### Q7 — ADA / WCAG posture: contrast is done, conformance and legal exposure are not

The checklist's §9 and §10 ("Public-Site WCAG Contrast Remediation" and
"Logged-In App WCAG Contrast & Route Health") cover color contrast
remediation only — 0 automated contrast violations found by an automated
scanner. **No accessibility statement page exists anywhere in `src/app`** (a
repository search for an accessibility or a11y route found none). Keyboard
navigation and screen-reader conformance beyond contrast, and any legal
opinion on ADA Title III exposure for a public-facing commerce site, are
outside what those checklist sections cover and have not been assessed by a
lawyer.

**Question:** Is contrast-only remediation, with no published accessibility
statement, an acceptable launch posture, or does this need a broader WCAG 2.1
AA conformance pass and a published statement first?

### Q8 — The AI inference tier claim, once G1's console evidence exists

`src/app/privacy/page.tsx:116` currently asserts AI inference runs through
"paid enterprise API tiers with strict zero-data-retention and non-training
guarantees (verified: Google Cloud Billing active on Gemini API project)." As
detailed in
[G1](prelaunch-gap-closure-plan-2026-09-11.md#g1--the-ai-inference-tier-claim-is-published-as-verified-and-the-verification-is-still-an-open-task),
that verification was never actually performed — the sentence was published
without the underlying check. The OpenAI half of the sentence
("zero-data-retention") is very likely false as written, because
zero-data-retention is an approved-account feature at OpenAI rather than a
default.

**This question is deliberately last and is not yet answerable.** Once the
operator completes G1's two console checks (Google Cloud Billing state,
OpenAI data-controls/ZDR state) and the copy is reconciled to what is
actually true, bring the corrected sentence back to counsel rather than the
current one — reviewing a sentence known to misstate its own verification
would waste the review.

### Q9 — Two different registered addresses appear across this codebase

This brief's header uses `2222 W GRAND RIVER AVE STE A, OKEMOS, MI 48864`,
sourced from `src/lib/company.ts` and repeated on the live `/privacy` and
`/terms` pages. Separately,
[G2 in the gap closure plan](prelaunch-gap-closure-plan-2026-09-11.md#g2--sales-tax-is-enabled-in-code-and-may-be-registered-nowhere)
and the checklist's §13 both describe the entity address as
`11801 Domain Blvd, 3rd Floor, Austin, TX 78758` for Stripe Tax head-office
purposes. **Both are quoted from real project documents; this brief does not
know which is authoritative** — that determination needs the operator or
counsel, not an agent guessing between two addresses found in different
files. Whichever is correct should be the one appearing everywhere: on the
public pages, in the CAN-SPAM postal-address mandate this register already
tracks (§4.1), and in the Stripe Tax head-office setting.

**Question:** Which address is the entity's actual registered/mailing address,
and where does the other one need to be corrected?

---

## What this brief does not cover

It does not re-litigate anything the FTC substantiation register already
disposed of (CLM-001 through CLM-013) — those are marketing-claim
substantiation, already reviewed and tagged "Commercial Legal" or
"Product Eng" as their owner. It does not cover the six-SKU billing
acceptance, the SignalWire carrier rollout, or any of the operational gates
elsewhere in `LAUNCH_CHECKLIST.md` — those are engineering and operations
questions, not legal ones. And it takes no position of its own on any of the
nine questions above; every one of them is written to be answerable only by
someone qualified to answer it.
