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

## Deployed verification instrument — September 11, 2026

`npm run verify:status-deployed` probes a running deployment, read-only, over
GET only. It is the counterpart to the local PostgreSQL run: that one proves the
migration is correct, this one proves *the database this product talks to* got
it, and that the rendered page did not print the internal half anyway.

It checks, in one run: the anonymous page returns 200; the banner is the expected
state and no other; caller-supplied text that must appear does; caller-supplied
internal text does **not** (pass the fixture's own root cause, owner and external
URL verbatim); no internal column name is rendered; the sitemap lists the route;
the app host 308s to the apex. Given the two public Supabase values it also asks
the hosted Data API directly, and requires it to refuse anonymous `select=*`,
`root_cause`, `owner`, `created_by` and `external_url` while still serving the
public column list and returning no unpublished row.

It could not be pointed at production from the authoring session: outbound
network there is restricted to package registries and every request to the site
returned the proxy's 403. It was instead exercised against a local mock
deployment across five scenarios — healthy, leaking the internal fields, `/status`
missing, wrong banner state, and absent from the sitemap. The healthy case passes
8 checks and exits 0; each of the other four exits 1 and names what was wrong.
**The instrument is tested; the deployment is not.**

## Remaining G5 release work

Procedure, with the command and PASS criterion for each step:
[status-page-release-2026-09-11.md](status-page-release-2026-09-11.md).

1. ~~Review and apply the publishing migration in staging~~ — **reviewed and
   rewritten**; the public field set is now defined and proved locally. Applying
   it to staging is still outstanding, and remains the next step.
2. ~~Correct the status route's error state; add the route to the sitemap~~ —
   **done in source.** `/status` is in `src/app/sitemap.ts` and in
   `MARKETING_PATHS`, so the app host 308s to the apex rather than answering as a
   duplicate.
3. Deploy the reviewed schema and application release, recording its exact SHA.
   **Not run.** Needs Vercel deploy authorisation and a production connection
   string.
4. Rehearse authenticated operator open/update/resolve through the deployed
   `/admin/incidents` controls, check the corresponding `admin_actions` rows, and
   verify the anonymous rendered page after each state. A service-role script
   bypasses operator authorization and cannot prove this. **Not run.** Needs a
   deployed release and a staff account with `ops.manage` and MFA. The eight-step
   sequence and its probe invocations are in the release procedure.
5. ~~Retain the G5 publication policy~~ — **written**:
   [status-page-publication-policy.md](status-page-publication-policy.md) covers
   which severities publish, the mapping from all eight operational alert
   categories, who writes the copy, target times, the overnight posture for a
   single operator, and the limitation that the page cannot report its own worst
   case. Its §4 and G7's overnight paging policy must end up naming the same
   categories.
   The **alert deep link** from `sendOperationalEmergencyAlert` is still not
   built, and is still required before G5 closes.


## Hosted release addendum — September 11, 2026, 20:45 UTC

**G5 remains open.** The hosted migrations, exact-SHA release gates, production
promotion and anonymous probes through operator row 7 passed. The operator
rehearsal is **incomplete and has deviations**, so Step 3 is not marked passed:
row 8 (deletion) is blocked by automatic approval review, and a browser session
for staff without `ops.manage` has not been supplied. Two rehearsal rows remain
internal; neither is public. The live status page is operational.

This addendum records a new hosted execution; all earlier entries above are
preserved as historical evidence. The publication policy was not changed.
Alert deep-link and independent-outage-channel work were outside this execution.

### Release identity and Step 0

- Repository/branch: `wideeyephoto/lets-get-quoted`,
  `claude/prelaunch-checklist-oocmbu` (fetched and pulled before work).
- Shipped and validated Git SHA: `fa0429f1087c1fdf3f41c3dbdc64c0fcccb82b04`.
- Production Vercel deployment: `dpl_6Z5vRfRbTNRqybasVuQxEADzZqLb`.
- Deployment URL: <https://lets-get-quoted-36biwure4-lets-get-quoted.vercel.app>.
- Vercel Git-source SHA and `meta.githubCommitSha` both equal the full shipped
  SHA above. The hosted build log reports cloning commit `fa0429f`.
