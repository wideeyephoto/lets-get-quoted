# Security and recovery — September 9, 2026

This record separates implemented controls, observed production results, and remaining recovery acceptance. It contains no credentials or user authentication material.

## Exposed credentials

The activity export identified `RESEND_DOMAINS_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `CRON_SECRET`. The owner created replacement Resend key `5fde4b44-0b97-40ff-aa92-f85a82dd9d1c`; domain reads passed. Supabase secret key `db7fca46-121c-435a-a016-be23a24e57df` passed database and Storage reads. Existing publishable key `8acc2f73-7ed0-40b6-a358-a2c1ae32d1df` replaces legacy public JWT consumers. Production and Preview cron values were replaced independently.

Vercel's exact existing environment bindings and the GitHub monitor secret were updated at 20:26 UTC. Production was rebuilt from then-current main `2c5958ac2e350148b256f670660fad2be296622b`, deployment `dpl_GcPRDacEHM27Atb6MchHdtJEDNPL`. At 20:39:34Z the canonical app accepted the new cron secret, withheld privileged diagnostics from the old secret, served the new publishable key in its login bundles, and returned operational database health. Resend returned both current domains as verified.

- Exposed Resend key `7c93c7fc-1b52-4b7b-8839-5af8709b4bd9` deleted at 20:39:54Z; its ID disappeared from the key inventory and the replacement continued working.
- Supabase legacy API keys disabled at 20:39:56Z. Previously used HS256 signing key `487bf152-0f3c-4f79-84ef-751a89739404` revoked at 20:40:00Z. Current ES256 key `4e27e215-4ba4-4f3a-945d-83f034b0787c`, in use since July 14, was preserved.
- At 20:40:59Z, the old service JWT returned **401 both as `apikey` and as bearer Authorization paired with the new publishable key**. The old anon JWT returned 401; the new secret and publishable Auth settings returned 200; live app database health passed.
- Initial immediate probes during provider propagation included a transient 503 and an old-public-key 200. The final negative probes above passed. No zero-downtime guarantee is claimed.
- At 20:41:48Z, six matching live local environment files were updated, including the main checkout used by scheduled backup. Staging credentials and historical encrypted snapshots were preserved. The current local recovery kit now includes the replacement domain-management credential.

See [credential evidence](evidence/security-credential-rotation-2026-09-09.json). Older immutable deployments contain revoked credentials and must be rebuilt with current environment values before rollback. Legacy signed links and short-lived codes that use the service credential as an HMAC key need reissuance; never restore the exposed value to make an old link work. Preflight found zero account-closure jobs with encrypted vendor handles, so there were no pending handles to re-encrypt. Provider-only secrets outside these three exposed credentials were not rotated by this drill.

## Native admin passkeys

The app now implements native WebAuthn registration and verification using SimpleWebAuthn, with the fixed production origin/RP `https://app.letsgetquoted.com` / `app.letsgetquoted.com`. Registration requires an active provider session that actually verified TOTP. Signed passkey assertions create a 15-minute application grant bound to the user, live provider session and credential. They do not change Supabase's AAL claim. Permission and active-staff checks still precede sensitive actions.

One-use challenges expire after five minutes; enrollment, cross-user/session binding, signature, user-verification, RP/origin, counters/revisions, expiry and revocation are enforced on the server. Browser roles cannot access the three credential tables or eight privileged functions. The private session reader has an empty search path. The canonical schema and recovery tooling include the new private schema; session deletion has an indexed cascade path.

Verification before application release:

- TypeScript passed. Focused suites passed 125 tests. The full run passed 14,423 tests and found two schema-audit failures; the missing challenge-session index and primary-key-index detection were corrected, and all 29 affected tests then passed.
- The real staging provider/database drill passed **22 checks**, including two independently signed passkeys, TOTP bootstrap/fallback, malformed/expired/replayed assertion denial, concurrent counters, separate-session denial, backup removal and immediate provider-session revocation. Disposable users and staff were deleted in cleanup. This uses a cryptographic test authenticator, not a real password manager.
- Browser preview verified setup, QR rendering, backup activation, enrollment state, cancelled prompt remaining locked, successful step-up, last-TOTP-backup protection, and account-switch invalidation. Preview provider responses were synthetic.
- Native schema and session index applied to production at 20:43–20:44 UTC. All three tables have RLS; anon/authenticated cannot read them; service-role CRUD works. All eight functions deny browser execution. Provider migration versions are `20260909204357` / `20260909204402`; their local source files are `20260909195002_admin_native_passkey_mfa.sql` / `20260909204200_admin_passkey_session_index.sql`.

PR #59 merged after full CI passed and released the application. The owner's first Add passkey attempt left a hidden/unresponsive Dashlane prompt. PR #63 adds visible waiting state, cancellation, a 60-second application timeout and rejection of late native responses; its 19 focused tests, typecheck and full CI passed before the approved release. Both PRs are merged. Canonical aliases and production health were rechecked at 21:58 UTC; the current release includes both fixes. [Release probes](evidence/security-production-release-2026-09-09.json).

**Remaining:** production native-device enrollment, fresh-session assertion, cancellation and recovery acceptance. Production still had zero registered credentials at the latest check. The authenticator backup is enrolled and the owner has verified it. A real Apple Passwords/Dashlane/device ceremony requires the owner to operate the native prompt. Do not mark that gate complete from the protocol fixture or from the presence of controls.

## Downloaded offsite recovery

The independently downloaded Drive pack `mfuvvtrkipkigwqqtcal-2026-09-09T12-42-53-253Z.tar.aesgcm` was authenticated and restored into a new loopback-only PostgreSQL cluster. All **260 row counts, 258 table/RLS/grant definitions, 272 policies and 435 functions/grants** matched. An existing restored owner saw three own jobs and no other-account jobs. All 38 Storage objects (35,726,922 bytes) were materialized and hash-verified as local files. The empty Supabase Vault extension was excluded because stock PostgreSQL lacks its provider. Temporary plaintext cluster/files were removed.

[Evidence](evidence/dr-downloaded-local-restore-2026-09-09.json) records 20:21:07.734Z–20:21:18.473Z. The 10.739-second execution time excludes tool preparation, source recovery and hosted services; it is not full-disaster RTO. The earlier hosted staging Auth/Storage drill remains separate evidence from this downloaded pack.

The owner subsequently approved replacing staging after a fresh encrypted safety capture. The exact downloaded pack completed hosted SQL restore at 21:14:46 UTC, baseline parity at 21:18, all 38 hosted Storage object hashes at 21:20 and 35 real RLS tests at 21:21. Existing restored-user Auth and owner/foreign job API checks passed. The first HTTP page smoke was insufficient to detect a streamed error boundary; its rendering claim has been withdrawn in its evidence file.

Independent source installation/build passed, and a new all-login-protected Vercel recovery project was deployed. After the separate tenant-access task changed staging grants, its permission-aware client adapter was added to the recovered app without weakening those grants. The protected browser now renders restored dashboard/jobs/clients/schedule data. No production restore or DNS cutover was performed. [Infrastructure/provider recovery record](infrastructure-provider-recovery-2026-09-09.md) contains detailed evidence, configuration/DNS inventories, timings and the provider reconciliation procedure.

**Remaining:** independent Dashlane-key retrieval, original-key/live-configuration recovery, full native-device production acceptance, Stripe financial-gap reconciliation and provider-owner-account/DNS-failover acceptance. The available Stripe live restricted key cannot read events. Supabase Free/PITR-disabled and the 12-hour offsite target remain the owner's chosen posture; a full-disaster RTO is not established.
