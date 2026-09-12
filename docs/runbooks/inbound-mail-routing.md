# Inbound mail routing — G3

Scaffolded per
[G3 in the gap closure plan](../prelaunch-gap-closure-plan-2026-09-11.md#g3--nobody-has-proven-a-human-receives-mail-at-any-of-the-14-addresses).
**This document cannot close G3 by itself.** Closing it needs a dated probe
sent from an external mailbox — outside this company's own Google Workspace —
to all 15 addresses, and a human confirming which ones a person actually
reads. That step needs a real mailbox this session does not have. What follows
is the routing table that probe should produce, pre-filled with everything
verifiable from source, so the operator is filling in one column, not
building the document from nothing.

## Why this is first among the open gaps

`src/lib/on-call-paging.ts:49` and `src/lib/founder-alerts.ts` both fall back
to `hello@letsgetquoted.com` when `ONCALL_PRIMARY_EMAIL` is unset — confirmed
again while writing [the watch-window runbook](launch-watch-window.md), which
depends on this closing. **If that variable is not set in Production, every
operational page across all eight alert categories terminates at `hello@`,**
whose liveness has never been separately proven either. This is also T26,
open since 2026-08-30.

## The probe

From an external mailbox (Gmail, not this company's Workspace), send one
dated, identifiable message — e.g. `[G3 PROBE 2026-XX-XX] Do not reply to this
automatically` — to all 15 addresses in the table below in a single send.
Record, per address: **arrived (yes/no)**, which mailbox or group it landed
in, and which human sees it. Then separately confirm `ONCALL_PRIMARY_EMAIL`
and `ONCALL_PRIMARY_PHONE` are set in Production **and that the current
deployment was built after they were set** — Vercel bakes env at build, so a
variable added after the last deploy is inert until the next one.

## Routing table

Owner column pulls from the `escalationContact` roles already assigned in
`src/lib/admin-manual/index.ts` where one exists, so this document doesn't
invent a second ownership model. SLA column reuses the two commitments
already on record in
[the chargeback evidence protocol](chargeback-evidence-protocol.md) rather
than re-deriving them, and states explicitly where no commitment exists yet.
Priority order follows the gap plan's own reasoning: what silently breaks if
nobody reads it.

| Address | Purpose (from source) | Owner | Target SLA | Arrived? | Notes |
| --- | --- | --- | --- | --- | --- |
| `dmarc@` | DMARC aggregate/failure reports (`rua=mailto:dmarc@letsgetquoted.com`, `p=reject`) | *(operator to assign)* | None on record | *(probe)* | **Priority 1.** With `p=reject` live, an unread `dmarc@` means alignment failures are invisible — you would not know a spoofed sender was being rejected, or that a legitimate one started failing, until a customer complained. |
| `security@` | Implied by convention (researcher reports); not found as a literal string anywhere in `src/` outside the DMARC/security-page context | Security Lead (`src/lib/admin-manual/index.ts`) | None on record | *(probe)* | **Priority 2.** A vulnerability report landing nowhere is the highest-severity single silent failure on this list short of `dmarc@` itself. |
| `privacy@` | Published on `/privacy` as the DSAR intake address; also the escalation contact for privacy/legal runbook sections | Privacy / Legal (`src/lib/admin-manual/index.ts`) | None on record — **should get one once G3 closes**, since DSAR responses have statutory deadlines (see [the legal review brief](../legal-review-brief-2026-09.md), Q6) | *(probe)* | **Priority 3.** A missed DSAR deadline is a compliance failure with a clock already running from the request, not from when someone happens to read the inbox. |
| `risk@` | Escalation contact for risk-flagged runbook sections (`src/lib/admin-manual/index.ts`); receiver of Stripe risk notices per the gap plan | Risk Lead | None on record | *(probe)* | **Priority 4.** Stripe/financial risk notices often carry their own short response windows. |
| `finance@` | The single most-referenced escalation contact in `src/lib/admin-manual/index.ts` (13 sections) — billing, payments, refund and settlement procedures | Finance Lead | None on record | *(probe)* | **Priority 4.** Given how many runbook sections point here, an unread `finance@` is a wide blast radius, not a narrow one. |
| `hello@` | **The universal fallback.** Sender identity across `src/emails/*`; the `ONCALL_PRIMARY_EMAIL`-unset fallback in `on-call-paging.ts` and `founder-alerts.ts`; the operational-monitor's own failure-notification fallback (`operational-monitor.mjs:56,69`) | *(operator to assign — this is the address every silent misconfiguration elsewhere routes to)* | **24h response**, per [the chargeback protocol](chargeback-evidence-protocol.md#L12) | *(probe)* | **Priority 5, but load-bearing beyond its own row.** Every other address's failure mode, and every category in [the watch-window runbook](launch-watch-window.md), degrades to this one. Confirm it before trusting anything downstream of it. |
| `ops@` | The second-most-referenced escalation contact (`src/lib/admin-manual/index.ts`) — platform engineering, communications lead procedures | Operations Lead / Platform Engineering | None on record | *(probe)* | |
| `founder@` | Escalation contact for founder/super-admin-level runbook sections | Founder / Engineering Lead | None on record | *(probe)* | |
| `support@` | Contractor-facing support, published in the UI (`AdminCampaignComposer.tsx` sender-select, `PaymentModals.tsx`, `DisputesDefensePanel.tsx`) | *(operator to assign)* | **2h acknowledgement (business hours), 12h resolution**, per [the chargeback protocol](chargeback-evidence-protocol.md#L11) | *(probe)* | |
| `system@` | Sender identity for operational/monitoring emails (`founder-alerts.ts`, `operational-monitor.mjs`) — explicitly send-only, `replyTo: null` set in three places in `founder-alerts.ts` | N/A by design | N/A — send-only | N/A | Genuinely send-only by explicit code intent, not just unconfirmed. Nothing to probe here. |
| `voice@` | Escalation contact for AI Voice runbook sections | Communications Lead | None on record | *(probe)* | |
| `orders@` | Sender for merchandise/card orders (`merchandise-emails.ts`) — **no `replyTo` set**, so a reply follows ordinary email behavior and lands back at this same address by default | *(operator to assign)* | None on record | *(probe)* | Unlike `system@`, this one is not marked send-only in code — a customer reply about an order is plausible and would land here. |
| `alerts@` | Sender for merchandise alerts (`merchandise-emails.ts`) and the AI operator digest (`ai-operator/digest.ts`) — same no-`replyTo` situation as `orders@` | *(operator to assign)* | None on record | *(probe)* | |
| `tools@` | Sender for the public calculator email-my-results feature (`src/app/api/tools/email-report/route.ts`) — same no-`replyTo` situation | *(operator to assign)* | None on record | *(probe)* | Customer-triggered, not staff-triggered, so a reply landing unread here is a real, if low-severity, customer-facing gap. |
| `updates@` | Sender option in the platform campaign composer (`AdminCampaignComposer.tsx`) | *(operator to assign)* | None on record | *(probe)* | |

**A documentation mismatch found while building this table:**
[the chargeback evidence protocol](chargeback-evidence-protocol.md#L13) also
lists `disputes@letsgetquoted.com` with a sub-1-hour SLA — that address
**does not appear anywhere in `src/`**. Either it was planned and never wired
up, or it's aspirational copy that drifted from what shipped. Confirm which,
and either implement it or correct that document; right now it names a
commitment nothing can fulfill, since dispute handling in code actually flows
through `finance@`/`risk@` per the escalation contacts above.

## After the probe

1. **Fix the black holes**, in the priority order above.
2. **Confirm `ONCALL_PRIMARY_EMAIL` and `ONCALL_PRIMARY_PHONE`** are set in
   Production and baked into the current build (T26). This is the one
   sub-item of G3 that is also independently required by
   [the watch-window runbook](launch-watch-window.md)'s overnight paging
   section — closing it here closes it there too.
3. **Resolve the `disputes@` mismatch** above.
4. **Assign an owner to every "(operator to assign)" cell.** A probe that
   confirms mail *arrives* somewhere is not the same as confirming a specific
   person is responsible for acting on it.

## Evidence to close G3

Dated receipt log covering all 15 addresses (14 plus `dmarc@`) · every cell in
this table's Owner and Arrived columns filled · `ONCALL_PRIMARY_EMAIL`
confirmed set and baked into the current build · the `disputes@` mismatch
resolved one way or the other.
