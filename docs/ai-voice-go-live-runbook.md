# AI Voice Receptionist — go-live runbook

Written 2026-08-19, against `golive-followup` at `68250515`. Everything in Phase
4 V1 exists in code and is dark. This is the order to switch it on, what to check
after each step, and how to tell a working call from a silently unbilled one.

Read §0 before anything else. It is the reason this runbook stops where it does.

---

## 0. Read this first: the meter cannot measure yet

**Nothing grants `voice_minutes` credits.** The monthly allowance reset
(`20260816061500`) grants **exactly four** canonical resources — `text_segments`,
`marketing_email_sends`, `ai_intake_threads`, `ai_writing_drafts` — and voice is
not among them. `top-up-purchase.ts` grants only what a purchased SKU names, and
there is no Voice SKU in `TOP_UPS`.

So today, with a workspace that has no voice credits:

| Flags | What happens |
| --- | --- |
| Meter **off** | Calls answered, nothing reserved. Correct and complete. |
| Meter **on** | Reserve raises "insufficient credits" → `exhausted_not_enforced` → every call answered **unmetered**. The meter measures nothing. |
| Gate **on** | Every call refused. Every caller goes to voicemail. |

**Turning the gate on today would take every AI receptionist offline**, silently
and correctly, because a workspace with no allowance has nothing to spend.

This is not a bug in the meter. It is the granting half of the feature, and it
depends on a decision that is still open: whether `voice_minutes` becomes a
fifth canonical resource — which trips the hard `verified_lot_count = 4`
invariant and would break credit grants for **every paid workspace** at the next
reset — or gets its own grant path tied to the Voice add-on SKU, which also does
not exist yet. `docs/ai-voice-v1-decisions.md` records the recommendation: its
own path, not the fifth canonical.

**Therefore this runbook covers steps 1–6 only.** Those prove the call path works
end to end, in production, with real audio, and cost nothing to reverse. Steps
7–9 are written down but must not be run until a granter exists.

There is one honest consolation: the call-history panel labels every such call
**"Answered but not billed"** in the warning colour, and keeps it out of the
billed total. The system is already truthful about its own incompleteness.

---

## Prerequisites

All six voice migrations applied to production:

| Migration | What it adds |
| --- | --- |
| `20260819100000` | `ai_voice` failure-log source |
| `20260819110000` | `commit_usage_reservation_partial` |
| `20260819120000` | `voice_events`, `voice_call_admissions`, ingest RPC |
| `20260819130000` | `ai_voice` lead source |
| `20260819140000` | `voice_settings` |
| `20260819150000` | `voice_calls` |

```sql
select to_regclass('public.voice_events')            as voice_events,
       to_regclass('public.voice_call_admissions')   as admissions,
       to_regclass('public.voice_settings')          as settings,
       to_regclass('public.voice_calls')             as calls,
       to_regprocedure('public.commit_usage_reservation_partial(uuid,text,bigint)') as partial_commit;
```

All five non-null, or stop.

---

## Step 1 — environment, then redeploy

Set in Vercel, **Production and Preview both**. Preview writes the Production
Supabase, so a preview deploy with these missing behaves differently from one
with them, and that difference is invisible until a call fails.

| Variable | Value |
| --- | --- |
| `LGQ_VOICE_RECEIPT_BASIC` | `user:password`, dedicated to this endpoint |
| `SIGNALWIRE_PROJECT_ID` | already set — confirm it matches the agent's project |
| `SIGNALWIRE_SPACE_ID` | the space id from the receipt payload |

`LGQ_VOICE_RECEIPT_BASIC` **must not** reuse `SIGNALWIRE_SIGNING_KEY` or any SMS
credential. Sharing one would make a correctly-authenticated SMS delivery a
valid billing receipt.

**Then redeploy.** Vercel bakes environment at build time: until a new build
runs, every flag below does nothing and the receipt endpoint will keep returning
401 while looking correctly configured in the dashboard.

**Check:** the receipt endpoint refuses an unauthenticated request.

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://<host>/api/voice/receipt \
  -H 'content-type: application/json' -d '{}'
```

Expect `401`. If it returns `500`, the credential is unset — the route fails
closed, which is correct, but the variable did not reach the build.

---

## Step 2 — the scratch agent

In SignalWire, create an AI Agent and set its **post-prompt URL** to:

```
https://user:password@<host>/api/voice/receipt
```

Credentials in the URL are the only authentication this provider offers — there
is no signature and no signing secret (`docs/ai-voice-v1-decisions.md` §11). The
userinfo is stripped from the request URL and arrives as an `Authorization:
Basic` header, which is what the route reads.

Do **not** attach a production number yet.

---

## Step 3 — point a test number

Set the number's **Voice webhook** to:

```
https://<host>/api/voice/ai
```

Use a number nobody has published. This is the last reversible step: change it
back and calls behave exactly as before.

---

## Step 4 — turn the product on

Set `LGQ_AI_VOICE_ENABLED=1`, **and redeploy**.

This is the product switch, deliberately separate from the two metering flags:
metering off means *answer without billing*, this off means *do not answer*.

**Check:** the receptionist card appears on `/dashboard/automations` for the test
workspace, and no other behaviour changed anywhere.

---

## Step 5 — configure the test workspace

On the card: set status **Answering**, when-it-answers **Every call** (so the
test does not depend on the hour), a greeting, and a transfer number.

Leave **recording off**. It requires the disclosure acknowledgement and the
database will refuse to enable it without one.

**Check:**

```sql
select status, answer_mode, transfer_number, recording_enabled
from public.voice_settings where account_id = '<test account>';
```

---

## Step 6 — place a real call

Ring the test number and speak to the agent. Ask for something concrete so the
summary has content. Hang up.

### What must be true, in order

```sql
-- 1. LGQ admitted the call. No row here means the SWML route never ran.
select provider_call_id, reservation_id, reserved_minutes, admitted_at
from public.voice_call_admissions order by admitted_at desc limit 5;