- Staging Supabase: `uydlabvgauzujdwuqzxq`; production:
  `mfuvvtrkipkigwqqtcal`. Credentials are deliberately absent from this record.

The full Step 0 suite first passed on `b48458e170c3e0344ea733ac8ba00440834dce8f`,
then on the operator-controls commit, and finally on the exact shipped SHA.
The final run used a normal Windows user, not root. The boundary script started
real PostgreSQL 17.10. No test or migration assertion was removed or weakened.
No Step 0 gate failed. Existing lint/build warnings remained; all exit codes
were zero.

| Gate on fa0429f1087c1fdf3f41c3dbdc64c0fcccb82b04 | UTC start → finish | Result |
| --- | --- | --- |
| `npm run verify:status-boundary` | 20:16:30 → 20:16:35 | exit 0, 10 checks |
| `npm test` | 20:16:35 → 20:17:46 | exit 0, 15,090 tests / 1,182 files |
| `npm run typecheck` | 20:17:46 → 20:17:55 | exit 0 |
| `npm run lint` | 20:17:56 → 20:17:58 | exit 0 |
| `npm run build` | 20:17:58 → 20:22:00 | exit 0 |

Raw final boundary output:

```text

> lets-get-quoted@0.1.0 verify:status-boundary
> node scripts/verify-status-page-boundary.mjs

PASS reproduced the pre-migration state: browser roles hold TRUNCATE on an RLS-protected table
PASS publishing migration applied, post-conditions held
PASS anon cannot read any internal incident column, including through select *
PASS anon cannot write platform_incidents by any statement, TRUNCATE included
PASS anon reads the published row and only the published row
PASS authenticated cannot read any internal incident column, including through select *
PASS authenticated cannot write platform_incidents by any statement, TRUNCATE included
PASS authenticated reads the published row and only the published row
PASS unpublishing retracts the row from anonymous reads
PASS a column added by a later migration is not readable — new columns fail closed

OK — 10 checks passed against PostgreSQL 17.10.
```

### Code change and ordering deviations

The requested browser table could not be completed with the original UI:
creation had no root-cause input, and the incident page had no description-edit
or delete controls. A source change was therefore necessary. Commit
`0fa9870882ed9422b433c7632fdcd29a68d2e2d7` added those narrowly scoped controls,
their MFA/`ops.manage` server actions and attributed audit writes, retained the
root cause when resolving, and added nine targeted action tests. Deletion
requires explicit confirmation and an unpublished row. Description editing
updates only the description; an already published incident stays published.
The full gates passed again before any hosted migration ran.

Two concurrent upstream updates arrived while pushing: the G6 legal brief
(`0d7bfd878`) and Stripe Terminal correction (`e8ef2e18b`). Both were merged
without discarding remote work. The migrations had already run from the fully
validated operator-controls commit. After the merges, Step 0 was repeated in
full on the final SHA before deployment. This changed the candidate after the
migrations, so the execution is not claimed to have followed an unchanged-SHA
sequence throughout. The migration, migration runner, staging rehearsal and
public probe were unchanged across those commits. The migration Git blob was
`a4913b3bebbc408ed109393549584838b6c5c78e` in both candidates. It was not blindly
reapplied. Both hosted migrations completed before the production deployment.

### Step 1 — staging migration and incident cycle

The commands below received the staging connection string through the child
process environment (the Windows equivalent of the runbook's inline
`DATABASE_URL='<staging>'` assignment). Each command exited 0. Neither migration
raised a DO-block assertion.

`node scripts/run-migration.mjs 20260911094000_platform_incidents_published.sql --check`
— 2026-09-11T20:12:46.243Z:

```text
Connected — Postgres 17.6
Migration: 20260911094000_platform_incidents_published.sql (107 lines)

--check: connected and read the file. Nothing was run.
```

`node scripts/run-migration.mjs 20260911094000_platform_incidents_published.sql`
— 2026-09-11T20:13:01.067Z:

```text
Connected — Postgres 17.6
Migration: 20260911094000_platform_incidents_published.sql (107 lines)

Applied in 330ms.
```

`npm run rehearse:incident-cycle -- --env-file .env.staging.local`
— run after the staging migration and before the production migration; exit 0:

