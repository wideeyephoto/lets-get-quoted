# Disaster Recovery & PITR Restore Drill Runbook

**Status:** Approved staging restore completed on 2026-09-09. Database/Auth/Storage acceptance passes after the crew-completion correction; all 35 real RLS tests pass. PITR is disabled and broader disaster recovery remains unverified. See the [measured posture](../backup-posture.md), [execution checklist](disaster-recovery-backup-posture-drill.md), and [drill results](dr-drill-record-2026-09-09.md).

## Capture

Use the existing local credentials. The source must match the explicit project ref. This command performs read-only database operations and downloads Storage files:

```powershell
node scripts/capture-dr-backup.mjs --env=.env.local --ref=mfuvvtrkipkigwqqtcal
```

The command writes an encrypted archive, encrypted Storage objects and manifest, and a capture report under `tmp/dr-captures/`. The snapshot timestamp and source row counts in the report are the reconciliation baseline. This is a manual capture; no scheduling or offsite replication is implied.

## Prepare the restore target

Use a separate Supabase project with real Auth and Storage services. Confirm the exact project is expendable. Shared staging is not approved merely because its credentials exist.

Put its database URL, Supabase URL, anon key, service-role key, and admin allowlist in `.env.scratch.local`. Keep the application disconnected from live provider credentials and traffic during the drill.

Inspect a dry run first, replacing the placeholders with the saved capture directory and the approved target ref:

```powershell
node scripts/restore-dr-managed.mjs --capture="<capture-directory>" --env=.env.scratch.local --project=<approved-project-ref>
```

After the target is approved, use the same command with `--apply --confirm-destroy=<approved-project-ref>`. This replaces the target's captured database objects. Do not invoke an unguarded restore or the production-default `deploy-schema.mjs` helper.

The managed wrapper authenticates the archive, rejects production and URL overrides, extracts the reviewed application schemas and managed data, then uses psql in one transaction with ON_ERROR_STOP. It retains compatible Supabase-owned DDL and migration history, orders managed data by foreign keys, and fails on unreviewed schemas or nonempty source Vault. Disable any destination cron and drain its HTTP queue first. It clears destination schema default grants before creating objects, then restores archive ACLs. The previous raw pg_restore wrapper failed on Supabase-owned event triggers. Inspect and retain complete local logs; exact grants must match after restore. Temporary plaintext archives and SQL are removed. RLS policies and grants are separate: `--no-privileges` discards grants, not RLS policies, and is deliberately not used here.

## Verify recovery

Start the RTO stopwatch before the first restore attempt. Include error remediation and application verification in elapsed time.

1. Compare row counts and schema definitions with `capture-report.json`. Include `accounts`, `memberships`, `staff`, `clients`, `jobs`, `invoices`, `payments`, `estimate_offers`, `auth.users`, and identities.
2. Run the relational validator with `SCRATCH_DATABASE_URL` supplied from the approved target configuration. It never falls back to production's `DATABASE_URL`. This validates core table presence and two foreign-key relationships; it does not reconcile amounts or prove complete recovery.
3. Check RLS and grants against the source baseline, then run `test-staging/field-app-rls.test.ts` using a staging configuration explicitly aimed at the restored project. Capture parity before running fixture-producing helpers.
4. Sign in as an existing restored member and attempt a cross-tenant read. `staging-signin.mjs` may create users and memberships; that behavior must not manufacture the identity being tested.
5. Run `scripts/restore-dr-storage.mjs` with the same capture, env, project and exact apply acknowledgement. It restores each captured object through the destination Storage API and checks signed-download SHA-256, lengths and private/public access. Database metadata is not file content.
6. In an isolated preview, open a job photo, download an invoice PDF, and load key dashboard pages. Only then stop the RTO clock.

Do not call an archive list, unit-test pass, schema count, or relational-validator pass a completed restore. Complete and sign the [dated drill record](dr-drill-record-2026-09-09.md) only when the restore and application checks have actual results.

For this recorded drill, the existing staging target was explicitly approved. Its previous encrypted capture is retained. The isolated preview uses `node scripts/dr-preview.mjs --project=uydlabvgauzujdwuqzxq` on port 3014, masking all local env keys before injecting the staging connection and fake provider keys. Keep cron disabled until provider reconciliation and an intentional traffic decision.


## September 9 production and offsite follow-up

The corrective migration was applied to production and verified by matching the tested staging function definition and grants. No production business rows were changed. The user chose to keep Supabase Free, so PITR remains disabled. Encrypted database, all 38 Storage objects, source and local configuration are now published to Google Drive with a twice-daily schedule and 30-day retention. The user confirmed independent Dashlane key escrow. Mounted readback and offline opening passed; Drive web confirms private cloud presence. Chrome blocked an independent cloud download, so that recovery check remains open. These findings supersede earlier same-machine-only and production-not-modified statements in this historical record. See [offsite runbook](dr-offsite-recovery.md), [offsite evidence](evidence/dr-offsite-2026-09-09.json), and [production migration evidence](evidence/dr-production-migration-2026-09-09.json). Full provider/infrastructure recovery remains unrehearsed.
