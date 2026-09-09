# Staff voice response delay

**September 9 later retest:** The full Dispatch call again failed audible delay
acceptance. The owner clarified there was a long silence after speaking, plus a
glitch on “dollars” in three of four readouts. Seven provider audio-anchor samples
ranged from 2.343 to 6.367 seconds while tool requests took under one second.
A short interactive diagnostic with the same speech parameters and a written-out
amount passed pronunciation and perceived response speed. PR #57's spoken-quote
format is now live. The actual post-release handset attempt hit voicemail with
`admission_unavailable` before Dispatch started; it cannot validate speech or
turn delay. Admission retry/startup fixes and the full retest remain open.
See the [dated acceptance record](voice-acceptance-2026-09-09.md).

The staff-call profile now sets `utility_model: gpt-4.1-nano`,
`auto_correct: true`, and `enable_text_normalization: "off"`.
[SignalWire documents](https://signalwire.com/docs/platform/ai/content-redaction#keep-it-fast)
that redaction runs inline and can delay a turn; this combination uses one
utility pass for transcription cleanup and redaction. Provider redaction and
the independent application receipt sanitizer remain enabled. The main
conversation model, customer profile, endpointing, interruption behavior,
call cap and financial gates are unchanged.

The owner reported the silence resolved on an earlier September 9 unrecorded
handset retest. The later failure above supersedes that result for current
acceptance. The earlier report is a successful sample, not production percentile
acceptance: the new provider timing anchors still included several multi-second
intervals, which need correlation with audible turns. The
reported gaps also occurred on readback turns without a tool call, while
backend lookups and saves completed much faster than the reported silence.
Previous minimized receipts did not retain the provider's pipeline metrics,
so they cannot identify the exact duration of each speech/model/audio stage.

New authenticated, scoped, admitted receipts emit `voice_provider_timing` once
on first ingestion. Diagnostics contain bounded numeric fields only, with
no conversation text, tool arguments, URLs or arbitrary provider fields.
They are operational logs, separate from immutable receipt payloads and usage
settlement; old receipt retries retain the same payload hash.

The projection preserves reported metric names and values. `answer_time` and
`token_time` in `generations` are seconds, per the provider contract. Computed
`speechToFirstAudioMs` uses only `stamps_us.first_audio - last_word_end`,
deduplicating filler/final-response entries by the caller's last-word anchor.
Missing telemetry is unavailable, not zero. Transcript publication timestamps
are never substituted for audio timing. These diagnostics follow
[SignalWire's analytics guidance](https://signalwire.com/docs/platform/ai/analytics).

The staff prompt and scope-tool description also distinguish notes from work
scope and ask for the destination before an ambiguous add request. A correction
reuses the supplied text and must not claim an earlier write was undone.

The retest exposed a separate note-flow problem: a draft readback was refused
until saving, and a clear note command triggered an unnecessary confirmation.
The staff instructions now distinguish drafts, submitted saves with an unknown
result, and confirmed saved text. Preview/readback never authorizes a write;
an explicit, complete add-note command does. Unknown saves retain the existing
no-retry rule. Tool descriptions carry the same distinction.

The caller also reported an unsolicited authentication-code explanation. The
processed transcript contains that phrase in caller input, so it cannot establish
whether recognition or cleanup introduced it. The staff redaction description
now restricts marking to actual credential values and explicitly preserves other
words without adding category labels. Internal mechanics should not be narrated
or prevent an otherwise clear supported job action. Fast utility settings and
the independent receipt sanitizer remain unchanged. Handset verification of
these conversation changes is still required.

Before accepting this change, repeat natural reference lookup, a quote read,
one harmless note save/readback, and interruption. Inspect the actual delivered
SWML, numeric timings and saved state. Check names, dates and amounts after
changing transcription cleanup. Handset reports and waveform measurements are
distinct evidence; no additional recording is enabled by this release.

Rollback: revert the three staff-only utility settings while keeping numeric
diagnostics. No database migration, recording or phone-routing change is needed.
