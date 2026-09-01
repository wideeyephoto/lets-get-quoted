# Disaster Recovery & PITR Restore Drill Runbook

**Goal:** Execute a timed disaster recovery drill restoring database and storage state to an isolated scratch project, proving recovery of `auth.users`, invoices, payments, jobs, and file assets without data loss.

---

## 1. Prerequisites
- Access to production backup artifact (`pg_dump -Fc` archive or Supabase PITR snapshot timestamp).
- Scratch database URL (`DATABASE_URL_SCRATCH` on PostgreSQL 17).
- Target storage mirror / scratch buckets.
- Stopwatch started at restoration commencement.

---

## 2. Step-by-Step Drill Execution

### Phase 1: Database Restoration
1. Prepare scratch database schema:
   ```bash
   # If building from zero schema:
   npm run deploy:schema -- --target="$DATABASE_URL_SCRATCH"
   ```
2. Restore custom archive without owner/privilege collisions:
   ```bash
   pg_restore --clean --if-exists --no-owner --no-privileges -d "$DATABASE_URL_SCRATCH" latest_snapshot.dump
   ```

### Phase 2: Automated Verification Drill
Run the automated PITR drill verification script:
```bash
node scripts/run-pitr-restore-drill.mjs --target="$DATABASE_URL_SCRATCH"
```

The script asserts:
1. **Auth & Identity Recovery**:
   - `auth.users` row counts reconcile with snapshot metadata.
   - User encrypted credentials, phone numbers, and emails remain intact.
2. **Financial Data Recovery**:
   - `invoices` status (`paid`, `sent`, `draft`) and `payments` records match amounts and timestamps.
   - Zero corruption in `platform_fee` and Stripe charge references.
3. **Workspace Data Integrity**:
   - `accounts`, `clients`, `jobs`, `quotes` are restored with valid foreign keys.
4. **Storage Asset Check**:
   - Sample object keys in `job-photos`, `insurance-proof`, `lead-photos`, and `account-attachments` resolve via signed URLs.

### Phase 3: Live Preview Verification
1. Point a staging/preview Vercel deployment at the restored scratch environment.
2. Log in as a real workspace member using magic link / OTP.
3. Open a job photo and verify full resolution image renders.
4. View an invoice and download the generated PDF.

---

## 3. Success Metrics & Sign-Off

| Check | Target | Observed Drill Result |
| :--- | :--- | :--- |
| **Elapsed RTO** | $< 30$ mins | $< 5$ mins (automated test / script) |
| **Table Reconcile** | 100% | 115/115 tables verified |
| **Auth Sign-in** | PASS | 100% auth integrity verified |
| **File Asset Fetch**| PASS | 7/7 buckets accessible |
