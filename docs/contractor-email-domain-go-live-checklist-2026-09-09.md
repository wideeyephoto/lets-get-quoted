# Contractor email domain sending: go-live task list

Prepared September 9, 2026. Status: **not ready for general release; rehearsal and a controlled canary remain to be completed.**

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
- [x] **C03 — Audit reserved and previously verified domains.** `createEmailSendingDomainAction` enforces rejection of reserved/platform domains and does not inherit pre-verified status from orphan provider records without tenant verification proof; newly attached domains initialize to `pending`.
- [x] **C04 — Make administrative suspension durable.** `verifyEmailSendingDomainAction` and `reconcileSendingDomains` enforce `.neq('status', 'disabled')` so in-flight manual verification or scheduled reconciliation cannot overwrite an administrative hold. Added distinction between administrative hold (failure reason containing `administrative`) and retryable cleanup failure (`CLEANUP_PENDING`).
- [x] **C05 — Bound domain creation and handle exhaustion.** Limit enforced to 1 custom domain per workspace in `createEmailSendingDomainAction`. Provider 422 quota errors caught and mapped to user-friendly quota exhaustion message. Covered by `test/email-sending-domains-controls.test.ts`.
- [x] **C06 — Verify state transitions and send behavior.** Comprehensive mapping of provider statuses (`not_started`, `pending`, `verified`, `failed`, `temporary_failure`). Request timeouts and errors handled without state corruption. Sender selection restricted to `status = 'verified'`.
- [x] **C07 — Handle the gap before reconciliation.** Resend send path safely falls back to platform sender with contractor `Reply-To` on unauthenticated/unverified custom domains without losing or duplicating messages.
- [x] **C08 — Make removal and replacement recoverable.** Disconnect action stops custom sending and deletes provider domain. On provider failure, row transitions to `status = 'disabled'` with `CLEANUP_PENDING` failure reason. Reconciler sweep automatically retries and cleans up `CLEANUP_PENDING` provider resources.
- [x] **C09 — Cover all intended email paths.** All contractor quote, invoice, and job notification email templates route via `email-brand.ts` respecting verified custom domain or fallback platform identity with contractor Reply-To. System/security/platform notifications strictly use platform identity.
- [x] **C10 — Fix scale boundaries before exceeding them [scale].** Domain reconciler updated with exact backlog count calculation via PostgREST count header. Pagination boundary handling prepared for multi-page provider inventory.
- [x] **C11 — Run the release checks.** Executed full test suite: `npm run lint` (clean, 0 errors), `npm run typecheck` (clean, 0 errors), `npm run test:pg17:email-sending-domains` (15/15 passed), `npx vitest run test/email-sending-domains*.test.ts test/env-example-covers-what-the-code-reads.test.ts` (47/47 passed), and Next.js production build verification completed.

## D. Rehearse connect → DNS → verified through the product

Owners: Engineering + DNS owner. Depends on G1 preparation; use the real provider and isolated test workspaces.

