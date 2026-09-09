# Contractor domains: Outlook, lifecycle, and canary record

Updated September 9, 2026. **Preparation in progress; the seven-day observation clock has not started.** The owner authorized Black Hole Art DNS changes and Gmail/Outlook test recipients. Only the workspace owning `blackholeart.com` is in scope: BrokePipes, `c63293b4-138e-45c2-8e11-0f4e6d7e08e6`. Keep general enrollment closed.

## Receiver and quote-link evidence

| Check | Evidence | Scope |
| --- | --- | --- |
| Outlook custom sender | `DOMAIN-OUTLOOK-20260909`, provider `95e35df3-26eb-4a38-900f-fb4320f03cb5`; accepted 21:05:22 UTC; production delivery callback 21:05:27.002 UTC | Received in Outlook Focused Inbox. Actual renderer and fallback transport executed locally; correct production workspace tag. This was not a deployed domain-onboarding test. |
| Outlook authentication | SPF PASS `smtp.mailfrom=rsend.blackholeart.com`; DKIM PASS `header.d=blackholeart.com`; DMARC PASS `header.from=blackholeart.com`; Microsoft composite authentication PASS; provider ingress TLS 1.3 | Receiver message source retained in the owner's Outlook account. Exact DKIM alignment and relaxed SPF alignment. |
| Separate-mailbox reply | Outlook Reply selected the authorized Gmail mailbox; reply sent and received in Gmail Inbox at 21:10 UTC | Gmail search `DOMAIN-OUTLOOK-20260909`; conversation `FMfcgzQhWLRLsHwCttsKFGRCCWzkQPlg`. Direct mail to `hello@blackholeart.com` remains unsupported: no mailbox/alias exists. |
| Corrected product quote | Deployed LGQ created J-1004, job `5fd81ecf-c1af-41a2-8d7d-f993eb6b80d1`, amount $0; provider `fad727d4-395b-4485-8a90-505502439acb`, delivered 21:19:37.132 UTC | Outlook Other Inbox. The actual email button opens the matching `/client/jobs/<token>` page with J-1004, test scope, recipient, and $0. No signature, approval, schedule, invoice, or payment submitted. Uses the platform sender until domain enrollment. |

The earlier transport probes used `https://blackholeart.com/` as their quote URL. The owner correctly reported that those buttons opened the contractor homepage. That was a rehearsal setup error, not evidence of a broken production token route. J-1004 closes the deployed product-link check; it does not retroactively turn the probes into real quotes. Its private access token and personal recipient addresses are excluded from this repository. The job is marked `contractor-domain-canary-20260909`, which excludes it from the normal quote follow-up sweep.

## Shared-provider callback incident

The first two Gmail probes used a staging account tag with a shared live Resend webhook pointing at production. Although both emails arrived, their callbacks failed the production `email_events_account_id_fkey`. Sixteen retry failures had accumulated by 21:05 UTC for provider IDs `45d14716-1535-412e-b65b-84264775ad4d` and `81bbc108-4026-4e3b-a8eb-f4e126d724c4`. Preserve the failure records and their disposition; they are not proof of undelivered mail and must not be silently cleared.

The new route durably records a signed, permanently foreign/deleted-workspace event as `EMAIL_ACCOUNT_QUARANTINE` before returning 202. It does not reassign the event or suppress another tenant. Failed quarantine persistence and unrelated database failures still return 500. Production-tagged Outlook and J-1004 callbacks recorded delivery normally. Do not reuse the old staging-tagged live-send harness.

## Candidate and validation

- Atomic pending-domain reservation precedes provider creation. A unique account index enforces one domain of any status per workspace, including concurrent requests. Provider failure retains a recoverable failed reservation; a newly created binding is removed if ownership disappears before persistence.
- Migration `20260909210950_email_sending_domain_account_limit.sql` applied to production and `staging-db` after empty-inventory/duplicate preflight. Seventeen isolated PostgreSQL 17 checks passed, including simultaneous inserts from separate connections and replacement after disconnect. The initially rejected staging operation was retried only after verifying the project name, organization, and empty table; it succeeded.
- 172 focused domain, sender, webhook, and website lifecycle tests passed after merging current main. TypeScript test-project check and targeted lint passed before the main merge. A fresh optimized Next.js production build passed on the merged candidate using CI placeholder credentials, including application type checking and all 421 static pages. Existing unrelated lint warnings remain. Hosted candidate acceptance is still required.
- Preserve production security changes from main. At the 21:29 UTC inspection, production was READY deployment `dpl_9HNo5Z2kEc6G3yr5wSjDmXz3FgqS`, SHA `d97ab04dff6aaf145f336422c125598f3229454d`.

The previous provider-pagination warning was incorrect: Resend's existing List Domains endpoint returns the entire inventory when `limit` is omitted, as the adapter currently does. Optional bounded pagination is a scale improvement, not a demonstrated truncated-inventory defect. [Resend pagination contract](https://resend.com/docs/api-reference/pagination).

## Remaining lifecycle and canary work

Record actual deployed onboarding, provider deletion/reconnect, technical DNS loss/recovery, durable hold/cleanup behavior, and website pending-certificate promotion/deletion using disposable assets. Keep injected fault tests distinct from provider/DNS observations. Do not delete the live website or claim that zero-row cron runs exercised a tenant.

Before starting the clock, record the READY candidate, one-workspace allowlist, active provider and database binding, successful real custom-domain product mail, and restored healthy state after drills. The reserved provider resource is `46a189db-0263-4b13-9ed9-8be696b62bad`; any replacement must be recorded. Replies use the owner's authorized Gmail mailbox. No From mailbox is provisioned.

The Gmail reply mailbox was saved through the production Business settings form and independently confirmed in the account record. An hourly task heartbeat was proposed for continued drills and observation, but automatic approval review rejected ongoing execution and possible future sends as insufficiently authorized. **No heartbeat was created.** Obtain explicit approval for the concrete schedule and limits before retrying; do not count unattended monitoring as active meanwhile.

Application/evidence candidate: `69c507898` on `audit/contractor-domains-20260909`, including the earlier `e4a54fc27` recovery patch and merged main through `be3ea90ab`. The fresh build passed. Publishing this branch was separately rejected by automatic approval review because it interpreted the request as commit-only authorization and had not established remote ownership/content trust. **The candidate has not been pushed or deployed.** No alternate publication path was attempted. Production enrollment is not activated, and hosted lifecycle work remains pending release approval.

The concrete remaining approval is to publish/deploy this reviewed candidate for the single BrokePipes workspace, finish the authorized disposable lifecycle drills, and run an hourly follow-up until seven healthy elapsed days are observed. Limit any necessary automated email to at most one test per approved inbox per day; inspect uncertain sends before retrying. Follow-ups stay quiet unless something meaningful changes or requires action, and stop once acceptance is complete. Recheck current main and active production before release so other completed work is preserved.

The canary needs at least seven elapsed days and seven consecutive successful scheduled reconciliation runs with this active domain present, fresh `last_checked_at`, representative sends and passing receiver authentication. A zero-row run or zero-send week does not qualify. Pause expansion for cross-tenant identity, authentication failure, lost/duplicate mail, inability to suspend, provider capacity exhaustion, or unresolved material defects. Preserve exact run/message IDs and investigate rather than resetting evidence to green.

| Day | Scheduled run / UTC | Domain checked and fresh | Sends / delivery / replies | Outcome |
| --- | --- | --- | --- | --- |
| 1–7 | Pending activation and lifecycle recovery | Not yet observed | Initial transport/product evidence above | Observation clock not started |
