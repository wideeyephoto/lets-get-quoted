# Dispatch draft retention — September 15, 2026

On production `8126f4e08`, the owner selected a job and dictated a note in short
phrases. The assistant repeatedly asked for wording it had already heard and
could not read the draft back. No save function ran. Lookup returned the correct
quote; the final receipt processed once and settled 82 AI seconds as two minutes.

The staff prompt now gives unsaved drafts an explicit, high-priority conversation
rule: retain the selected job, combine dictated fragments, preserve wording when
the caller says not to save, read it back as unsaved, and save only on an explicit
save request. Discarding a draft clears it without writing. Existing authorization,
exact-job resolution, unknown-save recovery and quote-write restrictions remain.

This is a candidate correction, not live acceptance. Repeat the full fragmented
draft/readback/save sequence on the released revision, including a correction and
an interruption. Verify one saved action with the exact final wording and no
mutation before approval. Code checks do not establish model behavior.

The owner separately reported a pause inside the fixed opening between
"Your personal" and "Let's Get Quoted". That audio issue remains open; a pause
before the sentence would not address it.

## Abandoned opening leaves capacity occupied

A later call ended at the provider during the opening, before AI execution. It
produced no AI receipt or terminal callback. Its admission therefore remained
open, and the next call was routed to voicemail as `at_capacity`. Provider facts
were verified before manually closing that admission and releasing its unused
reservation with zero AI charge.

When local admissions fill capacity, admission now verifies at most three pending
calls against the provider, with bounded requests. Only an exact ended inbound
call matching its ID, dialed number, known caller and configured project can close
the existing terminal gate. Missing credentials, mismatches and provider failures
preserve the occupied slot. This does not synthesize a receipt, estimate AI usage,
or automatically settle the unused reservation.

Validation: 135 targeted tests passed across admission, provider reconciliation,
grounding, provider-status route and settlement. Live acceptance still requires
hanging up during the opening and immediately calling again after deployment.
The voicemail attempt reached the primary recording callback successfully, but
the caller's intended interruption and silence tests did not run.

## Overlapping admission retry

The later voicemail report had a different cause. The first request took 11.865
seconds and eventually returned an AI plan. A provider retry overlapped its
unfinished reservation, exhausted three 100ms retries, and returned voicemail
first. The provider's executed SWML confirms voicemail; an admission row alone
does not prove the caller reached AI. The caller hung up during that greeting.

Busy polling now allows a five-second window with at most twenty 250ms pauses.
Every poll still uses the atomic claim gate; no busy claim itself grants access,
releases another request's hold or creates another reservation. A regression
test covers finalization after the former retry window. Persistently busy calls
still decline; slower startup remains a performance concern and live retry
acceptance is required.