```text

> lets-get-quoted@0.1.0 rehearse:incident-cycle
> node scripts/rehearse-incident-cycle.mjs --env-file .env.staging.local

Incident database/API rehearsal target: https://uydlabvgauzujdwuqzxq.supabase.co
Creating draft fixture 5da5da46-0883-47bb-8bbd-dd8a32be509e
PASS: draft hidden from anonymous reads
PASS: published incident visible anonymously
PASS: incident update visible anonymously
PASS: resolution visible anonymously
PASS: fixture 5da5da46-0883-47bb-8bbd-dd8a32be509e removed; cleanup verified
PASS: database/API incident cycle. Deployed page and operator audit trail remain separate G5 checks.
```

### Step 2 — production migration, promotion and baseline

The same migration commands received only the production connection string in
their selected environment. Both exited 0; no assertion raised.

`node scripts/run-migration.mjs 20260911094000_platform_incidents_published.sql --check`
— 2026-09-11T20:13:31.013Z:

```text
Connected — Postgres 17.6
Migration: 20260911094000_platform_incidents_published.sql (107 lines)

--check: connected and read the file. Nothing was run.
```

`node scripts/run-migration.mjs 20260911094000_platform_incidents_published.sql`
— 2026-09-11T20:13:43.371Z:

```text
Connected — Postgres 17.6
Migration: 20260911094000_platform_incidents_published.sql (107 lines)

Applied in 226ms.
```

The deployment was created from the frozen Git SHA with automatic custom-domain
assignment disabled, waited until READY, and then explicitly promoted. Raw
promotion output:

```text
Vercel CLI 59.16.0 (Node.js 24.18.0)
Fetching deployment "dpl_6Z5vRfRbTNRqybasVuQxEADzZqLb" in lets-get-quoted…
> Fetching deployment "dpl_6Z5vRfRbTNRqybasVuQxEADzZqLb" in lets-get-quoted…
Promote in progress…
Promote in progress…
Promote in progress…
Promote in progress…
> Promote in progress…
> Success! lets-get-quoted was promoted to lets-get-quoted-36biwure4-lets-get-quoted.vercel.app (dpl_6Z5vRfRbTNRqybasVuQxEADzZqLb) [2s]
```

Both aliases were verified against the deployed SHA after promotion:

```json
{
  "captured_at": "2026-09-11T20:28:38.856Z",
  "aliases": [
    {
      "host": "letsgetquoted.com",
      "id": "dpl_6Z5vRfRbTNRqybasVuQxEADzZqLb",
      "sha": "fa0429f1087c1fdf3f41c3dbdc64c0fcccb82b04",
      "state": "READY"
    },
    {
      "host": "app.letsgetquoted.com",
      "id": "dpl_6Z5vRfRbTNRqybasVuQxEADzZqLb",
      "sha": "fa0429f1087c1fdf3f41c3dbdc64c0fcccb82b04",
      "state": "READY"
    }
  ]
}
```

The apex `/status` answered 200; the app host `/status` answered 308 to the
apex. The authenticated app-host incident page also loaded successfully after
promotion. A read of production before the baseline found no published
incidents.

The deployed public Supabase settings were compared with the probe inputs and
matched. `NEXT_PUBLIC_SUPABASE_ANON_KEY` is a public `sb_publishable_` key in
this environment. No service-role key was passed to the probe. A supplemental
launcher initially assumed a JWT-format anon key and stopped before running
the probe; only that external launcher's format validation was corrected to
accept the deployed publishable key. The repository probe was unchanged.

Baseline command (the two values were supplied without printing them):

`node scripts/verify-deployed-status-page.mjs --host letsgetquoted.com --expect operational --supabase-url "$NEXT_PUBLIC_SUPABASE_URL" --anon-key "$NEXT_PUBLIC_SUPABASE_ANON_KEY"`

```text
PASS anonymous /status returns 200
PASS page shows "operational" and no other state
PASS page names no internal column
PASS sitemap lists /status
PASS app host 308s /status to the apex
PASS Data API refuses anonymous select=*
PASS Data API refuses anonymous root_cause
PASS Data API refuses anonymous owner
PASS Data API refuses anonymous created_by
PASS Data API refuses anonymous external_url
PASS Data API allows the public column read and returns no unpublished row

OK — 11 checks passed against https://letsgetquoted.com at 2026-09-11T20:28:16.018Z.
```

