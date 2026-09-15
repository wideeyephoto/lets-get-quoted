# Lien Help: Lean MVP Implementation Plan

**Product:** Let's Get Quoted (LGQ)  
**Date:** September 15, 2026  
**Status:** Proposed implementation plan; application changes have not been made by this task.  
**Recommendation:** Build a private project packet and provider handoff, followed by contractor-entered updates and supporting documents.  
**Source baseline inspected:** Local checkout `C:\dev\CLAUDE CODE FOLDER`, branch `temp-fix-typecheck`, observed HEAD `8af29fc8a`. This checkout is active; verify the implementation base before starting. Production deployment and database state were not inspected.

## 1. Product decision

The first version helps a contractor prepare information, continue with a specialist, and keep the resulting records against the job.

**Completion criterion:** An account owner can start before or after invoicing, review a project packet, download it, visit a provider, return to save a case reference and evidence, and find their next follow-up date. Every saved result survives reload and is private to authorized users.

### Decisions for this version

| Area | Implementation decision |
| --- | --- |
| Customer-facing name | **Lien help**; entry action **Get lien help**. |
| Entry points | Job detail and its payment/invoice context. Available before a payment is overdue. |
| Access | Account owners only for the pilot. The existing office capability system is the extension point for later access. |
| Organization | One case per job, with multiple notices, provider updates, and documents inside it. Reopening retains the same case and history. |
| Provider | One vetted outbound destination; Levelset is the first candidate. Support recording the name/reference of a contractor's existing provider as free text. |
| Document delivery | Contractor downloads a ZIP containing a PDF summary and selected documents, then supplies it to the provider. |
| Payment | Contractor orders and pays directly with the provider. LGQ has no filing charge in this version. |
| Status | Contractor-entered updates, explicitly attributed. Uploaded evidence supports a reported milestone; LGQ does not independently verify recording or legal validity. |
| Follow-up | One next-action date per case, visible on the case and in an owner-only Payments section. It is a date entered by the contractor, optionally sourced from provider instructions. |
| Availability | Server-side pilot flag and account allowlist. Included for enabled owners without introducing a new subscription product. Existing storage allowances apply. |

### Scope boundary

Direct provider APIs, OAuth, automatic document submission, automatic legal deadlines, mailing, recording, filing-fee collection, referral commissions, legal document generation, AI eligibility decisions, and automated customer communications are later work. Court enforcement and preparation of lien releases stay with the contractor's provider or counsel.

Existing lien waivers remain a distinct product workflow. A waiver, a preliminary notice, a notice of intent, and a recorded lien must not share interchangeable labels or status meanings.

## 2. Current implementation and required cleanup

These are observations from the local checkout, not findings about production usage.

| Existing area | Observation | Plan |
| --- | --- | --- |
| `src/lib/levelset-api.ts` | Generates a random order ID and simulated `processing`; its status helper returns `mailed`. | Remove production dependence on these functions. Any retained simulation belongs only in explicit test fixtures. |
| `src/app/api/liens/file/route.ts` | Calls that simulation, accepts account/job/amount fields from the request, and records a $45 placeholder cost. Billing is commented out. | Disable this ordering endpoint independently of the new feature. A direct request must never return a successful filing or charge. |
| `migrations/20260915110000_lien_filings.sql` | Defines provider-order records with `processing` and $45 defaults; uses a JWT account claim for policies. | Establish whether it has been applied and whether rows exist. Create additive changes where needed; preserve applied migration history. Do not treat this table as the new case model. |
| `src/lib/noi-generator.ts` and Payments actions | Generate statutory language using a default ten-day period without state input. | Retire the generic statutory-generation path from this release. Route its entry points to Lien help. |
| `PaymentModals.tsx` | Presents SMS as service of a statutory notice; its tracking button reports success without persistence. | Remove those actions from the new flow and block stale server calls. Replace tracking with persistent, attributed evidence entries. |
| `ReceivablesAgingBoard.tsx` | Offers the current NOI action after 30 days overdue. | Replace with the new job-linked action. Invoice age is context, not a determination of legal eligibility. |
| Job and payment pages | Already contain invoice, payment, change-order, photo, and waiver surfaces. | Reuse authorized data loaders and document renderers; add a focused case page. |
| `account-attachments.ts` | Staff-oriented storage explicitly bypasses contractor capacity admission. | Reuse its private-storage ideas, not the staff upload path or authorization assumptions. |
| `job-tasks.ts` | General job checklist has no due-date field and is used in job/field contexts. | Store private follow-up details on the lien case. |
| `docs/legal-review-brief-2026-09.md` | Already identifies lien/NOI validity for review. | Update it with the retired paths, proposed handoff copy, and remaining waiver questions. |

