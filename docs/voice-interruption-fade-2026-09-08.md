# Natural interruption fade — requested September 8

Status: investigated, not implemented or deployed. The user wants the assistant's
voice to fade quickly when a person starts speaking instead of cutting abruptly.

The current application supplies SWML to SignalWire's managed AI. SignalWire
owns phone-call TTS playback and interruption handling; this repository has no
PCM mixer, outbound audio queue, or client gain control for those calls.
The documented AI parameters and Fabric AI-agent update schema expose barge
enablement, word/noise thresholds, transparency and acknowledgment controls, but
no interruption fade envelope or duration. This establishes a public API gap,
not proof that SignalWire has no private or forthcoming capability.

Proposed behavior to validate: detect the interruption at the existing threshold,
continue listening immediately, cancel future assistant generation, and ramp the
currently audible output to zero over approximately 100–150 ms. Flush stale
assistant audio after the ramp; a late chunk from the interrupted turn must not
restart playback. A user-requested stop and repeated interruptions must remain
responsive. Gain changes must not affect the incoming speech or connected humans.
The duration is a proposed starting target, not a measured perceptual guarantee.

Next decision: confirm provider-native support before changing the media
architecture. A custom bidirectional audio relay would need its own design,
hosting, buffering, call-deadline continuity, transfer/recording integration,
latency budget, cancellation tests, and handset acceptance. Adding an unused
fade helper to this app would not change phone audio.

Provider question prepared below; it has not been sent:

> Our application uses the native SWML AI method for PSTN calls. Can its TTS
> playback apply a short gain fade on caller barge-in, ideally configurable near
> 100–150 ms, while speech detection and input capture remain immediate? Is there
> a supported parameter or media hook for this across your TTS engines? Please
> distinguish audio-envelope control from delaying interruption detection, and
> confirm how queued audio is canceled after the fade.

Acceptance remains open: fast interruption, correct resumed response, no old
audio after cancellation, no duplicate tool actions, no clicks, and an audible
comparison using authorized test audio. Ordinary endpointing is unchanged.

Sources checked September 8:

- https://signalwire.com/docs/swml/reference/calling/ai/params
- https://signalwire.com/docs/server-sdks/reference/typescript/rest/fabric/ai-agents/update
- https://signalwire.com/docs/server-sdks/guides/result-actions

For separate quantitative latency work, the official
https://github.com/signalwire/latency_checker may help analyze appropriately
authorized stereo call audio. It has not been installed, run, or given recordings.

Related: [provider questions](voice-provider-questions-2026-09-08.md) and [production checklist](voice-dispatch-production-todo-2026-09-08.md).
