# Office Data API correction — September 11, 2026

## Repository and production findings

The recovery commit `65bcbae28` exists on local `main` in the Windows checkout,
but no origin ref contains it. Remote `main` at `7f32e44c7` contains the incomplete
`20260911000000_office_data_api_security.sql` instead. Its mocked unit test does
not establish any database protection. The earlier 83/83 verification claim is
invalid; it must not be used to close the launch gate.

Read-only production inspection confirmed the reported finance trigger with no
pinned search path, table-wide authenticated SELECT, no masking view, and a
single-column client foreign key. Staging already had the earlier masking-view
candidate. The recovered files and historical evidence are included in this
release so another checkout can inspect them; their dated results are not
evidence for the corrected production release.

## Corrections

- `20260911154456_repair_office_job_write_boundary.sql` removes the defective
  public trigger functions. A private invoker trigger explicitly recognizes the
  service role, checks authenticated actors and current capabilities, and guards
  all ten financial fields on INSERT, UPDATE, and DELETE. A writer without
  `quotes.write` can create/delete a default-zero job but cannot delete a priced
  job and recreate it. Authenticated job identity changes are rejected.
- The migration creates the RLS-backed, security-invoker `job_access` view and
  checks quote visibility through a private actor-checked function. Its write
  trigger preserves confidential values during operational edits. A composite
  client foreign key enforces the parent workspace even for service-role writes.
- Both session-client factories route job requests and nested job selections
  through the view. The service-role factory remains direct. This preserves
  `getJob().select('*')` for permits and voice. No current session job upsert
  caller exists; view upserts remain unsupported.
- `20260911154457_enforce_office_job_read_boundary.sql` removes table-level
  SELECT and grants only operational columns directly. The private view helper
  supplies prices only to the owner or an office actor with current finance-read
  permission. Financial filters, wildcard and whole-row reads cannot bypass it.
- `schema.sql` mirrors the final functions, privileges, constraints, view, and
  the deployed capability-aware job RLS policies. The old mock security test is
  removed. CI runs the native PostgreSQL boundary harness.

## Reproduction and evidence

`npm ci && npm run test:pg17:job-access` boots a disposable PostgreSQL 17 cluster,
uses the actual canonical job columns, defaults, authorization functions and
policies, reproduces the three initial vulnerabilities and the broken migration,
then verifies both corrective phases and their replay. Eleven scenario groups
pass, including service-role and owner controls, all protected fields, INSERT,
UPSERT, DELETE, financial filters, parent constraints, capability revocation,
workspace switching, deactivation, catalog configuration, and client deletion.
No hosted environment file is read by this command.

The default suite tests the real Supabase SDK transport and the shared `getJob`
function separately; those checks are labeled as transport compatibility, not
database authorization. Type checking and the optimized application build passed.
The initial complete unit run passed 14,886 tests and found one stale documented
policy count; that count was corrected and its entire 26-test suite then passed.
The complete rerun passed all 14,887 tests across 1,157 files.

The real browser/API runner is `scripts/verify-tenant-office-browser.mjs`; fixture
setup and cleanup are in `scripts/tenant-office-fixtures.mjs`. Targets, credential
file, fixture directory and release identity are explicit. It uses Auth-issued
sessions in separate browsers, checks the admin-client price write and the
getJob-backed permits history route, and reconciles and deactivates its marked
fixtures. No customer records or delivery destinations are used.

The refreshed staging run passed all 47 browser/API cases and verified zero
active fixture memberships, sessions and grants after cleanup. Its evidence is
[recorded here](office-data-api-staging-evidence-2026-09-11.json). The initial run
had one stale expected rejection message; the database correctly denied the
operation and retained its original values. A captured staging screenshot also
caught an entrance transition before the main content was visible; the runner
now waits for the heading and its ancestors to be visible before scoring and
capturing production pages.

## Rollout status and order

Both corrective phases are applied in staging. Production phase one was applied
on September 11 and verified: the legacy finance guard is absent, the private
INSERT/UPDATE/DELETE guard exists, and `job_access` exists. Security advisors
reported no finding for the new job boundary. Production raw reads remain
unchanged until the application adapter is deployed.

1. Apply phase one; verify service-role writes and the parent constraint.
2. Deploy this application release, retaining its exact SHA and deployment ID.
3. Apply phase two; verify raw price reads are denied and session wildcard reads
   through the view still work.
4. Run the authenticated production rehearsal and record cleanup before closing
   FINANCE-REST, WRITER-FINANCE and WRITER-FOREIGN-PARENT in the launch tracker.

The September 9 migrations are historical artifacts. On existing production use
the two new corrective migrations above; do not replay the old broken migration
or the full canonical schema. Keep the adapter when rolling back unrelated app
changes after phase two. Restoring raw financial SELECT would reopen disclosure.
