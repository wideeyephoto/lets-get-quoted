# Faster AI opening

The opening still sounded slow on the owner's inbound retest. The owner requested faster speech and chose option two during a phone comparison. This change plays that exact 3.216375-second clip using a new versioned asset URL, so a cached earlier clip cannot mask the update.

The source is the synthetic Eyre/Coda disclosure documented in `voice-intro-playback-2026-09-15.md`: "Your personal Let's Get Quoted AI Assistant is loading." The beginning was shortened with FFmpeg's pitch-preserving tempo filter, using approximate word alignment and a low-energy transition near 0.795 seconds; a 10ms blend smooths the join. The whole resulting clip was then accelerated 1.45x. Wording, voice, and pitch are retained. Existing -2 dB playback level, chime, remaining greeting, recording-disclosure order, and call limits remain in place.

## Acceptance and verification

- Owner comparison call: `9cf61952-0889-4752-a890-117845f50b08`; all four playback operations finished; no call recording or application callbacks.
- Owner selected "Use option two" after hearing both faster versions.
- Asset: `public/audio/ai-disclosure-eyre-v2.wav`, mono 8 kHz PCM16, 3.216375 seconds, peak 23782, zero clipped samples.
- SHA-256: `72df7bb29d028d0b9a644a82760174b80c3231ac692d290bee970aba08dfa8e3`.
- Disclosure test pins this accepted file and asserts disclosure playback precedes recording.
- Local validation passed: all 59 targeted voice tests, full type checking, and targeted lint. Normal release checks, public asset checksum, and an inbound call retest remain required. A phone audition does not establish final inbound acceptance.

No human recording, signed audition link, or credential is included in the asset or release.
