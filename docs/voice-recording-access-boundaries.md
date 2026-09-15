# Voice recording access verification

`test/voice-recording-access-boundaries.test.ts` exercises the recording proxy's
security and playback boundaries. Its synthetic data contains no real calls,
recordings, destinations or credentials.

The route must reject an office-authorization failure before reading recording
metadata or requesting media. Knowing another workspace's call reference must
not reveal its recording. Pending, failed and absent recordings are unavailable.
These route tests complement database row-level security; mocking the office
authorization function does not verify its membership or session implementation.

Provider credentials may be attached only to the configured provider origin.
A redirect to a CDN must drop them; another provider workspace must not receive
them. Untrusted, insecure and looped redirects fail without forwarding a media
location to the caller. Audio responses are private, non-cacheable and marked
`nosniff`. Valid single byte ranges preserve partial-response headers; multipart
range requests are not forwarded.

Run the focused recording and operator checks with:

```sh
npx vitest run test/voice-recording-access-boundaries.test.ts test/voice-recording-ingest-playback.test.ts test/voice-retention.test.ts test/admin-voice-receipts.test.ts test/admin-voice-receipt-actions.test.ts test/admin-voice-receipts-ui.test.ts
```

For production verification, separately inspect actual table grants and RLS,
the latest retention execution and deletion backlog, and the operator's signed-in
receipt screen. A healthy empty queue does not exercise the live retry button.
Do not manufacture failed production receipts to make that button appear.
Use a supported, attributable failure when live recovery needs verification.

Actual authorized audio playback, recording disclosure and provider deletion
remain separate acceptance cases. Preserve the business recording preference;
an earlier test recording does not authorize a new human recording.
