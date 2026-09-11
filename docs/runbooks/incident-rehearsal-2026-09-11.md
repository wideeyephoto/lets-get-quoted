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

## Verification

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

## Code review and repair — September 11, 2026 (later)

Items 1 and 2 of the remaining-work list below are addressed in source. Nothing
in this section is hosted evidence: no migration has been applied to staging or
production, and `/status` still returns 404 in production.

### The publishing migration was unsafe to apply and has been rewritten

The reviewed version added the column and one policy,
`for select using (published = true)`, with no role and no column restriction.
Three defects, each independently disqualifying:

- **A policy filters rows and says nothing about columns.** Against a published
  row, `select *` would have returned `root_cause`, `owner`, `created_by`,
  `external_url` and `affected_services` — the internal half of a write-up,
  including the staff email that authored it — to anonymous callers. The page
  itself asked for `*`.
- **`TO` was omitted**, so the policy applied to every role rather than to the
  browser roles it was written for.
- **The table's default write grants were never removed.** Supabase grants ALL
  on new tables in `public` to `anon` and `authenticated`, and that ALL includes
  TRUNCATE, which is **not subject to RLS**. `platform_incidents` has therefore
  been truncatable by any browser session since 2026-08-06, believed unreachable
  because RLS was on and no policy existed. This is a pre-existing defect the
  migration would have carried forward; it is now closed by the same file.

The rewritten migration revokes all privileges from `public`, `anon` and
`authenticated`, grants `select` back on exactly ten public columns, scopes the
policy `to anon, authenticated` over published rows, and ends in a `DO` block
that raises if RLS is off, if any browser role holds INSERT/UPDATE/DELETE/
TRUNCATE, or if any of the six internal columns is readable.

A column added by a later migration is not in the grant, so **new columns fail
closed** rather than publishing themselves.

### The status page reported healthy when it could not read

The route logged the query error and then continued with an empty array, so a
database failure rendered **"All Systems Operational"** — the one moment the page
exists for was the moment it reassured every customer. `unavailable` is now a
third state, rendered amber, stating that the platform's health is unknown and
naming a support address. A null payload carrying no error, and missing Supabase
configuration, both resolve to the same state.

The page now selects the named public columns rather than `*`, and reads through
a session-free anon client rather than the cookie-bound server client.
`export const revalidate = 60` is retained but currently inert: the root layout
awaits `headers()`, `cookies()` and the CSP nonce, so every route in this app
renders on demand.

### The operator could not publish anything

`togglePublishIncidentAction` existed with **no caller anywhere in the app**, and
neither incident reader selected `published`. An operator could log and resolve
an incident and had no way to put it in front of a customer, so `/status` could
only ever have been empty. `/admin/incidents` now carries a publish/unpublish
control on open incidents and on every history row, a "Public" column, and a
publish checkbox on the log form, all behind the existing
`requireMfaPermission('ops.manage')` and writing `admin_actions` as before.

### Local evidence

`npm run verify:status-boundary` boots PostgreSQL 17.10, reproduces Supabase's
default grants, applies the three incident migrations in order and then reads
the table **as** `anon` and `authenticated`. 10 checks pass:

| Check | Result |
| --- | --- |
| Pre-migration state: browser roles hold TRUNCATE on an RLS-protected table | reproduced |
| Publishing migration applies; its post-conditions hold | pass |
| `select *` and each of the six internal columns refused, both roles | pass |
| INSERT/UPDATE/DELETE/TRUNCATE refused, both roles | pass |
| Published row visible, unpublished row not, both roles | pass |
| Unpublishing retracts the row from anonymous reads | pass |
| A column added after the grant is unreadable | pass |

`test/status-page.test.ts` adds 13 unit checks covering the unavailable state,
the column list, and the release-versus-incident distinction. Repository-wide
typecheck, lint (0 errors) and `next build` pass; the build lists `/status`.

## Remaining G5 release work

1. ~~Review and apply the publishing migration in staging~~ — **reviewed and
   rewritten**; the public field set is now defined and proved locally. Applying
   it to staging is still outstanding, and remains the next step.
2. ~~Correct the status route's error state; add the route to the sitemap~~ —
   **done in source.** `/status` is in `src/app/sitemap.ts` and in
   `MARKETING_PATHS`, so the app host 308s to the apex rather than answering as a
   duplicate.
3. Deploy the reviewed schema and application release, recording its exact SHA.
4. Rehearse authenticated operator open/update/resolve through the deployed
   `/admin/incidents` controls, check the corresponding `admin_actions` rows, and
   verify the anonymous rendered page after each state. A service-role script
   bypasses operator authorization and cannot prove this.
5. Retain the G5 publication policy and alert deep-link evidence required by
   `docs/prelaunch-gap-closure-plan-2026-09-11.md` before marking the item closed.
   The publication policy — which severities are published, who writes the copy,
   and the target time from page to publish — is still unwritten.
