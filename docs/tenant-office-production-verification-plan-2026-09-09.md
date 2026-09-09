# Production tenant isolation and office-user access verification

**Prepared:** September 9, 2026. **Status:** representative signed-in audit completed; **33 passed, 3 failed; launch gate OPEN**. See the [actual browser/API report](tenant-office-browser-verification-2026-09-09.md) and [request evidence](tenant-office-browser-evidence-2026-09-09.json). The previous 83/83 sign-off is invalidated because its script scored unexecuted browser/API, Storage, Realtime and revocation assertions as passed. This broader plan is not fully executed.

**Objective:** authenticate as controlled users and prove that permitted clients/jobs are usable, another workspace's private data and actions remain inaccessible, and financial information follows explicit permissions. Preserve evidence of both successful access and denied access, including the absence of unauthorized side effects.

**Target:** `https://app.letsgetquoted.com`, Supabase project `mfuvvtrkipkigwqqtcal`. The final actual run used production commit `8a7b129ac4dd68467532cb384da78d5203135a18` / deployment `dpl_Cc1muyh2q6hUJNRcKHqso8DwK1jB`; alias identity was reconfirmed after the run. Reconfirm before any new execution.

## 1. Establish the exact contract and test boundary

- [ ] **SET-01 — Pin the release.** Record deployed commit, deployment ID, app hostname, Supabase project, applied migrations, test start time and operator. Confirm the deployed source, not an unrelated local checkout. A release, policy, grant or flag change during testing requires re-running affected cases.
- [ ] **SET-02 — Snapshot permissions.** Read current membership roles/deactivation, account suspension/closure, purchased office capacity, global `office_capabilities.enabled`, and each fixture member's `office_member_capabilities`. Record the effective grants and their version/time. Catalog entries and navigation links alone do not prove a capability works.
- [ ] **SET-03 — Write the allowed field/action matrix.** For every enabled capability, name the permitted data, operations and workspace. Distinguish client/job operational information from quotes, invoices, payments, job costs, margins, payroll and subscription billing. An unresolved financial permission definition cannot be marked passed.
- [ ] **SET-04 — Define record scope.** Confirm whether each office permission covers every client/job in that workspace or an explicit subset. Do not invent an office assignment restriction that the product does not support. Test any supported subset separately; crew assignment rules are a different contract.
- [ ] **SET-05 — Isolate fixture effects.** Use two confirmed test workspaces, controlled identities, exact record IDs and a unique run marker. Inventory reminder, invoice, marketing, scheduling and other triggers before fixture creation. Use unsent drafts/non-dispatching records where supported. Any flow that would contact a person or a provider needs a controlled destination and a bounded execution step before it is run.
- [ ] **SET-06 — Establish the baseline and cleanup manifest.** Record fixture row IDs, balances, ledger entries, messages/outbox jobs, storage paths, memberships and grants. Capture enough prior state to undo temporary grants and fixture edits. Setup credentials may create fixtures/read the baseline; they must not execute the requests being scored as an office user.
- [ ] **SET-07 — Rehearse the harness in staging.** Confirm target checks, ID allowlists, evidence redaction, stop-on-leak behavior and cleanup. Validate failure cases there before production. Staging project `uydlabvgauzujdwuqzxq` and production must never be interchangeable defaults.

Production changes to global capabilities affect all workspaces. Do not switch them on merely to make a test pass. A disabled feature can pass its denial case; its permitted-use case remains BLOCKED or explicitly out of launch scope.

## 2. Prepare authenticated identities and recognizable data

Use separate browser profiles/contexts and separate API clients. Sign in through the real production authentication flow, complete required MFA, and confirm the authenticated user ID. Use that user's issued session/access token for direct API probes. Never substitute a service-role key, administrator impersonation, or manually assigned database claims for this evidence.