### Step 3 — browser operator observations and exceptions

Operator: `brett.arnold@live.com`, `super_admin`, staff ID
`72ffe849-9ad4-4270-80d3-ce289cfa38d4`. The existing browser session's Security
page showed **MFA verified**. No account role or authentication factor was
changed. The deployed `https://app.letsgetquoted.com/admin/incidents` UI was used
for the operator actions. Audit rows below identify `ops.manage`.

Rehearsal start: `2026-09-11T20:28:41.6035333Z`.

- Primary incident: `49e3e418-9fa6-4f1d-a001-28f1972dde1a`.
- Extra draft: `aa121fc1-b0b4-406e-801b-ddc76aedf850`.
- Title: `[REHEARSAL] Status page verification 2026-09-11 fa0429f10`.
- Stored root cause / forbidden marker: `G5-PRIVATE-ROOT-20260911-fa0429f10`.
- Stored owner / forbidden marker: `g5-private-owner-fa0429f10@example.invalid`.
- Stored external URL / forbidden marker:
  `https://internal.example.invalid/G5-fa0429f10`.

**Duplicate-submission deviation:** after the initial browser-tool click on
"Log it", the page did not immediately navigate. Before retrying the submit,
the database was inspected and contained two unpublished fixtures, created at
20:29:36.626Z and 20:29:36.676Z. Vercel runtime logs showed two separate
`POST /admin/incidents` requests at 20:29:25 and 20:29:27, both 303, followed by
successful GETs. The cause of the two requests was not established. A
supplemental fixture-count assertion failed with `2 !== 1`; it is not recorded
as passing. Reloading the page showed both internal rows. Subsequent actions
were scoped to the primary incident; the extra draft was never published.

**Deletion blocker:** attempts to submit the extra draft's delete form did not
remove it. An explicit browser click was then rejected by automatic approval
review with this message:

> This submits an irreversible production deletion; the browser policy requires fresh user confirmation at action time, and the transcript contains no such re-confirmation.

Fresh approval was requested for deletion of both identified fixtures. No
alternate database deletion or bypass was attempted. No deletion audit row is
claimed. Cleanup and row 8 remain unexecuted pending that approval.

| Runbook row | Browser observation / result |
| --- | --- |
| 1 | Warning, publish unticked, exact owner/root cause saved. Public column shows internal. **Deviation:** two drafts were created, not one. |
| 2 | Operational probe passed; both unpublished drafts are absent anonymously. |
| 3 | Primary fixture published through the confirmation control. Exact banner: "Published. It is on letsgetquoted.com/status now." Probe passed. |
| 4 | Incident-state probe passed with title required and actual private markers forbidden. |
| 5 | Description edited through "Save and re-publish". Banner: "Description updated. Published incidents show the new text on /status." Updated text required by probe; passed. |
| 6 | Resolved with "Rehearsal completed fa0429f10. No customer outage occurred." Browser showed "Marked resolved." Root cause remained populated. Operational/resolution probe passed. |
| 7 | Unpublished through the UI. Banner: "Unpublished. It is off /status and visible to staff only." Probe passed with title, update and resolution forbidden. |
| 8 | **NOT RUN / NOT PASSED:** deletion awaits fresh approval. Both rows still exist internally. There is no post-deletion probe output. |

The separate non-`ops.manage` staff browser check is **NOT RUN / NOT PASSED**.
An existing account/session was requested, but none has been supplied. Unit
authorization tests and the privileged operator's session are not substitutes
for this required negative browser check.

### Raw deployed probes for the eight operator rows

All executed probes used the unchanged repository script, the apex host, the
production Supabase URL and only its public publishable/anon key. Rows 1 and 3
were also probed so every executed table row has its own output. Every row
forbade all three actual private markers above. Rows 1/2 additionally forbade
the title; rows 3–6 required it; row 5 required the edited description; row 6
required the resolution; row 7 additionally forbade title, update and resolution.

#### Operator row 1 — raw probe output (exit 0)

