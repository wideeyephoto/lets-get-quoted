# Database & Storage Backup Posture — Let's Get Quoted

**Status: staging acceptance passes; the verified corrective migration is applied to production. Encrypted twice-daily Google Drive backups are installed, cloud presence is confirmed, and the user confirms Dashlane key escrow. Independent cloud-download recovery and full disaster recovery remain unproven.**
**Last checked:** 2026-09-09. Production project: `mfuvvtrkipkigwqqtcal`, PostgreSQL 17.6, Supabase organization `LETS GET QUOTED` (Free plan).

## Measured posture

| Item | Verified evidence |
| --- | --- |
| PITR | Disabled: Management API reports `pitr_enabled: false`. |
| Managed recovery points | API reports `backups: []` and `physical_backup_data: {}`. No retention window or backup cadence can be measured. `walg_enabled: true` does not establish PITR availability. |
| RPO | 12-hour target while this PC and Drive are available; availability guarantee unmeasured. PITR remains disabled by the user's keep-Free decision. |
| RTO | Full-disaster RTO unestablished. Initial restore/verification ended after 37m 32.680s with a crew-completion defect. Follow-up acceptance passed 1h 50m 3.457s after the first restore command, including the intervening pause and correction. Infrastructure/provider recovery was not rehearsed. |
| Manual database copy | Captured at 2026-09-09 10:17:00.776Z: 10,630,650-byte custom archive, 4,348 readable TOC entries, including `public`, `auth`, and `storage` data. |
| Manual Storage copy | All 38 objects in the seven current buckets downloaded: 35,726,922 bytes. Every object's length matches source metadata. Metadata was unchanged when checked after capture. |
| Encryption verification | All archive and object files encrypted with AES-256-GCM, read back, authenticated, and compared by SHA-256. |
| Scheduled or offsite backup | Twice daily 08:45/20:45, 30-day Drive retention. Full capture/publication and authenticated mounted readback passed; Drive web confirms private cloud files. Chrome blocked independent download verification. See the offsite runbook. |

Sources: [raw backups response](runbooks/evidence/dr-backups-2026-09-09.json), [capture summary and hashes](runbooks/evidence/dr-production-capture-2026-09-09.json), and [drill results](runbooks/dr-drill-record-2026-09-09.md).

The key is also saved independently in the user's Dashlane, confirmed by the user. The encrypted recovery kit contains source, local environment configuration, database and Storage data. See [offsite operation and recovery](runbooks/dr-offsite-recovery.md) for measured checks and remaining limitations.

## Local capture and recovery tooling

- `scripts/capture-dr-backup.mjs` takes a read-only, repeatable-read database snapshot and gives that snapshot to `pg_dump`. It records row counts, table grants, RLS settings, policy hashes, and function hashes from that snapshot. Storage files are copied separately through the Storage API.
- `scripts/restore-dr-managed.mjs` is the tested hosted-Supabase path; the raw `restore-dr-backup.mjs` rolled back on protected platform ownership. The managed wrapper defaults to a dry run. It rejects the production project, production aliases through the session pooler, connection-string host overrides, and source/target equality. Applying requires the explicitly chosen project and exact destruction acknowledgement. The restore uses one transaction and stops on the first error. It preserves platform DDL, loads managed data in dependency order, and clears destination defaults before replaying archive grants. Exact grant parity is a mandatory post-restore check.
- `scripts/run-pitr-restore-drill.mjs` is a read-only relational validator. It uses `SCRATCH_DATABASE_URL` or an explicit target, never a `DATABASE_URL` fallback. Its output does not certify sign-in, blob availability, RLS, or source/target count parity.
- `test/disaster-recovery-safety.test.ts` tests those guards and reporting logic. Unit tests are not restore evidence.

The PostgreSQL 17.11 client binaries are in `tmp/dr-tools/pgsql/bin`. Encrypted captures are in the gitignored `tmp/dr-captures/` directory. The encryption key is in `.env.dr-backup.local`; the one-day Management API token is in `.env.management.local`. Keep both key files out of commits, deployment environments, and frontend code.

## Recovery results and remaining gates

The approved production snapshot was restored into existing staging. All 258 captured table/RLS/grant entries, 272 policies and 435 function/grant entries matched at baseline. Captured row counts matched with one declared destination-infrastructure exception: staging retains its pre-existing Vault secret. All 38 Storage objects were restored and verified through signed-download hashes. Existing-member sign-in, tenant denial, photo display, invoice generation and dashboard/admin smoke succeeded.

The source function's missing `jobs.completed_at` write initially caused a 29/30 result. The staged forward migration fixes completion and its enum/text boundary and removes anonymous execution. All **35 real RLS tests now pass**. Follow-up comparison confirms only that intended function/grant change. All 12 Auth users' checked fields and all 14 identities match the capture; an authenticated cross-account private Storage download and signed-URL request are denied. App use and migration-history deltas are documented separately from the original parity evidence.

The verified crew-completion migration was applied to production at 12:30 UTC; readback matches the passing staging function exactly, including removal of anonymous execution. No production business rows were changed. Offsite capture/publication, scheduling, cloud presence and user-confirmed Dashlane escrow are established. Independent cloud-download recovery, provider reconciliation, deployment/DNS and broader recovery tiers remain open. Staging's SMS cron remains disabled. See the [dated evidence and limitations](runbooks/dr-drill-record-2026-09-09.md).