**Change since the earlier discussion:** The simulated filing files were initially untracked. In this inspection they are tracked; `git log` shows `c45be7abb` as the latest change to the adapter. Treat them as current source requiring a deliberate retirement, not disposable uncommitted drafts.

### Legacy disposition

1. Before rollout, inspect the deployed revision, endpoint reachability, migration history, and counts/statuses of legacy rows using read-only checks.
2. Establish the provenance of each legacy row. Simulation-shaped IDs are a review signal, not proof that a real order exists or does not exist.
3. Preserve records in place or in an audited migration snapshot. Present uncertain records as **Legacy record — filing unverified** if surfaced.
4. Import a reported milestone into a new case only with an identified source and supporting evidence. Never copy `processing`, `mailed`, or the placeholder fee into a confirmed real-world result.
5. If real customers relied on a simulated confirmation, prepare a concrete remediation proposal identifying affected records. Customer outreach is separate work and requires explicit authorization.

## 3. User experience

### A. Enter and start a case

- Place **Get lien help** in job actions. Once a case exists, use **Open lien help** and show its last update.
- Add the same action to invoice/payment context, passing the job and relevant invoice identifier. Server-side ownership checks remain authoritative.
- Do not require an invoice, positive balance, or overdue status to start. Early project notices may precede billing.
- If an old payment has no valid job association, explain that the contractor must select or create the correct job. Do not silently assign one.
- Creating the case is an explicit action, not a side effect of page load or browser prefetch.
- Use one focused page at proposed route `/dashboard/jobs/[id]/lien-help`, with sections for project details, documents, provider, and updates. Avoid adding a global navigation destination.

Introductory copy:

> Prepare your project information, continue with a filing provider, and keep the resulting documents with this job.

Ask why the contractor is seeking help: **Early project notice**, **Unpaid work**, or **Track an existing case**. This describes their intent and does not select a legal remedy.

### B. Review project information

| Information | Source and behavior |
| --- | --- |
| Contractor business name/contact | Prefill from account and existing business-name resolution. Allow a case-specific correction without overwriting account settings. |
| Customer / hiring party | Prefill from job. Keep separate from property owner. |
| Property owner | Separate name/contact fields; unknown is allowed. Explicit confirmation is required to copy the customer into this field. |
| Job address, state, county | Prefill known address fields. County can remain unknown; do not infer it silently from a ZIP code. |
| Contractor role | Owner selects direct contractor, subcontractor, supplier, or unsure. |
| Project type | Private residential, private commercial, public, or unsure. Public/unsure cases continue through provider review without implying a private-property lien applies. |
| Work description and dates | Record actual first/last work or delivery dates separately from scheduled dates. Unknown remains unknown. |
| Financial records | Show relevant invoices, net recorded payments, refunds, pending/disputed items, and selected outstanding balances. |
| Existing notices / provider | Optional prior notice dates, provider name, case reference, and documents. |

Allow saving incomplete drafts. Distinguish **Information to confirm** from an actual validation error. The provider link remains available when information is missing; the product must not imply that completing LGQ's form is necessary before seeking time-sensitive help.

For packet generation, require explicit review of the included information and document selection. Unknown fields appear as **Not provided**. Do not create filler facts, a legal property description, a license assertion, a signature, or an approval date.

### C. Select and download the packet

Display a preview of the summary and an attachment checklist. Nothing is selected simply because it exists somewhere in the account.

Eligible material:

- Selected invoices and a payment-history summary.
- Existing executed contracts or approved documents the contractor supplies.
- Approved change-order records, with their source approval metadata.
- Selected job photos and uploaded supporting documents.
- Prior notices, delivery receipts, recording documents, and release evidence selected by the contractor.

Internal margins, crew pay, tax IDs, card/bank details, platform fees, access tokens, private messaging credentials, and unrelated account files are excluded. Conversation exports are deferred; the contractor can attach specific correspondence as a file.

If LGQ lacks an original signed contract, say so and allow upload. A generated current invoice is labeled as a current LGQ rendering, not an original signed document. Reuse actual source records without inventing contractual evidence.

### D. Continue with the provider

Show the vetted provider's name, its verified destination, and:

> Continue with [Provider] to review available services and pricing. You will supply your packet and place any order directly with them.

Opening the provider page sends no project information and does not mean an order was submitted. Record the click only as an outbound visit. Open the destination in a new tab without leaking the case URL through the referrer.

The contractor separately selects **I contacted the provider**, enters a case reference when available, and records the date. Saving this moves the case to **With provider**. A failed analytics request must not block the outbound link.

The packet download and manual provider-reference fields remain usable if the recommended provider link is temporarily disabled.

### E. Save updates, evidence, and follow-up

Each update records the actor, date entered, date of the reported event, provider reference, and relevant documents. A user may record an event that happened before the LGQ case was created.

Support these milestones:

- Provider contacted / provider update.
- Notice reportedly sent or delivered.
- Lien submitted for recording.
- Recorded document saved.
- Rejected / further information requested.
- Release document saved, linked to the recorded document it concerns.

The private case history shows **Entered by [name] on [date]** and an evidence link. Use **Reported — evidence missing** when appropriate. **Recorded document saved** requires the recorded document, jurisdiction, recording date, and recording reference or an explicit note that the reference is absent from the supplied document. A receipt for submission alone cannot satisfy this milestone.

For release evidence, reference the original recording event; a release for one recording must not resolve other recordings on the case. Do not label uploaded evidence **Verified by LGQ**.

Store one next follow-up date, a short action, and a source: **My follow-up** or **Date provided by provider**. Provider-sourced dates require a source note/reference. Store dates as calendar dates and compare them using the account time zone. Overdue means the entered follow-up date has passed, not that lien rights have expired.

An owner-only Payments section lists upcoming and overdue follow-ups with links back to the case. The first release does not promise background email, SMS, or push reminders.

### F. Close or reopen

Case lifecycle is **Preparing**, **With provider**, or **Closed**. Document milestones are separate history, not a forced linear filing sequence.

Closure requires a reason: resolved before filing, no further action, provider declined, release documented, or other with a note. Closing is an administrative action in LGQ. It does not assert cancellation, release, or discharge of any lien.

If recorded documents lack linked release evidence, preserve that fact prominently even on a closed case. Payment arriving in LGQ must never auto-close a case, mark a lien released, or remove evidence. Reopening keeps the complete prior history.

## 4. Financial correctness and packet snapshots

The exported balance is **the balance shown by selected LGQ records as of a stated time**. It is not a computed legally lienable amount.

Implementation rules:

1. Use `computeInvoiceTotals`, `paymentsForInvoice`, `paidTowardInvoice`, and the existing invoice/payment state rules. Use integer cents for stored packet amounts and calculations.
2. Begin with the selected invoice from the entry point, then let the owner choose other relevant invoices. Exclude draft/void invoices from amounts owed; they may only be included as clearly labeled background documents if needed.
3. Do not add the job's quote to its invoices. Do not count an approved change order twice when it is already reflected in invoice items. If invoice relationships are ambiguous, show per-invoice figures and request reconciliation before presenting a combined balance.
4. Include refunds in net paid amounts. Requested, failed, canceled, pending, and disputed payments retain their actual labels and are not silently treated as settled cash.
5. List unapplied or unlinked payments separately. Do not guess how they reduce selected invoice balances.
6. Additional amounts claimed by the contractor, if provided, are separately labeled **Contractor-entered amount for provider review**, with an explanation. They never overwrite the accounting ledger or get silently added to the displayed balance.
7. Create the packet from a coherent server-side snapshot of the selected rows and case revision. Store source IDs, relevant revisions/values, review timestamp, and schema version.
8. Compare the reviewed state with the current source state at export. If relevant data changed, ask the owner to review the updated preview. After that snapshot is accepted, subsequent payment changes do not mutate an existing packet.
9. Show **Newer job/payment information is available** when the current case differs from its last packet. Regeneration makes a new numbered packet and preserves the previous version.

Financial acceptance fixture: a $10,000 invoice, $4,000 settled payment, and $500 refund yields $3,500 net paid and $6,500 remaining. A requested additional payment does not reduce that balance. Validate the same scenario with the shared invoice helpers and packet output.

## 5. Packet and upload implementation

### Packet contents

Proposed download name: `LGQ-[job-ref]-Lien-Help-v[number].zip`.

- `Project-summary.pdf`: reviewed parties, location, role/type, dates, work description, selected financial records, information still unknown, and preparation timestamp.
- `Document-index.pdf` or a section in the summary: each filename, category, source, and whether it is a supplied original or a current LGQ rendering.
- `Documents/`: the selected files, with collision-safe filenames. Preserve supplied original bytes; do not rewrite signed PDFs or insert stamps into evidence.
- A small machine-readable manifest for reproducibility: packet version, file hashes, source references, and generation time. No access tokens or temporary signed URLs.

Every summary clearly states: **Project information for provider review. Preparing this packet does not send a notice or file a lien.**

### Bounded first version

Proposed pilot limits: PDF/JPEG/PNG uploads, 10 MiB per uploaded file, 20 selected supporting files, and 25 MiB total packet size. Generated summaries are included in the total. These are implementation defaults to validate with realistic signed-contract samples, not provider restrictions.

Existing WebP/AVIF job photos may be included in their original format; list that format in the index. Do not silently transcode evidence. Files that exceed the limit remain available individually; the UI explains how to reduce the packet selection or supply them separately to the provider.