```text
PASS anonymous /status returns 200
PASS page shows "operational" and no other state
PASS page withholds internal text: "G5-PRIVATE-ROOT-20260911-fa0429f10"
PASS page withholds internal text: "g5-private-owner-fa0429f10@example.invalid"
PASS page withholds internal text: "https://internal.example.invalid/G5-fa0429f10"
PASS page withholds internal text: "[REHEARSAL] Status page verification 2026-09-11 fa0429f10"
PASS page names no internal column
PASS sitemap lists /status
PASS app host 308s /status to the apex
PASS Data API refuses anonymous select=*
PASS Data API refuses anonymous root_cause
PASS Data API refuses anonymous owner
PASS Data API refuses anonymous created_by
PASS Data API refuses anonymous external_url
PASS Data API allows the public column read and returns no unpublished row

OK — 15 checks passed against https://letsgetquoted.com at 2026-09-11T20:37:59.477Z.
```

#### Operator row 2 — raw probe output (exit 0)

```text
PASS anonymous /status returns 200
PASS page shows "operational" and no other state
PASS page withholds internal text: "G5-PRIVATE-ROOT-20260911-fa0429f10"
PASS page withholds internal text: "g5-private-owner-fa0429f10@example.invalid"
PASS page withholds internal text: "https://internal.example.invalid/G5-fa0429f10"
PASS page withholds internal text: "[REHEARSAL] Status page verification 2026-09-11 fa0429f10"
PASS page names no internal column
PASS sitemap lists /status
PASS app host 308s /status to the apex
PASS Data API refuses anonymous select=*
PASS Data API refuses anonymous root_cause
PASS Data API refuses anonymous owner
PASS Data API refuses anonymous created_by
PASS Data API refuses anonymous external_url
PASS Data API allows the public column read and returns no unpublished row

OK — 15 checks passed against https://letsgetquoted.com at 2026-09-11T20:38:04.988Z.
```

#### Operator row 3 — raw probe output (exit 0)

```text
PASS anonymous /status returns 200
PASS page shows "incident" and no other state
PASS page shows required text: "[REHEARSAL] Status page verification 2026-09-11 fa0429f10"
PASS page withholds internal text: "G5-PRIVATE-ROOT-20260911-fa0429f10"
PASS page withholds internal text: "g5-private-owner-fa0429f10@example.invalid"
PASS page withholds internal text: "https://internal.example.invalid/G5-fa0429f10"
PASS page names no internal column
PASS sitemap lists /status
PASS app host 308s /status to the apex
PASS Data API refuses anonymous select=*
PASS Data API refuses anonymous root_cause
PASS Data API refuses anonymous owner
PASS Data API refuses anonymous created_by
PASS Data API refuses anonymous external_url
PASS Data API allows the public column read and returns no unpublished row

OK — 15 checks passed against https://letsgetquoted.com at 2026-09-11T20:39:06.578Z.
```

#### Operator row 4 — raw probe output (exit 0)

```text
PASS anonymous /status returns 200
PASS page shows "incident" and no other state
PASS page shows required text: "[REHEARSAL] Status page verification 2026-09-11 fa0429f10"
PASS page withholds internal text: "G5-PRIVATE-ROOT-20260911-fa0429f10"
PASS page withholds internal text: "g5-private-owner-fa0429f10@example.invalid"
PASS page withholds internal text: "https://internal.example.invalid/G5-fa0429f10"
PASS page names no internal column
PASS sitemap lists /status
PASS app host 308s /status to the apex
PASS Data API refuses anonymous select=*
PASS Data API refuses anonymous root_cause
PASS Data API refuses anonymous owner
PASS Data API refuses anonymous created_by
PASS Data API refuses anonymous external_url
PASS Data API allows the public column read and returns no unpublished row

OK — 15 checks passed against https://letsgetquoted.com at 2026-09-11T20:39:11.575Z.
```

#### Operator row 5 — raw probe output (exit 0)

```text
PASS anonymous /status returns 200
PASS page shows "incident" and no other state
PASS page shows required text: "[REHEARSAL] Status page verification 2026-09-11 fa0429f10"
PASS page shows required text: "Rehearsal update fa0429f10: publishing and private-field protections verified. No customer outage."
PASS page withholds internal text: "G5-PRIVATE-ROOT-20260911-fa0429f10"
PASS page withholds internal text: "g5-private-owner-fa0429f10@example.invalid"
PASS page withholds internal text: "https://internal.example.invalid/G5-fa0429f10"
PASS page names no internal column
PASS sitemap lists /status
PASS app host 308s /status to the apex
PASS Data API refuses anonymous select=*
PASS Data API refuses anonymous root_cause
PASS Data API refuses anonymous owner
PASS Data API refuses anonymous created_by
PASS Data API refuses anonymous external_url
PASS Data API allows the public column read and returns no unpublished row

OK — 16 checks passed against https://letsgetquoted.com at 2026-09-11T20:39:51.966Z.
```

