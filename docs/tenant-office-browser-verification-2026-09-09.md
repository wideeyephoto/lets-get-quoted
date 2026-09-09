# Tenant and office-user signed-in verification — September 9, 2026

**Audit completed; launch gate remains open.** The final production run executed 36 cases: **33 passed, 3 failed**. All three failures are reproducible Data API authorization defects. Browser clients/jobs, Focus JSON financial redaction, workspace switching and subsequent-request revocation passed. The earlier “83/83 passed” report is invalidated; it did not perform the browser/API operations it claimed.

## Target and evidence

- Application: `https://app.letsgetquoted.com`; Supabase: `mfuvvtrkipkigwqqtcal`.
- Production commit: `8a7b129ac4dd68467532cb384da78d5203135a18`; deployment: `dpl_Cc1muyh2q6hUJNRcKHqso8DwK1jB`. Vercel's production alias was checked before the final run and again after it; both resolved to this deployment. An earlier exploratory run crossed a release change and is not the final evidence.
- Final run: **20:06:28–20:07:23 UTC**. Highest applied migration: recorded in the [JSON evidence](tenant-office-browser-evidence-2026-09-09.json), alongside all 30 global capability states, per-actor IDs, grant transitions, actual HTTP results and browser text.
- Fixture marker: `tenant-office-browser-2026-09-09-cb8b5d6b`. Two newly created marked workspaces, three newly created identities, two clients and two jobs. No existing customer's identity or records were used.
- Authentication: each identity followed the application's real magic-link callback in a separate Chromium context; `/auth/v1/user` confirmed the resulting identity. Links were generated only for these controlled fixture users, without sending email. API probes used the resulting cookies or their Auth-issued access tokens. Setup credentials were limited to fixture creation, independent database observations, bounded restoration and cleanup. Owner grant replacement/removal probes used the owner's real session.
- This proves callback/session behavior, not email delivery or MFA. No SQL role assignment, injected claims, mocked response or administrator impersonation was scored as a signed-in user.

Captured browser evidence: [no-grant holding page](evidence/tenant-office-2026-09-09/office-no-grants.png), [client detail](evidence/tenant-office-2026-09-09/office-client-detail.png), [job detail](evidence/tenant-office-2026-09-09/office-job-detail.png), [B owner after switching](evidence/tenant-office-2026-09-09/workspace-owner-b.png), and [revoked office grants](evidence/tenant-office-2026-09-09/office-grants-revoked.png).

## Confirmed launch blockers

| Case | Actual result | Requirement still open |
| --- | --- | --- |
| `FINANCE-REST` | An office user with only `clients.read` and `jobs.read` received HTTP 200 with `quoted_amount: 17351.69` and the confidential quote-item label from `GET /rest/v1/jobs?id=eq.<A-job>&select=id,quoted_amount,quote_items`. | Enforce financial field confidentiality at the Data API boundary while preserving permitted operational reads. UI/DTO redaction does not protect direct table reads. |
| `WRITER-FINANCE` | An office user with operational read/write grants, without `quotes.write`, changed `quoted_amount` from `17351.69` to `12345.67` using Data API PATCH. An independent database read confirmed persistence. | Reject protected financial-field writes, including mixed permitted/protected payloads and creation/upsert equivalents. Restore and re-run the positive operational write control. |
| `WRITER-FOREIGN-PARENT` | The same writer PATCHed A's job to use B's `client_id`. HTTP 200 and an independent database read confirmed the foreign parent was stored. | Enforce same-workspace parent relationships on create/update/upsert; re-run both directions and related child/parent boundaries. |

Both successful unauthorized mutations were confined to disposable records and restored immediately before continuing. No application code, RLS policy or global feature flag was changed by this audit. These failures remain unresolved and must not be checked off as launch-ready.

## What passed

