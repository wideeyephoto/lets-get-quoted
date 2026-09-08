# Disaster Recovery & Backup Posture Drill — Execution Checklist

**Status:** PLANNED — never executed
**Target:** PostgreSQL 17.6.1, Supabase project `mfuvvtrkipkigwqqtcal` (`us-west-2`), 7 storage buckets (an 8th appears on first use — §0.1)
**Supersedes the sign-off claims in:** [backup-posture.md](../backup-posture.md), [disaster-recovery-pitr-drill.md](./disaster-recovery-pitr-drill.md)
**Written:** 2026-09-08

---

## §0 — Ground truth before the drill starts

Verified against the tree today. Read this before trusting any existing DR document.

| Claim on record | Where it is claimed | What is actually true |
| :--- | :--- | :--- |
| "Hourly automated `pg_dump -Fc`, GPG AES-256, replicated to offsite Google Drive" | `backup-posture.md` §2.1.2 | **No implementation exists.** `pg_dump` appears nowhere in `src/`, `scripts/`, `vercel.json` (45 crons, none a backup), `package.json`, or `.github/workflows/`. The only hits are compiled `.next/` artifacts embedding doc text. |
| "RPO ≤ 1 hour" | `backup-posture.md` §1 | **Unknown.** With no hourly dump, RPO rests entirely on Supabase PITR. PITR is a paid add-on; nothing in the repo proves it is enabled. Without it, the managed daily backup puts RPO at **24 hours**, not 1. |
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

**Also true and load-bearing:** `pg_dump`, `pg_restore` and `psql` are **not installed on this machine**. `node_modules/@embedded-postgres/windows-x64/native/bin/` ships `initdb.exe`, `pg_ctl.exe` and `postgres.exe` only. The drill's central command cannot run until client tooling is installed. That is blocker B1.

---

## §1 — Blockers to clear before the drill can begin

- [ ] **B1 — Install PostgreSQL 17 client tools.** `pg_dump`/`pg_restore`/`psql` at **17.6 or newer**; an older `pg_dump` refuses a 17.6.1 server outright. Put `bin/` on PATH — the local-PG rig dies without it. **PASS =** `pg_dump --version` and `pg_restore --version` both report ≥ 17.6.
- [ ] **B2 — Obtain a scratch target. The staging rig already is one.** [staging-setup.mjs](../../scripts/staging-setup.mjs) expects a **separate Supabase project** — real `auth` and `storage` schemas, real Storage service — configured through `.env.staging.local` (`DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_EMAILS`). That is a better drill target than a local PG17 instance, which has no `auth`/`storage` schemas, no `supabase_auth_admin`/`supabase_storage_admin` roles and no Storage service, and so can only ever prove the `public` half. **The file is gitignored and is not present in this checkout** — it must be supplied or recreated before the drill can start. Record which tier of proof (§8) the chosen target can support.
- [ ] **B2a — Confirm staging is expendable before restoring over it.** `pg_restore --clean --if-exists` drops and recreates; whatever staging currently holds — including the fixtures `test-staging/admin-console.test.ts` and `test-staging/field-app-rls.test.ts` run against — does not survive. With other agents working this tree, this is a coordination step, not a formality. **PASS =** written confirmation that staging can be destroyed, or a separate throwaway project provisioned instead.
- [ ] **B3 — Define `SCRATCH_DATABASE_URL`** and make the runner read it, or fix the runbook to name the flag the runner does read. The two documents currently disagree and neither has been executed.
- [ ] **B4 — Confirm who can act.** Supabase dashboard / Management API access is needed to read PITR state and to create and delete a scratch project. Vercel and Stripe actions route through the operator agent. Name the human or agent for each *before* starting the stopwatch.
- [ ] **B5 — Freeze the scope of writes.** A drill that restores production over itself is not a drill. Confirm no step here targets `mfuvvtrkipkigwqqtcal` with anything but `SELECT`. **Prefer the mechanized guard over the promise:** `staging-setup.mjs` reads `.env.staging.local` only, never falls back to `.env.local`, and refuses outright when the two name the same host — its own comment is *"a script whose safety depends on remembering is not a safe script."* Any restore command written for this drill should carry the same host comparison, because `pg_restore` has no such guard and a mistyped `-d` is unrecoverable.

---

## §2 — Phase A: Backup-side posture (this sets RPO)

The restore half is worthless if there is nothing to restore from. Do this phase first.