-- 2. The receipt arrived and was accepted.
select provider_call_id, processing_status, account_id, last_error, received_at
from public.voice_events order by received_at desc limit 5;

-- 3. The call is in the contractor's history.
select provider_call_id, caller_number, ai_seconds, billed_minutes, settlement, outcome
from public.voice_calls order by created_at desc limit 5;

-- 4. A lead was created, filed as an AI call and not a missed one.
select id, source, name, phone, left(message, 80) as summary, created_at
from public.leads where source = 'ai_voice' order by created_at desc limit 5;

-- 5. Nothing failed quietly.
select source, event_type, reference_id, error_message, created_at
from public.webhook_failures where source = 'ai_voice'
order by created_at desc limit 10;
```

**Expected, with metering off:**

| Check | Expected | If wrong |
| --- | --- | --- |
| 1 admission | one row, `reservation_id` **null**, `reserved_minutes` 0 | no row → the number is not pointed at `/api/voice/ai`, or the signature failed. See (5). |
| 2 receipt | `processing_status = 'processed'`, `account_id` set | `ignored` → the call id matched no admission. Almost always: the agent's post-prompt URL is on a different deployment from the one that answered. |
| 3 history | `ai_seconds` ≈ the real call, `settlement = 'unmetered'` | `unbillable` → the receipt carried no usable `ai_start_date`/`ai_end_date`. Capture the payload. |
| 4 lead | one row, `source = 'ai_voice'` | none → check (5); lead failure is contained and does not stop settlement. |
| 5 failures | empty | read it; every rejection lands here with a reason. |

`settlement = 'unmetered'` is **correct at this stage** and is what §0 predicts.
The history panel will show "Answered but not billed".

### How to tell a working call from a silently unbilled one

They look identical to a caller, so use the tables:

- **Working and billed** — admission with a `reservation_id`, `voice_calls.settlement = 'allowance'`, a matching committed `usage_reservations` row.
- **Working, not billed** — admission with `reservation_id` null, `settlement = 'unmetered'`. This is every call today.
- **Not working** — no admission row at all. The caller still reached the business through forwarding, so nobody complains. **This is the failure that hides**, and check (1) is the only thing that finds it.

---

## Steps 7–9 — DO NOT RUN YET

Written down so the order is not re-derived later. Blocked on §0.

**7. Meter on.** `LGQ_VOICE_MINUTE_METER_ENABLED=1`, redeploy. Only meaningful
once a granter exists. Watch for a week: every call should produce a
`usage_reservations` row that commits for the rounded minutes, and
`voice_calls.settlement` should read `allowance`.

**8. Reconcile before enforcing.** Compare a full period of ledger minutes
against the SignalWire invoice. They will not match exactly — LGQ bills
AI-connected time rounded up, the provider bills its own basis — but the shape
must be explicable. An unexplained gap means the meter is wrong, and enforcing a
wrong meter refuses real callers.

**9. Gate on.** `LGQ_VOICE_MINUTE_GATE_ENABLED=1`, redeploy. Only after 7 and 8.
From here an exhausted workspace sends callers to voicemail, which is the
published behaviour but is the first time a billing decision can end a call.

---

## Rollback

Every step reverses independently, cheapest first:

| To undo | Do this | Effect |
| --- | --- | --- |
| Enforcement | `LGQ_VOICE_MINUTE_GATE_ENABLED=0`, redeploy | stops refusing; keeps measuring |
| Metering | `LGQ_VOICE_MINUTE_METER_ENABLED=0`, redeploy | stops touching the ledger; keeps answering |
| One workspace | set its card to **Paused** | keeps configuration, stops answering |
| The product | `LGQ_AI_VOICE_ENABLED=0`, redeploy | card disappears, calls forward as before |
| Everything | point the number's Voice webhook back | instant, no deploy needed |

The last row is the true kill switch and needs nobody with Vercel access.

Held reservations do not need cleaning up: `expire_usage_reservations` releases
anything outstanding within the 90-minute hold.

---

## Known traps, each already paid for once

- **Vercel bakes env at build.** A flag set in the dashboard does nothing until a
  redeploy. This made two billing workers look like they had stopped.
- **Preview writes Production Supabase.** A variable set only in Production makes
  preview deploys behave differently against the same data.
- **The receipt is unauthenticated by design.** It is safe only because LGQ
  settles calls it admitted. If admissions ever stop being written, a forged
  receipt stops being inert — check (1) is therefore a security check as well as
  a functional one.
- **A call that fails while connecting sends no receipt at all.** Its hold is
  released by the sweeper, not by anything in the request path. The sweeper is
  load-bearing here, not a backstop.
- **The lot-eligibility window.** `reserve_usage_credits` only draws on lots that
  outlive the reservation, and a voice hold is 90 minutes — so in the final 90
  minutes of a billing period, a plan-period lot expiring at period end is
  ineligible and a call refuses while credits are visibly present. Fix the lot
  tail before step 9, not after.
