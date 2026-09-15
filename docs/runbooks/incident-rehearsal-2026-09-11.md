# Incident rehearsal verification — September 11, 2026

G5 remains open. The database rehearsal in commit `fd95b5990` was present, but
could not substantiate an incident cycle. Inspection started from `65bcbae28`.

## Runner corrections

- Use the schema's valid `warning` severity instead of `minor`.
- Fail with a nonzero exit for missing credentials and API errors; a failed
  anonymous request cannot count as proof that a draft is hidden.
- Check schema and anonymous access before writing a fixture. Support an explicit
  `--env-file` without mixing it with credentials inherited from another project.
- Verify publish, content update, and resolution through anonymous reads. Verify
  returned mutation data so missing/unchanged rows cannot pass.
- Always attempt cleanup, including after a lost insert response. Scope deletion
  to a generated ID and unique creator marker, verify absence as admin and anon,
  and preserve both the primary and cleanup failures when both occur.
- State the evidence boundary: this exercises the database/API, not authenticated
  operator actions, `admin_actions`, or the rendered `/status` page.

## Initial verification, before migration approval

`npm run test:incident-rehearsal` exercises the runner through the real Supabase
JavaScript client with an in-memory transport. All 21 tests pass, including
injected access errors, failed/ineffective mutations, stale reads, missing
credentials, environment isolation, and cleanup failures. These tests validate
the runner; they do not establish hosted RLS correctness.

The actual staging command was:

```powershell
npm run rehearse:incident-cycle -- --env-file .env.staging.local
```

It exited **1** before creating a fixture:

```text
FAIL: Admin schema preflight: column platform_incidents.published does not exist (42703)
```

Read-only catalog checks of staging (`uydlabvgauzujdwuqzxq`) and production
(`mfuvvtrkipkigwqqtcal`) both found the existing 16 incident columns, no `published`
column, RLS enabled, no policies, and an existing anonymous SELECT grant. The
publishing migration is therefore absent from both inspected schemas. No hosted
schema changes or incident writes were made in this verification.

Anonymous HTTP checks found:

| Endpoint | Result |
| --- | --- |
| `https://letsgetquoted.com/status` | 404 |
| `https://letsgetquoted.com/sitemap.xml` | 200; no `/status` entry |

## Gaps identified during the initial verification

1. Review and apply the publishing migration in staging, then repeat the real
   database/API rehearsal. The proposed policy exposes every selectable column
   of a published row, including `owner`, `created_by`, `root_cause`, and
   `external_url`; define the intended public fields before deploying it.
2. Correct the status route's error state: its current source logs a database
   error, then treats an empty result as “All Systems Operational.” Add the route
   to the sitemap; it is absent from the current sitemap source as well.
3. Deploy the reviewed schema and application release, recording its exact SHA.
4. Rehearse authenticated operator open/update/resolve, check the corresponding
   `admin_actions` rows, and verify the anonymous rendered page after each state.
   A service-role script bypasses operator authorization and cannot prove this.
5. Retain the G5 publication policy and alert deep-link evidence required by
   `docs/prelaunch-gap-closure-plan-2026-09-11.md` before marking the item closed.

## Subsequent staging verification

The corrected public-column migration
`20260911150644_platform_incident_public_boundary.sql` was applied to staging
after approval. The real API rehearsal passed with fixture
`88653710-7042-43ff-b9f8-6d621b264fae`; cleanup was verified. Staging security
advisors reported no finding referencing `platform_incidents` afterward.

A second staging fixture, `3784c893-d22a-41f3-a0a9-f1bf3d45d122`, exercised the
local Next.js page at `http://localhost:3031/status`. Anonymous HTTP checks and
browser reads verified hidden draft, visible publication, visible copy update,
and resolved history. Every HTTP response returned 200 with the CSP nonce
header; no framework error overlay appeared. Cleanup was verified. The
unavailable state was also observed before the staging migration.

The isolated release checkout is `C:\dev\g5-incident-release-20260911`, based on
remote `main` at `7f32e44c7`. It excludes unrelated unpublished local work and
adds the public field boundary, explicit operator controls, truthful unavailable
state, separate active/history reads, sitemap entry, alert/cockpit links, and
[publication policy](public-incident-channel.md).

These are staging and local-page results, not a production operator rehearsal.
Production migration approval and release verification are tracked separately.

## Release validation and deployment hold

- The rehearsal runner now passes 22 tests, including page-observation failure
  cleanup. The database policy tests pass both initial-schema and prior-policy
  scenarios, including replay, private columns, public write denial, publication
  timestamps, and compatibility with older service-role inserts.
- Type checking and the production build passed. Lint passed with existing
  repository warnings. The full unit run found one public company-email exposure
  in the new page; the support link was corrected to `/contact`, and the focused
  status, operator, and company-email tests then passed (15 tests). The final
  complete rerun passed all 14,897 tests across 1,159 files.
- The production staff security page reports an MFA-verified session. No live
  operator mutations were performed.
- Automatic approval review rejected application of the migration to production
  project `mfuvvtrkipkigwqqtcal`, requesting explicit approval of that project and
  the published-incident public-read change. The identical SQL has passed staging,
  but production remains unchanged until that specific approval is supplied.

The release contains only the final restricted-column migration. It does not
ship the earlier broad public-read policy as an intermediate migration.