Use the existing `pdfkit` dependency for the summary and invoice rendering. Select one maintained, pinned ZIP library during implementation if the repository still lacks one. Benchmark generation with the largest supported packet before settling the production runtime budget. Do not add an asynchronous generation platform to the MVP; reduce limits if the bounded synchronous build cannot fit reliably.

### Private storage

Use a dedicated private `lien-help` bucket, with immutable paths such as `accountId/caseId/objectId.ext`. Store object identifiers, not public URLs, in the database.

1. A small authenticated request authorizes an upload, checks the owner and case, checks the declared size/type and storage allowance, and allocates an immutable path.
2. Upload bytes directly to private storage with a narrowly scoped, short-lived signed upload capability. Avoid sending large multipart files through Server Actions.
3. Finalize by checking the actual stored object size, file signature/type, ownership binding, and case revision. Only finalized files are selectable or downloadable as evidence. Failed finalization removes/quarantines the object and reports failure; it cannot return a successful attachment.
4. Reject executable/HTML/SVG content and archives as uploads. Do not fetch arbitrary user-provided document URLs or unpack uploaded files.
5. Generate the bounded packet server-side, persist it privately, and mark it **Ready** only after its files and metadata are complete. Partial packets are failures, not successful downloads with omitted evidence.
6. Issue short-lived signed downloads only after fresh authorization. Persisting a packet does not make it publicly accessible. Use private/no-store responses for sensitive metadata and download authorization.
7. Expired download links can be refreshed by an authorized owner. A previously issued signed URL remains a temporary bearer capability until expiry; use a short lifetime, proposed 60 seconds, and document that practical limit.
8. Include the bucket in both `METERED_STORAGE_BUCKETS` and the matching SQL function, plus capacity, cleanup, and account export/closure handling. Do not copy the staff attachment capacity bypass.

Admission and upload finalization must handle concurrent uploads and actual sizes. Pending uploads and failed exports need expiry-based cleanup using the existing cleanup facilities where suitable. Record the storage provider's actual signed-upload expiry and clean abandoned objects after that capability has expired; do not assume LGQ can revoke it sooner. Retry cleanup on the next existing sweep, or add a small cleanup operation if the current sweep has no suitable extension point. This is operational file cleanup, not a legal deadline.