- [ ] **A1 — Read PITR state from the Management API, not the dashboard card.** `GET https://api.supabase.com/v1/projects/mfuvvtrkipkigwqqtcal/database/backups` with a personal access token. Capture `pitr_enabled`, `walg_enabled`, the physical backup list and each `inserted_at`. A UI read is not truth — that mistake has already cost half a day on Stripe. **PASS =** raw JSON in the drill record, with `pitr_enabled` explicitly true or explicitly false.
- [ ] **A2 — Establish the real retention window.** If PITR is on, record the actual earliest recoverable timestamp the API reports — not the "7 days" the doc asserts. If PITR is off, record that and stop calling RPO one hour.
- [ ] **A3 — Establish the real backup cadence.** Read the timestamps of the last seven managed backups and compute the worst-case gap. **PASS =** a measured number of hours, written down, replacing the asserted ≤ 1h.
- [ ] **A4 — Decide the fate of the phantom hourly dump.** Either build it — scheduled `pg_dump -Fc`, encrypted, offsite, restore-tested, with a failure alert — or delete the paragraph from `backup-posture.md`. Do not leave a described-but-absent rail under a customer-facing security page. If you build it: a cron that runs and records nothing is indistinguishable from one that never runs, so it must write an audit row and fail loudly.
- [ ] **A5 — Prove the backup is readable, not merely present.** A backup never decompressed is a hypothesis. `pg_restore --list` the archive (or take a fresh dump) and confirm the table of contents is intact and non-empty. **PASS =** a TOC line count.
- [ ] **A6 — Confirm the dump scope covers `auth` and `storage`.** A `public`-only dump loses `auth.users`, which makes every workspace unrecoverable no matter how clean the `public` restore looks. Highest-consequence check in the phase. **PASS =** the TOC names objects in `auth`, `storage` *and* `public`.
- [ ] **A7 — Storage blobs are not in the database dump.** `storage.objects` rows are metadata pointing at bytes held by the Storage service; restoring the database yields rows whose blobs do not exist. Establish whether any blob-level backup exists at all. **PASS =** either a located blob backup with a proven object count, or a written statement that **file assets have no independent backup** — which, if true, is a finding, not a checklist item.
- [x] **A8 — Bucket inventory resolved (2026-09-08).** Production holds **7** buckets; `voice-recordings` does not exist and the admin-manual entry naming it is fiction. The count in `backup-posture.md` is therefore accurate *today*. **But `tool-photos` is a bucket waiting to happen:** [tool-photo-storage.ts:21](../../src/lib/tool-photo-storage.ts#L21) creates it on the first inventory upload, `public: true`, and it is in neither `KNOWN_STORAGE_BUCKETS` nor `METERED_STORAGE_BUCKETS`. The instant a contractor uploads a tool photo, the platform gains a public bucket that account closure will not delete, the meter will not charge, and this runbook does not cover. **Fix the two lists now**, before the bucket exists — it is a one-line change today and a data-deletion incident later.
- [ ] **A9 — Re-check the bucket count as a standing item, not a one-off.** Lazy `createBucket` means the inventory can grow without a migration, a deploy, or a review. Any check that hard-codes "7" will be wrong silently. **PASS =** the drill reads `storage.buckets` at run time rather than trusting a constant.

---

## §3 — Phase B: Restore rehearsal (this sets RTO)

**Start the stopwatch at the first command of B2 and do not stop it for debugging.** The number that matters is wall-clock from "we have decided to restore" to "a human can log in", including every error you have to solve on the way. A five-minute figure that excludes forty minutes of ownership errors is the reason this drill is being re-run.

- [ ] **B1 — Record the recovery point.** UTC timestamp or archive filename, chosen before restoring, written down.
- [ ] **B2 — Restore into the scratch target.** `pg_restore --clean --if-exists --no-owner --no-privileges -d "$SCRATCH_DATABASE_URL" <archive>` — expect the first attempt to fail. The Supabase-flavored archive carries `supabase_auth_admin` / `supabase_storage_admin` objects and extension ordering that is exactly the shape that breaks on a foreign target. **Capture every error, not just the last.** **PASS =** exit status plus a complete error log, retained even on success.
- [ ] **B3 — Log each remediation as a step in the real RTO.** Missing roles, missing extensions (`pgcrypto`, `pg_net`, `uuid-ossp`, and any vector/cron extension present), `search_path` assumptions, `plpgsql` ownership. Each is a step a human performs at 3am under load. **PASS =** an ordered remediation list a second person could follow.
- [ ] **B4 — Reconcile row counts against the production snapshot.** Use the §0.1 baseline: `accounts`, `memberships`, `staff`, `clients`, `jobs`, `invoices`, `payments`, `auth.users`, plus `estimate_offers`. **Do not reconcile `quotes` or `crew_members`** — they do not exist, whatever the older DR docs and the P0 gate say. Do not accept "no error" as evidence — a zero-row read returns no error, and that pattern sits behind most of this repo's false green. **PASS =** a two-column table, source vs restored, with every delta explained.
- [ ] **B5 — Verify the 320 migrations landed as objects, not as a number.** Compare the `information_schema` function/table/index inventory against source. A matching migrations-table count proves nothing about function bodies. Cross-check with `npm run audit:applied` — the *applied* audit, not the ordering one, which passes on a database missing its foundation.
- [ ] **B6 — Verify RLS survived, by exercising it rather than counting it.** Policies and `FORCE ROW LEVEL SECURITY` are the tenancy boundary, and `--no-privileges` is precisely the flag most likely to drop them. Start with parity — 271 policies and 59 FORCE-RLS tables per §0.1 — then **run `test-staging/field-app-rls.test.ts` against the restored database** (`npx vitest run --config vitest.staging.config.ts`). That suite already exists to drive real RLS against a real database, which is a far stronger proof than a count: a policy can restore intact and still not bite. **PASS =** count parity *and* the staging RLS suite green against restored data.
- [ ] **B7 — Verify grants did not default open.** New objects are anon-accessible by default in this project — the revoke *is* the security. Assert `anon` has no EXECUTE on service-only functions and no write on public tables in the restored database. **PASS =** an explicit denial per rail, not an absence of error.
- [ ] **B8 — Fix the drill runner's table list before running it.** Its `coreTables` array asserts `quotes`, which does not exist, so it reports `core_tables_presence: failed` on a flawless restore. Replace `quotes` with `estimate_offers` (and confirm the rest against §0.1) *first* — otherwise the drill's first real execution produces a false failure, and someone will spend the incident debugging the checker. Then run `node scripts/run-pitr-restore-drill.mjs --target="$SCRATCH_DATABASE_URL"`; its FK-orphan and count checks are genuinely useful once pointed at a real database. **PASS =** the emitted report, dated, committed to the drill record.
- [ ] **B9 — Stop the stopwatch and write the number.** That is the RTO. Whatever it is, it replaces the 30-minute claim.

---

## §4 — Phase C: Storage blobs

The database half is the easy half. Seven buckets hold the evidence contractors are legally required to keep and homeowner property photos they cannot re-take.

- [x] **C1 — Count objects per bucket in production.** Done 2026-09-08: `site-videos` 3 / 16.93 MB, `site-images` 11 / 7.79 MB, `crew-photos` 2 / 5.02 MB, `lead-photos` 12 / 2.35 MB, `insurance-proof` 1 / 1.37 MB, `job-photos` 9 / 0.61 MB, `account-attachments` 0 / empty. **Total 38 objects, 34.07 MB.** Re-measure before the drill.
- [ ] **C2 — Mirror every bucket, not a sample.** At 34 MB total this is small enough to copy in full in seconds, so there is no reason to prove one bucket and extrapolate. If no blob backup exists (A7), a full re-mirror from production *is* the recovery procedure, and at this size it is cheap — write it down as such. **Note the asymmetry:** `insurance-proof` holds a single object, but it is a contractor's liability document, and `job-photos`/`lead-photos` are homeowner property photos that cannot be re-taken. Object count is not importance.
- [ ] **C3 — Prove a signed URL resolves to real bytes.** Generate a signed URL against a restored object and fetch it. **PASS =** HTTP 200 and a byte length matching the source; a 200 on a zero-byte object is a failure.
- [ ] **C4 — Verify tenant partitioning survived.** Object paths are `${accountId}/${uuid}.${ext}`. Confirm no object landed under a different account prefix and that per-bucket RLS/access policies restored. **PASS =** a cross-tenant read attempt that is refused.
- [ ] **C5 — Reconcile `workspace_storage_usage` after restore.** Run `reconcile_workspace_storage_usage_v1()` on the restored database and compare against production. A missing row means never swept, which is not zero. **PASS =** per-workspace byte parity, or an explained delta.

---

## §5 — Phase D: Identity, tenancy and the RLS helpers

A restored database nobody can log into is a backup, not a recovery.

- [ ] **D1 — `auth.users` row parity**, including `encrypted_password`, `phone`, `email_confirmed_at`, and identities. **PASS =** counts and a spot-check of five real rows.
- [ ] **D2 — Verify the auth schema's own functions and triggers restored,** not just its tables. Sign-in fails on a missing trigger with tables that look perfect.
- [ ] **D3 — Prove one real workspace member can actually sign in** against the restored database — the only check that proves `auth.users` *plus* the RLS helper functions survived together. [staging-signin.mjs](../../scripts/staging-signin.mjs) already does this against a staging project and is the shortest path. Magic links are single-use; plan for that. **PASS =** an authenticated session on restored data.
- [ ] **D4 — Prove tenant isolation on restored data.** Sign in as workspace A and attempt to read workspace B. The launch checklist currently ticks "tenant isolation confirmed" and that tick is false. **PASS =** zero rows returned *and* a policy demonstrably doing the refusing — a zero-row read with RLS accidentally disabled looks identical.
- [ ] **D5 — Prove the break-glass path.** `ADMIN_EMAILS` bootstrap and `super_admin` provisioning, per [staff-identity-recovery-drill.md](./staff-identity-recovery-drill.md). If nobody can reach the admin surface of the restored system, RTO is infinite.

---

## §6 — Phase E: Application-level proof

- [ ] **E1 — Point a Vercel preview at the restored database.** Preview env vars have broken this twice; budget for it. **PASS =** the preview boots and serves an authenticated page.
- [ ] **E2 — Open a job photo at full resolution through the app.** Not a signed URL in a terminal — the app path.
- [ ] **E3 — Open an invoice and download the generated PDF.** Confirm amounts render in cents, not rounded — the money surfaces have failed exactly this way before.
- [ ] **E4 — Load the Plan & usage tab.** It is live and reads the billing rails; it will surface a projection or entitlement restore gap that raw row counts hide.
- [ ] **E5 — Run the dashboard smoke across the main surfaces** (jobs, clients, schedule, messages, payments) and record anything that renders empty. An empty page on restored data is the failure mode this whole drill exists to catch.

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

- [ ] **H1 — Rewrite `backup-posture.md`.** Remove the unimplemented hourly-dump rail, remove the "verified clean restore … < 5 minutes" sentence, replace RPO/RTO with measured numbers or the word *unmeasured*, and correct the bucket count to 8. A false durability claim under a customer-facing security page is consumer-protection exposure, not a docs nit.
- [ ] **H2 — Fix or delete `test/disaster-recovery-restore-drill.test.ts`.** It certifies nothing and its 4/4 green has been cited as evidence in two separate checklist sections. Either delete it, or replace it with a test that **fails when no dated drill record exists** — the only assertion of that kind that would have caught this.
- [ ] **H3 — Correct the `security/page.tsx` copy** to what is actually true after A1–A3. If PITR is on and verified, "automated backups" is defensible; if it is not, the sentence has to change.
- [ ] **H4 — Untick the two completed sections in `LAUNCH_CHECKLIST.md`** (§611-616, §649-653) that certify this drill as done. Edit by hand carefully — the page-inventory generator truncates this file from section 14 down when it fails.
- [ ] **H5 — Correct §443-444 of `platform-go-live-2026-09-08.md`,** which states "the backup half genuinely runs". The managed Supabase backup may run; the hourly encrypted offsite dump described in `backup-posture.md` does not exist.
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
| Buckets restored / verified | n of 8 |
| Job photo opened through the app | PASS / FAIL |
| Invoice PDF opened through the app | PASS / FAIL |
| Secrets with no re-derivation path | list |
| Stripe reconciliation procedure | attach |
| Findings raised | |
| Docs corrected (§9) | |

---

## §11 — Out of scope here, covered elsewhere

[vercel-rollback-drill.md](./vercel-rollback-drill.md) (deploy rollback, forward-only schema), [staff-identity-recovery-drill.md](./staff-identity-recovery-drill.md) (identity loss, MFA, break-glass), [secret-rotation-drill.md](./secret-rotation-drill.md) (rotation, distinct from recovery), [clean-slate-onboarding-rehearsal.md](./clean-slate-onboarding-rehearsal.md). Each is referenced above where it carries a dependency; none of them substitutes for this one.
