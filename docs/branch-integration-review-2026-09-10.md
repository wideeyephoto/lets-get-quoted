# Branch integration review — September 10, 2026

Reviewed 46 divergent local branches and 123 distinct non-merge commits against fetched main `7f72eaf84`. This review uses ancestry, exact patch matches, changed-file comparisons, current implementation and source evidence. An unmatched patch is not automatically missing functionality. Branches and original worktrees were preserved.

## Selected changes

- Operational outage paging and honest webhook inspection from `f51f24620`, with internal paging-ledger registration.
- Email lifecycle/campaign safety, truthful shared templates and mailing identity from `7be35f09b`.
- Quote-reminder conversation/approval checks and queue-time eligibility from selected paths in `ac9442042`, adapted to current SMS code and branding.
- Voice transfer outcome correction from `4d88aa1ad`.
- Client-statement net totals from `9e1eae3a2`, with a behavioral refund/visit-fee regression test.
- SMS HELP account binding and projection grants from `30606a916` and `bd151870c`; regenerated current messaging schema rather than replacing it with an old snapshot.
- Current domain-release evidence from `29e501b5b` and mockup noindex changes from selected paths in `7cbbacf85`.

The full operational observation, carrier/handset acceptance, actual paid renewals and staged security rollout remain separate launch gates. This integration does not run live provider drills or database mutations.

## Required follow-up

**Tenant financial confidentiality remains a launch blocker.** A read-only production catalog query confirmed `public.job_access` is absent. Source `51e25643b` requires ordered rollout: additive migration `20260909212204`, compatible client-adapter release and owner/office verification, then raw-column revocation `20260909212423` and the signed-in acceptance suite. The branch and its tested staging evidence are preserved. Publishing its unconditional adapter before the additive migration would break job reads/writes.

**Operational activation remains unverified for this new revision.** The paging ledger already exists in production under an earlier applied migration timestamp; deployment, scheduled cycles, operator delivery and appropriate observation must be checked. Historical 221-record disposition evidence is not equivalent to a completed new observation window.

**New audit evidence has limits.** The R09 concurrency test mocks capacity admission with a synchronous counter; production uses no such lock in that test. Its preservation assertion only inspects an in-memory object. These do not establish concurrent upload enforcement or actual file access after downgrade. R10's public probes do not establish that the deployed alias matches the reported candidate SHA. Only the concrete mockup noindex change was selected from that audit branch.

## Branch decisions

