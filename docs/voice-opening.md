# Voice opening

AI-answered calls first say "Your personal Let's Get Quoted AI Assistant is loading."
The original LGQ connection cue plays immediately afterward, before the conversation begins.
Staff calls use only this opening sentence and cue; customer greetings keep their
configured text, played after the cue.
Earlier fixed disclosures are normalized so saved greetings do not repeat the introduction.
Recording disclosure still finishes before any permitted recording starts.
Staff calls remain unrecorded.

The opening uses the explicit `rime.eyre:coda` voice with SignalWire's
[`play.say_voice`](https://signalwire.com/docs/swml/reference/calling/play).
The existing conversation voice and its accepted latency settings are unchanged.
[SignalWire's Rime reference](https://signalwire.com/docs/platform/voice/tts/rime)
documents the engine-qualified voice format. Eyre appears in SignalWire's public
voice catalog and [Rime's Coda lineup](https://www.rime.ai/resources/how-we-chose-the-voices-of-coda)
as a warm, calm American voice. It is the candidate for the owner's warm
receptionist preference. The whole opening uses `play.volume: -2` (dB), a
[documented playback control](https://signalwire.com/docs/server-sdks/reference/typescript/agents/swml-builder/play).
Its speakerphone quality and pickup timing still need handset acceptance.

`public/audio/dispatch-connected-v3.wav` is an original two-tone cue synthesized
by `node scripts/generate-dispatch-chime.mjs`. It contains no sampled or copied
brand audio. Following owner feedback about speakerphone harshness, v3 lowers
the descending cabin-style pair to A4 (440Hz) and F4 (349.228Hz), seven semitones
below v2, with softer overtones. It is 1.02 seconds,
24kHz mono 16-bit PCM, with a peak of -18.4dBFS and rounded attack/release
envelopes. The file is 49,004 bytes and served under a
versioned, publicly cached path on the same app origin as the receipt endpoint.
Generate a new filename/version for future sound changes.
The earlier v1 and v2 files remain intact for existing immutable caches; new calls use v3.

One ordered play list runs the branded disclosure, cue, then any remaining
customer greeting and recording disclosure, before recording/AI.
The original answer deadline includes the entire opening. Transfers, voicemail
and fallback prompts retain their existing handling. No routing, recording
default, metering policy or account setting changes are required.

Release checks: existing disclosure/recording/order and provider-cap tests,
protected deployment health, and an unauthenticated GET confirming WAV audio
and exact RIFF bytes at the public sound URL. On the handset, confirm the soft
cue is audible in full after the branded line, the disclosure sounds natural,
and the subsequent conversation still responds promptly.