The access-control approach follows the separation between private objects and storage policies in the [Supabase Storage documentation](https://supabase.com/docs/guides/storage/security/access-control).

## 6. Data model

These are proposed table/field names, not an instruction to apply SQL during planning. Use a new CLI-generated migration during implementation and update the canonical schema.

| Table | Purpose and principal fields |
| --- | --- |
| `lien_help_cases` | `id`, `account_id`, `job_id`, `purpose`, `lifecycle`, `revision`, reviewed party/location/work fields, provider name/reference, next-action date/text/source, closure reason, actor/timestamps. Flexible reviewed intake can use schema-versioned JSON; ownership, lifecycle, date, and revision remain typed columns. |
| `lien_help_documents` | `id`, `account_id`, `case_id`, category, storage object path, safe filename, MIME, actual byte size, SHA-256, upload/finalization state, source type/ID, actor/timestamps. Evidence corrections add a superseding row. |
| `lien_help_packets` | `id`, `account_id`, `case_id`, version number, request ID, case revision, immutable reviewed snapshot and manifest, build state/error code, private ZIP path, size/hash, review/generation timestamps and actor. |
| `lien_help_events` | Append-only private history: case/account, event type, actual event date, actor/entered timestamp, source/provider reference, evidence document IDs, related recording event ID, note, operation ID. Holds state changes and evidence milestones in the same transaction as their mutation. |

### Integrity and access requirements

- Unique `(account_id, job_id)` for one case per job; duplicate create/retry returns the existing case.
- Unique packet `(case_id, version)` and `(account_id, request_id)`; request IDs also deduplicate event submissions.
- Bind case/job/account and document/event/packet relationships with composite foreign keys or equivalent database constraints. Same-account objects from an unrelated job/case cannot be attached by changing IDs in a request.
- Foreign-key indexes and read indexes: cases by account/job; active follow-ups by account/date; documents and packets by account/case; events by account/case/entered time. Use a partial follow-up index for open cases with a date.
- Apply row-level security to all four tables. Owner policies use the existing membership-based `public.is_owner(account_id)` convention after confirming its live definition. Do not trust a submitted account ID or adopt the placeholder migration's JWT account-claim pattern.
- Grant only the operations needed by the implementation. Revoke public/anonymous function execution and unused table privileges explicitly. Mutations that enforce versioning/history must not have a direct table-write bypass.
- Critical mutations use a transactional database function: verify owner/account/case, enforce expected revision, make the change, and append the event together. Prefer invoker execution; if a restricted definer function is necessary, use a private schema, fixed search path, explicit membership checks, and tightly scoped execution rights.
- A stale revision returns a conflict, allowing the owner to reload or reapply edits. Do not silently overwrite another open tab's changes.
- Normal UI operations never rewrite historical events or packet snapshots. Corrections append a new event with a reason.

Feature admission must also cover callable database mutations. An authenticated owner must not bypass the disabled pilot by invoking a mutation RPC directly. Either restrict those operations to an already-authorized server path with no browser-role execution grant, or use one authoritative private release-control record that both the application and the database guard consult. Decide this wiring in work package 2; an environment-only UI check is insufficient. Database authorization must still verify the current owner membership independently of the feature flag.

The existing tenant audit helper is a useful format reference, but calling it after an unrelated write does not make both operations atomic. Keep detailed lien history in its owner-only table; do not expose it through a general job feed or activity view available to office/crew users.

RLS and Data API grants are separate controls. Verify both with the current [Supabase RLS documentation](https://supabase.com/docs/guides/database/postgres/row-level-security) and [Data API security guidance](https://supabase.com/docs/guides/api/securing-your-api). The [Supabase changelog](https://supabase.com/changelog) reports changes to automatic table exposure; new migrations must not rely on implicit grants.

## 7. Authorization and privacy

| Actor | MVP access |
| --- | --- |
| Account owner | Read/write own cases; select documents; generate/download packets; record provider updates; manage follow-up and closure. |
| Office user, including a user with Payments access | No lien-case access in this pilot. Do not serialize hidden case data into their page props. |
| Crew, subcontractor, homeowner, public visitor | No access via UI, direct route, Server Action, Data API, storage object listing, or signed-link minting. |
| LGQ support staff | No new case-content access introduced. Any later support access must use the existing authorized support workflow and be audited. |
| Filing provider | Receives only what the contractor personally supplies outside LGQ. No LGQ portal token or account access is created. |

Use `requireOwnerContext()` for owner pages/actions and an equivalent API guard that returns appropriate 401/403 responses instead of HTML redirects. Derive account and actor from the authenticated session; check role/account state again on each mutation and download authorization.

Authorize the job, selected invoices, payment associations, source files, case documents, and packet independently. A bucket path prefix alone proves insufficient ownership. Any service-role storage access must follow a fully authorized server-side lookup of the exact object.

Do not publish case data into homeowner timelines, ordinary job tasks, shared attachment galleries, Realtime channels, search indexes, customer notifications, or client-side analytics payloads. Analytics should contain event names and opaque identifiers, not addresses, balances, filenames, notes, or provider reference numbers.

New tables and storage objects must be registered in the data-disposition/export system. Job soft-delete keeps the case and evidence recoverable and removes it from active follow-up lists. Job permanent deletion must run the agreed disposal/legal-hold workflow in dependency order; do not introduce silent cascading loss of case evidence. Account closure and portability tests must include the new bucket and tables. Reuse the established retention policy subject to the existing legal review; do not invent a national lien-record retention period.

The server must authorize every operation even when a button is hidden. This follows the action-boundary guidance in [Next.js Data Security](https://nextjs.org/docs/app/guides/data-security).

## 8. Application structure and operations

Use Server Components for initial reads, small client components for forms/upload progress, Server Actions for metadata changes, and authenticated Route Handlers for upload authorization, packet generation, and downloads. Reuse existing loading/error/modal styles.

### Proposed files

Paths in this table are implementation targets relative to the repository; new files do not exist yet.

| Area | Proposed files / changes |
| --- | --- |
| Case domain | `src/lib/lien-help.ts`: types, validation, allowed transitions, evidence requirements, date and status labels. |
| Authorized data access | `src/lib/lien-help-data.ts`: scoped reads and calls to transactional mutation functions. |
| Financial snapshot | `src/lib/lien-help-snapshot.ts`: selected-record snapshot using existing invoice/payment helpers. |
| Storage | `src/lib/lien-help-storage.ts`: upload authorization/finalization, immutable objects, signed downloads, cleanup. |
| Packet | `src/lib/lien-help-packet.ts`: PDF summary, document index, ZIP assembly, hashes and manifest. |
| Provider configuration | `src/lib/lien-help-provider.ts`: one enabled HTTPS destination, display name, reviewed-on metadata; no secrets or customer payload. |
| Feature admission | `src/lib/lien-help-access.ts`: global enable switch plus pilot account allowlist and distinct provider-link switch. |
| Case UI | `src/app/dashboard/jobs/[id]/lien-help/page.tsx`, `actions.ts`, and focused form/document/history components. |
| Entry points | Job detail; `RevenuePaymentsScreen.tsx`, `PaymentsLedgerTable.tsx`, `ReceivablesAgingBoard.tsx`, and their data/type wiring as applicable. |
| Binary boundaries | Proposed `/api/lien-help/...` handlers for upload authorization/finalization, packet build, and download authorization. |
| Existing cleanup | `levelset-api.ts`, `/api/liens/file`, `noi-generator.ts`, Payments NOI actions/modal, `sms-templates.ts`, and related help/catalog copy. |
| Platform integration | CLI-generated migration, `schema.sql`, storage metering SQL/TypeScript, disposition/portability cleanup, existing admin flag controls if used. |
| Tests | Domain, packet, tenant/storage access, database transaction/integrity, and focused browser flow tests. |

### Operation contract

| Operation | Required result |
| --- | --- |
| Create/open case | Owner + job checked; explicit create deduplicates by job; GET performs no writes. |
| Save intake | Validated fields, expected revision, atomic save + event. Case corrections do not mutate the job/account. |
| Authorize/finalize upload | Bound immutable object; actual bytes validated; finalized evidence visible only after success. |
| Review/build packet | Snapshot revision checked; stable request ID; complete ZIP stored; retry returns the same successful packet or safely rebuilds a failed attempt. |
| Download document/packet | Fresh owner/account/object check; short-lived capability; no public invoice endpoint used as an authorization shortcut. |
| Record update / handoff | Explicit contractor action, source attribution, evidence rules, revision check, atomic event. |
| Set follow-up | Calendar date + text + source saved; no claim that an external reminder was sent. |
| Close/reopen | Reason and actor retained; no automatic legal milestone; recorded/released evidence remains visible. |

Use structured error codes for forbidden, missing, conflict, validation, capacity, unsupported file, generation failure, and temporary storage failure. Return a truthful error if a required read fails; do not substitute an empty balance or empty document list.

## 9. Provider and content readiness

Levelset is the first candidate because its published material describes document ordering and related support. This is evidence for evaluation, not evidence of an LGQ partnership or agreed commercial terms. Its public help page distinguishes presenting a lien for recording and document delivery/tracking. [Levelset document-order help](https://www.levelset.com/support/document-order-help/)

Before enabling the outbound destination, record:

1. A working official customer intake URL and whether a new contractor can use it without an enterprise contract.
2. Supported project types, customer roles, and jurisdictions for the pilot; the support path for unsupported or urgent cases.
3. What information/files the provider accepts, whether ZIP contents must be uploaded separately, and the quote/order steps the customer will see.
4. Who performs property research, document preparation, service/recording, rejection handling, and post-recording guidance. Distinguish administrative processing from legal advice.
5. How the contractor obtains delivery evidence, recorded copies, corrections, and releases.
6. Permission for any logo/partnership claim. An ordinary accurate outbound link does not establish a partnership; use text-only branding until rights are established.

Do not hardcode a filing price. Display **Pricing is provided by [Provider]** and link to its current ordering flow. No API approval, provider account credentials, or payment integration is necessary for this handoff release.

Early entry matters: California's licensing board describes preliminary notice timing tied to first work/material delivery and the consequence of lateness. That is an example of why a universal overdue-invoice trigger is inadequate, not a rule LGQ should generalize nationally. [California CSLB guidance](https://www.cslb.ca.gov/Consumers/Legal_Issues_For_Consumers/Mechanics_Lien/If_A_Mechanics_Lien_Is_Filed_Against_You.aspx)

Have the existing legal-review owner review the actual proposed copy, packet disclaimer, legacy-path retirement, privacy/retention treatment, and remaining waiver language. Legal review gates customer-facing claims; it does not prevent implementing and testing the neutral packet workflow.

## 10. Delivery sequence and effort

Estimates are planning ranges for one engineer familiar with this repository, with timely review. They exclude provider response time, counsel turnaround, unrelated failing checks, and repairs to unknown deployed legacy data.

| Work package | Deliverable | Dependencies | Estimate | Exit condition |
| --- | --- | --- | --- | --- |
| 0. Confirm baseline | Implementation checkout, deployed-state read-only inventory, provider intake check, final copy checklist. | None | 0.5–1 day | Known legacy disposition and implementation base; unresolved external items have owners. |
| 1. Contain legacy paths | Disabled simulated filing and generic NOI generation/service actions; truthful replacement/disabled copy. | Baseline source review | 0.5–1 day | Direct stale calls cannot file, charge, simulate success, or send a statutory notice. |
| 2. Case and storage foundation | Migration/RLS, owner admission, case/events, upload/finalization, storage/disposition integration. | 0 | 2–3 days | Two-account database/storage tests pass; case saves and evidence persist. |
| 3. Packet and case UI | Reviewed intake, financial snapshot, selected evidence, immutable PDF/ZIP, download and retry behavior. | 2 | 2–3 days | Realistic packet opens correctly and matches source records; stale review detected. |
| 4. Handoff and follow-up | Provider action, attributed milestones, evidence links, follow-up list, close/reopen. | 2; provider link review | 1–2 days | End-to-end preparation and manual return flow works without false provider status. |
| 5. Verification and pilot | Browser/accessibility review, security/retention regressions, rollout controls and support notes. | 1–4; reviewed public copy | 2–3 days | Release checklist passes on the release revision; pilot can be enabled and disabled safely. |

**Expected engineering effort: about 8–13 working days**, plus external readiness time. Keep work package 1 independently releasable. Packages 2–4 stay hidden until the flow is complete. A partner API is not on the critical path.

Use small reviewable PRs following these boundaries. Do not combine this feature with unrelated payment, quote, messaging, or shared-checkout changes.

## 11. Acceptance and verification matrix

Tests should exercise actual behavior and authorization. Source-text assertions can supplement but cannot replace database, storage, or browser checks.

| Scenario | Required evidence |
| --- | --- |
| Pre-invoice job | Owner creates case without invoice/payment; unknown data is explicit; provider help remains reachable. |
| Existing unpaid invoice | Correct job/invoice preselected; selected financial data and source documents appear in preview. |
| Customer is not owner | Separate names persist and export; no automatic equality assumption. |
| Part payment/refund | $10,000 / $4,000 / $500 fixture displays $6,500 remaining. Pending/disputed/unlinked payment cases retain correct labels. |
| Multiple invoice versions | No double counting of quote/change order/replacement invoice; ambiguous totals require review. |
| Source changes after preview | Packet build refuses stale review; accepted packet remains immutable after later payment/edit. |
| Document selection | Only selected authorized documents appear; an unrelated same-account job file is rejected. |
| Invalid or oversized upload | Actual-byte mismatch or invalid type cannot finalize; no selectable evidence or quota bypass. |
| Storage/export interruption | Failure remains failure; retry is safe; partial ZIP is never presented as ready; abandoned objects are cleaned. |
| Packet visual QA | Inspect rendered summary pages, long names/addresses, multipage tables, special characters, filenames, and extracted ZIP contents. |
| Download lifecycle | Valid owner gets usable download; expiry refresh works; guessed objects, expired sessions, and removed ownership cannot mint new links. |
| Provider click | No customer/project data in URL/referrer or outbound network request; click does not mark order placed. |
| Manual return | Provider contact/reference, notice tracking, and follow-up survive reload and show actor/source. |
| Recording vs submission | Submission receipt cannot satisfy recorded-document milestone. Missing evidence is visibly attributed. |
| Multiple recordings/releases | Each release links to the right recording; unresolved recordings remain visible. |
| Payment and closure | Payment never auto-releases a lien; administrative close/reopen retains history and unresolved evidence. |
| Role and tenant isolation | Owner A, owner B, office user with broad financial capabilities, crew, homeowner token, and anonymous callers tested through route, action, SQL/RLS, and storage surfaces. |
| Concurrent operations | Duplicate create/build/update retries deduplicate; stale edits conflict; state change and event either both commit or neither commits. |
| Privacy surfaces | No lien data in homeowner/crew/office page payloads, shared feeds, general tasks, logs, analytics, or public invoice routes. |
| Retention / deletion | Soft-delete/restore, hard-delete with retention/hold rules, portability, account closure, and orphan cleanup include all new records/objects. |
| Legacy calls | Old filing and NOI-generation/SMS calls cannot return fabricated success or initiate customer contact. Legacy rows are not promoted as real filings. |
| Feature disabled | New case/export/update routes are blocked as designed; existing owners retain the explicitly configured read/download access for their records. |
| Mobile/accessibility | Keyboard navigation, labels/errors, focus after upload failure, narrow-screen tables, progress indicators, and duplicate-click behavior verified. |

Run focused unit/component tests, real Postgres/RLS transaction tests, and storage integration tests using synthetic fixtures. Reuse existing `invoice-pay`, invoice PDF, storage usage, tenant isolation, payment action, SMS preview, and data-disposition suites where affected. Run typecheck, lint, and build on the final release revision. Use the browser verification skills when a dev server is started. Test packet rendering with the PDF skill during implementation.

Live provider validation is a read-only intake walkthrough until an actual filing is separately authorized. Never submit a fabricated lien as a smoke test. Real pilot cases are initiated and authorized by their contractors directly with the provider.

## 12. Rollout, operations, and rollback

### Proposed controls

- Global creation/mutation/export enable switch, checked server-side.
- Server-side pilot account allowlist; no new customer-editable account flag granting access.
- Separate recommended-provider-link switch, so a broken partner destination does not prevent owners reading their records.
- Existing-case read/download mode retained if the pilot closes, except when access itself is disabled for a security incident or account restriction.

Use one source of truth for feature admission across pages, actions, and handlers. The general switch and allowlist are deployment configuration; the UI never decides authorization.

### Release checklist

1. Confirm the release revision and all additive migrations. Never rewrite an already-applied migration.
2. Apply new schema, policies, indexes, explicit grants, storage setup, and registry changes with the feature disabled.
3. Run two-account/role checks and packet smoke tests on hosted staging with synthetic data.
4. Verify generic filing/NOI paths are disabled in the release and inspect any legacy-record remediation outcome.
5. Confirm provider URL, reviewed copy, retention handling, and a named support owner.
6. Enable for internal test accounts, then 5–10 consenting pilot contractors. No automatic invitation or outreach is part of implementation.
7. Observe generation success, capacity errors, duplicate/conflict handling, and support questions. Expand only after a complete real contractor journey has been observed without submitting anything on their behalf.

### Support ownership

LGQ handles packet contents, source data, downloads, account access, and saving records. The provider handles the contractor's order, pricing, accepted formats, service/recording updates, and its supported processing. Legal validity, contested claims, and enforcement questions go to the appropriate professional. Put these distinctions in a short support runbook with the verified contact destination.

Use structured operational logs with opaque case/packet IDs and error codes. Redact document content and personal/financial fields. Packet failures and policy failures should surface through existing monitoring; this feature does not need a separate operations dashboard.

### Rollback

Disable new mutations/exports and the provider link as appropriate, while preserving authorized access to existing documents. An isolated provider-link incident only disables that destination. A security incident may require disabling read/download authorization as well; account for the short remaining lifetime of already-issued links.

Keep new tables and objects during rollback. Do not restore simulated filing or generic statutory-notice actions. Apply a forward fix after preserving error evidence and affected operation IDs.

## 13. Pilot measurement and expansion decision

Record these product events without sensitive payloads: case created, intake reviewed, packet ready, download authorized, provider link opened, provider contact recorded, evidence saved, follow-up set, case closed, and case reopened. A download authorization is not proof the transfer finished; a provider click is not a conversion.

Measure:

- Number of distinct contractors completing packet preparation.
- Reported provider contacts and actual cases with returned evidence.
- Time to a usable packet and common missing fields/documents.
- Failed generations/uploads and support time per completed case.
- Requests for automatic status updates or less repeated data entry.
- Contractor-reported outcomes, kept distinct from money LGQ can independently observe.

**Proposed review point:** after 30–60 days or five completed provider-assisted cases across at least three contractors, whichever gives meaningful evidence first. This is a learning checkpoint, not proof of broad demand.

Consider a full API integration only if repeated usage and requests demonstrate a material manual burden, provider access/terms are confirmed, and projected customer value covers implementation and ongoing support. If usage is low, keep the handoff feature and its maintenance small. Do not add billing merely to measure interest.

## 14. Open dependencies and defaults

| Item | Default / owner | Required before |
| --- | --- | --- |
| Implementation base and live legacy state | Engineering establishes the release branch and performs read-only deployment/DB checks. | Migration and legacy cleanup rollout. |
| Provider choice and intake requirements | Product evaluates Levelset first; no partnership assumed. | Enabling recommended outbound link. |
| Customer-facing copy and retention treatment | Existing legal-review owner reviews the concrete screens/packet text and disposition proposal. | Customer pilot. |
| Office access | Owner-only in v1; add explicit future permissions only after demand is established. | No blocker for v1. |
| File limits | 10 MiB/file, 20 selected files, 25 MiB packet; engineering tests realistic samples and runtime limits. | Packet acceptance. |
| Pricing | Included helper; contractor pays provider directly. | No LGQ billing dependency. |
| Follow-up delivery | On-screen owner list and case date only. | No notification-service dependency. |
| Unknown facts or unsupported project context | Save unknown; offer provider review. | No national rules engine dependency. |
| Existing waiver functionality | Separate scope; preserve behavior unless a specifically reviewed correction is necessary. Track unresolved claims in the legal brief. | No automatic claim of waiver compliance from this project. |

## 15. Definition of done

- The four promised capabilities work: job entry, reviewed packet, provider handoff, and persistent results/follow-up.
- Simulated filing and generic statutory-service paths cannot produce customer-facing success.
- Source balances and evidence are accurate, selected deliberately, and preserved in versioned packets.
- Owners can distinguish local preparation, reported provider activity, submission, recording evidence, and release evidence.
- Owner/tenant boundaries are enforced at every exposed layer and tested with actual policies.
- No data is transmitted to a provider until the contractor supplies it themselves.
- Storage capacity, portability, retention, deletion, retry, and rollback behavior are verified.
- Hosted browser and packet visual checks pass on the release revision.
- Provider destination and customer-facing copy are reviewed, and the pilot has a support owner.
- Documentation clearly describes the manual handoff and contractor-entered status model.

**Roadmap summary:** prepare the packet, continue with the provider, keep the evidence, and use pilot results to decide whether deeper integration earns its cost.