#### Operator row 6 — raw probe output (exit 0)

```text
PASS anonymous /status returns 200
PASS page shows "operational" and no other state
PASS page shows required text: "[REHEARSAL] Status page verification 2026-09-11 fa0429f10"
PASS page shows required text: "Rehearsal completed fa0429f10. No customer outage occurred."
PASS page withholds internal text: "G5-PRIVATE-ROOT-20260911-fa0429f10"
PASS page withholds internal text: "g5-private-owner-fa0429f10@example.invalid"
PASS page withholds internal text: "https://internal.example.invalid/G5-fa0429f10"
PASS page names no internal column
PASS sitemap lists /status
PASS app host 308s /status to the apex
PASS Data API refuses anonymous select=*
PASS Data API refuses anonymous root_cause
PASS Data API refuses anonymous owner
PASS Data API refuses anonymous created_by
PASS Data API refuses anonymous external_url
PASS Data API allows the public column read and returns no unpublished row

OK — 16 checks passed against https://letsgetquoted.com at 2026-09-11T20:40:38.108Z.
```

#### Operator row 7 — raw probe output (exit 0)

```text
PASS anonymous /status returns 200
PASS page shows "operational" and no other state
PASS page withholds internal text: "G5-PRIVATE-ROOT-20260911-fa0429f10"
PASS page withholds internal text: "g5-private-owner-fa0429f10@example.invalid"
PASS page withholds internal text: "https://internal.example.invalid/G5-fa0429f10"
PASS page withholds internal text: "[REHEARSAL] Status page verification 2026-09-11 fa0429f10"
PASS page withholds internal text: "Rehearsal update fa0429f10: publishing and private-field protections verified. No customer outage."
PASS page withholds internal text: "Rehearsal completed fa0429f10. No customer outage occurred."
PASS page names no internal column
PASS sitemap lists /status
PASS app host 308s /status to the apex
PASS Data API refuses anonymous select=*
PASS Data API refuses anonymous root_cause
PASS Data API refuses anonymous owner
PASS Data API refuses anonymous created_by
PASS Data API refuses anonymous external_url
PASS Data API allows the public column read and returns no unpublished row

OK — 17 checks passed against https://letsgetquoted.com at 2026-09-11T20:41:09.393Z.
```

#### Operator row 8 — no output; not executed

No row-8 probe was run because the deletion state was never reached. Running
the probe against the still-unpublished fixtures would not prove deletion.

### Raw audit query and remaining fixture rows

The following read-only query was scoped to the two rehearsal IDs; it did not
collect unrelated incident audit records:

```sql
select created_at, action, target_id, admin_email, meta, staff_id, permission
  from public.admin_actions
 where target_type = 'platform_incident'
   and target_id = any(array[
     '49e3e418-9fa6-4f1d-a001-28f1972dde1a',
     'aa121fc1-b0b4-406e-801b-ddc76aedf850'
   ])
   and created_at > '2026-09-11T20:28:41.6035333Z'
 order by created_at;
```

All required primary-fixture actions are present and attributed to the acting
staff member: log, publish update, description update, resolve, and unpublish
update. This audit subcheck passed. The remaining-row query confirms why
cleanup and the overall operator step cannot be marked passed. Raw result:

