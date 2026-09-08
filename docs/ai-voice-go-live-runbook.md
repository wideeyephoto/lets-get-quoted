# AI Voice Receptionist — go-live runbook

## Current release policy and evidence — 2026-09-08

Production flags verified individually: `LGQ_VOICE_MINUTE_METER_ENABLED=1`,
`LGQ_VOICE_ALLOWANCE_WORKER_ENABLED=1`, `LGQ_VOICE_MINUTE_GATE_ENABLED=0`.
The owner approved measurement mode and absorption of usage beyond available
credit. Strict financial enforcement is a later owner decision. Step 9 is a
deferred full-period reconciliation milestone; Step 10 is not authorized now.

The controlled staff call on September 8 ended at **593.807 connected seconds**
with a system-side hangup. The user confirmed a clear closing message and no
long silent gaps. Its receipt processed on the first attempt, committed ten
minutes, and saved the requested note once after the database contract repair.
The earlier 600.938-second overrun remains historical evidence. This staff-call
result does not substitute for transfer/voicemail boundary or statistical audio
latency acceptance. See the [current checklist](voice-dispatch-production-todo-2026-09-08.md).

The failed post-call receipt was recovered by the supported worker without a
duplicate debit. Its automatic caller follow-up exposed an ineligible customer
sender. BrokePipes caller follow-ups are paused and the customer registration
guard is installed; voice and owner alerts remain active. Customer messaging
needs its own approved registration and acceptance. See the [sender guard](customer-sms-sender-guard-2026-09-08.md).

## Call duration and accounting

The owner selected a **10-minute maximum** for reception and dispatch calls.
New allowance admissions reserve at most ten minutes. A definite ledger
shortfall can reserve the smaller available whole-minute balance. In measurement
mode the call retains its normal ten-minute limit and any excess is recorded as
absorbed usage. Only an explicitly enabled enforcement mode ties the duration
to reserved minutes. Duplicate inbound webhooks reload the saved policy and
limit. Ambiguous ledger failures do not trigger a smaller retry.

SignalWire's documented `answer.max_duration` bounds the entire answered call
(including greeting and transfers), configured at 598 seconds to leave a timer
margin, with `ai.params.hard_stop_time` set fifteen
seconds earlier to allow a closing line, followed by explicit hangup. The old
`ai.params.max_duration` setting was not a documented duration control.
References: https://signalwire.com/docs/swml/reference/answer and
https://signalwire.com/docs/swml/reference/calling/ai/params.

The 90-minute reservation expiry remains a receipt-processing grace period,
not a call limit. Settlement uses the original admission's cap so delayed
receipts from older calls are not incorrectly reduced to the new maximum.
This change does not enable financial enforcement or bill absorbed usage.
Before enforcement, validate a controlled call reaching the provider cutoff,
low-balance admission, recovery/retries, and Step 9 invoice reconciliation.

Written 2026-08-19, revised 2026-08-26. Everything in Phase 4 V1 and P0/P1
hardening (truthful capacity, live in-call transactional booking, admission-bound
SWAIG tool permits, emergency deduplication, structured post-call extraction,
returning-caller recognition, and dedicated dashboard UI) exists in code and is
tested under 41 voice test files (392 tests passing).

**Pilot & Staging Readiness:**
The software layer is fully transaction-ready. Follow the sequential activation steps
below to safely stage, canary, and launch live AI voice lines.

Read §0 before anything else. It is why the flag order is what it is.

## Call recovery update — 2026-09-05

- SWML voicemail after a declined call, an unanswered forward, or an unanswered
  AI transfer uses foreground `record`: play a beep, wait for the caller, and
  record for up to 120 seconds before hanging up. `#` or five seconds of silence
  ends the recording; the initial speech timeout is ten seconds.
- New number configurations set the provider fallback URL to
  `/api/voice/fallback` with POST. Previously configured `/api/voice/health`
  POST callbacks use the same recovery handler. The health dashboard's GET
  remains session-protected.
- Both recovery URLs require a valid SignalWire signature for the exact URL
  and body, return LaML or SWML to match the callback, and work without database
  or session lookups. The emergency fallback recording stays with SignalWire;
  this path does not create an AI session or a dashboard call-history entry.
- After deployment, use an unpublished test number to verify a declined call,
  an unanswered transfer, and a provider fallback. Speak a complete message,
  confirm the beep and recording duration, then listen to the saved recording
  in SignalWire. Automated callback tests do not replace this carrier check.