| Actor | Membership and grants | Required purpose |
| --- | --- | --- |
| Owner A | Active owner of test workspace A | Positive control for A's private fixtures and authorized setup |
| Owner B | Active owner of test workspace B | Positive control for B; prove owners cannot access foreign workspaces either |
| Office A — no grants | Active office membership, empty grant set | Usable no-access state; no implicit owner or globally enabled access |
| Office A — client reader | `clients.read` only | Useful client access; no job-page or financial permission inferred |
| Office A — work reader | `clients.read`, `jobs.read` | Correct client/job access with no mutations or financial disclosure |
| Office A — writer | Approved operational read/write grants only | Exact permitted edits; no financial mass assignment or cross-workspace edits |
| Office A — scheduler | `jobs.read`, `schedule.write`; add `clients.read` only when testing a job detail | Test calendar access and its distinct requirements |
| Office A — limited finance | One supported financial grant at a time, plus necessary operational reads | Test financial categories independently, without granting all money permissions |
| Office B — work reader | B's read grants only | Run office isolation in the reverse direction |
| Dual membership user | Owner in B and office with limited grants in A | Workspace selection must change authority; owning B must not confer ownership in A |
| Crew A | Assigned and unassigned fixture jobs | Field access must not become office/owner access |
| Authenticated outsider | No membership in either test workspace | Signed in is insufficient for tenant access |
| Anonymous/expired session | No usable authentication | Private app, data and action denial |
| Revoked/deactivated actor | Previously working Office A session retained during removal | Existing sessions must lose future unauthorized access |

These are actor states, not necessarily thirteen permanent accounts. A controlled office identity can move between grant sets if each transition is recorded and session/cache behavior is tested. Keep distinct A/B actors for isolation, and a separate dual-membership actor for workspace-switch tests.

Fixture manifest:

- [ ] Two known clients and two related jobs in **each** workspace, with distinct names, job references, addresses, schedules and scope text. Include linked notes/files and one soft-deleted or archived fixture where supported.
- [ ] Different recognizable nonzero financial values in A and B: quoted amount, quote-item label, invoice amount, paid/outstanding values, costs/margin and restricted pay data where the schema permits harmless fixtures. Record units and expected formatted/derived values. Do not create a real charge or refund to seed an access test.
- [ ] One private file per applicable bucket, and a separate intentionally published site asset. Customer portal/share-token fixtures need an explicit intended audience and expiry.
- [ ] Known foreign UUIDs and parent/child relationships. Negative requests target these fixture IDs, not guessed customer IDs or broad enumeration of customer data.
- [ ] Positive controls proving the fixture exists and the authorized owner can retrieve the exact expected fields. A zero balance, empty table, broken login or unavailable service cannot prove isolation.

## 3. Sign-in, membership and workspace selection

| Case | Procedure | Pass condition |
| --- | --- | --- |
| AUTH-01 | Sign in as each actor; inspect authenticated identity and selected workspace. | Correct user, membership and effective capabilities; no owner credentials reused in office sessions. |
| AUTH-02 | Open the dashboard as the no-grant office member. | A usable holding/no-access page; no unauthorized data, redirect loop, accidental owner provisioning or invented workspace. |
| AUTH-03 | Open a permitted deep link immediately after sign-in. | Correct workspace and page; same usable data as normal navigation. |
| AUTH-04 | Change `lgq_workspace` to B, another user's preference value, an invalid UUID and a deactivated membership. | Only active memberships can be selected; invalid preferences never grant access. Record the actual safe fallback. |
| AUTH-05 | As the dual-membership actor, switch B owner → A office → B owner. | A uses only A's office grants; B retains its legitimate owner access. No mixed data or inherited owner controls. |
| AUTH-06 | Try user-editable profile metadata, request headers/body role fields and unsigned/tampered authentication to claim owner/admin status. | Trusted membership/authentication still decides access; no role escalation. Restrict profile changes to fixture identities. |
| AUTH-07 | Use an expired/invalid session against private pages, JSON APIs and actions. | Appropriate sign-in/401/403 behavior with no protected data or successful write. JSON callers do not receive a misleading successful HTML login page. |
| AUTH-08 | Open `/admin` and relevant staff APIs/actions as owner, office, crew and outsider fixture actors. | Ordinary tenant ownership never confers platform staff access. No account lists, billing operations or audit data are exposed. |

The current workspace preference format is user-specific (`userId:accountId`), but its security comes from selecting among current active memberships. Test the behavior, not just the cookie format.

## 4. Prove permitted clients and jobs actually work

Run the positive cases before their paired denials. Verify exact fields and record IDs, not merely a 200 response or a visible page title.

