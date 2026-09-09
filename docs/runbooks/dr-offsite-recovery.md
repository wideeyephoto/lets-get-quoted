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

## September 9 proof and remaining download check

The 12:49:03.458Z snapshot contains a 10,679,604-byte database archive with 4,348 readable TOC entries and 38 Storage objects totaling 35,726,922 bytes. The pack also authenticates the source and encrypted environment recovery kit. Offline opening passed, as did four wrong-key/tampering rejection tests.

Pack used for the offline recovery verification: `mfuvvtrkipkigwqqtcal-2026-09-09T12-50-32-079Z.tar.aesgcm`.

Ciphertext SHA-256: `1ffebdf0e2be530d8bdca09ab98af672e69719060b1332984032d6a52c4f4782`.

Google Drive web confirms the file exists in cloud storage. A download was requested through Drive, but Chrome reported **Can't download file** and **This page has been blocked by Chrome**. No independent cloud-download hash or restore is claimed. Complete this remaining check by downloading the named file through a user-controlled browser into `C:\dev`, then running the offline opener against that downloaded file and comparing its hash with the receipt.

## Recover on another PC

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

The user also attempted the Drive download and reported that it was blocked. Independent cloud-download recovery remains an explicit open check; no browser-policy workaround was attempted.

See [offsite evidence](evidence/dr-offsite-2026-09-09.json) and [production migration verification](evidence/dr-production-migration-2026-09-09.json).
