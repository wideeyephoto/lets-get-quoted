# Tenant and office access fixes — September 9, 2026

**All three reported defects are fixed in this branch and verified against hosted staging. Production deployment remains pending.** The final signed-in Chromium/API run passed **44 of 44 cases** from **21:58:09.093 to 22:01:52.799 UTC**, using the local candidate application at `http://localhost:3014` and staging Supabase project `uydlabvgauzujdwuqzxq`. This is separate from the preserved [33-pass/3-failure production audit](tenant-office-browser-verification-2026-09-09.md).

## Changes and observed results

| Defect | Enforcement | Actual signed-in result |
| --- | --- | --- |
| Restricted office users could read job quote values directly | Revoke raw financial-column SELECT; use an invoker view with a narrowly scoped private function checking current workspace membership and financial capabilities | Raw financial projection, wildcard, financial filtering and raw embedded quote reads return 403. The application view returns the correct operational job with zero/null quote values. Explicit quote permission reveals the original nonzero amount; removing it masks the next request. |
| Operational writers could change prices | Base-table INSERT/UPDATE trigger checks financial changes and `quotes.write`; view writes retain the caller's RLS | Raw and view mixed quote PATCH requests return 403 `job_quote_write_required`; independent reads confirm no change. Unauthorized priced creates and upserts fail. Ordinary scope edits and default-zero creation succeed; an owner saves and reads the exact new quote amount. |
| Jobs could reference another workspace's client | Composite `(account_id, client_id)` foreign key to `clients(account_id, id)` | Foreign-parent PATCH, insert and upsert fail with `23503`; independent reads confirm the original parent remains. Existing PostgREST relationship hints and both embedding directions work. |

The original `jobs` table remains in place, retaining its identity and dependent relationships. Both normal session client factories route job reads/writes and nested job selections through `job_access`. Service-role clients retain their existing base-table access. The adapter preserves session headers, bodies, filters, aliases and relationship hints; it confers no permission itself.

The view uses `security_invoker=true` and `security_barrier=true`. Its private helper requires current `jobs.read` plus `quotes.read` or `reports.read` and checks the actual job's workspace. The helper is outside the exposed Data API schemas; a real RPC attempt using the private profile returns 406 `PGRST106`. Masked values are not copied over stored quote values during operational edits. Base-table guards also reject workspace reassignment by authenticated tenant callers. The composite foreign key retains `jobs_client_id_fkey`, so existing explicit relationship hints stay valid; deleting a client nulls only `client_id`.

Protected fields: `quoted_amount`, `quote_items`, `deposit_gate`, `reschedule_discount_percent`, `reschedule_discount_note`, `reschedule_discount_agreed_at`, `quote_signer_name`, `quote_signed_at`, `quote_signature_path`, `quote_signature_method`. New base-table columns do not gain authenticated SELECT automatically; future migrations must deliberately extend the view and column grants. View upserts are not supported; there are no current session-client job upsert callers. Raw-table upsert attacks were exercised and rejected.

## Evidence and validation