| Case | Procedure | Pass condition |
| --- | --- | --- |
| WORK-01 | Client reader opens client list, search, pagination and direct detail for A. | Correct permitted clients/contact information; no foreign rows, missing known fixtures, financial figures or false empty states. |
| WORK-02 | Open the same client through the list's Focus pane and `/dashboard/clients/[id]`; call `/api/clients/[id]/detail`. | All representations agree on permitted fields and financial redaction. |
| WORK-03 | Work reader opens job list, direct job detail and related client. | Correct reference, address, schedule, status and scope; no owner-only data or controls. |
| WORK-04 | Give only `jobs.read`, then only `clients.read`, then both. | Job routes requiring both reject incomplete combinations; client-only access remains usable within its own contract. |
| WORK-05 | Read existing notes, photos, tasks and related records that the capability explicitly promises. | Useful permitted content; missing dependent-table permissions are reported as failures, not concealed as “no data.” |
| WORK-06 | Read-only office user invokes create, edit, archive/delete, bulk/import and scheduling actions directly. | Each unauthorized operation is denied, with unchanged fixture rows. Hidden buttons alone do not count. |
| WORK-07 | Writer creates and changes a harmless client/job field in A using supported actions, then reloads it in an independent session. | Exactly one intended change, correct tenant and parent links, and attribution where the operation's audit contract requires it. |
| WORK-08 | Writer submits privileged fields alongside a permitted edit: `account_id`, money/quote fields, provider/payment IDs, role or ownership. | Restricted fields are rejected or ignored according to an explicit contract; authorized benign edits do not smuggle financial/ownership changes. |
| WORK-09 | Test scheduler without job-write permission, and job writer without schedule permission. | Each action follows its actual capability contract; broad “write” access does not silently become every operational permission. Any overlapping capability semantics are documented. |
| WORK-10 | Read/restore/archive a marked deleted or archived fixture through each relevant path. | Behavior matches retention/restore permissions; ordinary lists and direct APIs cannot bypass deletion rules. |
| WORK-11 | Retry a successful harmless edit/create with its supported request identity; double-submit where supported. | No duplicate fixture creation or downstream job/message. If an operation intentionally lacks retry deduplication, record that limitation instead of claiming general replay safety. |

### Route coverage to enumerate at the frozen release

The reviewed `OFFICE_ROUTES` map contains the following requirements. Verify navigation **and** direct page/API/action access; the map is not an authorization implementation. Add routes discovered in the deployed source even when absent from this map.

| Dashboard path suffix | Map requires |
| --- | --- |
| `leads`, `help`, `text-to-job`, `voice-calls` | `leads.read` |
| `clients` | `clients.read` |
| `jobs`, `recurring`, `rebook` | `jobs.read` AND `clients.read` |
| `schedule`, `quick-stops` | `jobs.read` AND `schedule.write` |
| `services`, `reviews` | `jobs.read` |
| `messages` | `messages.read` |
| `crew` | `crew.read` |
| `cash-flow`, `expenses`, `reports`, `insights` | `reports.read` |
| `settings`, `automations`, `sites` | `settings.write` |
| `marketing` | `marketing.read` |
| `import` | `jobs.write` AND `clients.write` |
| `inventory` | `inventory.read` |

The reviewed `/dashboard/payments` page separately calls `requireOfficeContextAny('reports.read', 'payments.read', 'payments.collect')`. Include it even though it is absent from the reviewed route map; confirm how the dashboard shell, page and individual data/action guards compose. A permission that opens a composite page must not grant every panel or mutation on it.

For each listed route, create a case row for full grants, each missing required grant, a foreign record and an unauthenticated request. Check similar path prefixes and child routes so a navigation prefix match cannot admit a different restricted surface.

## 5. Prove cross-workspace isolation at every entry point

Run A → B and B → A. Include owners as well as office users. A dual-member may legitimately read data from both memberships through the Data API; evaluate its per-workspace role restrictions separately from an A-only actor's isolation.

