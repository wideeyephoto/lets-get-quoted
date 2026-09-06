# Dispatch behavior and response latency

Dispatch tools now play a short progress phrase while their webhook runs. The
SignalWire configuration uses the documented language-keyed `fillers` object,
`wait_for_fillers: false`, and `function_wait_for_talking: false`. Staff calls
use a 700 ms speech-end timeout with turn detection enabled at 250 ms. Customer
endpointing remains at 1,000 ms. The ten-minute hard cap remains unchanged.

Job lookup makes one database request instead of fetching up to twenty pages.
An account-scoped expression index supports exact references; UUIDs use the
primary key. Name/address matching, including accent normalization, happens in
PostgreSQL. Matching priority and the total count are determined before limiting
the response to six candidates. Duplicate matches cannot authorize a write.
Queries retain account, deletion, and optional customer-phone scope.

Spoken results show at most three brief choices. Scope, schedule, status, and
quote detail are available on explicit request for one selected job. The prompt
distinguishes leads from jobs, preserves the selected reference and pending
change, anchors relative dates to the business timezone, and asks for clear
confirmation of ambiguous schedules or completion. These conversation rules are
prompt guidance; access control, ambiguity rejection, price-write rejection,
transactional saves, and idempotency remain server-enforced.

Reads have transport deadlines: four seconds for admission, identity and job
lookup. An identity read may finish in the background after its deadline, but no
action proceeds with an unavailable identity. A write response has a six-second
deadline; an uncertain result triggers one read-only status check (2.5 seconds).
That check requires the same admitted staff call and exact original payload and
targets. It never repeats the write. A missing record remains unknown because
the first transaction may still commit. Dispatch directs the caller to check the
dashboard before repeating an unconfirmed update.

Job updates store their saved status and schedule in the same transaction as
the action receipt. Normal confirmations, recovered responses and retries use
that snapshot. Later dashboard edits cannot rewrite the earlier confirmation.
Historical actions without a snapshot retain their existing generic confirmation.

`voice_tool_timing` logs total server duration and authorization, identity and
dispatch stages, keyed by account, call and function. Additional lookup and write
timings isolate database work. Logs exclude arguments, phone numbers, transcripts,
credentials and raw provider errors. These measure backend latency, **not** the
caller's speech-end-to-first-audio gap. Conversation transcript timestamps do not
establish actual silence. Provider redaction remains enabled.

## Validation and rollout

- 637 voice tests passed before release, including filler shape, endpointing,
  ten-minute clamping, timezone boundaries, concise choices, ambiguous searches,
  uncertain write recovery and exact saved-value readback.
- 23 PostgreSQL assertions passed in PGlite using the committed migration,
  including 4,500-job searches, duplicate detection, phone/account isolation,
  index maintenance by dashboard roles, private RPC grants, recovered creates,
  terminal-call denial and saved snapshot replay. The harness stubs the older
  mutation helper; the existing voice tests cover that established boundary.
- Typecheck and scoped lint passed.

The optional database harness is `scripts/verify-voice-dispatch-latency.mjs`.
Install `@electric-sql/pglite` separately, or set `VOICE_PGLITE_MODULE` to its
installed module's file URL, then run the script with Node. It uses an ephemeral
local database and cannot access production.

Apply `20260906105714_voice_dispatch_latency.sql` before deploying the application.
It adds bounded reads and augments the existing action wrapper; older application
versions tolerate the extra outcome fields. If the 700 ms trial clips speech,
restore staff endpointing to 1,000 ms without reverting save safeguards. An app
rollback to the preceding release is compatible with this migration.

A live staff-call canary still needs to check ordinary speech, spelling, street
addresses, hesitation, background noise and barge-in. Check a job lookup, an
ambiguous name, an explicit schedule, and a note save. Verify the displayed saved
record and compare perceived delay with backend timings. Listen to or measure
audio directly for the speech-end-to-first-audio interval; do not infer it from
transcript timestamps. A call held to the ten-minute cutoff also remains a live
provider acceptance check. Metering remains on and financial enforcement remains
off pending the go-live runbook's full-period invoice reconciliation.

Provider references checked September 6, 2026:

- [SWAIG function options](https://signalwire.com/docs/swml/reference/calling/ai/swaig/functions)
- [AI parameters](https://signalwire.com/docs/swml/reference/calling/ai/params)
- [AI debug webhook event semantics](https://signalwire.com/docs/apis/rest/webhooks/ai-debug-webhook)