- [ ] **D01 — Connect from staging workspace A using the UI.** Record normalized domain, From prefix, workspace/row IDs, provider ID, and initial status. Confirm retries do not create duplicate ownership or hidden extra rows and that pending domains still send through the expected platform path.
- [ ] **D02 — Inspect the exact DNS instructions.** Compare the provider response to the rendered table, including names, types, values, priorities, and copy buttons. Do not hard-code “four records” or “two DKIM TXT records”: use the real provider-returned set. Reject instructions that replace existing root MX/SPF or unrelated records; review warnings instead of hiding required configuration failures. Verify root/subdomain names and registrar auto-appending behavior. [Resend domain documentation](https://resend.com/docs/dashboard/domains/introduction).
- [ ] **D03 — Publish only the rehearsal records.** Preserve the test domain's existing mail configuration. Verify authoritative/public DNS answers match the intended names and values, including registrar quoting, DNS-only requirements where relevant, and propagation. Do not weaken an existing DMARC policy to make the test pass.
- [ ] **D04 — Reach verified through the UI.** Capture provider and database state, populated `verified_at`/`last_checked_at`, cleared failure reason, correct provider binding, and UI after reload. No manual database promotion counts as a pass. Confirm a refresh does not create a second domain.
- [ ] **D05 — Test pending and incomplete setup.** Leave a required test record absent initially, click Verify before propagation, then correct it. UI must show an accurate pending/failed explanation and next step, without claiming authenticated sending or exposing raw provider errors.

## E. Prove the delivered email and reply experience

Owners: Engineering + mailbox operator. Depends on D04. Use the approved test recipients and actual LGQ product actions.

- [ ] **E01 — Send a real LGQ quote to Gmail and Outlook/M365.** Record product action/quote ID, sender workspace, release deployment, UTC time, provider message ID, receipt, and inbox/junk placement. Provider acceptance or a “sent” toast alone is insufficient.
- [ ] **E02 — Capture receiver authentication evidence.** Save the original `.eml` or raw headers from both receivers. Require the intended contractor `From`, at least one passing DKIM signature whose signing domain aligns with that From under the applicable DMARC policy, expected envelope sender/Return-Path and SPF result, and `dmarc=pass` on the rehearsal domain configured with DMARC. Header formatting may differ (`header.d`, `header.i`, multiple signatures); use the receiver's authentication result rather than matching one exact string. A passing signature for only `letsgetquoted.com` does not prove contractor authentication. [DMARC reference](https://resend.com/docs/dashboard/domains/dmarc).
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
| F03 ☐ | Delete the rehearsal domain at Resend | Reconciler treats GET 404 as an absent binding and downgrades it without an unhandled exception. Subsequent send falls back. Reconnection creates a valid binding and re-verifies; DNS restoration alone cannot repair a deleted provider resource. |
| F04 ☐ | Claim workspace A's domain from workspace B | Make both staging workspaces eligible for the rehearsal, so a rollout-gate refusal cannot mask the ownership test. Real application requests must refuse B's claim because A owns the domain; A's row, binding, and subsequent sender remain unchanged. Pair this with C02 concurrency/RLS tests. |
| F05 ☐ | Provider request timeout, 429, or 5xx | Use controlled fault injection in Preview, clearly labeled as injected rather than a naturally occurring provider failure. Existing verification is not overwritten merely because the request failed; failures are observable, retries bounded, and sends follow C07. No deliberate outage of Production. |
| F06 ☐ | Administrative disable and concurrent verification | Disable the test tenant/domain using the supported operator path. Verify, reconnect, in-flight reconciliation, and queued work cannot bypass the hold. Technical-domain suspension uses approved fallback; an abuse hold stops the affected tenant's sends entirely. |
| F07 ☐ | Owner notification fails | Simulate a failed alert delivery after downgrade. Failure is retained and retried/escalated; the next pass must not forget it solely because the domain is already failed. The current transition-only notification approach needs an explicit retry or incident process. No repeated successful alert spam. |
| F08 ☐ | Clean disconnect and reconnect | UI disconnect immediately removes custom sending eligibility, removes provider resource and DB binding, and releases a slot. Reconnect follows ownership verification and uses the current provider ID. No automatic adoption of an unrelated stale verified resource. |
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
- [ ] **G07 — Define supported recovery.** Give Support a short diagnostic flow for pending DNS, failed authentication, provider 404, capacity full, alias/reply failure, disabled domain, and cleanup pending. Document the division of responsibility between LGQ, registrar, and mailbox provider.

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
| C: engineering | Changes/review, ownership and suspension race tests, send-path inventory, check exit statuses | Pass (2026-09-09): C01–C11 complete; all 15 PG17 checks pass, 47 Vitest tests pass (including controls & env coverage), zero lint/typecheck errors, production build verified |
| D: connect/DNS | UI records, actual DNS answers, provider binding and verified DB state | Pending |
| E: received messages | Gmail and Outlook originals, auth results, reply/alias receipt, template coverage | Pending |
| F: failure matrix | Before/after states and evidence for F01–F11; real versus injected clearly labeled | Pending |
| G/H: operations | Alert receipt, responder, quota/cleanup ownership, successful rollback/hold drill | Pending |
| I: canary | Seven scheduled runs with real volume, incident log, contractor and release sign-off | Pending |
| J: GA | Entitlement, purchased capacity, support article, cohort and deployment, post-release checks | Pending |

**Go decision:** G1–G5 have retained evidence, no unresolved identity/authentication/suspension/data-loss defect, capacity covers the admitted cohort and reserves, and a named responder owns operation. “All tests green,” “domain verified,” and “cron healthy” are each necessary evidence where applicable; none substitutes for a received contractor-domain message and a working rollback.