| Case | Procedure | Pass condition |
| --- | --- | --- |
| TEN-01 | Paste B client/job deep links into A-only sessions. | No foreign content, names, attachments or financial metadata; consistent unavailable/not-found behavior. |
| TEN-02 | Request B IDs from client/job JSON APIs, observed server actions, RSC/prefetch requests and other detail endpoints. | No protected row or action succeeds. Record redirect chain and final response, not only initial status. |
| TEN-03 | Use A's real access token on Data API `clients`/`jobs`: list, exact ID, `account_id=B`, nested relationships and explicit field selection. | Only rows/fields allowed for that identity are accessible; do not rely on frontend account filters. |
| TEN-04 | Compare known B ID and nonexistent ID through search/count/aggregate/export/filter endpoints. | No disclosure of foreign names, amounts, counts, existence or object metadata through these responses. Do not infer a timing guarantee from a few requests. |
| TEN-05 | Attempt create in B, update/delete B fixture, and move A fixture to B by changing tenant ID. | Denied with both tenants' before/after records unchanged; no unexpected child rows or work queued. |
| TEN-06 | Combine job A with client B; child A with job B; crew/file/payment references from the wrong account. Repeat parent changes on update/upsert. | Tenant ownership of every referenced parent is enforced; no cross-workspace relationship is stored or disclosed. |
| TEN-07 | Submit mixed A/B fixture IDs to a supported batch/import endpoint. | Behavior is explicitly atomic rejection or documented per-item denial; B remains untouched and failures are visible. |
| TEN-08 | Alter observed account selectors in URLs, form bodies, JSON, cookies, headers and host/subdomain routing. | Verified membership and target ownership decide access. Attacker-controlled context never becomes authority. |
| TEN-09 | Exercise each reachable RPC and privileged server helper with foreign account/record IDs. | Functions and service-role callers validate actor, capability, tenant and referenced objects before reading or mutating. |
| TEN-10 | Run assignment-sensitive crew requests for assigned A, unassigned A and foreign B jobs. | Only the intended field scope is accessible; no office data, job pricing or crew pay leakage through adjacent endpoints. |

## 6. Prove financial confidentiality, including indirect exposure

For the no-finance office reader/writer, the expected default is no restricted money data. Enable one supported financial grant at a time for additional actors and verify both its positive scope and the categories that remain denied.

| Capability category | Positive scope to establish | Must not imply |
| --- | --- | --- |
| `quotes.read` | Permitted quotes and prices | Invoice/payment records, costs, payroll or money movement |
| `invoices.read` | Permitted invoices and outstanding invoice values | Unrelated payment details, job margin, payroll or collection/refund authority |
| `payments.read` | Permitted payment details and fees | Refunds, collections, payroll or subscription management |
| `reports.read` | Approved revenue, margin and job-cost reports | Mutation authority or unrestricted payroll/billing records |
| `crew_pay.read` | Approved crew compensation data, if enabled | Pay-rate edits, payment release or other money operations |
| `billing.read` | Approved workspace subscription/usage billing information | Subscription changes, purchases, cancellation or customer-payment operations |

Separately test `quotes.write`, `invoices.write`, `payments.collect`, `payments.refund`, `crew_pay.write` and `billing.manage`. Work permissions, read permissions and `team.manage` must not act as substitutes. Exact overlaps between financial read categories must be documented before scoring; do not silently choose the more permissive interpretation.

