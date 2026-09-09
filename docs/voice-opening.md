# Voice opening

AI-answered calls play the original LGQ connection cue and a short disclosure
before the conversation begins: "Hi, I'm your AI assistant." Staff hear
"Field dispatch is ready." next; customer greetings keep their configured text.
The earlier fixed disclosure is normalized so saved greetings do not repeat it.
Recording disclosure still finishes before any permitted recording starts.
Staff calls remain unrecorded.

The opening uses the explicit `rime.luna:coda` voice with SignalWire's
[`play.say_voice`](https://signalwire.com/docs/swml/reference/calling/play).
The existing conversation voice and its accepted latency settings are unchanged.
[Rime's provider reference](https://signalwire.com/docs/platform/voice/tts/rime)
lists this engine-qualified voice. The opening no longer relies on an unspecified
provider TTS default. Its quality and pickup timing still need handset acceptance.

`public/audio/dispatch-connected-v2.wav` is an original two-tone cue synthesized
by `node scripts/generate-dispatch-chime.mjs`. It contains no sampled or copied
brand audio. Following owner feedback, v2 uses a descending cabin-style pair,
less high-frequency content and more space between tones. It is 1.02 seconds,
24kHz mono 16-bit PCM, with a peak of -15.9dBFS and rounded attack/release
envelopes. The file is 49,004 bytes and served under a
versioned, publicly cached path on the same app origin as the receipt endpoint.
Generate a new filename/version for future sound changes.
The earlier v1 file remains intact for existing immutable caches; new calls use v2.

One ordered play list runs the cue then the disclosure, before recording/AI.
The original answer deadline includes the entire opening. Transfers, voicemail
and fallback prompts retain their existing handling. No routing, recording
default, metering policy or account setting changes are required.

Release checks: existing disclosure/recording/order and provider-cap tests,
protected deployment health, and an unauthenticated GET confirming WAV audio
and exact RIFF bytes at the public sound URL. On the handset, confirm the soft
cue is audible from the beginning, the complete disclosure sounds natural,
and the subsequent conversation still responds promptly.
