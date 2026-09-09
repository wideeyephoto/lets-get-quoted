# Encrypted offsite recovery

Updated September 9, 2026. The user chose to keep Supabase Free and complete offsite backups. PITR remains disabled by that decision; no paid upgrade was submitted.

## Backup location and key

Google Drive account `hello@letsgetquoted.com`, My Drive → LGQ-Backup → disaster-recovery. The desktop path is `G:\My Drive\LGQ-Backup\disaster-recovery`. Google Drive web showed both September 9 archives and reported the latest as **Private to you**, 167.3 MB.

The user confirmed that the recovery key is saved in their Dashlane Secure Note, **Lets Get Quoted - disaster recovery key**. Retrieval from Dashlane has not been independently rehearsed. The scheduled process uses the gitignored `.env.dr-backup.local`; the recovery key and temporary Management API token are excluded from the offsite pack. Never put the key beside the archive in Drive.

Each AES-256-GCM pack contains a fresh PostgreSQL custom archive, Storage objects and manifests, source at the recorded Git commit, working changes, and encrypted local production/staging environment files. It covers configuration present in this checkout; credentials existing only in provider dashboards may need recovery or reissue separately. Metadata is encrypted by the outer pack.

## Schedule and checks

Windows task **LGQ Database Offsite Backup** runs at 08:45 and 20:45 local time on this America/New_York PC, plus catch-up after login. It uses the logged-in user's existing Drive mount. A backup less than ten hours old suppresses duplicate logon runs. The manual full workflow passed in 93 seconds; the registered task's fresh-backup skip returned zero.

The recovery-point target is 12 hours while the PC is running and Drive is connected. This is a target, not a measured availability guarantee. Drive retains 30 days of this pipeline's packs and at least two recent verified copies. Local drill captures are retained separately without automated pruning. Drive is not immutable storage.

Every run authenticates encrypted artifacts and the published mounted copy. Unchanged Storage objects may be reused only after matching source metadata and authenticating the prior artifact; periodic full downloads refresh that cache. The September 9 12:49 UTC run downloaded all 38 objects. A successful mounted read does not independently prove cloud synchronization on every future run.

Inspect `tmp/dr-offsite-status.json`, `tmp/dr-offsite-run.log`, and Task Scheduler. Failed runs retain the prior last-success record, return nonzero, and attempt a local desktop warning. Notification delivery is not an independently measured alerting guarantee.

## September 9 proof and independent cloud download

The 12:49:03.458Z snapshot contains a 10,679,604-byte database archive with 4,348 readable TOC entries and 38 Storage objects totaling 35,726,922 bytes. The pack also authenticates the source and encrypted environment recovery kit. Offline opening passed, as did four wrong-key/tampering rejection tests.

Pack used for the offline recovery verification: `mfuvvtrkipkigwqqtcal-2026-09-09T12-50-32-079Z.tar.aesgcm`.

Ciphertext SHA-256: `1ffebdf0e2be530d8bdca09ab98af672e69719060b1332984032d6a52c4f4782`.

The initial Chrome download was blocked. The user subsequently downloaded `mfuvvtrkipkigwqqtcal-2026-09-09T12-42-53-253Z.tar.aesgcm` from Drive, and independent verification passed at 13:12:04.918Z. Its ciphertext SHA-256 is `ddccdacf0dbdcbfc5aaf5bc5c2f31c5d7986004600a5c8ffc55dc92cc6956bd3`, matching its saved receipt exactly. All inner artifacts authenticated: database archive 10,674,967 bytes / 4,348 readable TOC entries, 38 Storage objects / 35,726,922 bytes, source and encrypted environment. This verifies recovery of cloud-stored bytes; the downloaded archive was not restored into a running database during this check. See [download evidence](evidence/dr-cloud-download-2026-09-09.json).

## Recover on another PC

**September 9 hosted/infrastructure follow-up:** the independently downloaded pack subsequently passed hosted SQL/Auth/Storage and RLS verification. Independent source was rebuilt into a new Vercel project protected by login on all deployments, with staging configuration and no outbound credentials/crons. Later staging permission changes required the tenant-access client adapter for application acceptance. The [dated infrastructure/provider record](infrastructure-provider-recovery-2026-09-09.md) supersedes earlier statements below that these steps had not been attempted, and lists the remaining key/provider/DNS acceptance gates.

**September 9, 20:21 UTC follow-up:** the user-downloaded 12:42 pack was restored into a new loopback-only PostgreSQL cluster. All 260 row counts, 258 table/RLS/grant definitions, 272 policies and 435 functions/grants matched. An existing owner's real RLS check denied other-account jobs. All 38 object files were materialized and hashed, and temporary plaintext data was removed. See [local restore evidence](evidence/dr-downloaded-local-restore-2026-09-09.json). Hosted Auth/Storage and full infrastructure/provider recovery remain separate gates.