---

## 0. Metering & Allowance Foundation

**Summary.** Minute metering and allowance workers are fully integrated.
`grant_voice_minute_allowance` and the `voice-allowance` cron worker handle
monthly allocations. SWAIG tools for in-call booking, warm transfers, emergency
alerts, and structured post-conversation extractions are authenticated via
admission-bound HMAC-SHA256 tool permits.

**Keep the allowance worker and meter enabled; leave exhaustion blocking off.**
The worker grants eligible credit. The meter records rounded AI usage and its
debited/absorbed split even when credit is insufficient. Enforcing before credit
and reconciliation are correct can refuse real callers.

Use the current billing entitlement and allowance ledger for eligibility.
Checkout, provisioning, and renewal acceptance are tracked in the billing
workstream; historical SKU-withholding statements are not current launch
evidence. An unmetered settlement alone is insufficient to diagnose a failure:
inspect measured minutes, absorbed minutes/reason, and the admission policy.

## Prerequisites

All required voice migrations applied to production, in order:

| Migration | What it adds |
| --- | --- |
| `20260819100000` | `ai_voice` failure-log source |
| `20260819110000` | `commit_usage_reservation_partial` |
| `20260819120000` | `voice_events`, `voice_call_admissions`, ingest RPC |
| `20260819130000` | `ai_voice` lead source |
| `20260819140000` | `voice_settings` |
| `20260819150000` | `voice_calls` |
| `20260819160000` | truncate-setting compatibility fix |
| `20260819170000` | revoke browser-role truncate privileges |
| `20260819180000` | voice SKU support in the top-up ledger |
| `20260819190000` | `grant_voice_minute_allowance`, the lot tail |
| `20260819200000` | asserts the canonical reset is untouched |
| `20260821190000` | receipt claim/lease/CAS retries, lead idempotency, unsupported-setting guards |
| `20260821191000` | atomic concurrency admission and token-bound release/finalization |
| `20260821221223` | exact active dedicated-number revision binding for admission |
| `20260821230000` | single transcript, entitlement-bounded visibility, and service-only purge |
| `20260908160159` | immutable measurement policy and explicit absorbed usage |
| `20260908163021` | confirmed transfer completion survives AI receipt recovery |
| `20260908204510` | customer SMS requires matching eligible registration |
| `20260908205505` | restore current private dispatch write contract |
| `20260908210359` | bounded voice health alerts in the operator failure inbox |

```sql
select to_regclass('public.voice_events')            as voice_events,
       to_regclass('public.voice_call_admissions')   as admissions,
       to_regclass('public.voice_settings')          as settings,
       to_regclass('public.voice_calls')             as calls,
       to_regprocedure('public.commit_usage_reservation_partial(uuid,text,bigint)') as partial_commit,
       to_regprocedure('public.grant_voice_minute_allowance(uuid,timestamptz,timestamptz)') as granter,
       to_regprocedure('public.claim_voice_call_admission(uuid,text,text,integer)') as admission_claim,
       to_regprocedure('public.claim_voice_event_processing(uuid)') as event_claim,
       to_regprocedure('public.complete_voice_event_processing(uuid,uuid)') as event_complete,
       to_regprocedure('public.fail_voice_event_processing(uuid,uuid,text,boolean)') as event_fail,
       to_regprocedure('public.purge_expired_voice_history(integer)') as retention_purge;
```

All eleven checks non-null, or stop.

Local-only verification on 2026-08-21 passed 21 voice test files / 276 tests,
the final webhook-boundary suite 12/12, and the disposable PostgreSQL 17 voice
inbox/retention harness 89/89. The full repository passed 550 files / 9,476
tests. These counts prove the local artifact only; they are not deployment or
provider evidence.

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

Expect **`401`** — the endpoint is configured and refused an unauthenticated
request. Then, with the credentials just set:

```bash
curl -s -o /dev/null -w '%{http_code}
' -X POST 'https://<host>/api/voice/receipt' -u 'user:password' \
  -H 'content-type: application/json' -d '{}'
```

Expect **`400`** — authentication passed and the empty body was rejected.

| Code | Means |
| --- | --- |
| `503` | **no credential in this build.** Set the variable and redeploy; setting it without a new build changes nothing. |
| `401` | the credential does not match what the build holds |
| `400` | working |
| `404` | this host is not serving the app — check the alias points at the deployment |

