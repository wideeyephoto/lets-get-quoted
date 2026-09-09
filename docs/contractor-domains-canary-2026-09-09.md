# Contractor domains: Outlook, lifecycle, and canary record

Updated September 9, 2026. **Preparation in progress; the seven-day observation clock has not started.** The owner authorized Black Hole Art DNS changes and Gmail/Outlook test recipients. Only the workspace owning `blackholeart.com` is in scope: BrokePipes, `c63293b4-138e-45c2-8e11-0f4e6d7e08e6`. Keep general enrollment closed.

Release continuation: Brett explicitly approved publishing/deploying the candidate and hourly follow-ups with at most one test per approved inbox daily. The task heartbeat `contractor-domain-seven-day-canary` is now ACTIVE, hourly at minute 40. It continues lifecycle preparation first and does not start/count canary days until the activation and recovery gates below pass. This supersedes the historical approval blocks recorded below.

## Production release and enrollment

- [PR #64](https://github.com/wideeyephoto/lets-get-quoted/pull/64) merged as `18a412404d275949c919b06e80bd015fd1595cc9`. [Full CI](https://github.com/wideeyephoto/lets-get-quoted/actions/runs/34409001923) passed 1,129 files / 14,590 tests, security audit, SEO/stock checks, type checks, lint, and production build.
- Brett separately approved the exact Production settings `LGQ_EMAIL_SENDING_DOMAINS_ENABLED=true` and `LGQ_EMAIL_SENDING_DOMAINS_WORKSPACE_ALLOWLIST=c63293b4-138e-45c2-8e11-0f4e6d7e08e6`. Both were applied; no wildcard or other workspace was added.
- READY deployment `dpl_955shMPfprmxsadkAEui6PqeaKC9` contains that SHA and those settings. At 22:09 UTC, both `app.letsgetquoted.com` and `letsgetquoted.com` were independently confirmed aliased to it. The earlier READY Git build did not yet serve those aliases; it was not counted as live acceptance.
- The BrokePipes production settings UI exposed enrollment and successfully created row `75f27b4c-2911-4885-b06d-b8db1fe86c97`, provider binding `de786e7c-a449-42b0-9917-85cc10af8692`, From prefix `hello`, initially pending. Another authenticated workspace, Lawn & Order Landscapers, had no domain-enrollment UI after reloading the same release. Fourteen focused rollout-control tests also passed; the UI observation alone does not prove a direct forbidden server-action attempt.
- The reserved standalone provider binding `46a189db-0263-4b13-9ed9-8be696b62bad` was explicitly retired at 22:11:02 UTC (DELETE 200, subsequent GET 404) before product enrollment. It was never silently adopted by tenant name.
- The new binding returned the same DKIM public key, but different return-path records. Squarespace now has `send` MX priority 10 → `feedback-smtp.us-east-1.amazonses.com` and `send` TXT → `v=spf1 include:amazonses.com ~all`, both TTL 30 minutes. These replace the earlier rehearsal-only `send` CNAME. The apex website A record, Domain Connect record, DKIM, DMARC, and legacy `rsend` CNAME remain as observed. Older recursive caches can retain the former four-hour CNAME TTL; do not count publication alone as verified authentication.

No additional recipient email was sent during this release continuation. Earlier September 9 tests already used today's allowance; defer further deliberate sends and owner-notification drills until the next daily allowance, including notifications triggered indirectly by DNS recovery. Before each send, check the provider inventory for an uncertain prior attempt.

### Verification-button defect found in the live rehearsal

At 22:23:29 UTC, GET of the exact provider binding returned `verified`, with all three required records verified; public DNS also returned the new MX/TXT values. LGQ's preceding Check Connection had left the row pending at 22:22:13 UTC. The helper unconditionally POSTed `/verify` before reading status, restarting asynchronous verification even when it had already completed. The follow-up patch first reads the owned binding and returns an already verified result without restarting it. Unverified bindings still trigger verification and report the actual result; deleted bindings return null. A stateful regression reproduces the provider's verified → pending reset on POST. All 59 affected tests and targeted lint pass; release verification of this additional patch is still required before counting product activation.

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

On the released public endpoint, all four original provider events were replayed through Resend's supported Replay Event API. Each actual delivery attempt returned HTTP 202 with `{"received":true,"quarantined":true}` at 22:09:45–22:09:49 UTC and persisted its quarantine record. This sent no email.

| Original event | Successful replay attempt |
| --- | --- |
| `msg_3J6dsJls8eA7JPCxy2COFFrQtmZ` | `atmpt_3J6qIVqt569HTS7Xu0MOKpowdh9` |
| `msg_3J6dsDMV2j7SCCBHfwU6DwBBjnL` | `atmpt_3J6qIdqdFramEu9Mv1ZiIqfz7gF` |
| `msg_3J6dMI4ZPDvSYpNStMy3hZZq6IR` | `atmpt_3J6qIonyixD06NbUO7w8sIIWqWF` |
| `msg_3J6dM7L01Hz0nWfoSGw0FuTo3vb` | `atmpt_3J6qIuQc8Npol6q0mU47eVg31zD` |

All 16 original failures and four quarantine rows are retained with an explicit reviewed disposition and marker `contractor-domain-callback-rehearsal-20260909`; zero remain open under that marker. The disposition identifies the two delivered test messages, incorrect deleted staging tags, release, and successful replay evidence. No customer event was reassigned or resent. Resend's event summary still displayed its historical `failed` status with no next automatic attempt; the actual replay attempt list is the HTTP-202 evidence. This closes this rehearsal incident, not every suppression/bounce/complaint scenario in F11.

## Website fixture

The disposable account `dc0c3913-ef17-4868-b00a-789362c5cbf2` and site `cdb17a5c-cf57-489e-86cb-26ecfe61155b` are marked `website-domain-lifecycle-20260909`. The site is unpublished, with domain `certificate-canary-20260909.blackholeart.com`, null verification stamp, no memberships, and no jobs or payments. Its notification recipient is the approved owner mailbox.

Scheduled run `366afbd1-ee74-4d86-9077-346bf155441e` at 22:00:29 UTC checked this one real pending row, attached it to the production Vercel project, and returned `stillPending=1`, `connected=0`, `ownersNotified=0`, `errors=0`, `orphanedAtProject=0`. Unlike the earlier zero-row runs, this proves the deployed watcher uses its credentials to attach and inspect a pending domain. DNS has not yet been published for this fixture. Publish its provider-recommended record when a notification send is allowed, observe a scheduled TLS promotion and owner notice, then delete only this empty fixture through the deployed administrative action and prove the provider binding is absent. Never delete the active Black Hole Art site.

## Candidate and validation

- Atomic pending-domain reservation precedes provider creation. A unique account index enforces one domain of any status per workspace, including concurrent requests. Provider failure retains a recoverable failed reservation; a newly created binding is removed if ownership disappears before persistence.
- Migration `20260909210950_email_sending_domain_account_limit.sql` applied to production and `staging-db` after empty-inventory/duplicate preflight. Seventeen isolated PostgreSQL 17 checks passed, including simultaneous inserts from separate connections and replacement after disconnect. The initially rejected staging operation was retried only after verifying the project name, organization, and empty table; it succeeded.
- 172 focused domain, sender, webhook, and website lifecycle tests passed after merging current main. TypeScript test-project check and targeted lint passed before the main merge. A fresh optimized Next.js production build passed on the merged candidate using CI placeholder credentials, including application type checking and all 421 static pages. The subsequent full CI and production release are recorded above. Remaining hosted scenarios still require their own evidence.
- Preserve production security changes from main. At the 21:29 UTC inspection, production was READY deployment `dpl_9HNo5Z2kEc6G3yr5wSjDmXz3FgqS`, SHA `d97ab04dff6aaf145f336422c125598f3229454d`.

The previous provider-pagination warning was incorrect: Resend's existing List Domains endpoint returns the entire inventory when `limit` is omitted, as the adapter currently does. Optional bounded pagination is a scale improvement, not a demonstrated truncated-inventory defect. [Resend pagination contract](https://resend.com/docs/api-reference/pagination).

## Remaining lifecycle and canary work

Record actual deployed onboarding, provider deletion/reconnect, technical DNS loss/recovery, durable hold/cleanup behavior, and website pending-certificate promotion/deletion using disposable assets. Keep injected fault tests distinct from provider/DNS observations. Do not delete the live website or claim that zero-row cron runs exercised a tenant.

Before starting the clock, record the READY candidate, one-workspace allowlist, active provider and database binding, successful real custom-domain product mail, and restored healthy state after drills. The retired and replacement provider bindings are recorded above. Replies use the owner's authorized Gmail mailbox, saved through production Business settings and independently confirmed in the account record. No From mailbox is provisioned.

Historical approval gates: automatic review initially rejected publication, recurring execution, and then the exact production variables. Brett explicitly approved publication/deployment and hourly follow-ups, then approved the two exact variables. Each rejected operation was retried only after the corresponding approval and then succeeded. No alternative path bypassed a rejection. There is no outstanding publication, scheduling, or variable approval at this checkpoint.

Continue the authorized disposable drills with at most one test per approved inbox per day, counting automatically triggered owner notifications in planning. Follow-ups stay quiet unless something meaningful changes or requires action, and stop once acceptance is complete. Recheck current main and active production before any later release so other completed work is preserved.

The canary needs at least seven elapsed days and seven consecutive successful scheduled reconciliation runs with this active domain present, fresh `last_checked_at`, representative sends and passing receiver authentication. A zero-row run or zero-send week does not qualify. Pause expansion for cross-tenant identity, authentication failure, lost/duplicate mail, inability to suspend, provider capacity exhaustion, or unresolved material defects. Preserve exact run/message IDs and investigate rather than resetting evidence to green.

| Day | Scheduled run / UTC | Domain checked and fresh | Sends / delivery / replies | Outcome |
| --- | --- | --- | --- | --- |
| 1–7 | Pending activation and lifecycle recovery | Not yet observed | Initial transport/product evidence above | Observation clock not started |
