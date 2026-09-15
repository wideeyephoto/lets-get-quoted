# Dispatch write contract repair — September 8, 2026

The authorized staff call at 20:51 UTC found the correct job but its note write
returned PostgreSQL `42703`. No action ledger or job-feed entry committed.
The September 4 lead-creation migration had replaced the private hardened
implementation with a legacy body that wrote `jobs.notes`, obsolete labor
tables, and obsolete quote fields. The current live-call wrapper was intact.

`20260908205505_voice_dispatch_contract_restore.sql` restores the supported
job-feed, client-note, costs, draft-change-order, and lead contracts. It retains
optional lead phone/default create, current staff lifecycle and assignment
checks, atomic writes, exact-request replay, and private function privileges.
It also removes financial writes from this implementation. The public wrapper
continues to enforce the live call and saved outcome snapshot without an OTP.

The note outcome now contains the exact saved text. The application readback
uses that snapshot when available and retains the generic confirmation for
older durable outcomes that did not contain it.

## Verification

- 31/31 disposable PostgreSQL 17 checks passed against the relevant migration
  sequence, including the intervening legacy replacement and repeated repair.
- 52 focused application tests passed.
- The migration is installed in production. An authorized-call transaction
  verified an applied note, its exact saved snapshot, and one feed entry, then
  rolled back. A separate read verified zero committed actions from that probe.
  This is a hosted transaction check, not a completed phone-save acceptance.
- Security advisors did not name the changed function. The private function
  remains unavailable to public, anonymous, authenticated, and service roles;
  application callers must use the guarded public wrapper.
- The hosted verifier now compares the private function body with this reviewed
  migration. Checking columns and grants alone did not detect this regression.

Run the current-contract regression with `LGQ_VOICE_CURRENT_CONTRACT=1 node
scripts/verify-voice-contractor-dispatch.mjs`. The default preserves the original
migration-only regression. Both use a disposable database and make no provider
requests. The harness uses UTF-8 on Windows and exits unsuccessfully on fatal
setup errors.

## Release and containment

Database repair takes effect immediately; spoken saved-text readback requires
the application release. Do not roll back to the incompatible private body.
If a new write defect appears, contain the affected action at the tool boundary
while preserving signed callbacks, receipts, and existing action evidence.
Any uncertain write must be inspected by exact call/request before retrying.
The production repair does not manually replay the user's failed note.

Handset recheck, final application deployment, and strict revised cutoff
evidence are tracked in the unified production checklist.