503 and 401 were the same code once, so "the variable never reached the build"
and "the password is wrong" were indistinguishable. They are not any more.

---

## Step 2 — the scratch agent

For a dashboard scratch agent, set its **post-prompt URL** to:

```
https://<host>/api/voice/receipt
```

Set the scratch agent's post-prompt username and password fields separately.
There is no receipt signature or signing secret (`docs/ai-voice-v1-decisions.md`
§11). SignalWire sends those fields as `Authorization: Basic`, which is what the
route reads. Never place the credential in the URL: URLs are routinely captured
by browser history, proxy access logs and error trackers.

The production `/api/voice/ai` route does this automatically in returned SWML:
it emits `post_prompt_url`, `post_prompt_auth_user`, and
`post_prompt_auth_password` as separate fields from `LGQ_VOICE_RECEIPT_BASIC`.

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
test does not depend on the hour), a greeting, and a transfer number. Recording
and a separate emergency route are intentionally unavailable; the database
also rejects those unsupported states.

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
select provider_call_id, processing_status, account_id, attempt_count,
       next_attempt_at, last_error, received_at
from public.voice_events order by received_at desc limit 5;

-- 3. The call is in the contractor's history, with the one retained transcript.
select provider_call_id, caller_number, ai_seconds, billed_minutes, settlement,
       outcome, coalesce(jsonb_array_length(transcript), 0) as transcript_entries
from public.voice_calls order by created_at desc limit 5;

-- The backend receipt retains no transcript aliases after normalization.
select provider_call_id,
       payload ?| array['call_log','raw_call_log','call_timeline','post_prompt_data']
         as has_transcript_key,
       payload_sha256
from public.voice_events order by received_at desc limit 5;

-- 4. A lead was created, filed as an AI call and not a missed one.
select id, source, source_voice_event_id, name, phone,
       left(message, 80) as summary, created_at
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
| 4 lead | one row, `source = 'ai_voice'`, linked to the receipt by `source_voice_event_id` | none → check (2) and (5); lead failure keeps the receipt retryable, so `failed` plus a future `next_attempt_at` is expected until a retry succeeds. |
| 5 failures | empty | read it; every rejection lands here with a reason. |

For a deliberately disabled-meter fixture, `settlement = 'unmetered'` is expected.
For current production, inspect the saved policy and measured/absorbed split;
do not treat all unmetered calls as healthy or as broken.

For a receipt that includes `call_log`, check (3) must show that normalized array
only in `voice_calls.transcript`; `has_transcript_key` must be false in
`voice_events`. The stored payload hash must match the rewritten transcript-free
payload. Any duplicate transcript or stale hash is a stop condition.

### How to tell a working call from a silently unbilled one

They look identical to a caller, so use the tables:

- **Working and billed** — admission with a `reservation_id`, `voice_calls.settlement = 'allowance'`, a matching committed `usage_reservations` row.
- **Working with absorbed usage** — measured minutes equal committed plus absorbed minutes, with an explicit absorption reason and measurement-mode admission. A zero-credit call may have no reservation.
- **Expected non-AI/historical** — fallback-only or historical unsnapshotted calls are inspected separately; do not backfill invented AI duration or debit them.
- **Not working** — no admission row at all. The caller still reached the business through forwarding, so nobody complains. **This is the failure that hides**, and check (1) is the only thing that finds it.

---

## Measurement operation and deferred enforcement milestones

**7. Grant minutes first.** `LGQ_VOICE_ALLOWANCE_WORKER_ENABLED=1`, redeploy.
Then confirm before going further:

```sql
select account_id, granted_units, available_from, expires_at, source_type
from public.usage_credit_lots
where resource_code = 'voice_minutes' order by created_at desc limit 10;

select job, ok, summary, started_at from public.cron_runs
where job = 'voice-allowance' order by started_at desc limit 5;
```

Expect lots with `source_type = 'voice_addon'` and an `expires_at` **later than
the period end** — that tail is what lets a 90-minute hold draw on the lot in the
final minutes of a period, and without it calls refuse once a month with the
credits visibly present.

**8. Meter on (verified).** Keep `LGQ_VOICE_MINUTE_METER_ENABLED=1` and the gate
off. A funded call should commit its rounded minutes once. Low/zero-credit calls
retain the bounded duration, debit at most reserved credit, and explicitly record
absorbed minutes. Check `measured_minutes = coalesce(billed_minutes,0) +
coalesce(absorbed_minutes,0)` on new snapshotted calls.

