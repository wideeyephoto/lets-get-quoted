# Provider-confirmed transfer history

A controlled production call reached the configured forwarding phone, and its
provider forwarding leg was linked to the original inbound call. Application
history still showed `transfer_attempted` with no forwarding duration. The AI
transfer's `connect` block omitted `status_url`; the existing forwarding RPC also
left an already-created history outcome unchanged.

AI admissions now pass the existing signed forwarding-status endpoint into the
transfer instruction. Query-free native callbacks resolve workspace and caller
from saved history after signature verification. Unknown duration stays null.
A generic ended leg cannot trigger a missed-call message without an explicit
failure reason.

The database records connected/disconnected timestamps and derives elapsed
forwarding seconds. A history trigger preserves `transferred_and_answered` and
`provider_forwarding` attribution across later AI receipt upserts. A completed
cXML callback with a known duration also supplies connection evidence, including
zero-second answered calls. A disconnected callback alone remains unresolved.
AI seconds and customer minute debits are never derived from forwarding time.

Validation includes actual PostgreSQL callback replay, reverse arrival order,
concurrent history writes, service-only permissions, and application callback,
admission, rendering, and settlement tests. The human test confirmed receiving
audio; it did not verify return audio, recovery voicemail, busy/no-answer, or
caller abandonment. Provider leg duration includes different intervals from
bridge time and must not be copied into the new field as an assumed equivalent.

Apply `20260908163021_voice_transfer_completion_evidence.sql` before deploying
the callback wiring. It requires the existing observation foundation migration
`20260905151055_voice_observation_and_recording_hardening.sql`. The designated
staging database has both migrations installed after explicit approval. The
installed-schema callback replay passed with test rows rolled back. Production
installation and callback deployment remain pending.

The migration does not backfill history or modify ledger entries. Keep existing
provider evidence for reconciliation. App rollback can retain the additive
trigger/function change; it stops wiring new AI-transfer callbacks and recreates
an observation gap. Removing the trigger would again allow late AI summaries to
replace a confirmed outcome. Exhaustion blocking remains off.