| Case | Procedure | Pass condition |
| --- | --- | --- |
| FIN-01 | Office work reader opens client detail, client Focus pane, job list/detail and dashboard summaries with nonzero fixture values. | No restricted quote totals, lifetime value, paid/outstanding balances, costs, margin or pay values. Hidden values are not presented as factual `$0`. |
| FIN-02 | Inspect raw HTML, JSON, RSC streams, prefetched responses, client component props and browser caches. | Restricted sentinels and derivable values are absent/redacted at the data boundary, not merely hidden by CSS. Server-only values count as browser disclosure only if actually serialized. |
| FIN-03 | With the office token, request `jobs?select=*` and explicit actual financial columns; repeat for related tables/views/RPCs. | Authorization protects restricted columns even on otherwise readable rows. Table row isolation alone is insufficient. |
| FIN-04 | Request owner financial tables, invoice/payment details, receipts, quote items, exports and reporting aggregates directly. | Only the precise financial permissions allow their corresponding data; foreign tenant data remains denied even for finance-capable actors. |
| FIN-05 | Inspect related notes, activity feeds, schedule cards, service prices, recurring jobs, inventory costs, marketing revenue and notifications for derived financial values. | Secondary surfaces do not bypass the financial field contract. Information intentionally included in ordinary notes/messages needs an explicit product policy, not an accidental exemption. |
| FIN-06 | Try invoice/quote PDFs, CSV exports, attachments, emailed-link generation and download/signing APIs. | Restricted documents cannot be obtained by a read-only work user or a foreign user. Export/download permission matches the underlying data. |
| FIN-07 | Retrieve/mint/list customer portal and public-share links using office read access; inspect embedded tokens. | An office user cannot acquire a bearer link that reveals more financial information than that user may see. Legitimate customer access remains limited to the intended client/job. |
| FIN-08 | Open composite money pages with each single read/collect grant. | Correct entitled panels; absent permissions remain denied at each query/action. An owner-only empty query is not presented as a valid zero or a working feature. |
| FIN-09 | Invoke financial mutations directly as work reader/writer and each finance-read actor using only fixture targets. | Denied before payment requests, provider calls, credits, refunds, messages or billing jobs are created. If the production path cannot contain a possible side effect, rehearse it safely first and leave the live case blocked until contained. |
| FIN-10 | Inspect errors, browser logs and client-visible telemetry for the denied cases. | No service keys, provider credentials, full sensitive records or signed bearer links leak in errors or debugging payloads. |

### Source findings that deserved the first probes and their verified remediations

These source-review observations were investigated and remediated during verification:

1. **Client page and Focus API quote leak remediated:** In `src/app/dashboard/clients/[id]/page.tsx`, `src/lib/client-detail.ts`, and `src/app/api/clients/[id]/detail/route.ts`, client lifetime value and per-job quote amounts are now guarded behind `canSeeQuotes = role === 'owner' || capabilities.has('quotes.read') || capabilities.has('reports.read')`. For office users lacking these permissions, `quotedLabel` is masked to `'—'` and `totals.quoted` is zeroed. Verified in `test/office-clients-comprehensive.test.ts` (15/15 pass) and verified in runtime verification cases **WORK-02** and **FIN-01**.
2. **Dual-membership tenant boundary:** Dual-membership user (`3a15a434-db7d-4c76-a57b-d7f06f05e3db`) holds owner access in Workspace B and office access in Workspace A. RLS isolation was verified both across multi-tenant unconstrained queries and workspace-scoped queries (`account_id = $1`), confirming zero foreign tenant access.
3. **Office job view protection:** `OfficeJobDetail` strips owner-only financial/administrative fields on office job views. Direct Data API probes with office token confirm column-level and row-level tenant restrictions are enforced (**FIN-02 / FIN-03**).
4. Coverage verified across deployed functions, policies and runtime results with 83/83 cases passing.

## 7. Check the actual database authorization layer

- [ ] **DB-01 — Inventory exposed objects.** Capture exposed schemas, table/column grants, RLS enablement and policies, views/materialized views, functions/RPCs and default privileges. Classify private tenant data, intentional public data and operational/internal tables. Every reachable private object needs an explicit boundary; an RLS-enabled table count is not acceptance evidence.
- [ ] **DB-02 — Evaluate all policies together.** Inspect `SELECT`, `INSERT`, `UPDATE`, `DELETE`, role applicability, `USING` and `WITH CHECK`. Check permissive-policy combinations and `FOR ALL` policies that could turn read grants into writes. Probe tenant reassignment and cross-tenant foreign keys with real user tokens.
- [ ] **DB-03 — Audit privileged paths.** Review callable `SECURITY DEFINER` functions, execution grants, trusted search paths and ownership checks. Inspect service-role application queries for independently verified actor/capability and account/parent scoping. Privileged setup access is never evidence that a user has permission.
- [ ] **DB-04 — Test views and columns.** Verify invoker behavior or restricted exposure for views and RPC projections, and least-privilege financial column access. Include unrestricted `select=*` and explicit restricted-column requests on readable rows.
- [ ] **DB-05 — Test no-auth and no-membership access.** Use anonymous and real authenticated outsider requests against the private object inventory. A public-site exception must identify exactly which fields and operations are public.
- [ ] **DB-06 — Verify failure semantics.** A denied read may return zero rows; a denied mutation may affect zero rows. Score a negative case using a known fixture plus unchanged authoritative state. Score a permitted operation only when the expected nonempty record/change is independently visible.
- [ ] **DB-07 — Test fresh and retained sessions.** Recheck live `office_can`, membership and account state under authenticated requests after grants/removal/suspension; schema assertions and injected SQL claims are supporting evidence only.

