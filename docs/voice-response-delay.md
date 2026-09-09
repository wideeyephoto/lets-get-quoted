# Staff voice response delay

The staff-call profile now sets `utility_model: gpt-4.1-nano`,
`auto_correct: true`, and `enable_text_normalization: "off"`.
[SignalWire documents](https://signalwire.com/docs/platform/ai/content-redaction#keep-it-fast)
that redaction runs inline and can delay a turn; this combination uses one
utility pass for transcription cleanup and redaction. Provider redaction and
the independent application receipt sanitizer remain enabled. The main
conversation model, customer profile, endpointing, interruption behavior,
call cap and financial gates are unchanged.

This is a targeted latency candidate, not a measured improvement yet. The
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

Before accepting this change, repeat natural reference lookup, a quote read,
one harmless note save/readback, and interruption. Inspect the actual delivered
SWML, numeric timings and saved state. Check names, dates and amounts after
changing transcription cleanup. Handset reports and waveform measurements are
distinct evidence; no additional recording is enabled by this release.

Rollback: revert the three staff-only utility settings while keeping numeric
diagnostics. No database migration, recording or phone-routing change is needed.
