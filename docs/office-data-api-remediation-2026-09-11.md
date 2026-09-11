# Office Data API correction — September 11, 2026

## Repository and production findings

At the start of this audit, recovery commit `65bcbae28` existed on local `main`
in the Windows checkout, but no origin ref contained it. Remote `main` at
`7f32e44c7` contained the incomplete
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

The final staging run on `561408f85be82f7079ce0d9e698a2f95b1e91b17` passed all
47 browser/API cases from 16:40:55 to 16:41:40 UTC and verified zero active fixture
memberships, sessions and grants after cleanup. Its evidence is
[recorded here](office-data-api-staging-evidence-2026-09-11.json). It used the
optimized production build against the hosted staging database, not a Vercel
deployment. The focused redirect/context tests passed 33/33 and the optimized
build passed. The first optimized run fixed all three denial redirects but hit
one network fetch failure; the complete fresh-fixture rerun passed.
Earlier diagnostic runs exposed a stale expected rejection message and screenshot
timing during an entrance transition. The final runner verifies visible content
and accepts legitimate denial pages that render a paragraph without a heading.

## Rollout status and order

Both corrective phases are applied in staging and production. PR #78 merged as
`b1bb7f172ee1042f13bfaf5816318d467f5193f3`; production deployment
`dpl_6aT9U7w7GpzkDN9Y1RsM4PBDwjgm` became READY and the live
`app.letsgetquoted.com` alias was explicitly assigned and verified before phase
two was applied. The alias had remained on the prior deployment after the Git
build completed, so the deployment status alone was insufficient.

Production migration history records `repair_office_job_write_boundary` at
`20260911155729` and `enforce_office_job_read_boundary` at `20260911162539`;
the hosted migration service assigns its own application timestamp. The SQL
hashes in the browser evidence identify the committed migration bodies.
Raw authenticated table/price SELECT and TRUNCATE are denied; operational-column
SELECT and service-role table SELECT remain enabled. The composite parent key
is present and security advisors report no finding for the new job boundary.

The initial [production rehearsal](office-data-api-production-initial-2026-09-11.json)
passed 44/47 cases and verified cleanup. All data-boundary, service-role pricing,
owner quote-save and session permits checks passed. Three denial pages emitted
React #310 during a streamed redirect, despite recovering to the correct
destination. The same Router/useMemo failure reproduced in a local optimized
build. PR #79 moves these read-page denials ahead of the dashboard loading
boundary while retaining the existing page guards for every client navigation.
The upstream [React issue](https://github.com/react/react/issues/33580) describes
the corresponding hydration/transition hook failure.

The final production run passed **47/47** from **16:53:14 to 16:54:40 UTC** on
September 11. The live hostname was verified against merged commit
`1633473fb0253b757b31d3e2f85cf6d3297f730d` and READY production deployment
`dpl_4xoqSw1KS1XwC2DbhzTv4nknkTXc` before the run. See the
[complete production evidence](office-data-api-production-evidence-2026-09-11.json)
and [database catalog checks](office-data-api-production-catalog-2026-09-11.json).
The final release passed CI, including all 14,890 unit tests, the PostgreSQL
boundary harness, type checking, lint and build. Its first CI attempt hit an
unrelated randomized merchandise order-number collision assertion; the unchanged
suite passed locally and the complete CI retry passed.

Cleanup removed the two fixture clients and two jobs, revoked sessions and grants,
deactivated memberships and suspended the two test workspaces. An independent
database check also confirmed zero remaining jobs, clients, active memberships,
sessions and grants for **all three production fixture sets** used during the
initial run, redirect diagnosis and final run. Suspended marked workspaces and
test identities are retained for audit. The cleanup checks are recorded in
[this reconciliation](office-data-api-production-cleanup-2026-09-11.json).

The restricted [job page](office-data-api-evidence-2026-09-11/office-job-detail.png)
and [revoked-access page](office-data-api-evidence-2026-09-11/office-grants-revoked.png)
were visually inspected. **FINANCE-REST, WRITER-FINANCE and
WRITER-FOREIGN-PARENT are closed**, along with the service-role regression,
schema/replay/search-path gaps and invalid test evidence described above. This
does not close unrelated launch, Storage concurrency, Realtime or invitation gates.

The completed rollout order, for reference:

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