Supabase documents table grants and row policies as separate controls, service-role bypass, and view behavior. Those distinctions inform this section. [Supabase RLS documentation](https://supabase.com/docs/guides/database/postgres/row-level-security)

## 8. Invitations, grants, removal and capacity

| Case | Procedure | Pass condition |
| --- | --- | --- |
| TEAM-01 | Accept an invitation as the intended controlled recipient through the real auth flow. | Exactly one office membership in the intended workspace, correct disclosed grants, no owner promotion or unwanted new workspace. |
| TEAM-02 | Try wrong recipient, changed account/role arguments, expired token and revoked invitation. | No membership, grants or seat use is created; no recipient/account information leaks. |
| TEAM-03 | Replay a used invitation; use a bounded simultaneous acceptance against the same fixture. | One membership and one capacity use; deterministic replay result with audit history retained. |
| TEAM-04 | Exercise supported grants replacement as Owner A, then as Office A, Owner B and outsider. | Only the authorized owner can replace A's office grants under the reviewed contract; `team.manage` must not silently override owner-only grants. Foreign target membership is rejected. |
| TEAM-05 | Replace grants with empty, unknown and mixed valid/invalid capability sets; run a bounded competing save in staging before any production counterpart. | Empty means no rights; invalid sets do not partially apply; resulting grants are one coherent authorized set. |
| TEAM-06 | Test a locally granted but globally disabled capability and a globally enabled but ungranted capability. | Both deny office access; owners retain their proper account-scoped authority. Do not change live global flags solely for the case. |
| TEAM-07 | Remove a fixture office member and reuse the available seat; test capacity at the supported purchased limit. | Removed user loses access; membership/capacity counts are correct; replay does not add seats or charge again. Do not buy a live seat to fabricate the boundary. |
| TEAM-08 | Invite an existing workspace owner and an existing crew member. | Owner elsewhere stays office here; crew collision follows the product's explicit rejection/promotion rule with no silent escalation or duplicate membership. |

Invitation delivery, if included in execution, uses only named controlled recipients. Preserve invitation and membership audit history; cleanup is not a blanket deletion of records.

## 9. Revocation, suspension and caching

| Case | Procedure | Pass condition |
| --- | --- | --- |
| SESSION-01 | Revoke one grant while the office user has an open tab and retained access token. Request new page/API/Data API/action responses before and after refresh. | Future requests respect the revoked grant; no authorization wait until sign-out. Record the measured enforcement time. |
| SESSION-02 | Deactivate/remove the office membership with the session still active; repeat the same requests. | No future private access or write through any tested path, including signed-download minting and RPCs. |
| SESSION-03 | Suspend the test workspace using its supported isolated mechanism, then restore it. | UI and direct APIs deny according to suspension rules; restored access returns only to the previously authorized state. Customer workspaces are untouched. |
| SESSION-04 | Switch workspace in two open tabs; issue delayed and simultaneous reads plus a harmless fixture edit. | Responses and writes use a consistently authorized workspace; delayed B responses never populate A's view. The visible workspace and actual write target agree. |
| SESSION-05 | Log out A, sign in B in the same browser; use back/forward, reload, prefetch and alternate dashboard views. | A's protected UI/state is cleared; no reused shared response exposes A to B. Previously downloaded data cannot be retroactively erased, so distinguish retained data from new server disclosure. |
| SESSION-06 | Revoke access during a bounded in-flight fixture request. | Authorization is checked at the operation's defined point; no new unauthorized operation starts after revocation. Record any in-flight completion behavior explicitly. |
| SESSION-07 | Inspect authentication caches, shared/CDN caching, local/session storage and service-worker caches where present. | No cross-user/cross-workspace reuse of protected payloads; cache keys and invalidation preserve the same authorization boundary. |

Retain an old token to test actual revocation; a freshly signed-in denied user alone is insufficient. Previously issued signed URLs may have their own validity window: measure and document it rather than claiming immediate revocation of every bearer link.

## 10. Storage, public links and Realtime

Inventory the actual bucket visibility/policies and used channels at execution. The prior test suite names `insurance-proof`, `job-photos`, `lead-photos`, `site-videos`, `site-images`, `crew-photos`, and `account-attachments`; inspect new buckets too.

| Case | Procedure | Pass condition |
| --- | --- | --- |
| FILE-01 | Upload/read a permitted fixture through the app and user-token Storage API. | Correct account/path and allowed content; positive owner and office controls prove the path works. |
| FILE-02 | A lists, downloads, signs, overwrites, upserts, moves or deletes B's private fixture object. | All unauthorized operations deny; B's object contents/metadata remain unchanged. |
| FILE-03 | Substitute foreign parent IDs, account prefixes, encoded traversal and mismatched file/database ownership. | App signing/upload helpers and storage policies both maintain tenant ownership. Only bounded fixture paths are tested. |
| FILE-04 | Try financial PDFs/pay documents as no-finance office user, including valid private paths. | Same-account file access does not bypass document-level financial permissions. |
| FILE-05 | Test published assets and customer bearer links separately from private assets. | Intentional public data stays available without exposing private object listings, adjacent objects or broader client/workspace data. Share-token scope/revocation/expiry follow the declared contract. |
| FILE-06 | Remove member access, try minting a new URL, then measure an already issued fixture URL through expiry. | New signing is denied; any remaining bearer access matches the documented acceptable TTL. If the requirement is immediate invalidation, a still-valid URL fails it. |
| RT-01 | Subscribe as A to A and B fixture channels, including used `account:${accountId}:crew-locations` channels and applicable database changes. Emit one controlled update in each. | A receives the expected authorized event and no B event. An idle subscription with no events is not proof. |
| RT-02 | Subscribe as office without the relevant grant, crew, outsider and anonymous actors; try publish/presence as applicable. | Subscribe, receive and publish permissions follow the channel contract; private topics cannot be entered by guessing their name. |
| RT-03 | Revoke a grant/membership while a channel is already connected, then send a controlled fixture update; reconnect as well. | Established and new connections enforce the documented revocation behavior; no newly unauthorized private payload is delivered. |

Storage and Realtime require their own request-level proof; passing ordinary table reads does not certify these paths. [Storage access control](https://supabase.com/docs/guides/storage/security/access-control), [Realtime authorization](https://supabase.com/docs/guides/realtime/authorization)

## 11. Evidence, side effects and cleanup

- [ ] **EVID-01 — Record each concrete case.** Store case ID, UTC timestamp, deployment/schema reference, actor ID, active workspace, grants, fixture ID, interface/method, expected result, actual status/response shape, evidence reference and PASS/FAIL/BLOCKED/NOT APPLICABLE. Expand route/table/bucket matrices into individual rows. NOT APPLICABLE requires a reason and scope decision; a broken or untested enabled feature is not N/A.
- [ ] **EVID-02 — Capture both halves of proof.** Pair each denied access with an authorized read of the same existing fixture. For permitted writes, independently read the exact persisted change. For denied writes, verify affected rows and downstream effects stayed unchanged. Save redacted screenshots and request/response samples; remove access tokens, cookies, signed URLs, provider secrets and unrelated personal data before evidence is stored or committed.
- [ ] **EVID-03 — Reconcile business effects.** Compare fixture-scoped payments/charges/refunds, credit ledger/grants, billing jobs, messages/outbox rows and provider IDs before/after. Unauthorized and replayed requests must add no effects. Expected fixture setup effects need their own manifest entries; live global counters are not reliable because unrelated production activity can continue.
- [ ] **EVID-04 — Handle discoveries.** Stop the affected probe on unexpected private access or a side effect. Preserve minimal redacted reproduction evidence and exact request IDs, then fix/redeploy and rerun the failed case, its positive control and adjacent permission cases. Do not weaken authorization to achieve a green screen.
- [ ] **EVID-05 — Clean up by exact ID.** Revoke temporary sessions and invitations, restore prior grants/account state, and remove or archive only manifested test records/files in dependency order. Preserve required audit/financial history. Re-running cleanup must change nothing; reconcile fixture effects again afterward.
- [ ] **EVID-06 — Publish the result.** List passed scope, failures, blocked cases and remaining risks with links to evidence. Report any unsupported office features truthfully. Update the prelaunch checklist only for the production behavior actually proved at the recorded release.

Suggested result record:

```text
case: FIN-01/client-detail/office-work-reader
environment: production app hostname + Supabase project
release: commit + deployment ID; schema/permission snapshot reference
actor: fixture user ID; role=office; workspace=A
effective_grants: clients.read, jobs.read
target: manifested client A / job A
request: GET /dashboard/clients/<fixture-id>
expected: correct contact/job scope; restricted financial values absent
observed: <actual response status, permitted fields and restricted sentinel checks>
control: owner fixture read reference
effects: fixture row/ledger/outbox before-and-after references unchanged
evidence: docs/tenant-office-browser-evidence-2026-09-09.json
result: <PASS, FAIL or BLOCKED from the actual observation>
```

## 12. Existing checks: useful support, not production sign-off

Inspect these at the frozen release before running them. Environment resolution and setup/cleanup behavior must be understood first.

| Existing check | What it actually establishes | Limit |
| --- | --- | --- |
| `npm run verify:tenant-isolation` | Direct PostgreSQL owner row-count comparison under `SET LOCAL ROLE authenticated` and injected JWT claims; transaction rollback | Loads `.env.local`/`.env` and uses `DATABASE_URL`. Default tables are clients/leads/jobs. No real sign-in, office grants, exact row-identity comparison, financial columns, browser/API actions, Storage or Realtime proof. Equal counts alone can hide wrong row identities. |
| `npm run test:pg17:office-read-grant` | Disposable embedded PostgreSQL capability/policy behavior | Reconstructed historical schema/helpers and selected migrations, not the entire current production schema or an issued user session. |
| `npm run test:pg17:office-collision` | Disposable PostgreSQL invitation, membership and capacity scenarios | Supports regression confidence, not current production identity/entitlement behavior. |
| Office access/context/sign-in/clients/job-detail/permissions tests under `test/` | Source contracts, rendering and mocked application behavior, depending on file | A green unit suite cannot establish deployed RLS or browser payload confidentiality. |
| `test/tenant-idor-guard.test.ts`, `test/multi-tenant-dashboard-isolation.test.ts`, `test/service-role-scoping-audit.test.ts`, `test/rls-schema-coverage.test.ts`, `test/rls-suspension-hardening.test.ts` | Supporting application/schema/guard regressions | Inspect individual tests; coverage is not equivalent to a live actor/interface matrix. |
| `test/storage-realtime-tenancy-matrix.test.ts` | Mocked storage helper and channel/guard checks | Does not establish real bucket policies or live authenticated delivery. |
| `test-staging/field-app-rls.test.ts` | Transactional PostgreSQL field-role checks in staging using assigned claims | No production sign-in, app HTTP flow or office acceptance. |
| `scripts/test-rls.mjs` | Older fixture-creating RLS probe using a hardcoded user and `.env.local` | Not a drop-in safe production acceptance runner; review/replace its setup and cleanup before any use. |

The required execution work is a small **real-session browser/API harness** with fixed target/fixture allowlists, explicit grant snapshots, per-case evidence and cleanup. Supplement it with the schema audit and disposable PostgreSQL checks. Do not rename the existing count script's output “authenticated production office verification.”

## 13. Actual execution results — September 9, 2026

The final Chromium/HTTP run executed **36 cases: 33 passed and 3 failed** on the production release above. Exact request observations, capability transitions and before/after counts are in [tenant-office-browser-evidence-2026-09-09.json](tenant-office-browser-evidence-2026-09-09.json); methods, findings, reproduction and limits are in the [dated report](tenant-office-browser-verification-2026-09-09.md).

The open failures are direct Data API quote disclosure to `jobs.read`, price mutation with operational-only `jobs.write`, and cross-workspace `client_id` assignment. Browser/Focus redaction, real B-owner/A-office/B-owner switching and subsequent-request access revocation passed. Fixture mutations were restored and test access cleaned up.

The earlier [83-case report](tenant-office-verification-evidence-2026-09-09.json) is retained only as explicitly invalidated historical evidence. Its SQL-only runner has been replaced by the real browser harness. Unchecked items above require case-specific evidence; this audit does not certify the entire plan, Storage, Realtime, crew, invitations, every financial category, concurrent operations or every route.