| Branch | Reviewed head | Decision | Reason / remaining work |
| --- | --- | --- | --- |
| `agent/ci-full-test-suite` | `e39c795cf` | Superseded | Current CI already runs npm test with Node 24; schedule capacity fixes also have a main-history equivalent. |
| `agent/crew-workflow-followup` | `b8b9b15dd` | Already represented | Every branch-only non-merge patch has a match in main. Preserve later fixes; do not replay the old patch. |
| `agent/dashboard-integrity-fixes` | `42aba2b3f` | Already represented | Every branch-only non-merge patch has a match in main. Preserve later fixes; do not replay the old patch. |
| `agent/enable-github-tests` | `abd8374c9` | Superseded | Current CI already runs npm test with Node 24; schedule capacity fixes also have a main-history equivalent. |
| `agent/schedule-workflow-overhaul` | `33d0566fc` | Already represented | Every branch-only non-merge patch has a match in main. Preserve later fixes; do not replay the old patch. |
| `archive/backup/ux-snapshot` | `d4110054a` | Keep archived | Historical whole-workspace WIP snapshots; applying them would overwrite many subsequent source changes. No isolated current defect justifies the bundle. |
| `audit/contractor-domains-20260909` | `29e501b5b` | Integrated | Reconciled the remaining three runbook/canary files; recorded released safeguards and certificate authentication while keeping deletion and elapsed-canary gates open. |
| `backup/billing-before-publish-20260910` | `f15bc59df` | Superseded | Current billing classification and inert parser fixtures supersede the old rehearsals. Preserve the current checkout compatibility and operational review registration. |
| `backup/ux-snapshot` | `21e85c702` | Keep archived | Historical whole-workspace WIP snapshots; applying them would overwrite many subsequent source changes. No isolated current defect justifies the bundle. |
| `codex/ai-receptionist-marketing` | `4cd01e764` | Optional feature held | Introduces a new public coverage/signup experience and media; it is not a missing repair. Voice claims and live acceptance must be reconciled before replacing the newer public pages. |
| `codex/email-campaign-audit-20260909` | `7be35f09b` | Integrated | Owner-recipient resolution, current-entitlement audiences, suppression/eligibility checks, cadence/idempotency, shared platform templates and consistent mailing identity. |
| `codex/pricing-live-20260828` | `1a05513d2` | Superseded claim held | Old patch advertises texting as live. Current messaging availability remains purpose/carrier dependent; do not restore a blanket live claim over current disclosures. |
| `codex/tenant-office-access-20260909` | `51e25643b` | Required fix held for staged rollout | Production catalog confirms job_access is absent. Apply additive view/guard/FK migration, deploy and verify adapter, then revoke raw financial SELECT and perform signed-in acceptance. Unconditional adapter deployment first would break job requests. |
| `docs/six-sku-private-evidence-20260908` | `7dec2060d` | Evidence retained | Historical SMS/Voice acceptance and private fixture records remain recoverable on the source branch. Relevant missing runtime SMS/Voice fixes are integrated separately; no blanket live acceptance is inferred. |
| `docs/sms-operational-acceptance-20260909` | `7f75db7dd` | Evidence retained | Historical SMS/Voice acceptance and private fixture records remain recoverable on the source branch. Relevant missing runtime SMS/Voice fixes are integrated separately; no blanket live acceptance is inferred. |
| `docs/voice-closeout-20260908` | `31518f3dd` | Evidence retained | Historical SMS/Voice acceptance and private fixture records remain recoverable on the source branch. Relevant missing runtime SMS/Voice fixes are integrated separately; no blanket live acceptance is inferred. |
| `feat/how-it-works-tour-popup` | `b8dd0f78a` | Optional feature held | Changes public demo/tour routing and authenticated navigation across 41 files. A product-flow decision and browser acceptance are still needed; do not restore old navigation wholesale. |
| `fix/billing-rehearsal-completion-20260909` | `264dd478a` | Code represented; evidence retained | Classification, mode rejection and operational review retention are already in main. Its additional production report remains dated source evidence, not a new acceptance run. |
| `fix/billing-rehearsal-noise-20260909` | `a8370ad6d` | Superseded | Current billing classification and inert parser fixtures supersede the old rehearsals. Preserve the current checkout compatibility and operational review registration. |
| `fix/custom-domain-automation-20260908` | `be3fffbff` | Already represented | Every branch-only non-merge patch has a match in main. Preserve later fixes; do not replay the old patch. |
| `fix/marketing-flows-20260910` | `35a04c0ab` | Already represented | Five exact patch matches; the sixth matches when package-lock.json is excluded. Main already contains the reconciled lockfile and all six repairs. |
| `fix/mfa-setup-apple-passwords` | `100ff42d1` | Superseded | Native-passkey implementation now supports completing an unverified TOTP factor after reload and adds prompt cancellation/timeout. Old panel would remove newer protections. |
| `fix/outgoing-sms-improvements-20260909` | `ac9442042` | Partially integrated | Imported conversation-aware quote reminders, queue-time rechecks and staged reminder copy. Held the broad unrelated SMS copy/preview rewrite so it cannot overwrite the newer campaign-branding and disputed-alert changes. |
| `fix/overage-recovery-20260910` | `6f4674c3e` | Already represented | Every branch-only non-merge patch has a match in main. Preserve later fixes; do not replay the old patch. |
| `fix/prelaunch-operational-cleanup-20260909` | `ccff4445f` | Partially integrated; keep active | Imported outage paging and truthful webhook inspection. Historical manifests and one-off production scripts remain with the observation task at ccff4445f; the ongoing runtime gate is not closed. |
| `fix/prelaunch-paid-renewals-20260909` | `dcc67e06e` | Evidence retained; gate open | Natural-renewal cohort progress and checklist restructuring are historical evidence. Real elapsed renewal/cancellation and payment authorization remain with the owning task; no new billing action is performed. |
| `fix/prelaunch-security-recovery-20260909` | `a714e4ac5` | Recovery evidence/tooling held | Downloaded-backup hosted recovery, provider/DNS inventories and restore scripts belong to their isolated recovery procedure. Preserve private recovery artifacts; do not run/import them as an application rollout or declare disaster recovery complete. |
| `fix/prelaunch-voice-acceptance-20260909` | `d272ee477` | Integrated missing fix | Only assistant/tool activity can imply a transfer attempt. Prompt instructions and caller requests no longer misclassify the outcome. Handset acceptance stays open. |
| `fix/sellable-capacity-20260908` | `1085b41ab` | Superseded | Current catalog, price preparation and capacity lifecycle implementation supersede the release fixtures. No old price fixture is used as authority for current sales policy. |
| `fix/signalwire-brand-identity-20260910` | `045140cc7` | Code represented; evidence retained | Changed application/test files match current main. Residual provider-support drafts and operator records remain in the original worktree. |
| `fix/sku-readiness-20260908` | `5338147e8` | Already represented | Current code contains owner office-workspace selection, client-attachment capacity checks and updated entitlement/price preparation. Keep newer auth and catalog revisions. |
| `fix/sms-dispatch-help-20260908` | `5f4f7725c` | Integrated missing fixes | Imported HELP account binding and service-role projection migrations/harness changes; regenerated schema.sql. Read-only production checks confirmed both fixes already applied there. Inline cancellation is already in main. |
| `fix/subcontractor-cancel-inline-20260908` | `664db9961` | Already represented | Every branch-only non-merge patch has a match in main. Preserve later fixes; do not replay the old patch. |
| `fix/texting-readiness-20260905` | `bc9fbeae4` | Already represented | Consent fixes and typecheck heap configuration have main-history matches; production texting notes are already represented in main under reconciled commits. |
| `fix/voice-alert-readable-summary-20260908` | `43d174d5f` | Superseded | Current voice-summary formatter and SMS branding/hold tests contain the evolved implementation. Applying the older whole template would regress the subsequent sender work. |
| `fix/voice-measurement-partial-balance` | `3a9d8820e` | Superseded | Measurement/transfer changes have main-history equivalents; refund and renewal logic has since been hardened and released. Keep later event-identity and refund-worker fixes. |
| `fix/voice-retry-callback-20260908` | `843031f3a` | Already represented | Every branch-only non-merge patch has a match in main. Preserve later fixes; do not replay the old patch. |
| `fix/voice-sku-release-20260908` | `33713cd1b` | Code represented; evidence retained | All changed implementation files match main. Its live retry note is dated evidence and does not close later Voice acceptance gates. |
| `hold/unready-features-20260905` | `557054e11` | Superseded release bundle | Current main contains evolved Meta/Halo/card, office, site-cache, TLS and LiDAR implementations. Whole-bundle integration would revive replaced provider and compatibility code. |
| `prelaunch/audit-R10-R12-R09-R07-R11-20260910` | `7cbbacf85` | Partially integrated | Imported noindex on three mockup pages. Held evidence that does not establish deployed SHA parity, real upload concurrency or file preservation; held the dependency-range relaxation and scratch tests. |
| `publish/billing-rehearsal-clean-20260910` | `a8370ad6d` | Superseded | Current billing classification and inert parser fixtures supersede the old rehearsals. Preserve the current checkout compatibility and operational review registration. |
| `publish/texting-reconciled-20260910` | `bc9fbeae4` | Already represented | Consent fixes and typecheck heap configuration have main-history matches; production texting notes are already represented in main under reconciled commits. |
| `release/ready-20260905-evening` | `9560603cd` | Superseded release bundle | Current main contains evolved Meta/Halo/card, office, site-cache, TLS and LiDAR implementations. Whole-bundle integration would revive replaced provider and compatibility code. |
| `release/verified-20260905-evening` | `a8021c34e` | Superseded release bundle | Current main contains evolved Meta/Halo/card, office, site-cache, TLS and LiDAR implementations. Whole-bundle integration would revive replaced provider and compatibility code. |
| `test/customer-sms-acceptance-20260909` | `9bd5a672e` | Evidence retained | Historical SMS/Voice acceptance and private fixture records remain recoverable on the source branch. Relevant missing runtime SMS/Voice fixes are integrated separately; no blanket live acceptance is inferred. |
| `test/merge-rehearsal` | `f85747d73` | Partially integrated | Imported client-statement net-payment totals and added behavioral coverage for refunds/visit fees. Held the old CSS revert and optional friends/family pricing/admin bundle. |

