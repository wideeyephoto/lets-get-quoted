# Database & Storage Backup Posture — Let's Get Quoted

**Status:** ACTIVE & PRODUCTION-HARDENED  
**Target Database:** PostgreSQL 17.6.1 (`mfuvvtrkipkigwqqtcal` on Supabase, `us-west-2`)  
**Storage Assets:** 7 Managed Buckets (`insurance-proof`, `job-photos`, `lead-photos`, `site-videos`, `site-images`, `crew-photos`, `account-attachments`)  
**Last Updated:** 2026-09-01

---

## 1. RPO & RTO Objectives

| Parameter | Objective SLA | Mechanism | Verified Capability |
| :--- | :--- | :--- | :--- |
| **RPO (Recovery Point Objective)** | $\le$ 1 Hour | Hourly automated `pg_dump` with custom binary format (`-Fc`), per-object SHA-256 Storage mirroring, and Supabase continuous WAL archiving (PITR). | Hourly snapshots mirrored to offsite encrypted storage; PITR WAL continuous log retention up to 7 days. |
| **RTO (Recovery Time Objective)** | $\le$ 30 Minutes | Automated restore scripts (`scripts/run-pitr-restore-drill.mjs`) applying schema, dropping ownership constraints (`--no-owner --no-privileges`), and hydrating relational tables. | Verified clean restore of auth users, invoices, jobs, and storage assets in $< 5$ minutes on scratch database. |

---

## 2. Backup Architecture & Infrastructure

### 2.1 Database Rails
1. **Continuous WAL Archiving (Supabase PITR)**:
   - Supabase Point-in-Time Recovery archives database Write-Ahead Logs continuously.
   - Allows second-precision rollbacks to any point within the retention window.
2. **Scheduled Hourly Custom Dumps (`pg_dump -Fc`)**:
   - Out-of-band backup scripts export the full schema and data using PostgreSQL custom format:
     ```bash
     pg_dump --format=custom --no-owner --no-privileges --compress=9 -d "$DATABASE_URL" -f "db_backup_$(date +%Y%m%d_%H%M%S).dump"
     ```
   - Encrypted with GPG (AES-256 symmetric cipher) and replicated to offsite Google Drive storage.

### 2.2 Storage Asset Rails
1. **7 Object Buckets Mirrored**:
   - `insurance-proof`: Contractor COI and general liability proof documents.
   - `job-photos`: Work-in-progress, pre-job, and post-completion field documentation photos.
   - `lead-photos`: Homeowner-submitted property damage/project intake photos.
   - `site-videos`: Contractor hero and showcase promotional video assets.
   - `site-images`: Website builder branding logos, trade banners, and team assets.
   - `crew-photos`: Field worker badges and profile photos.
   - `account-attachments`: Change order PDFs, lien waiver signed notices, and invoices.
2. **Metadata & Blob Integrity**:
   - Object paths structured as `${accountId}/${randomUUID()}.${ext}` maintain strict tenant partitioning.
   - Storage state mirrored with object checksum verification.

---

## 3. Disaster Recovery Restoration Procedure

### 3.1 Pre-Restoration Checks
1. Identify recovery timestamp (UTC) or specific backup archive file (`.dump`).
2. Provision or target an isolated scratch PostgreSQL 17 instance.
3. Validate decryption passphrase against GPG offsite bundle.

### 3.2 Database Restore Execution
```bash
# 1. Restore database without ownership and privileges (preventing supabase admin permission errors)
pg_restore --clean --if-exists --no-owner --no-privileges -d "$SCRATCH_DATABASE_URL" "db_backup.dump"

# 2. Execute verification script to audit relational integrity and counts
node scripts/run-pitr-restore-drill.mjs --target="$SCRATCH_DATABASE_URL"
```

### 3.3 Post-Restore Verification Checklist
- [x] **Auth Users**: Confirm `auth.users` row count matches production snapshot and identities can sign in.
- [x] **Core Tenancy**: Validate `accounts`, `memberships`, and `staff` tables.
- [x] **Financial Records**: Validate `invoices`, `payments`, `billing_events`, and Stripe customer mappings.
- [x] **Field Operations**: Validate `jobs`, `clients`, `quotes`, and `crew_members`.
- [x] **Storage Assets**: Verify signed URL generation and object availability across all 7 buckets.
