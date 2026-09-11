# Contractor email domain sending: go-live task list

Prepared September 9; updated September 11, 2026. Status: **Gmail and Outlook actual production quote receipt, authentication and matching links passed. Production onboarding and clean disconnect/reconnect passed. Remaining message paths, lifecycle drills, supported website-fixture cleanup and the seven-day canary remain open.**

**Current checkpoint, September 11, 05:18 UTC:** [PR #76](https://github.com/wideeyephoto/lets-get-quoted/pull/76) fixed the quick-contact editor's missing-column failure and is live on both production aliases as `dpl_Uk5c8x51awwv2cXU5Dhnac2ErMD2`, SHA `7f32e44c7ce4f94553a305f1921050fba9ee50a3`. Full CI passed 14,884 tests, nine PostgreSQL checks and the 422-page build. The repaired UI saved the synthetic quote's recipient, and its actual product email reached Gmail Inbox with SPF/DKIM/DMARC PASS, correct Reply-To and a working J-1004/$0 quote link. The original recipient was restored without another send. Gmail's September 11 allowance is used; Outlook remains unused. The certificate watcher and its September 10 owner notice already passed. LGQ staff verification, supported closure/provider cleanup and the other lifecycle gates remain open; the seven-day clock has not started. [Dated release and receipt evidence](contractor-domains-canary-2026-09-09.md#september-11-release-and-gmail-product-acceptance).

Release update, 22:09–22:20 UTC: PR #64 is merged and READY deployment `dpl_955shMPfprmxsadkAEui6PqeaKC9` serves the public app/webhook with the explicitly approved BrokePipes-only allowlist. Full CI passed 14,590 tests and build. Deployed product enrollment created a pending binding, and its exact return-path DNS is now published. Another authenticated workspace has no enrollment UI. Four authentic provider callback replays returned 202 with durable quarantine; the 20 known rehearsal incident records have explicit retained dispositions. The website watcher checked/attached one pending fixture through deployed credentials. Hourly follow-ups are ACTIVE; the seven-day clock remains unstarted. [Current evidence and remaining work](contractor-domains-canary-2026-09-09.md).

Earlier release and acceptance checkpoint, September 10 04:54 UTC: PR #68 merged as `72b3a4662e` and served both aliases as `dpl_Pmo6VeDnWAv9WKy1kiodGUHP8Jim`; full CI passed 14,597 tests and build. F08 passed through the production inline confirmation, and the replacement binding verified at 02:13:28.628 UTC. At 04:47 UTC, a real LGQ J-1004 quote arrived in Outlook Focused Inbox from the reconnected custom domain with SPF/DKIM/DMARC and Microsoft authentication PASS. Its received button opened the matching $0 test quote. The initial Gmail website-notice reservation was subsequently reassigned to the provider-loss owner alert below. The website fixture remains pending because Squarespace requires device verification before DNS editing. The seven-day clock has not started.

Scheduled execution update, September 10 06:43 UTC: run `93219051-6b33-40be-84fd-b68ce8f588d5` at 06:23 UTC checked the actual active domain with zero errors, orphans, or backlog and refreshed `last_checked_at` to 06:23:21.089 UTC. Database and provider verification still pass. This closes the first active-domain scheduled-execution check, not I03 or the unfinished recovery gates; the seven-day clock remains unstarted.

**Earlier release checkpoint, September 10 13:10 UTC:** PR #70's durable owner-notice recovery and PR #71's direct settings link/failure explanation served both aliases as **`dpl_4r5THCtG18aDrULMbbLUrLLbvdRP`**, SHA **`a19356d3b671fdd0fd49628220bef6e9cd3479c1`**. Full final CI passed **14,619 tests** and the production build. Actual provider deletion, deployed downgrade, one authenticated Gmail platform owner alert, matching callback resolution without resend, and product reconnection passed. The replacement binding below is verified. Both September 10 test-inbox allowances are used. F03 product fallback receipt and remaining lifecycle gates remain open; the later certificate and release checkpoint follows. See the [dated release and drill evidence](contractor-domains-canary-2026-09-09.md).

## September 9 verification update

**Current checkpoint, September 10, 14:44 UTC:** DNS/passkey and the website certificate-watcher gate passed: the scheduled watcher connected the disposable fixture, strict TLS validation passed, and its one approved extra Gmail alert arrived with a matching signed callback and receiver SPF/DKIM/DMARC PASS. PR #73 is live on both aliases as **`dpl_YZRey9qLGxen8BFNZyYPM1SWwrWG`**, SHA **`83e5663274c66854f6b4bc5de8d8859c800f47ba`**, with three production migrations and a hosted rollback drill passed. Full CI passed **14,643 tests**, nine PostgreSQL checks and build. The deployed closure form correctly describes 30-day recovery, but submitting the empty fixture reached LGQ's second-factor requirement before any mutation. Staff verification, actual closure/provider release and DNS fixture removal remain open. The active email binding remains verified. Today's normal test allowances and extra Gmail alert are used. The seven-day clock remains unstarted. See [current evidence](contractor-domains-canary-2026-09-09.md) and the [closure runbook](runbooks/account-closure-domains.md).

The [Outlook and canary follow-up](contractor-domains-canary-2026-09-09.md) supersedes the receiver-coverage and concurrency gaps below: Outlook authentication and its reply to Gmail passed; production quote J-1004 opened correctly from its received email. The earlier probes' homepage URL was a test-setup error. The account reservation index is applied in staging and production. The follow-up also records the earlier staging-tagged messages' production callback failures; do not treat those as a clean webhook rehearsal.

The [dated verification report](contractor-domains-verification-2026-09-09.md) records real provider, DNS, Gmail, production cron, TLS, and provider-cleanup observations. These replace the stale "no live send" and "watcher undeployed" assumptions. The actual quote-send function delivered from `blackholeart.com` with Gmail SPF/DKIM/DMARC PASS; Reply-To selected the approved Gmail inbox, and a self-reply was sent. A real rejected custom-domain send recovered once through the platform sender. This used an isolated staging fixture, not LGQ UI onboarding. The fixture was removed; production still has zero sending domains. The verified Resend domain is reserved for Brett's rehearsal and remains outside the production tenant inventory.

- [x] Owned rehearsal DNS verified and Gmail delivery/authentication evidence retained.
- [x] Gmail Reply-To selection and self-reply exercised; real provider-rejection fallback delivered.
- [x] Production website TLS, watcher scheduling, and disposable provider-binding cleanup observed with the report's explicit scope limits.
- [x] Outlook authentication and separate-mailbox reply receipt; real product quote-link verification.
- [x] Deploy the recovery patch with the approved single-workspace eligibility settings and verify the public app/webhook aliases.
- [ ] Complete the remaining D–H app and provider/DNS drills; do not treat the successful release or callback replay as completion of unrelated scenarios.
- [x] Receive and inspect a production custom-domain Outlook quote from the active product binding, including authentication and its exact quote link.
- [ ] Complete remaining acceptance and the seven-run canary in the approved production workspace before expansion.

The initial observations below are historical. The standalone reserved `blackholeart.com` resource was explicitly retired; later product bindings were removed during F08 and the real F03 provider-loss drill. The active provider binding is now `e36d84f4-13e1-4c52-a1ef-3b53514945ec`, database row `ac8aff96-573a-4ec1-8cfa-25d48c551e05`, verified through production LGQ at September 10 **12:50:48.309 UTC**. Production flag and one-workspace allowlist are applied and deployed. Recheck current occupied slots before further admissions. This task did not independently close the separate credential-recovery work in B08.

Scope: LGQ sends contractor quotes, invoices, and supported job emails from a verified contractor domain. Replies go to the contractor's existing mailbox. This release does not provision inboxes, ingest incoming mail, or configure website domains. Successful authentication is required; universal inbox placement is not a promise we can make.

This is the execution checklist for the current rollout. It updates the assumptions in the September 8 [go-live plan](plan-custom-email-domains-go-live-2026-09-08.md) and [runbook](runbook-custom-email-domains-production-2026-09-08.md). Preparing this document does not execute its deployments, DNS changes, purchases, or email sends.

## How to use this list

An unchecked item is outstanding even if code exists. Check it only when its acceptance criteria have evidence. A passing mock, a database test, a live provider test, and a received email prove different things; label the evidence accordingly.

Owners below are proposed responsibilities: **Engineering** implements and tests; **Operations** manages deployments, provider configuration, monitoring, and incident response; **Brett** owns product decisions and spending; **DNS owner** controls the rehearsal or contractor DNS; **Support** owns onboarding and support material. One person may fill several roles. Assign names in A01 before execution.

All tasks in A–H block the production canary unless specifically marked **GA** or **scale**. I is the canary itself. J blocks general release. K is continuing operation. Product decisions can be made while engineering works on independent items; do not wait for pricing decisions to build account-level rollout control.

## Verified starting point

These are observations from this task on September 9, not a certification of the eventual release deployment.

| Observation | Evidence | What it establishes |
| --- | --- | --- |
| Production and staging each contain zero sending-domain rows | Read-only SQL against `mfuvvtrkipkigwqqtcal` and `uydlabvgauzujdwuqzxq` | No currently connected tenant domains; not proof that no cleaned-up test ever occurred |
| Production has 11 workspaces | Production `accounts` count | Potential rollout audience, not 11 confirmed customers requesting domains |
| `LGQ_EMAIL_SENDING_DOMAINS_ENABLED` exists in Preview only | Vercel project variable search; no matching shared variable | Absent from current Production configuration; active deployment behavior still needs release verification |
| `RESEND_DOMAINS_API_KEY` exists in Production and Preview | Vercel environment-variable listing | Key presence; the value and all required permissions were not established by this listing |
| Resend lists only verified `letsgetquoted.com` | Resend Domains dashboard | One occupied provider slot |
| Resend Free shows Domains **1 / 3** | Resend Usage dashboard | Two available slots across additional tenant and test domains |
| Free also shows 3,000 monthly emails, 100 daily, and 10 requests/second | Resend Usage dashboard | Shared account limits that need a rollout volume budget |
| Scheduled reconciliation succeeded at `2026-09-09 06:23:20 UTC` | `cron_runs`, `ok=true`, `checked=0`, `errors=0`, `orphanedAtProvider=0` | Scheduling and an empty-inventory run work; no tenant reconciliation was exercised |
| Separate domain-management key support and permission probing exist | `src/lib/resend-domains.ts` | Earlier Stage 0 code work exists; preserve it and verify the deployed version |
| No per-workspace or tier eligibility check exists in the connect action | `src/app/dashboard/settings/email-domain-actions.ts` | A global flag alone cannot provide a one-workspace canary |
| Sender selection uses `status='verified'` independently of the feature flag | `src/lib/email-brand.ts` | Turning off the flag does not stop existing custom-domain sends |
| The earlier evidence archive has no rehearsal or receiver-header proof | September 8 go-live plan, evidence archive | End-to-end release proof remains outstanding |

Authenticated sources: [Vercel variables](https://vercel.com/lets-get-quoted/lets-get-quoted/settings/environment-variables), [Resend domains](https://resend.com/domains), [Resend usage](https://resend.com/settings/usage).

## Update from the coding agent's activity export

The user supplied this additional report after the initial checklist was created. Treat deployment and Preview-target details below as agent-reported until checked against the named runtime. Credential values from the export are deliberately excluded.

| Reported work | Corroboration / checklist effect |
| --- | --- |
| Domain-management key provisioned in Production and Preview; `/domains` returned 200 | Environment-variable presence and successful Production reconciliation were independently observed. Initial provisioning is not missing. B04 still requires actual create/verify/delete and contractor-domain send proof; listing alone does not exercise those operations. |
| Production deployed as `dpl_7MfxqfkjUrzocAur2SAuTF8Zh1HU`; manual run `2b1f448d-0031-4e1a-bf33-a8ed4dbb4704` succeeded with zero checked domains | The run ID appears in the local runbook. A later scheduled run on September 9 was independently verified. Initial empty-domain runtime/scheduler setup is established; tenant behavior remains untested. Do not assume this reported deployment is still the current release. |
| Preview flag enabled and deployment `dpl_4pfCDG76QcTYzwnZGpRP173rB5ds` created | Preview-only flag configuration was independently observed; B01/B05 must still verify the named deployment and effective runtime. |
| That Preview's Supabase URL points to Production (`mfuvvtrkipkigwqqtcal`) | **B02 is an identified isolation blocker for this reported Preview, not merely a precaution.** Correct the database and matching server credentials before the rehearsal. |

Reported Preview: [deployment](https://lets-get-quoted-l3xzcj0ta-lets-get-quoted.vercel.app).

Do not proceed with the export's “connect your test domain” instruction while that Preview uses Production. A verified row written there can be consumed by Production's sender selection for the same workspace even while the Production enrollment flag is off. Company ownership of the test domain and later cleanup do not isolate those writes or sends. Build a verified staging rehearsal first; use the separately gated Production canary later.

The export's fixed “two DKIM TXT / four DNS records” requirement is not an acceptance criterion. D02 uses the actual provider-returned records while protecting existing inbound mail. The export still contains no successful tenant-domain connection, received aligned-DKIM proof, failure/recovery rehearsal, or canary evidence.

The export also contains plaintext Resend domain-management, Supabase service-role, and cron-authentication credentials. Treat them as exposed pending revocation/replacement under B08. Do not paste the raw export into commits, tickets, task messages, or further evidence documents.

## Release gates and order

| Gate | Required outcome | Depends on |
| --- | --- | --- |
| G1: rehearsal ready | Safe test environment, selected domain and inboxes, controlled eligibility, code checks complete | A03; environment/key preflight in B01–B06 and B08; C01–C09 and C11. B04's live create/verify/delete/send proof is completed in D–F. |
| G2: product claim proven | UI connection and DNS verification plus authenticated LGQ mail received at Gmail and Outlook | D, E |
| G3: failure handling proven | Tenant isolation, downgrade, recovery, suspension, cleanup, and rollback evidence | F, G, H |
| G4: canary passed | One approved contractor, seven healthy scheduled checks with real sends, no unresolved release defect | G1–G3, I |
| G5: general release | Capacity, eligibility, support, abuse controls, and monitoring ready for the admitted cohort | G4, all GA tasks, J |

Critical path: **environment and rollout controls → real DNS verification → received headers → failure/rollback rehearsal → one-contractor canary → seven-day observation → staged general release.** DNS/provider propagation and the observation period are elapsed-time dependencies; do not replace them with green unit tests.

Start with **B08 (exposed credentials), B02 (reported Preview-to-Production binding), C01 (workspace allowlist), and C04 (durable suspension)** while the owner selects the rehearsal assets and canary. The pricing decision is not a prerequisite for those tasks. A06's v1 behavior and A05's suspension policy must be settled before dependent implementation and G3 sign-off.

## A. Make the rollout decisions

- [ ] **A01 — Assign release owners.** Owner: Brett. Name the engineering lead, deploy operator, DNS operator, support contact, incident responder, and final release decision-maker. Record names and availability in the evidence register.
- [ ] **A02 — Select the canary.** Owner: Brett + Support. Choose one active contractor with authority over their DNS and normal quote volume. Record their workspace ID, business domain, operational reply mailbox, and onboarding contact in the restricted release record.
- [ ] **A03 — Select the rehearsal assets.** Owner: Operations + DNS owner. Name an LGQ-controlled test domain/subdomain, two staging workspaces, a Gmail inbox, and an Outlook/M365 inbox. Record approved test recipients and who may change those DNS records. Destructive DNS/provider scenarios use these assets only.
- [ ] **A04 — Choose GA eligibility [GA].** Owner: Brett. Record whether this is included for everyone, limited to named plans, or a paid add-on. Define downgrade/cancellation behavior for an already-connected domain. Recommendation: use a workspace allowlist for the canary and settle commercial eligibility before GA; an add-on requires its own billing/catalog work and verification.
- [ ] **A05 — Choose the suspension policy.** Owner: Brett + Operations. Separate technical DNS failure from abusive sending. Recommendation: technical failure may use the platform fallback; confirmed abuse or a complaint-driven sending hold must stop that tenant's affected outbound traffic, including platform fallback. Record manual response ownership for the canary and the automation/threshold policy required at GA. Set thresholds and sample windows explicitly rather than inventing a provider-approved number.
- [ ] **A06 — Choose v1 domain and mailbox behavior.** Owner: Brett + Engineering. Confirm one active verified domain per workspace, a bounded number of pending attempts, supported root/subdomain forms, replacement behavior, and whether the visible From address must already receive mail. Recommendation: use an existing receiving address or require its alias before the contractor goes live.

## B. Prepare the environment and capacity

Owner: Operations, with Engineering for runtime checks. Depends on A02–A03.

- [ ] **B01 — Record the actual release candidate.** Capture commit SHA, Preview URL/deployment ID, database project, Resend team, and current Production deployment ID. A local checkout is not evidence that the running deployment contains that code.
- [ ] **B02 — Verify Preview uses staging before writing data.** Confirm the deployed Supabase target and server credentials resolve to `staging-db`. If it uses Production, correct the binding and redeploy before rehearsal. Also verify that test jobs cannot reach real customer recipients or run unrelated production workflows.
- [ ] **B03 — Make provider ownership across environments explicit.** Determine whether Preview and Production share a Resend team. Prefer separate provider inventories when available. If shared, reserve named rehearsal domains, account for all slots, and ensure both orphan checks recognize the other environment's legitimate domains. Never auto-delete a domain solely because one environment's database lacks it.
- [ ] **B04 — Prove both keys do their jobs.** Preserve separation of `RESEND_DOMAINS_API_KEY` and `RESEND_API_KEY`. From the release runtime, prove management can list and later create/read/verify/delete the rehearsal domain. Confirm the sending key can send from the contractor domain; a sending-only key scoped solely to `letsgetquoted.com` would still fail the product claim. Keep secrets out of logs and evidence files.
- [ ] **B05 — Verify environment flags and configuration.** Confirm Preview's flag value and deployed behavior, Production's currently disabled exposure, key availability, root domain, platform fallback From, and reply configuration. Record an environment/deployment matrix. Later variable changes require a new deployment before behavior is assessed.
- [ ] **B06 — Set a canary capacity budget.** Re-read account limits immediately before rehearsal. The observed budget is 3 total domains: 1 platform + 1 rehearsal + 1 canary leaves zero spare while all coexist. Include pending domains and cleanup failures. Budget shared daily/monthly email volume so tests and the canary do not interrupt platform mail.
- [ ] **B07 — Provision sufficient GA capacity [GA].** Owner: Brett + Operations. Record the selected plan/add-on, recurring cost, purchased cap, current inventory, test reserve, and supported cohort. If all 11 workspaces require distinct domains, the minimum is **12 total domains before test/growth reserve**. Verify the resulting quota in the account after any purchase; do not assume a plan called Pro is sufficient.
- [ ] **B08 — Replace exposed credentials and sanitize evidence.** Owner: Operations + Engineering. Inventory the services/deployments using the Resend domain-management key, Supabase service-role credential, and cron secret exposed in the supplied activity export. Use each provider's supported replacement/revocation process with a deployment plan that preserves required service. For the legacy Supabase JWT credential, establish its signing-key dependencies before changing keys; do not assume replacement is isolated to one variable. Verify the replacements work and the exposed credentials no longer authorize access. Review whether the values reached tracked files/history, logs, or other shared exports and remediate those copies. Record credential names, revocation times, and validation results only, never secret values. This task is preparation for execution, not authorization to change credentials merely because the earlier agent did so.

Capacity worksheet:

| Field | Current observation | Release value |
| --- | --- | --- |
| Provider domain cap | 3 | Pending |
| Platform domains | 1 | Pending |
| Rehearsal/reserved domains | 0 currently listed | Pending |
| Tenant/pending/cleanup domains occupying slots | 0 currently listed | Pending |
| Free slots = cap minus all occupied/reserved slots | 2 before new reservations | Pending |
| Allowed canary/cohort size | Proposed: 1 | Pending |
| Daily/monthly send budget and alert levels | Free limits: 100 / 3,000 | Pending |

Quotas can be expanded. Current public pricing lists Free 3, Pro 10, Scale 1,000 domains, with a paid domain add-on; verify pricing when selecting capacity. [Resend pricing](https://resend.com/pricing/).

## C. Close the engineering release blockers

Owner: Engineering. Acceptance requires tests on the final candidate, with fixes where current behavior fails.

- [x] **C01 — Add server-side workspace rollout control.** Gated settings visibility, UI section, and domain activation/connect actions by authenticated workspace ID plus global feature flag via `isWorkspaceEligibleForSendingDomains()`. Fails closed in production if allowlist unset/empty. Allowlist supports comma-separated list or `*`. Existing tenant domains remain viewable and manageable even if new enrollments are paused. Covered by unit tests in `test/email-sending-domains-controls.test.ts`.
- [x] **C02 — Enforce authorization and immutable ownership.** Verified create, read, verify, disconnect enforce tenant session and owning `account_id`. RLS policies protect database records across tenants. Case-normalized duplicate domains refused across tenants (`lower(domain)`). Verified in `scripts/verify-email-sending-domains.mjs` (PG17: all 15 checks pass).
- [x] **C03 — Audit reserved and previously verified domains.** Reserved/platform domains are refused. The September 9 patch removes name-only provider adoption: only an existing same-workspace provider ID with a matching domain can be reused. An unowned duplicate fails closed for operator resolution; setting a newly attached orphan to pending alone was insufficient because reconciliation could later verify it. Binding tests cover these cases.
- [x] **C04 — Make administrative suspension durable.** `verifyEmailSendingDomainAction` and `reconcileSendingDomains` enforce `.neq('status', 'disabled')` so in-flight manual verification or scheduled reconciliation cannot overwrite an administrative hold. Added distinction between administrative hold (failure reason containing `administrative`) and retryable cleanup failure (`CLEANUP_PENDING`).
- [x] **C05 — Bound domain creation and handle exhaustion.** Atomic reservation now precedes provider creation; the account unique index covers every status and is applied to both databases. Concurrent action requests create one provider binding; separate PostgreSQL connections yield one winner and one unique violation. Quota rejection retains a failed reservation; disconnect releases the slot. Hosted candidate acceptance is tracked separately.
- [x] **C06 — Verify state transitions and send behavior.** Comprehensive mapping of provider statuses (`not_started`, `pending`, `verified`, `failed`, `temporary_failure`). Request timeouts and errors handled without state corruption. Sender selection restricted to `status = 'verified'`.
- [x] **C07 — Handle the gap before reconciliation.** The September 9 shared send wrapper retries exactly once only for Resend's definitive `validation_error` naming the actual custom From domain as unverified. Reply-To/content/options are preserved. It does not retry accepted sends, generic 403s, quota failures, timeouts, or unknown outcomes. Ten transport tests and a real provider rejection followed by Gmail fallback receipt pass. This is not a guarantee against every lost/duplicate message or an abuse-hold mechanism.
- [x] **C08 — Make removal and replacement recoverable.** The September 9 patch disables sending and stores `CLEANUP_PENDING` before provider deletion, retaining it on provider/DB failure. A concurrent administrative hold prevents a cleanup retry from overwriting it. The reconciler counts provider/DB/read failures as errors and only counts actual removed rows as cleanup success. Local fault tests pass; live injected cleanup/recovery remains in F09.
- [x] **C09 — Cover all intended email paths.** All contractor quote, invoice, and job notification email templates route via `email-brand.ts` respecting verified custom domain or fallback platform identity with contractor Reply-To. System/security/platform notifications strictly use platform identity.
- [ ] **C10 — Fix scale boundaries before exceeding them [scale].** Exact database backlog counting exists. Correction: the current `/domains` call omits `limit`, which returns all domains under [Resend's documented contract](https://resend.com/docs/api-reference/pagination). Optional bounded pagination can reduce large-inventory response cost; the earlier claim that only one page was read was incorrect. Reserve provider/test capacity and respect the reconciler's batch/cadence limits.
- [x] **C11 — Run the release checks.** Final PR #76 candidate `711ffd7a68668a88b72d0b12b7a4c4a78b82071f` passed [CI run 34564115124](https://github.com/wideeyephoto/lets-get-quoted/actions/runs/34564115124): 14,884 tests across 1,156 files, nine PostgreSQL closure checks, security audit, type checking, lint and the 422-page build. The earlier domain reservation/notice PostgreSQL checks and hosted rollback drills are retained in the dated record. Production merge `7f32e44c7ce4f94553a305f1921050fba9ee50a3` is READY on both aliases; the repaired contact action, real Gmail product send and received quote link passed after release. This closes the stale build/deployment requirement, not the remaining hosted lifecycle matrix or canary observation.

## D. Rehearse connect → DNS → verified through the product

Owners: Engineering + DNS owner. Depends on G1 preparation; use the real provider and isolated test workspaces.

- [ ] **D01 — Connect from staging workspace A using the UI.** Record normalized domain, From prefix, workspace/row IDs, provider ID, and initial status. Confirm retries do not create duplicate ownership or hidden extra rows and that pending domains still send through the expected platform path.
- [ ] **D02 — Inspect the exact DNS instructions.** Compare the provider response to the rendered table, including names, types, values, priorities, and copy buttons. Do not hard-code “four records” or “two DKIM TXT records”: use the real provider-returned set. Reject instructions that replace existing root MX/SPF or unrelated records; review warnings instead of hiding required configuration failures. Verify root/subdomain names and registrar auto-appending behavior. [Resend domain documentation](https://resend.com/docs/dashboard/domains/introduction).
- [ ] **D03 — Publish only the rehearsal records.** Preserve the test domain's existing mail configuration. Verify authoritative/public DNS answers match the intended names and values, including registrar quoting, DNS-only requirements where relevant, and propagation. Do not weaken an existing DMARC policy to make the test pass.
- [x] **D04 — Reach verified through the UI.** Production LGQ Check Connection restored the current replacement binding to Verified on September 10 at 12:50:48.309 UTC, with the expected account/provider IDs and a null failure reason. The refreshed direct settings link showed the verified custom sender after release. Repeated reads preserved the same binding; no database promotion was used. September 11's scheduled run refreshed `last_checked_at` to 06:23:20.954 UTC, and actual Gmail delivery authenticated that current binding. The [dated UI/provider/database evidence](contractor-domains-canary-2026-09-09.md) records initial enrollment, each explicit replacement and the fixed read-before-verify behavior. Other pending/incomplete-setup cases remain in D05.
- [ ] **D05 — Test pending and incomplete setup.** Leave a required test record absent initially, click Verify before propagation, then correct it. UI must show an accurate pending/failed explanation and next step, without claiming authenticated sending or exposing raw provider errors.

## E. Prove the delivered email and reply experience

Owners: Engineering + mailbox operator. Depends on D04. Use the approved test recipients and actual LGQ product actions.

- [x] **E01 — Send a real LGQ quote to Gmail and Outlook/M365.** Both production J-1004 quote actions, sender workspaces, release deployments, timestamps, provider/canonical IDs, actual receipts and received-link checks are recorded in the [canary evidence](contractor-domains-canary-2026-09-09.md). Outlook Focused Inbox passed September 10 04:47 UTC, provider `50605306-9687-418c-85ea-819819637642`. Gmail Inbox passed September 11 05:14 UTC, provider `e695285a-1ad1-41ac-a2ff-e99050bb0b9a`, using the current replacement binding. Both actual buttons opened the matching $0 quote. The earlier transport probes remain separate evidence.
- [x] **E02 — Capture receiver authentication evidence.** Both original messages and raw headers are retained in the owner's mailboxes, with exact Message-IDs and conversation/provider/canonical correlation in the dated record. September 10 Outlook and September 11 Gmail show From `hello@blackholeart.com`, SPF PASS with the expected `send.blackholeart.com` envelope domain, DKIM PASS exactly aligned to `blackholeart.com`, DMARC PASS and the intended Reply-To. Outlook additionally reports Microsoft composite authentication PASS; both ingress connections used TLS 1.3. Gmail's current-binding original was inspected after the actual product receipt. Private access tokens and raw message bodies are excluded from this public repository. [DMARC reference](https://resend.com/docs/dashboard/domains/dmarc).
- [ ] **E03 — Test strict alignment where supported.** Validate the configured root/subdomain arrangement against the test domain's actual `adkim`/`aspf` policy. Do not label SPF as aligned just because `spf=pass` appears; alignment is a separate comparison. Record limitations for unsupported configurations instead of weakening customer policy.
- [ ] **E04 — Verify replies in both receivers.** Confirm `Reply-To` is the intended contractor mailbox and click Reply from Gmail and Outlook. Confirm receipt at that mailbox. Send a separate new test message to the visible From address and confirm the mailbox/alias handles it as the onboarding copy promises.
- [ ] **E05 — Verify the other supported message types.** Exercise at least one actual product send for each distinct in-scope sender/queue implementation from C09, including a background send. Check identity, reply address, links/attachments where used, and recipient suppression. Record which templates share a tested transport and which need separate evidence.
- [ ] **E06 — Prove platform fallback and isolation.** Send from workspace B with no custom domain and from workspace A after a technical downgrade. Confirm platform From plus the correct contractor Reply-To. Verify no tenant's domain or reply address appears in another tenant's message. Test fallback again in F after the real failure transition.

Store original messages in restricted evidence storage; use approved test addresses. Keep credentials and customer message bodies out of the repository. A redacted summary should link to the retained originals rather than replace them.

## F. Rehearse failures, recovery, and cleanup

Owners: Engineering + Operations + DNS owner. Depends on D/E. Capture before/after DB state, provider state, logs, run summary, and received emails. Restore a healthy test domain between destructive scenarios. Provider/DNS delays are part of the observation, not a reason to manually force a passing state.

| ID / status | Scenario | Acceptance criteria |
| --- | --- | --- |
| F01 ☐ | Remove a published rehearsal DKIM record | Observe DNS and provider status over time; once the provider reports loss, reconciliation removes verified sending eligibility, records the reason, and sends a platform-origin owner alert. A subsequent product email follows the technical fallback policy. Record actual detection latency. |
| F02 ☐ | Restore DKIM | Restore records and, if the provider requires it, trigger its documented re-verification. Reconcile back to verified, clear the technical failure, and receive a new tenant-domain message with passing aligned DKIM. Record whether recovery needed a manual action; do not call it automatic if it did. |
| F03 ☐ | Delete the rehearsal domain at Resend | September 10 production drill passed actual DELETE/GET 404, deployed downgrade, one Gmail platform owner alert with matching callback, repeat without resend, and product reconnect to a fresh binding verified at 12:50:48 UTC. Subsequent product fallback receipt remains open under the daily recipient limit. See the dated record; DNS restoration alone cannot repair a deleted provider resource. |
| F04 ☐ | Claim workspace A's domain from workspace B | Make both staging workspaces eligible for the rehearsal, so a rollout-gate refusal cannot mask the ownership test. Real application requests must refuse B's claim because A owns the domain; A's row, binding, and subsequent sender remain unchanged. Pair this with C02 concurrency/RLS tests. |
| F05 ☐ | Provider request timeout, 429, or 5xx | Use controlled fault injection in Preview, clearly labeled as injected rather than a naturally occurring provider failure. Existing verification is not overwritten merely because the request failed; failures are observable, retries bounded, and sends follow C07. No deliberate outage of Production. |
| F06 ☐ | Administrative disable and concurrent verification | Disable the test tenant/domain using the supported operator path. Verify, reconnect, in-flight reconciliation, and queued work cannot bypass the hold. Technical-domain suspension uses approved fallback; an abuse hold stops the affected tenant's sends entirely. |
| F07 ☐ | Owner notification fails | Durable notice and operator-review implementation released in PR #70 on September 10. Injected application faults, 15 PostgreSQL checks, and a rollback-only hosted staging drill prove retained failure, single claiming, unknown-outcome review, and scoped closeout. Actual production owner-alert receipt, matched callback resolution, and repeat without resend passed. Hosted failed-notice escalation and recipient-recovery acceptance remain open. The next pass must keep unresolved notice incidents unhealthy even when the domain is already failed. See the dated evidence and notice-recovery runbook. |
| F08 ☑ | Clean disconnect and reconnect | Passed September 10 02:10–02:13 UTC on PR #68 production release. Inline cancellation preserved the verified row; confirmed disconnect removed the DB/provider binding and released a slot. Product reconnect created new row `987a0916-a18f-4645-a451-8de3647de995` / provider `0703afc2-8d2b-448b-a808-e9b614e790de`, then verified through LGQ at 02:13:28.628 UTC. Old provider GET returned 404; no stale-resource adoption. See the dated canary record. |
| F09 ☐ | Provider deletion or DB cleanup fails | Preserve a safe sending state, show a useful error, retain enough ownership information to retry, and record a cleanup ticket or retry job. Verify the slot is actually released after recovery. |
| F10 ☐ | Connect partially succeeds or hits capacity | Inject DB-write failure after provider creation and simulate quota rejection. No false success, cross-tenant reassignment, duplicate active domain, or untracked permanent slot leak. Existing sending remains usable. |
| F11 ☐ | Spoofed/replayed delivery events | Verify webhook signature validation, tenant attribution, replay/idempotency behavior, and bounce/complaint handling using the supported test mechanism. Suppression and suspension survive retries and cannot be bypassed by changing From to the platform. |

The daily 06:23 UTC schedule adds up to roughly 24 hours between checks while the cohort fits one run. **Total detection time also includes DNS caching, Resend detection/reverification, outages, and backlog.** Until LGQ changes the stored status, mail may still attempt the custom sender. Do not state that platform fallback is active throughout that interval.

## G. Prepare monitoring and support operations

Owners: Operations + Engineering. Depends on C and rehearsal observations.

- [ ] **G01 — Monitor real domain freshness.** Alert on failed/skipped/silent reconciliation and stale verified domains using the measured cadence plus an agreed grace period. Inspect per-domain `last_checked_at` and unresolved failures, not only `ok=true`. Confirm a job can be healthy with zero rows and that this is not treated as a tenant test.
- [ ] **G02 — Make failures attributable.** Logs/evidence should correlate workspace, domain binding, provider message ID, action, and UTC time without exposing secrets. Display actionable owner-facing states for pending, failed, administratively paused, and cleanup failure.
- [ ] **G03 — Connect alerts to a named responder.** Exercise the alert route for missed reconciliation, permission failure, owner-notification failure, and provider errors. Record response expectations during the canary. Existing general operational alerts may be reused if they actually cover these conditions.
- [ ] **G04 — Track capacity and orphan ownership.** Monitor occupied and reserved slots, pending attempts, and cleanup backlog across environments. Assign an owner to every orphan; review ownership before cleanup. Set a capacity alert early enough to purchase/enable more capacity before the next admitted cohort.
- [ ] **G05 — Validate suppression and tenant abuse response.** Confirm complaint/bounce events reach the correct tenant and suppressed recipients stay suppressed across all custom and fallback paths. Drill the manual canary hold and resume process. Resume requires review and must not be triggered just because DNS verifies again.
- [ ] **G06 — Ship the GA abuse policy [GA].** Implement the A05 policy with documented complaint/bounce thresholds, minimum sample sizes, time windows, audit trail, owner notice, and restoration rules. If automation is deferred, record the named staffed process, enforceable cohort/volume limit, and explicit owner acceptance before GA.
- [x] **G07 — Define supported recovery (September 10).** The [support recovery guide](runbooks/contractor-email-domain-support.md) covers pending DNS, authentication, provider 404, transient/access failures, capacity/partial creation, alias/reply failure, administrative disable, cleanup and owner-notice incidents. It identifies LGQ, registrar/domain-owner and mailbox-provider responsibilities, the current settings path, exact-binding evidence and escalation boundaries. Reviewed against the released handlers; its read-only scoped snapshot passed in production at 13:17:31 UTC. Obsolete immediate-fallback and bulk/abuse-disable instructions in the September 8 runbook were replaced. This completes the diagnostic document only; G03 staffed response, G05 tenant hold, hosted lifecycle drills and H rollback acceptance remain open.

## H. Rehearse rollback and lock the release candidate

Owners: Engineering + Operations. Depends on C–G; done in the rehearsal environment first.

- [ ] **H01 — Verify the enrollment stop.** Turn off rehearsal enrollment and redeploy/apply the selected control. Confirm new connections are refused through both UI and direct actions. Record which existing operations remain available. This does not by itself stop verified custom-domain sending.
- [ ] **H02 — Verify technical sending rollback.** Use the supported domain-disable control on the test account; confirm fresh and queued sends use the intended platform identity with the contractor Reply-To. Confirm no concurrent verify/reconcile action undoes the disable. Keep reconciliation available to observe the rest of the cohort.
- [ ] **H03 — Verify abuse/emergency sending hold.** Stop the affected tenant's sends across custom and platform identities. For a shared provider account incident, define how to pause affected dispatch globally and preserve queued work. Never treat switching an abusive tenant to the platform domain as containment.
- [ ] **H04 — Record exact release and recovery steps.** Capture release SHA, deployment ID, environment/allowlist changes, operator control or reviewed scoped DB procedure, expected affected rows, backup/restore metadata, verification query, and responder. Avoid an unscoped bulk update as the default recipe. Provider deletion is not the first rollback step.
- [ ] **H05 — Review G1–G3 evidence.** Confirm all required tasks passed on the candidate to be deployed, reserve capacity, identify the allowed canary workspace, and close feature-related defects. Update obsolete runbook claims about fixed DNS record counts, permanent capacity ceilings, immediate fallback, automatic cleanup, and feature-flag rollback.

## I. Launch one contractor and observe for seven days

Owners: Operations + Support; release decision: Brett. Entry: G1–G3 passed.

- [ ] **I01 — Deploy with one-workspace eligibility.** Configure Production flag and server-side allowlist, deploy the reviewed SHA, and record the resulting READY deployment. Confirm runtime behavior in the allowed workspace and a different workspace; the latter must be refused server-side. Recheck actual provider headroom and total email budget.
- [ ] **I02 — Supervise production onboarding.** Contractor publishes their provider-returned DNS records, verifies through LGQ, and confirms mailbox/alias plus Reply-To. Observe a real production quote with consented recipients and save received authentication/reply evidence. Preview success alone does not close this step.
- [ ] **I03 — Observe seven consecutive scheduled runs with the canary present.** Each must successfully check the active domain with current timestamps, no unexplained backlog, and no unresolved permission/provider error. Track actual sends, provider delivery results, bounces, complaints, reply receipt, and support incidents daily. A zero-send week does not pass; extend observation until representative normal usage exists.
- [ ] **I04 — Enforce stop conditions.** Pause enrollment immediately for cross-tenant identity, inability to suspend, broken incoming mail caused by DNS instructions, failed aligned authentication, unexplained lost/duplicate messages, or exhausted capacity. Apply the appropriate H rollback/hold to affected sending. Investigate any complaint or material delivery failure before continuing. After a material fix, re-run affected evidence and restart the healthy observation period as needed.
- [ ] **I05 — Record canary sign-off.** Engineering signs correctness; Operations signs monitoring, quota, and rollback; Support/contractor confirms receiving/replies and usable onboarding; Brett decides expansion. Record the seven run IDs, message evidence, actual volume, open issues, and decision date.

Canary daily log:

| Day/date | Scheduled run ID; checked/errors | Domain status; last checked | Actual send/delivery counts | Bounces/complaints; replies | Issue/action; owner |
| --- | --- | --- | --- | --- | --- |
| 1 | Pending | Pending | Pending | Pending | Pending |
| 2 | Pending | Pending | Pending | Pending | Pending |
| 3 | Pending | Pending | Pending | Pending | Pending |
| 4 | Pending | Pending | Pending | Pending | Pending |
| 5 | Pending | Pending | Pending | Pending | Pending |
| 6 | Pending | Pending | Pending | Pending | Pending |
| 7 | Pending | Pending | Pending | Pending | Pending |

## J. Open general availability in controlled batches

Owners: Engineering + Operations + Support; product decisions: Brett. Depends on G4 and all tasks marked GA.

- [ ] **J01 — Enforce the selected entitlement.** Implement A04 in server actions and UI, including billing verification if sold separately. Test eligible, ineligible, trial, canceled, and downgraded accounts according to the chosen policy. Preserve deliberate support/disconnect behavior for existing configurations.
- [ ] **J02 — Publish accurate onboarding guidance.** Explain sending-only scope, ownership of DNS, propagation, exact record entry, existing mailbox/alias requirements, Reply-To, supported domains, and troubleshooting. Publish registrar guidance for the providers actually supported at launch. Do not promise new inboxes, website-domain setup, or guaranteed inbox placement.
- [ ] **J03 — Finish customer-facing states.** Check desktop/mobile DNS table readability and copy buttons. Show distinct pending, failed, paused, unconfigured, and quota-full states. Present the correct next action and avoid calling an administrative pause “pending DNS.” Explain technical fallback without claiming it occurs before detection.
- [ ] **J04 — Admit a capacity-bounded cohort.** Record the actual workspace IDs/count, required slots including pending/test/cleanup reserve, provider email/rate budgets, and next review time. Recheck the live account quota rather than a cached pricing assumption. Increase the cohort only after the previous batch's activation and sends are observed.
- [ ] **J05 — Verify after each rollout change.** Confirm active deployment/eligibility, connect and send metrics, per-domain freshness, successful owner notices, queue health, and fallback/system-mail regressions. Keep rollback controls immediately usable; retain deployment and provider evidence.
- [ ] **J06 — Close the release.** Record launch date, deployed SHA, enabled audience, capacity plan, final owner decisions, evidence links, remaining explicitly deferred scale work, and operational handoff. General release is complete only after the admitted audience can connect and send with the measured controls in place.

## K. Continuing operation

- [ ] **K01 — Operations: monitor daily.** Watch failed/missed reconciliation, stale verified rows, unexpected downgrades, owner-notification failures, queue/send failures, quota headroom, and tenant complaints. During the canary, review manually each day in addition to alerts.
- [ ] **K02 — Support: review incomplete setups and cleanup backlog weekly.** Follow up on aged pending domains using the chosen support policy. Track failed disconnects, closed accounts, abandoned domains, and potential ownership changes until both database and provider state are reconciled.
- [ ] **K03 — Operations + Brett: review capacity and cost before each expansion and monthly.** Forecast active plus pending domains and aggregate sends. Schedule C10 before crossing provider pagination or reconciler batch/cadence limits.
- [ ] **K04 — Engineering: repeat affected checks after material changes.** Re-test received headers, identity isolation, suspension, and reply routing when provider configuration, sender keys, branding, DNS handling, or transport/queue implementation changes. Keep evidence tied to the new version.
- [ ] **K05 — Operations: drill recovery and access changes.** Periodically confirm responders can stop enrollment, suspend a tenant, preserve suppression, and restore service deliberately. Revalidate key scope and domain ownership after key rotation, domain transfer, or provider-account changes.

## Evidence register and completion rule

For each task, retain: task ID, named owner, execution UTC time, environment, commit/deployment, test method, observed outcome, relevant row/provider/message/run IDs, restricted evidence link, and pass/fail. Use **not applicable with a reason** only for conditional GA/scale work; do not silently omit a failed gate.

| Evidence bundle | Required contents | Owner / location / decision |
| --- | --- | --- |
| A: decisions | Named owners, canary, recipients, eligibility, suspension policy | Pending |
| B: environment and quota | Deployment matrix, DB/provider mapping, key-scope proof, capacity worksheet | Pending |
| C: engineering | Changes/review, ownership and suspension race tests, send-path inventory, check exit statuses | September 9 recovery patch and targeted checks pass; C05, C10 and final C11 remain open. See dated report |
| D: connect/DNS | UI records, actual DNS answers, provider binding and verified DB state | Production LGQ enrollment and Check Connection verified at 22:48 UTC; remaining D scenarios and recovery stay open |
| E: received messages | Gmail and Outlook originals, auth results, reply/alias receipt, template coverage | Gmail/Outlook custom transport authentication, separate-mailbox reply, and real product quote link passed; custom-domain deployed product send and remaining templates open |
| F: failure matrix | Before/after states and evidence for F01–F11; real versus injected clearly labeled | F08 clean disconnect/reconnect passed in production on September 10 UTC. Real rejected-domain transport fallback received; local recovery fault tests pass; remaining live matrix open |
| G/H: operations | Alert receipt, responder, quota/cleanup ownership, successful rollback/hold drill | Pending |
| I: canary | Seven scheduled runs with real volume, incident log, contractor and release sign-off | Pending |
| J: GA | Entitlement, purchased capacity, support article, cohort and deployment, post-release checks | Pending |

**Go decision:** G1–G5 have retained evidence, no unresolved identity/authentication/suspension/data-loss defect, capacity covers the admitted cohort and reserves, and a named responder owns operation. “All tests green,” “domain verified,” and “cron healthy” are each necessary evidence where applicable; none substitutes for a received contractor-domain message and a working rollback.