## Uncommitted worktrees

- Native-MFA worktree: most content is represented in main; remaining panel/library differences remove newer cancellation/timeout and origin-normalization fixes. Kept newer main implementation.
- Old auth/JWKS worktree: images and tests match main; companion naming is optional, and old founder-email code would remove current escaping/branding. Preserved original files.
- Old voice-hardening worktree: baseline hardening is already in main, followed by newer callback, metering and tool-authorization revisions. Preserved the old verification files without overwriting current runtime code.
- Pricing-growth worktree: 1,344 mixed staged/unstaged entries, including staged additions deleted in the worktree, describe an old integration snapshot. No wholesale import or deletion.
- Performance/release verification worktrees: generated environment typing/logs and local Supabase state are not application changes to publish.
- Operational-alert, SMS/SKU, branding and Voice closeout worktrees: residual checklist/provider/drill notes are kept with their source evidence; ongoing tasks and raw operator records are preserved.
- Two old OneDrive worktrees could not be inspected. They remain untouched and are not approved for deletion.

## Validation

- Full unit suite: **14,860 tests / 1,151 files passed**. After a test-double typing correction and the additional client-statement behavioral test, the focused 11-test run passed.
- TypeScript passed after the test fixture correction. Lint passed with existing unrelated warnings.
- Isolated PostgreSQL: inbound actions **38/38**, delivery foundation **27/27**, and campaign-purpose checks passed. Production catalog reads confirmed HELP binding and service-only projection grants; no hosted SQL mutation was executed.
- Messaging schema parity and foreign-key ordering passed. SEO, stock-image and overage reconciliation tests passed. Production dependency audit: **0 vulnerabilities**.
- Optimized production build passed. The additional paging-ledger PostgreSQL harness passed all 7 checks.

Logs and machine-readable review inventories are retained in `C:/dev/branch-review-20260910`. Historical evidence was not represented as new production acceptance.
