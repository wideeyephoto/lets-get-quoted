# Disaster Recovery & Backup Posture Drill — Execution Checklist

**Status:** STAGING DATABASE/AUTH/STORAGE ACCEPTANCE PASSED — approved restore and local app verification completed 2026-09-09. A corrective migration resolves the source crew-completion defect; all 35 real field tests pass. Broader recovery gates below remain open. See [the results and remaining scope](./dr-drill-record-2026-09-09.md).
**Target:** PostgreSQL 17.6.1, Supabase project `mfuvvtrkipkigwqqtcal` (`us-west-2`), 7 storage buckets (an 8th appears on first use — §0.1)
**Supersedes the sign-off claims in:** [backup-posture.md](../backup-posture.md), [disaster-recovery-pitr-drill.md](./disaster-recovery-pitr-drill.md)
**Written:** 2026-09-08

---

## §0 — Ground truth before the drill starts

Verified against the tree today. Read this before trusting any existing DR document.

| Claim on record | Where it is claimed | What is actually true |
| :--- | :--- | :--- |
| "Hourly automated `pg_dump -Fc`, GPG AES-256, replicated to offsite Google Drive" | `backup-posture.md` §2.1.2 | **No hourly/offsite implementation was found.** As of 2026-09-09, `scripts/capture-dr-backup.mjs` performs verified manual encrypted local captures; no scheduler or offsite replication is configured. |
| "RPO ≤ 1 hour" | `backup-posture.md` §1 | **Unmeasured.** Management API verification on 2026-09-09 shows PITR disabled and no listed backups. Neither a one-hour nor a 24-hour RPO is established. |
| "RTO ≤ 30 minutes … verified clean restore … in < 5 minutes on scratch database" | `backup-posture.md` §1, runbook §3 | **No restore has ever been run.** No output, no timing log, no scratch project ID, no reconciled counts anywhere in the repo. |
| "Verified via `test/disaster-recovery-restore-drill.test.ts` (4/4 passing)" | `LAUNCH_CHECKLIST.md` §611-616, §649-653 | 108 lines of mocks that restore nothing and assert literals against themselves (`expect(mockPayment.platform_fee).toBe(3.63)`). It is green and will stay green through total data loss. |
| "7 Managed Buckets" | `backup-posture.md` header, runbook §2 | True **today** (measured — see §0.1), but latently wrong. An 8th, `tool-photos` ([tool-photo-validation.ts:1](../../src/lib/tool-photo-validation.ts#L1)), is lazily created by [inventory/actions.ts](../../src/app/dashboard/inventory/actions.ts) on first upload and does not exist yet. When it appears it will be `public: true`, absent from `KNOWN_STORAGE_BUCKETS` ([account-deletion-saga.ts:6](../../src/lib/account-deletion-saga.ts#L6)) so account closure never deletes it, absent from `METERED_STORAGE_BUCKETS` ([storage-usage.ts:34](../../src/lib/billing/storage-usage.ts#L34)) so it is never charged or capacity-guarded, and absent from the DR inventory. `voice-recordings` is **admin-manual fiction** — no such bucket, resolved. |
| "Validate … `quotes`" and "`crew_members`" | `backup-posture.md` §3.3, runbook §2.3, `LAUNCH_CHECKLIST.md` §21 P0 gate, and `coreTables` in `run-pitr-restore-drill.mjs` | **Neither table exists.** `public.quotes` and `public.crew_members` are not in production; the quote-ish table is `estimate_offers`. The runner fails its `core_tables_presence` check when a table is missing, so **the drill runner reports FAILED on a perfect restore** — and the P0 gate instructs the operator to reconcile counts on a table that has never existed. |
| "`node scripts/run-pitr-restore-drill.mjs --target=…`" | runbook §2 Phase 2 | The runner exists and connects, but contains **no reference to `SCRATCH_DATABASE_URL`**, the variable its own runbook says the drill needs. Never invoked against a real database. |
| "automated backups" sold to customers | [security/page.tsx:48](../../src/app/security/page.tsx#L48) | Customer-facing durability claim standing on all of the above. Five of the seven buckets hold homeowner property photos and contractor insurance documents. |

### §0.1 — Measured production baseline

Read-only, from `db.mfuvvtrkipkigwqqtcal.supabase.co`, **2026-09-08, 18:2xZ**. This is the reconciliation baseline for §3 B4 and the scale the restore must reproduce. Re-measure immediately before the drill; these are recorded so a later run can show drift.

| Dimension | Measured |
| :--- | :--- |
| `public` base tables | 226 |
| RLS policies (`public`) | 271 |
| Tables with FORCE RLS | 59 |
| Functions (`public`) | 410 |
| Extensions | 5 — `plpgsql`, `pgcrypto`, `uuid-ossp`, `pg_stat_statements`, **`supabase_vault` 0.3.1 in schema `vault`** |
| `auth.users` | 12 |
| `accounts` / `memberships` / `staff` | 11 / 8 / 2 |
| `clients` / `jobs` | 961 / 691 |
| `invoices` / `payments` | 273 / 282 |
| Storage buckets | 7 (`site-images` and `site-videos` are `public: true`) |
| Storage objects / bytes | **38 objects, 35,726,922 bytes (34.07 MB)** |
| Storage meter agreement | **Exact.** `workspace_storage_usage` reports the same 38 objects and 35,726,922 bytes across 11 workspaces, last swept 18:17:19Z. This rail is genuinely green. |

**The planning conclusion this forces:** at 34 MB of blobs and under a thousand rows in the largest table, **restore time is not a data-volume problem.** Nothing here takes minutes to copy. The entire RTO will be consumed by schema, ownership, extension ordering and permission errors — 226 tables, 410 functions, 271 policies and `supabase_vault`. Optimizing for transfer speed would be optimizing the wrong thing; the drill's value is the error log in §3 B3, not the clock.

**Client-tool blocker cleared 2026-09-09:** PostgreSQL 17.11 `pg_dump`, `pg_restore`, and `psql` are installed in `tmp/dr-tools/pgsql/bin`, downloaded from EDB. Versions and archive hash are recorded in the capture evidence.

---

## §1 — Blockers to clear before the drill can begin

- [x] **B1 — PostgreSQL 17 client tools installed.** `pg_dump`, `pg_restore`, and `psql` all report 17.11. Use `tmp/dr-tools/pgsql/bin` or the wrappers. PostgreSQL major-version compatibility matters; an older minor release is not automatically rejected merely for being below 17.6.
- [x] **B2 — Obtain a scratch target. The staging rig already is one.** [staging-setup.mjs](../../scripts/staging-setup.mjs) expects a **separate Supabase project** — real `auth` and `storage` schemas, real Storage service — configured through `.env.staging.local` (`DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_EMAILS`). That is a better drill target than a local PG17 instance, which has no `auth`/`storage` schemas, no `supabase_auth_admin`/`supabase_storage_admin` roles and no Storage service, and so can only ever prove the `public` half. **Credential blocker cleared on 2026-09-09:** copied the existing gitignored `.env.staging.local` from `C:/dev/CLAUDE CODE FOLDER.worktrees/campaigns-page-redesign-recommendations/` into this checkout. All five required variables are populated for staging project `uydlabvgauzujdwuqzxq` (`staging-db`), distinct from production. Verified a read-only PostgreSQL connection, real `auth` and `storage` schemas, and HTTP 200 responses from Auth with the anon key, Auth admin with the service-role key, and Storage. Staging had 145 public tables before the drill. Brett explicitly approved replacement; the completed restore now has the captured 227 public tables. Record which tier of proof (§8) the chosen target can support.
- [x] **B2a — Confirm staging is expendable before restoring over it.** `pg_restore --clean --if-exists` drops and recreates; whatever staging currently holds — including the fixtures `test-staging/admin-console.test.ts` and `test-staging/field-app-rls.test.ts` run against — does not survive. With other agents working this tree, this is a coordination step, not a formality. **PASS =** written confirmation that staging can be destroyed, or a separate throwaway project provisioned instead.
- [x] **B3 — Configure the approved scratch target.** The validator now reads `SCRATCH_DATABASE_URL` or explicit `--target`, with no `DATABASE_URL` fallback. Restore credentials use an explicitly selected local env file and expected project ref. The approved target is staging-db, uydlabvgauzujdwuqzxq.
- [ ] **B4 — Confirm who can act.** Supabase dashboard / Management API access is needed to read PITR state and to create and delete a scratch project. Vercel and Stripe actions route through the operator agent. Name the human or agent for each *before* starting the stopwatch.
- [x] **B5 — Freeze the scope of writes.** A drill that restores production over itself is not a drill. Confirm no step here targets `mfuvvtrkipkigwqqtcal` with anything but `SELECT`. **Prefer the mechanized guard over the promise:** `staging-setup.mjs` reads `.env.staging.local` only, never falls back to `.env.local`, and refuses outright when the two name the same host — its own comment is *"a script whose safety depends on remembering is not a safe script."* Any restore command written for this drill should carry the same host comparison, because `pg_restore` has no such guard and a mistyped `-d` is unrecoverable.

---

## §2 — Phase A: Backup-side posture (this sets RPO)

The restore half is worthless if there is nothing to restore from. Do this phase first.

- [x] **A1 — Read PITR state from the Management API, not the dashboard card.** `GET https://api.supabase.com/v1/projects/mfuvvtrkipkigwqqtcal/database/backups` with a personal access token. Capture `pitr_enabled`, `walg_enabled`, the physical backup list and each `inserted_at`. A UI read is not truth — that mistake has already cost half a day on Stripe. **PASS =** raw JSON in the drill record, with `pitr_enabled` explicitly true or explicitly false.
- [ ] **A2 — Establish the real retention window.** If PITR is on, record the actual earliest recoverable timestamp the API reports — not the "7 days" the doc asserts. If PITR is off, record that and stop calling RPO one hour.
- [ ] **A3 — Establish the real backup cadence.** Read the timestamps of the last seven managed backups and compute the worst-case gap. **PASS =** a measured number of hours, written down, replacing the asserted ≤ 1h.

  **Management API check, 2026-09-09 10:10:58Z:** HTTP 200 from the production backups endpoint. [Raw response](./evidence/dr-backups-2026-09-09.json): `pitr_enabled: false`, `walg_enabled: true`, `backups: []`, `physical_backup_data: {}`. PITR is disabled. The response supplies no backup timestamps or recoverable window, so retention, backup cadence, and RPO remain **unmeasured**; this does not substantiate either a one-hour or a 24-hour RPO. A2/A3 remain open pending evidence of available recovery points. Access uses the approved token `lgq-dr-phase-a-2026-09-09`, expiring 2026-09-10, saved as `SUPABASE_ACCESS_TOKEN` in the gitignored `.env.management.local`. This Management API request was read-only; subsequent approved staging writes are recorded separately.

- [x] **A4 — Removed the unsupported hourly/offsite backup claim.** `backup-posture.md` describes the manual local capture that now exists. Scheduled offsite backup and alerts remain future work and are not represented as operational.
- [x] **A5 — Archive readability verified.** PostgreSQL 17.11 `pg_restore --list` read 4,348 TOC entries from the 10,630,650-byte production archive. Encrypted readback authenticates and matches the plaintext SHA-256. See [capture evidence](./evidence/dr-production-capture-2026-09-09.json).
- [x] **A6 — Dump includes `public`, `auth`, and `storage` data.** Verified against the archive TOC and the completed hosted restore. Compatible Supabase-owned Auth/Storage DDL was retained; application objects and managed data were restored with grants verified.
- [x] **A7 — Storage copy established locally.** No earlier object-backup implementation was found in the inspected repo. The 2026-09-09 capture downloaded all 38 objects (35,726,922 bytes), matched every metadata byte count, authenticated encrypted readback, and checked that the object metadata was unchanged afterward. No offsite copy is verified.
- [x] **A8 — Bucket inventory resolved (2026-09-08).** Production holds **7** buckets; `voice-recordings` does not exist and the admin-manual entry naming it is fiction. The count in `backup-posture.md` is therefore accurate *today*. **But `tool-photos` is a bucket waiting to happen:** [tool-photo-storage.ts:21](../../src/lib/tool-photo-storage.ts#L21) creates it on the first inventory upload, `public: true`, and it is in neither `KNOWN_STORAGE_BUCKETS` nor `METERED_STORAGE_BUCKETS`. The instant a contractor uploads a tool photo, the platform gains a public bucket that account closure will not delete, the meter will not charge, and this runbook does not cover. **Fix the two lists now**, before the bucket exists — it is a one-line change today and a data-deletion incident later.
- [x] **A9 — Runtime bucket inventory captured.** The capture queries `storage.buckets` and `storage.objects` dynamically: seven buckets and 38 objects on 2026-09-09. The inventory is saved with the capture, not hardcoded into the command.

---

## §3 — Phase B: Restore rehearsal (this sets RTO)

**Start the stopwatch at the first command of B2 and do not stop it for debugging.** The number that matters is wall-clock from "we have decided to restore" to "a human can log in", including every error you have to solve on the way. A five-minute figure that excludes forty minutes of ownership errors is the reason this drill is being re-run.

- [x] **B1 — Record the recovery point.** UTC timestamp or archive filename, chosen before restoring, written down.
- [x] **B2 — Restore into the approved scratch target.** Use `scripts/restore-dr-managed.mjs`, first as a dry run, then with `--apply --confirm-destroy=<approved-project-ref>` only after approval. It verifies the selected project, rejects production aliases and connection overrides, authenticates the encrypted archive, preserves grants, and runs an atomic transaction. Capture and resolve every error; a failed or rolled-back attempt is not recovery. See [the guarded command sequence](./disaster-recovery-pitr-drill.md).
- [x] **B3 — Log each remediation as a step in the real RTO.** Missing roles, missing extensions (`pgcrypto`, `pg_net`, `uuid-ossp`, and any vector/cron extension present), `search_path` assumptions, `plpgsql` ownership. Each is a step a human performs at 3am under load. **PASS =** an ordered remediation list a second person could follow.
- [x] **B4 — Reconcile row counts against the production snapshot.** Use the §0.1 baseline: `accounts`, `memberships`, `staff`, `clients`, `jobs`, `invoices`, `payments`, `auth.users`, plus `estimate_offers`. **Do not reconcile `quotes` or `crew_members`** — they do not exist, whatever the older DR docs and the P0 gate say. Do not accept "no error" as evidence — a zero-row read returns no error, and that pattern sits behind most of this repo's false green. **PASS =** a two-column table, source vs restored, with every delta explained.
- [ ] **B5 — Verify the 320 migrations landed as objects, not as a number.** Compare the `information_schema` function/table/index inventory against source. A matching migrations-table count proves nothing about function bodies. Cross-check with `npm run audit:applied` — the *applied* audit, not the ordering one, which passes on a database missing its foundation.
- [x] **B6 — Verify RLS survived, by exercising it rather than counting it.** Verified 272 policy definitions and 59 FORCE-RLS tables against the capture. The restored function initially failed completion because it wrote missing `jobs.completed_at`. The staged corrective migration restores completion with explicit enum/text casts, preserves the first start time and removes anonymous execution. **PASS 2026-09-09: all 35 real tests in `test-staging/field-app-rls.test.ts` pass**, including cross-account, archived-job and repeat-completion probes. Baseline failure and corrective evidence are both retained in the [dated record](./dr-drill-record-2026-09-09.md).
- [ ] **B7 — Verify grants did not default open.** New objects are anon-accessible by default in this project — the revoke *is* the security. Assert `anon` has no EXECUTE on service-only functions and no write on public tables in the restored database. **PASS =** an explicit denial per rail, not an absence of error.
- [x] **B8 — Run the corrected validator against restored data.** The runner now uses `estimate_offers`, records counts without claiming parity, rejects production, and executes read-only queries. Its restored-database run passed; see evidence/dr-staging-after-restore-2026-09-09.json.
- [ ] **B9 — Stop the stopwatch and write the number.** That is the RTO. Whatever it is, it replaces the 30-minute claim.

---

## §4 — Phase C: Storage blobs

The database half is the easy half. Seven buckets hold the evidence contractors are legally required to keep and homeowner property photos they cannot re-take.

- [x] **C1 — Count objects per bucket in production.** Done 2026-09-08: `site-videos` 3 / 16.93 MB, `site-images` 11 / 7.79 MB, `crew-photos` 2 / 5.02 MB, `lead-photos` 12 / 2.35 MB, `insurance-proof` 1 / 1.37 MB, `job-photos` 9 / 0.61 MB, `account-attachments` 0 / empty. **Total 38 objects, 34.07 MB.** Re-measure before the drill.
- [x] **C2 — Mirror every bucket, not a sample.** At 34 MB total this is small enough to copy in full in seconds, so there is no reason to prove one bucket and extrapolate. If no blob backup exists (A7), a full re-mirror from production *is* the recovery procedure, and at this size it is cheap — write it down as such. **Note the asymmetry:** `insurance-proof` holds a single object, but it is a contractor's liability document, and `job-photos`/`lead-photos` are homeowner property photos that cannot be re-taken. Object count is not importance.
- [x] **C3 — Prove a signed URL resolves to real bytes.** Generate a signed URL against a restored object and fetch it. **PASS =** HTTP 200 and a byte length matching the source; a 200 on a zero-byte object is a failure.
- [x] **C4 — Verify tenant partitioning survived.** All 38 objects retained their captured bucket/path and hash; Storage policy definitions matched. An existing restored member was denied both download and signed-URL creation for another account's private `crew-photos` object. Service role confirmed the same object exists and holds 2,103,537 bytes. [Live API evidence](./evidence/dr-storage-tenant-denial-2026-09-09.json). This denial concerns private buckets; public objects remain public by design.
- [x] **C5 — Reconcile `workspace_storage_usage` after restore.** Run `reconcile_workspace_storage_usage_v1()` on the restored database and compare against production. A missing row means never swept, which is not zero. **PASS =** per-workspace byte parity, or an explained delta. Passed for all 11 workspaces: 35,726,922 bytes and 38 objects.

---

## §5 — Phase D: Identity, tenancy and the RLS helpers

A restored database nobody can log into is a backup, not a recovery.

- [x] **D1 — `auth.users` row parity.** Compared all 12 captured users' IDs, `encrypted_password`, phone and email/phone confirmation fields with staging; all match. All 14 identities match IDs, user, provider and identity data. Compared directly against encrypted-capture COPY data in memory; no field values appear in the [evidence](./evidence/dr-completion-verification-2026-09-09.json).
- [x] **D2 — Verify the auth schema's own functions and triggers restored,** not just its tables. Sign-in fails on a missing trigger with tables that look perfect.
- [x] **D3 — Prove an existing restored workspace member can sign in and read their workspace.** Verify their restored auth row and membership first. `staging-signin.mjs` may create missing users and memberships; merely running that helper can manufacture a passing test. Use the real Auth callback and assert authenticated workspace access without adding the identity or membership under test. Magic links are single-use. **PASS =** an authenticated session using the restored identity and tenancy data.
- [x] **D4 — Prove tenant isolation on restored data.** Sign in as workspace A and attempt to read workspace B. The launch checklist currently ticks "tenant isolation confirmed" and that tick is false. **PASS =** zero rows returned *and* a policy demonstrably doing the refusing — a zero-row read with RLS accidentally disabled looks identical.
- [x] **D5 — Prove the break-glass path.** `ADMIN_EMAILS` bootstrap and `super_admin` provisioning, per [staff-identity-recovery-drill.md](./staff-identity-recovery-drill.md). If nobody can reach the admin surface of the restored system, RTO is infinite.

---

## §6 — Phase E: Application-level proof

- [ ] **E1 — Point a Vercel preview at the restored database.** Preview env vars have broken this twice; budget for it. **PASS =** the preview boots and serves an authenticated page. A local isolated preview passed on port 3014; Vercel recovery deployment was not rehearsed.
- [x] **E2 — Open a job photo at full resolution through the app.** Not a signed URL in a terminal — the app path.
- [ ] **E3 — Open an invoice and download the generated PDF.** Confirm amounts render in cents, not rounded — the money surfaces have failed exactly this way before.
- [ ] **E4 — Load the Plan & usage tab.** It is live and reads the billing rails; it will surface a projection or entitlement restore gap that raw row counts hide.
- [x] **E5 — Run the dashboard smoke across the main surfaces** (jobs, clients, schedule, messages, payments) and record anything that renders empty. An empty page on restored data is the failure mode this whole drill exists to catch.

---

## §7 — Phase F: The half a database restore cannot reach

Restoring Postgres restores your record of the world, not the world. Every item below is state held by a third party that a point-in-time restore puts *out of sync* rather than back in sync.

- [ ] **F1 — Secrets inventory.** Vercel Sensitive vars are write-only and unreadable by anyone, including the owner. A total-loss scenario needs every secret re-derivable from its source of truth. **PASS =** a list of every required env var with, for each, where its value can be re-obtained. Any var with no answer is an unrecoverable dependency and a finding.
- [ ] **F2 — Stripe divergence.** Money state lives at Stripe. A restore to time T leaves the database believing it is T while Stripe is at now: subscriptions, invoices, charges and refunds in between exist only at Stripe. Plan the reconciliation — `scripts/reconcile-stripe-live-ledger.mjs` is the starting point. **PASS =** a documented procedure for closing the gap, and an explicit statement of which direction wins on conflict.
- [ ] **F3 — Replay hazard on restore.** Bringing back a restored database with crons live re-processes events already processed. Idempotency keys are not automatically safe here — a stable key can replay a 24h-old response. **PASS =** a written pre-cutover step that pauses the money-touching crons (`billing-subscription-projection`, `connected-payment-projection`, `top-up-projection`, `direct-payment-settlement`, `overage-settlement`, `ad-wallet-refill`, `dunning`) before traffic resumes.
- [ ] **F4 — Provider-side pointers go stale.** Custom domains and TLS certs, email sending domains at Resend, SignalWire numbers and campaign assignments, QuickBooks OAuth tokens, Google LSA and Meta ad credentials. Each is a row pointing at a resource whose real state moved on. **PASS =** a per-provider note on whether restore-then-reconcile is automatic (the reconciler crons cover email and custom domains), manual, or impossible.
- [ ] **F5 — DNS and deploy recovery.** The Vercel rollback drill covers deploy; confirm DNS records and their zone are recoverable independently. **PASS =** a zone export or a documented source of truth.
- [ ] **F6 — Repo and migration recovery.** The 320 migrations under `migrations/` are the schema's source of truth. Backups exist (hourly USB, twice-daily offsite) but GitHub silently refuses some refs. **PASS =** confirm the migration directory and `schema.sql` are present in at least two independent backups.

---

## §8 — Phase G: Scenario tiers

Run at least Tier 2. Tier 3 is the one the security page is promising.

- [ ] **G1 — Tier 1, single-row recovery.** A contractor deletes an invoice. Recover one row without disturbing anything else. Fastest, most likely, currently undocumented. **PASS =** a documented procedure and a measured time.
- [ ] **G2 — Tier 2, single-tenant recovery.** One workspace corrupted or wrongly deleted; the other ten are healthy and must not be interrupted. This is the hard case — PITR restores the whole project, so single-tenant recovery needs a scratch restore plus a selective copy-back. **PASS =** a proven procedure, including how you avoid restoring the other tenants backwards.
- [ ] **G3 — Tier 3, total project loss.** Region gone. Rebuild from backup into a new project, re-point DNS, re-enter secrets, reconcile Stripe. **PASS =** an end-to-end wall-clock estimate with each step's contribution, even if the drill only rehearses parts of it.
- [ ] **G4 — Ransom / malicious-actor case.** Backups reachable with the same credentials as production are not backups. **PASS =** a statement of whether the offsite copy is separately credentialed, and whether it is immutable or merely a copy someone with the service-role key can also delete.

---

## §9 — Phase H: Truth-up (do this even if the drill is deferred)

These are false today and remain false regardless of when the drill runs.

- [x] **H1 — Rewrote `backup-posture.md` with measured evidence.** Removed hourly/offsite and sub-five-minute restore claims. RPO and RTO remain unmeasured; current bucket inventory is seven, determined dynamically.
- [x] **H2 — Replaced the old literal-assertion mock test.** `test/disaster-recovery-safety.test.ts` runs the actual guard and validator logic and explicitly does not certify a restore. Nineteen tests passed.
- [x] **H3 — Corrected security-page source copy.** Removed the unsupported automated-backup claim from `src/app/security/page.tsx`. This source change has not been deployed by this task.
- [x] **H4 — Withdrew both historical completed DR sign-offs in `LAUNCH_CHECKLIST.md`.** Staging database/Auth/Storage acceptance now passes after correction. The broader sign-offs remain open for offsite, provider, infrastructure and recovery-tier proof.
- [x] **H5 — Corrected the go-live document's claim that the backup half runs.** It now distinguishes verified manual local capture from unverified scheduling, offsite storage, and recovery.
- [ ] **H6 — Purge the phantom tables from every DR document.** `quotes` and `crew_members` are named in `backup-posture.md` §3.3, `disaster-recovery-pitr-drill.md` §2.3, the `LAUNCH_CHECKLIST.md` §21 P0 gate, and the runner's `coreTables`. None of them exist. This is the tell that the whole DR record was written without ever being executed against the database it describes — a single run would have failed on the first one.
- [ ] **H7 — Remove the `voice-recordings` bucket from the admin manual** ([admin-manual/index.ts:2192](../../src/lib/admin-manual/index.ts#L2192)). It hands an operator a `SELECT` against a bucket that does not exist, during a call-audio investigation, which is exactly when nobody has time to discover that.

---

## §10 — Sign-off record

The drill is not complete until this table is filled with measurements, not adjectives. Save it as `docs/runbooks/dr-drill-record-YYYY-MM-DD.md` and link it from `backup-posture.md`.

| Field | Value |
| :--- | :--- |
| Drill date / operator | |
| Scenario tier run (§8) | |
| Scratch target (project ref or local) | |
| PITR enabled (raw API value) | |
| Measured earliest recovery point | |
| **Measured RPO** | |
| Recovery point restored from | |
| Restore attempts before success | |
| Remediation steps required | |
| **Measured RTO (wall clock, incl. debugging)** | |
| Row-count reconciliation | attach |
| RLS / grant parity | attach |
| Real member sign-in on restored data | PASS / FAIL |
| Cross-tenant read refused | PASS / FAIL |
| Buckets restored / verified | n of the captured runtime inventory |
| Job photo opened through the app | PASS / FAIL |
| Invoice PDF opened through the app | PASS / FAIL |
| Secrets with no re-derivation path | list |
| Stripe reconciliation procedure | attach |
| Findings raised | |
| Docs corrected (§9) | |

---

## §11 — Out of scope here, covered elsewhere

[vercel-rollback-drill.md](./vercel-rollback-drill.md) (deploy rollback, forward-only schema), [staff-identity-recovery-drill.md](./staff-identity-recovery-drill.md) (identity loss, MFA, break-glass), [secret-rotation-drill.md](./secret-rotation-drill.md) (rotation, distinct from recovery), [clean-slate-onboarding-rehearsal.md](./clean-slate-onboarding-rehearsal.md). Each is referenced above where it carries a dependency; none of them substitutes for this one.


## September 9 production and offsite follow-up

The corrective migration was applied to production and verified by matching the tested staging function definition and grants. No production business rows were changed. The user chose to keep Supabase Free, so PITR remains disabled. Encrypted database, all 38 Storage objects, source and local configuration are now published to Google Drive with a twice-daily schedule and 30-day retention. The user confirmed independent Dashlane key escrow. Mounted readback and offline opening passed; Drive web confirms private cloud presence. Chrome blocked an independent cloud download, so that recovery check remains open. These findings supersede earlier same-machine-only and production-not-modified statements in this historical record. See [offsite runbook](dr-offsite-recovery.md), [offsite evidence](evidence/dr-offsite-2026-09-09.json), and [production migration evidence](evidence/dr-production-migration-2026-09-09.json). Full provider/infrastructure recovery remains unrehearsed.


September 9, 13:12 UTC follow-up: the user successfully downloaded the earlier 12:42 UTC encrypted pack from Google Drive. Its receipt hashes match exactly, and the database archive, all 38 Storage objects, source and encrypted configuration authenticate. This supersedes the earlier blocked-download finding. See [independent cloud-download evidence](evidence/dr-cloud-download-2026-09-09.json). A live restore of this downloaded pack and full provider/infrastructure recovery were not performed in this check.