```text
{
  "captured_at": "2026-09-11T20:41:51.858Z",
  "admin_actions": [
    {
      "created_at": "2026-09-11T20:29:36.772Z",
      "action": "platform_incident_log",
      "target_id": "49e3e418-9fa6-4f1d-a001-28f1972dde1a",
      "admin_email": "brett.arnold@live.com",
      "meta": {
        "kind": "incident",
        "owner": "g5-private-owner-fa0429f10@example.invalid",
        "title": "[REHEARSAL] Status page verification 2026-09-11 fa0429f10",
        "severity": "warning",
        "published": false,
        "externalUrl": "https://internal.example.invalid/G5-fa0429f10",
        "affectedServices": []
      },
      "staff_id": "72ffe849-9ad4-4270-80d3-ce289cfa38d4",
      "permission": "ops.manage"
    },
    {
      "created_at": "2026-09-11T20:29:36.924Z",
      "action": "platform_incident_log",
      "target_id": "aa121fc1-b0b4-406e-801b-ddc76aedf850",
      "admin_email": "brett.arnold@live.com",
      "meta": {
        "kind": "incident",
        "owner": "g5-private-owner-fa0429f10@example.invalid",
        "title": "[REHEARSAL] Status page verification 2026-09-11 fa0429f10",
        "severity": "warning",
        "published": false,
        "externalUrl": "https://internal.example.invalid/G5-fa0429f10",
        "affectedServices": []
      },
      "staff_id": "72ffe849-9ad4-4270-80d3-ce289cfa38d4",
      "permission": "ops.manage"
    },
    {
      "created_at": "2026-09-11T20:38:47.743Z",
      "action": "platform_incident_update",
      "target_id": "49e3e418-9fa6-4f1d-a001-28f1972dde1a",
      "admin_email": "brett.arnold@live.com",
      "meta": {
        "published": true
      },
      "staff_id": "72ffe849-9ad4-4270-80d3-ce289cfa38d4",
      "permission": "ops.manage"
    },
    {
      "created_at": "2026-09-11T20:39:32.842Z",
      "action": "platform_incident_update",
      "target_id": "49e3e418-9fa6-4f1d-a001-28f1972dde1a",
      "admin_email": "brett.arnold@live.com",
      "meta": {
        "edit": "description",
        "title": "[REHEARSAL] Status page verification 2026-09-11 fa0429f10",
        "published": true
      },
      "staff_id": "72ffe849-9ad4-4270-80d3-ce289cfa38d4",
      "permission": "ops.manage"
    },
    {
      "created_at": "2026-09-11T20:40:20.431Z",
      "action": "platform_incident_resolve",
      "target_id": "49e3e418-9fa6-4f1d-a001-28f1972dde1a",
      "admin_email": "brett.arnold@live.com",
      "meta": {},
      "staff_id": "72ffe849-9ad4-4270-80d3-ce289cfa38d4",
      "permission": "ops.manage"
    },
    {
      "created_at": "2026-09-11T20:40:49.237Z",
      "action": "platform_incident_update",
      "target_id": "49e3e418-9fa6-4f1d-a001-28f1972dde1a",
      "admin_email": "brett.arnold@live.com",
      "meta": {
        "published": false
      },
      "staff_id": "72ffe849-9ad4-4270-80d3-ce289cfa38d4",
      "permission": "ops.manage"
    }
  ]
}
PASS: primary fixture log, publish, unpublish and resolve are attributed to brett.arnold@live.com.
{
  "remaining_rehearsal_rows": [
    {
      "id": "49e3e418-9fa6-4f1d-a001-28f1972dde1a",
      "title": "[REHEARSAL] Status page verification 2026-09-11 fa0429f10",
      "description": "Rehearsal update fa0429f10: publishing and private-field protections verified. No customer outage.",
      "root_cause": "G5-PRIVATE-ROOT-20260911-fa0429f10",
      "owner": "g5-private-owner-fa0429f10@example.invalid",
      "external_url": "https://internal.example.invalid/G5-fa0429f10",
      "published": false,
      "resolved_at": "2026-09-11T20:40:20.196Z",
      "resolution_summary": "Rehearsal completed fa0429f10. No customer outage occurred.",
      "created_by": "brett.arnold@live.com"
    },
    {
      "id": "aa121fc1-b0b4-406e-801b-ddc76aedf850",
      "title": "[REHEARSAL] Status page verification 2026-09-11 fa0429f10",
      "description": "Scheduled status-page rehearsal. No customer outage.",
      "root_cause": "G5-PRIVATE-ROOT-20260911-fa0429f10",
      "owner": "g5-private-owner-fa0429f10@example.invalid",
      "external_url": "https://internal.example.invalid/G5-fa0429f10",
      "published": false,
      "resolved_at": null,
      "resolution_summary": null,
      "created_by": "brett.arnold@live.com"
    }
  ]
}
```
