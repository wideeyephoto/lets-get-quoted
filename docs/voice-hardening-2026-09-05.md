# Voice hardening release

Apply `migrations/20260905151055_voice_observation_and_recording_hardening.sql`
before deploying the application changes. This migration has not been applied
to production as part of the local hardening work. Deployment and live calls
remain deferred until the other commits are finished.

## Behavior

- The Voice page reads `voice_minutes`, reports the actual metering mode, and
  separates billed AI minutes, conversation time, and recorded forwarding time.
- Enforced metering requires a confirmed reservation. Ledger uncertainty uses
  the configured forwarding/voicemail fallback. Off and measurement modes remain
  explicit rollout choices; this commit does not change production environment
  variables. Both `LGQ_VOICE_MINUTE_METER_ENABLED=1` and
  `LGQ_VOICE_MINUTE_GATE_ENABLED=1` are required for enforcement.
- Forwarding duration is idempotent and remains available after transcript
  retention. Native connected/disconnected timestamps and compatibility
  `DialCallDuration` are supported. Unknown duration is not reported as zero.
  Tracking uses new callbacks; historical usage is not reconstructed. Forwarding
  usage is distinct from AI billing and does not invent new overage charges.
- Recording callbacks accept signed native nested payloads and legacy receipt
  credentials. Only provider-signed callbacks can attribute recovery voicemail
  through the dedicated-number inventory. Early metadata survives call creation;
  late progress/failure events cannot overwrite ready audio.
- Playback streams through the account-authorized endpoint and follows only
  trusted media redirects, without forwarding credentials across origins.
- History deletion atomically queues provider recording cleanup. The retention
  worker drains bounded jobs and reports failures/backlogs for retry.
- Bridge callbacks require a provider signature, a five-minute callback expiry,
  a provider call ID, and a destination belonging to the lead's account.
  Missing credentials and queued carrier calls no longer appear connected.
- Voice tool calls require an active, caller-bound admission and an atomic
  per-call budget. Appointment cancellation/rescheduling saves an idempotent
  office-review request; it does not alter an appointment based on caller ID or
  a spoken phone number. Existing lead information is preserved.
- Failed writes are not announced as success. Relative dates are not mapped to
  arbitrary available-day indexes. Unverified generic prices are not offered as
  business quotes. Notification enqueue errors escape to the durable receipt
  worker; stable SMS keys prevent duplicate enqueueing during retries.

## Local verification

The normal voice Vitest suites cover billing, rendering, callbacks, tools,
notifications, retention, and authorization. The additional SQL check exercises
the migration against local PGlite PostgreSQL, including repeat application,
role grants, callback ordering, monotonic recording status, forwarding replay,
retention-independent totals, and appointment-request deduplication.

Run `node scripts/verify-voice-observation-hardening.mjs` with
`@electric-sql/pglite` installed outside the repository and `LGQ_PGLITE_MODULE`
pointing to its module URL, or with that package available to Node resolution.
It creates only an in-memory fixture database and never reads hosted credentials.

## Deferred production validation

After deployment, verify production flags and execute the live-call matrix:
AI completion and duplicate receipts; forwarding answered/busy/no-answer;
recording callback authentication, playback and cleanup; recovery voicemail
during an application failure; appointment requests and notification retries.
Reconcile historic provider usage separately before presenting it as complete.

Provider callback contracts were checked against SignalWire's
[record reference](https://signalwire.com/docs/swml/reference/record),
[connect reference](https://signalwire.com/docs/swml/reference/calling/connect),
and [recording deletion API](https://developer.signalwire.com/rest/signalwire-rest/endpoints/space/recordings-delete).
