# Fixed AI disclosure playback

The owner reported a stretched first word in the live opening after the earlier gap improved. A provider-only synthetic call generated the exact existing disclosure twice with `rime.eyre:coda`: "Your personal Let's Get Quoted AI Assistant is loading." The owner then heard the saved recording on a separate phone playback call and reported normal speed. This supports using that clip; it does not establish the cause of the live synthesis artifact.

The SWML opening now plays `public/audio/ai-disclosure-eyre-v1.wav`, followed by the existing chime and any remaining account-specific greeting. The clip contains only the first synthetic rendition, with short edge padding. No human voice, customer recording, signed provider URL, or credential is included. Sample rate, pitch, and speed are unchanged. Playback retains the existing -2 dB level, and the remaining greeting uses the same Eyre/Coda voice. Recording disclosures still precede recording; staff recording remains disabled.

## Provenance and validation

- Synthetic source call: `bcb2a57e-bb17-4680-a9c7-8fe25b846926`; no PSTN destination or application callbacks.
- Owner playback call: `bf13fd71-1760-4b91-8d97-6db0c6f58b39`; both play operations finished, no recording enabled. Owner reported "Normal speed".
- Asset: first rendition cropped at 2.49–7.51 seconds from the source WAV; 5.02 seconds, mono 8 kHz PCM16.
- Adapter tests retain the disclosure/chime/greeting order, pre-recording notice, contractor recording exclusion, and provider call limits.
- Local validation passed: 50 targeted adapter/grounding tests, full type checking, and targeted lint. Asset validation confirmed 8 kHz mono PCM16, 5.02 seconds, and zero clipped samples. SHA-256: `29b6b75fc4c1f85d65921c37b4a9c7e7a21b0cedaf51a7d361e5c4fc92174848`.
- Normal release checks, public asset verification, and a live inbound opening retest remain required. A passing saved playback is not a completed inbound retest.