- [44-case request/response evidence](tenant-office-access-fix-evidence-2026-09-09.json), including actor identity checks, retained-session grant transitions, database observations, all 30 global capability states and cleanup. Application implementation file hashes identify the tested working-tree candidate; the recorded Git SHA is its base, not a deployed release.
- Actual application browser pages: [restricted job](evidence/tenant-office-fixes-2026-09-09/office-job-detail.png), [restricted client](evidence/tenant-office-fixes-2026-09-09/client-stable.png), [workspace switch](evidence/tenant-office-fixes-2026-09-09/workspace-owner-b.png), [no grants](evidence/tenant-office-fixes-2026-09-09/office-no-grants.png), [revoked grants](evidence/tenant-office-fixes-2026-09-09/office-grants-revoked.png). No browser page errors were recorded in the scored run. Its client screenshot caught the page being replaced during hydration, so the linked client image comes from a [supplementary real-session capture](evidence/tenant-office-fixes-2026-09-09/client-stable.json) that waited for the heading to be actionable and fully opaque. That capture used a separate marked fixture (`208fcca2`), also cleaned with zero active memberships, sessions and grants.
- Real browser magic-link callbacks established three independent Auth-issued sessions. All HTTP assertions used those cookies or their access tokens. Setup/admin access was confined to fixture setup, bounded restoration, independent observations and cleanup. No mocked requests or SQL role impersonation counted as signed-in evidence. The unavailable browser CLI daemon was replaced by the installed Playwright/Chromium runner.
- **17 isolated PostgreSQL scenario groups passed**, executing both complete migrations. These also check individual protected fields, SQL row conversion, owner/office cross-parent attempts, deactivated membership, per-workspace financial authority and client deletion behavior. These are supporting database tests, separate from the signed-in run.
- Focused application tests: **78 passed**. Full Vitest run: **14,487 passed**, with one schema-header formatting assertion corrected afterward; its entire three-test suite then passed. The adapter and advisor suites were re-run together: **8/8 passed**. No remaining known unit-test failure.
- TypeScript and lint passed (existing unrelated lint warnings remain). The optimized Next.js build passed, including generation of all **421 pages**. The build used an isolated output directory and staging environment with outbound providers disabled.
- Staging Supabase advisors reported no new job-access security finding. The new composite foreign key's missing-index advisory was corrected with a covering index and rechecked successfully. Existing unrelated advisory findings remain outside this change.

The PostgreSQL harness runs with `npm run test:pg17:job-access`; set `LGQ_PGLITE_MODULE` to an installed `@electric-sql/pglite` module when it is not available in the project. The browser runner uses the target arguments documented in the original audit. Local runs require `--deployment=local` and a real 40-character base/source SHA; deployed runs require the verified deployment ID. Always use a fresh fixture directory for a new completed run and an explicit evidence output path to preserve earlier reports.

## Cleanup

Fixture marker: `tenant-office-browser-2026-09-09-32ccf129`. The final run compared all **189 public base tables with UUID account IDs**. Counts changed only for three login events, 4 tour events and two temporary office grants. Payment/message/credit-lot counts did not change. The successful additional create was deleted immediately by its exact UUID and marker; blocked creates left no row. No contact destination or outbound delivery was configured; local provider credentials were disabled.

Cleanup completed at **22:01:52.445 UTC**: removed the two main jobs and clients, removed grants, revoked sessions and deactivated memberships. Independent verification returned **zero active fixture memberships, sessions and grants**. Two suspended marked workspaces and three test identities remain for audit/initialization traceability. Staging capability switches were not changed. The earlier rehearsal fixtures were also cleaned before the final run.

## Production rollout

Do not apply both migrations together ahead of the application release. Existing application clients select raw job financial columns and require the adapter before SELECT is revoked.

1. Confirm there are no existing jobs linked to a client in another workspace. Apply `20260909212204_job_access_financial_boundary.sql`, which adds the view, write guards and indexed composite foreign key. The constraint is validated before replacing the original single-column relationship.
2. Deploy the application containing `job-access-fetch.ts` and both client-factory integrations. Verify owner reads, operational edits and embedded queries against the production deployment; load a fresh browser bundle.
3. Apply `20260909212423_revoke_raw_job_financial_reads.sql`. It asserts that authenticated users no longer have raw quote SELECT privileges. This completes the direct-read confidentiality fix; the additive phase alone does not.
4. Freeze the production deployment identity and rerun the full signed-in harness with new marked fixtures and automatic cleanup. Verify the alias still identifies the tested deployment before checking off the production gate.

Staging applied the two migrations and then the covering-index correction; the final additive migration and canonical schema include that index. The staging migration high-water mark in the final run is `20260909214305`. Both complete final migration files also pass the disposable PostgreSQL harness.

After SELECT revocation, rolling the app back to clients that query raw quote columns will break those reads. Restore a compatible adapter application if application rollback is needed; do not casually restore broad SELECT privileges. Cached older browser bundles must refresh after cutover.

The broader launch matrix remains open: crew access, Storage, Realtime, invitations/capacity, other financial categories, every server action and exhaustive route/table/verb coverage need their own evidence. No production code, production database permissions or production deployment were changed by this fix task.