**9. Deferred full-period reconciliation, required before enforcement.** Compare a full period of ledger minutes
against the SignalWire invoice. They will not match exactly — LGQ bills
AI-connected time rounded up, the provider bills its own basis — but the shape
must be explicable. An unexplained gap means the meter is wrong, and enforcing a
wrong meter refuses real callers.

**10. Later owner decision only.** Keep `LGQ_VOICE_MINUTE_GATE_ENABLED=0` now.
If the owner later chooses strict enforcement, complete Step 9 and repeat
exhausted/partial-balance canaries before that separate release. The current
launch absorbs usage beyond available credit.

---

## Retention is continuous, not an activation flag

`/api/cron/voice-retention` runs daily at **05:43 UTC** and calls
`purge_expired_voice_history(integer)` as the service role. It has no rollout
flag: retention is a privacy boundary once caller content exists.

- Owner RLS must hide history as soon as the workspace's bounded entitlement
  retention period expires, even before the next purge.
- Purge must delete expired terminal `voice_calls` and `voice_events` in bounded
  batches while preserving active or retryable receipts.
- Browser/authenticated roles must not be able to execute the purge.
- The supported entitlement range remains 30–90 days; missing or malformed
  entitlement evidence fails to the bounded default rather than retaining forever.

Inspect the cron result and oldest eligible rows during staging. A failed purge,
owner-visible expired history, or deletion of retryable evidence blocks go-live.

---

## Rollback

Every step reverses independently, cheapest first:

| To undo | Do this | Effect |
| --- | --- | --- |
| Enforcement | `LGQ_VOICE_MINUTE_GATE_ENABLED=0`, redeploy | stops refusing; keeps measuring |
| Metering | `LGQ_VOICE_MINUTE_METER_ENABLED=0`, redeploy | stops touching the ledger; keeps answering |
| Granting | `LGQ_VOICE_ALLOWANCE_WORKER_ENABLED=0`, redeploy | stops issuing minutes; already-granted lots stand |
| One workspace | set its card to **Paused** | keeps configuration, stops answering |
| The product | `LGQ_AI_VOICE_ENABLED=0`, redeploy | card disappears, calls forward as before |
| Everything | point the number's Voice webhook back | instant, no deploy needed |

The last row is the true kill switch and needs nobody with Vercel access.

Held reservations do not need cleaning up: `expire_usage_reservations` releases
anything outstanding within the 90-minute hold.

---

## Known traps, each already paid for once

- **Dispatch transcript timestamps are not silence measurements.** Use the
  backend timing events and a live audio canary to distinguish lookup delays
  from speech endpointing and provider generation. Follow the
  [dispatch latency acceptance checks](voice-dispatch-latency-2026-09-06.md)
  after changing voice settings. A lost write response is an unknown outcome
  until the action receipt confirms it; never retry by guessing.

- **Vercel bakes env at build.** A flag set in the dashboard does nothing until a
  redeploy. This made two billing workers look like they had stopped.
- **Preview writes Production Supabase.** A variable set only in Production makes
  preview deploys behave differently against the same data.
- **The provider supplies no signature, but the receipt is not unauthenticated.**
  LGQ requires dedicated HTTP Basic credentials, exact project/space identity,
  and a matching admission. The admission check remains security-critical: a
  receipt for a call LGQ did not admit is stored as inert evidence and is never
  settled.
- **A call that fails while connecting sends no receipt at all.** Its hold is
  released by the sweeper, not by anything in the request path. The sweeper is
  load-bearing here, not a backstop.
- **The lot-eligibility window, fixed but fragile.** `reserve_usage_credits` only
  draws on lots that outlive the reservation, and a voice hold is 90 minutes, so
  a lot expiring exactly at period end is ineligible for the last 90 minutes of
  every period. `voice_minute_lot_tail()` is the fix. It is derived from
  `RESERVATION_TTL_MS` in `voice-minute-usage.ts`, and the two moving apart
  reintroduces a once-a-month refusal with the credits visibly present.
- **A check that names the wrong thing passes.** 20260819190000 shipped with a
  post-condition guarded by `is not null` against a misspelled function name; it
  abstained instead of failing and committed green having verified nothing. If a
  verification query here returns **zero rows**, that is a failure, not a pass.