To reproduce that isolated check, install the optional `embedded-postgres@17.10.0-beta.17` tooling and PostgreSQL 17 client binaries, then run `scripts/verify-dr-local-restore.mjs --capture=<opened-pack-directory> --key-file=<private-key-file> --out=<new-report.json> --pg-restore=<pg_restore.exe>`. This verifier never accepts a hosted database URL. It excludes an empty Supabase Vault extension and refuses a nonempty Vault; it cannot certify hosted Auth or Storage.

After the September 9 credential rotation, old packs retain historical revoked credentials. Restore the data/source, then supply current replacement credentials from independent escrow or reissue them. Do not re-enable a compromised key to make a recovered environment work. New captures and hosted restore tooling include the private `admin_security` passkey schema.

1. Download a pack, its receipt, and `open-dr-recovery-pack.mjs` from the Drive folder. Install Node.js, tar, and PostgreSQL 17 client tools. Obtain the recovery key independently from Dashlane and save it in a temporary local key file containing only the 64 hexadecimal characters. Keep it out of the synced folder.
2. Run the standalone opener, specifying a new output directory:

   ```powershell
   node .\open-dr-recovery-pack.mjs --pack=<downloaded-pack> --key-file=<local-key-file> --out=<new-directory> --pg-restore=<path-to-pg_restore.exe>
   ```

   It authenticates the outer pack before extraction, rejects nested/link entries, authenticates the inner database, objects and recovery kit, and writes `recovery-verification.json`. It does not expose environment values or restore a database.
3. To materialize source and configuration, repeat the opener with a different new local output directory and `--export-kit`. This deliberately writes plaintext `recovered-source.zip`, `recovered-working-tree.patch`, `recovered-untracked.tar`, and `recovered-environment.json`; use a private, unsynced directory. Extract the source ZIP, apply the patch with Git, and extract the untracked TAR into the recovered repository. The environment JSON maps filenames to their contents; recreate those ignored environment files privately. Restore repository dependencies and place the key in ignored `.env.dr-backup.local` for the repository restore tools. Remove the temporary plaintext kit once recovery is complete.
4. Provision a separate Supabase recovery project and its credentials. Disable outbound jobs/webhooks before loading production-derived data. Run `restore-dr-managed.mjs --capture=<recovered-directory> --env=.env.staging.local --project=<recovery-ref>` as a dry run. It rejects production, source/target equality and unsafe aliases. Applying additionally requires `--apply --confirm-destroy=<recovery-ref>` and destroys that chosen target's contents.
5. Restore Storage with `restore-dr-storage.mjs` using the same explicit target and acknowledgement. Preserve existing dated evidence before another drill. Verify row/grant/policy parity, all object hashes, real RLS tests, existing-user sign-in and application smoke. The earlier staging drill passed 35 real RLS tests after the corrective migration; that is separate from the current offsite pack's offline verification.
6. Reconcile external providers and outstanding jobs before enabling outbound work or changing deployment/DNS. Full infrastructure/provider recovery and full-disaster RTO remain unrehearsed. Staging's SMS cron remains disabled.

The existing USB task also captures database and Storage data. Earlier repository-only inspection missed that implementation. Its September 9 runs verified database and all 38 objects but exposed missing Git worktree branch refs; four refs were restored from their own HEAD reflogs without changing files or indexes. The final 09:07:58 local rerun still failed its repository portion: `pricing-growth-journey` references missing indexed blob `18479a8f32af5f222ea7cbafa818907803d3fad0` for `src/app/dashboard/sites/WebsiteBuilder.tsx`. Its index was not reset because that could discard staged work. Database/Storage verification still passed. The older cloud task's Git/GPG backup is separate from this new, passing encrypted database/Storage pipeline.

The user resolved the download block through their browser. No browser-policy workaround was attempted by the agent. Independent cloud-download authentication now passes; Dashlane retrieval itself and full infrastructure/provider recovery remain unrehearsed.

### USB repair verified at 09:19 local time

The later rerun supersedes the failed USB attempt above: **status `ok`, task exit code 0, eight repositories, 439 loose items, database verified, all 38 Storage objects, zero failures**, completed in 481.3 seconds. Fourteen missing indexed blobs were reconstructed from working files with exactly matching Git object hashes; another 27 historical objects were recovered from the USB mirror. The affected index's SHA-256 remained unchanged. All 37 active `C:\dev` worktrees produce readable binary diffs, and Git connectivity excluding reflogs passes.

Two old OneDrive worktrees have broken Git metadata; the backup successfully captured their full non-rebuildable trees and reported warnings. One old `lgq-pricing-production` reflog entry refers to an unavailable commit; the entry was preserved, and it does not block active repository connectivity or the successful backup. See [USB repair evidence](evidence/dr-usb-repair-2026-09-09.json).

See [offsite evidence](evidence/dr-offsite-2026-09-09.json) and [production migration verification](evidence/dr-production-migration-2026-09-09.json).
