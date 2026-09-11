# Status page release procedure — G5

The four hosted steps that close
[G5](../prelaunch-gap-closure-plan-2026-09-11.md#g5--no-customer-facing-incident-channel),
in order, with the command for each and the evidence each produces.

**Status: none of steps 1–3 has been run.** Every check below is unexecuted.
The source work and the local proof are complete and recorded in
[the rehearsal record](incident-rehearsal-2026-09-11.md); step 4, the
publication policy, is written and lives in
[status-page-publication-policy.md](status-page-publication-policy.md).

These steps need credentials this repository does not hold: a staging and
production Supabase connection string, Vercel deploy authorisation, and a staff
account with `ops.manage` and MFA. They are the operator's to run.

> **Ordering.** The migration goes first, in every environment, before the code
> that reads the column. `getIncidentsPaged`, `getOpenIncidents` and the status
> page all select `published`. Deployed against a database without that column
> they fail closed — the admin page shows "Incident history is unavailable" and
> `/status` shows "Status Unavailable" — which is visible and safe, but it is
> still an outage of both surfaces. This is ordering rule (3) in the checklist's
> *Orderings where the wrong sequence is what causes the harm*: migration before
> the deploy that reads the column, never after.

---

## Step 0 — re-run the local proof on the exact SHA you are about to ship

Cheap, offline, and it is what makes the rest meaningful.

```bash
npm run verify:status-boundary     # 10 checks, real PostgreSQL 17
npm test                           # 15,080 / 1,181 files
npm run typecheck && npm run lint && npm run build
```

`verify:status-boundary` boots PostgreSQL, so it cannot run as root. On a
container that runs as root, run it as an unprivileged user with its own
`TMPDIR` — the script's header gives the exact invocation.

**PASS =** all four exit 0. Record the SHA.

---

## Step 1 — apply the migration to staging and re-run the rehearsal

```bash
# Connection string for STAGING. Check first, then apply.
DATABASE_URL='<staging>' node scripts/run-migration.mjs \
  20260911094000_platform_incidents_published.sql --check
DATABASE_URL='<staging>' node scripts/run-migration.mjs \
  20260911094000_platform_incidents_published.sql
```

The migration is transactional and ends in a `DO` block that raises if RLS is
off, if any browser role holds INSERT/UPDATE/DELETE/TRUNCATE, or if any of the
six internal columns is readable. **If it raises, nothing is committed** — read
the message rather than retrying.

Then the rehearsal that previously failed at the schema preflight:

```bash
npm run rehearse:incident-cycle -- --env-file .env.staging.local
```

**PASS =** the migration applies without raising, and the rehearsal reaches
`PASS: database/API incident cycle` having created, published, updated, resolved
and deleted its fixture, with the draft proven invisible to the anonymous client
at every stage.

**Evidence:** both command outputs, dated, appended to
[the rehearsal record](incident-rehearsal-2026-09-11.md).

---

## Step 2 — apply to production, deploy, record the SHA

Migration first, same two commands against the production connection string.

Then deploy the frozen SHA from step 0 and record the deployment id and the
commit it built, exactly as the contractor-domain releases do
(`dpl_…` plus the 40-character SHA). Verify both public aliases answer after
promotion.

Immediately after promotion, with no incident published:

```bash
node scripts/verify-deployed-status-page.mjs \
  --host letsgetquoted.com --expect operational \
  --supabase-url "$NEXT_PUBLIC_SUPABASE_URL" --anon-key "$NEXT_PUBLIC_SUPABASE_ANON_KEY"
```

Both Supabase values are public; **do not pass a service-role key.** The script
is read-only and sends only GETs.

**PASS =** every check passes, including the five that prove the hosted Data API
refuses an anonymous `select=*`, `root_cause`, `owner`, `created_by` and
`external_url`, and the one that proves an unpublished row is not returned.
Those six are the hosted counterpart of the local boundary run — the local run
proves the migration is correct, these prove *this database* got it.

**Evidence:** deployment id, SHA, and the script's dated OK line.

---

## Step 3 — rehearse the operator cycle against the deployed page

This is the step a service-role script cannot stand in for: it exercises the
authenticated operator path, its authorisation, and its audit trail. Do it as a
staff user with `ops.manage` and MFA, in a browser, against production.

Use a clearly-labelled rehearsal incident. Put text you can grep for in the
internal fields — that is what turns the leak check into evidence.

| # | Action | Check |
| --- | --- | --- |
| 1 | `/admin/incidents` → log a `warning` incident, **publish unticked**, with a root cause and owner filled in | Row shows `internal` in the Public column |
| 2 | Probe the page | `--expect operational` — the unpublished row must not appear |
| 3 | Click **Publish to /status…** → confirm | Banner reads "Published. It is on letsgetquoted.com/status now." |
| 4 | Probe the page | `--expect incident --require "<title>" --forbid "<root cause>" --forbid "<owner email>"` |
| 5 | Edit the description, re-publish | Probe with `--require "<new text>"` |
| 6 | **Resolve…** with a resolution summary | Probe with `--expect operational --require "<resolution>"` |
| 7 | **Unpublish from /status** | Probe with `--expect operational`, `--forbid "<title>"` |
| 8 | Delete the rehearsal row | Probe once more; nothing of it remains |

The probe for steps 2, 4, 5, 6 and 7:

```bash
node scripts/verify-deployed-status-page.mjs --host letsgetquoted.com \
  --expect <state> --require '<text>' --forbid '<internal text>' \
  --supabase-url "$NEXT_PUBLIC_SUPABASE_URL" --anon-key "$NEXT_PUBLIC_SUPABASE_ANON_KEY"
```

Then the audit trail. Every action above writes an `admin_actions` row:

```sql
select created_at, action, target_id, admin_email, meta
  from admin_actions
 where target_type = 'platform_incident'
   and created_at > '<when you started>'
 order by created_at;
```

**PASS =** `platform_incident_log`, `platform_incident_update` (publish),
`platform_incident_update` (unpublish) and `platform_incident_resolve` are all
present, attributed to the acting staff member, and the probe passed at every
state with the internal text absent every time.

Also confirm a non-`ops.manage` staff account sees no publish control and cannot
reach the action, since the control is new.

**Evidence:** the eight probe outputs, the `admin_actions` rows, and the
deployment id they were taken against.

---

## Step 4 — publication policy

**Done.** [status-page-publication-policy.md](status-page-publication-policy.md)
covers which severities publish, the mapping from each of the eight operational
alert categories, who writes the copy, the target times, the overnight posture
for a single operator, and the limitation that the page cannot report its own
worst case.

It has one open dependency: §4 of the policy and G7's overnight paging policy
must name the same categories. Neither is finished until they agree.

---

## What still will not be closed after all four

- **The alert deep link.** `sendOperationalEmergencyAlert` generates SRE console
  links; the gap plan asks for an "open a public incident" link so paging and
  publishing are one step. Not built.
- **An independent channel.** A database outage takes `/status` with it. §6 of
  the policy states this as a known limitation rather than a solved problem.
- **`G3`.** The paging chain still terminates at an address whose liveness has
  never been proven, so "the operator was paged" is itself unverified.