- Three real sign-ins and identity checks; both owners read exact own fixtures with distinct nonzero prices and received no foreign job rows.
- No-grant office holding page, JSON 403 and empty Data API response; client-only reads worked while the job deep link was denied.
- The reader could open the actual client and job pages with recognizable fixture content. Their rendered/serialized page data and client Focus JSON omitted the restricted quote sentinel. Explicit `quotes.read` revealed the expected amount; removing it hid the amount on the next request using the same session.
- A-only office requests could not read B through Data API, Focus JSON or client/job deep links. The client page's unavailable state returns HTTP 200 because of its rendering contract; the audit checked the final body and absence of foreign content rather than treating HTTP 200 alone as access.
- Read-only writes left the fixture unchanged. A writer could change harmless scope but could not modify B's job or move A's job into B. A forged workspace cookie fell back safely and did not authorize B access. Ordinary owner and office identities could not open platform administration.
- The real workspace selection form switched the dual actor **B owner → A office → B owner**. Each Focus request returned the selected workspace's fixture; the other workspace returned 404. B ownership did not permit A writes.
- The original office session/token lost access after grant removal, membership deactivation and the owner's removal RPC. Independent Data API checks returned no A rows; the app denied/unavailable response contained no A client content. Anonymous Focus API returned JSON 401.

The exact 36-case results and observations are in the JSON; “passed” applies to each described case, not every route, financial category or possible payload.

## Cleanup and side effects

The final run compared all **189 public base tables with a UUID `account_id`** before and after execution. Only expected login events (+3), tour events (+2), and temporary office grants (+2 before cleanup) changed counts. Payment, billing-event, message/outbox and existing credit-lot counts did not change. The eight fixture credit lots and two entitlement rows came from normal workspace initialization and were already present at the baseline. This count comparison is not a proof about every column or tables scoped solely by another key.

Cleanup completed at **20:07:55 UTC**: removed both jobs and both clients, removed all fixture grants, revoked all fixture sessions, and deactivated the remaining memberships. Independent checks returned **0 active fixture memberships, 0 sessions and 0 grants**. The two test workspaces are suspended. Three test identities, suspended workspaces, initial entitlement/credit rows and audit/telemetry records remain marked for traceability; they are not active customer workspaces. No customer contact destinations, invoice/payment operations or dispatch requests were created.

## Reproduction

Use a fresh private directory outside version control. The target project and origin are required and checked against the credential file; production accepts only the production app origin. Never print the environment file, cookies or magic-link URL.

```powershell
node scripts/tenant-office-fixtures.mjs --mode=prepare --env-file=<private-env-file> --project=mfuvvtrkipkigwqqtcal --origin=https://app.letsgetquoted.com --private-dir=<fresh-private-directory>
npm run verify:tenant-office -- --env-file=<private-env-file> --project=mfuvvtrkipkigwqqtcal --origin=https://app.letsgetquoted.com --private-dir=<same-private-directory> --commit=<verified-production-sha> --deployment=<verified-production-deployment>
```

The runner exits nonzero on failed cases or incomplete execution and cleans up its fixture access in `finally`. If the process is forcibly interrupted, use `tenant-office-fixtures.mjs --mode=cleanup` with the same target arguments. `--keep-fixtures=1` is available for bounded diagnosis and requires that explicit cleanup afterward. The legacy suite entry point now calls the real browser runner and cannot silently default to a production SQL connection.

The browser CLI could not establish its daemon connection in this environment, so verification used the repository's installed Playwright/Chromium. Navigation waits for the loaded document and disappearance of the dashboard loading state. Exploratory harness errors (network-idle waits, case-transformed references and the streamed unavailable response) were corrected before the final run; they are not reported as product defects.

## Coverage limits

This closes the requested execution audit for the representative permissions, quote confidentiality, workspace switching and revocation paths above. It does **not** close the full [broader verification plan](tenant-office-production-verification-plan-2026-09-09.md). Storage, Realtime, crew assignment, invitation/capacity lifecycle, every financial category, all server actions, concurrent in-flight revocation, session expiry and exhaustive route/table/verb coverage were not exercised here. There was no staging browser rehearsal. Their old inherited PASS claims are withdrawn, and they require separate evidence before sign-off.
