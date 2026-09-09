# Operational alert verification — 2026-09-09

Owner and approved inbox: **Brett / hello@letsgetquoted.com**.

## Release

PR [#46](https://github.com/wideeyephoto/lets-get-quoted/pull/46) is merged. Production commit `48dee526b6c25a020758e42f4684bd5698ef54e2`, deployment `dpl_uLi2ZDS2BP6NY78hfwxd8gCasGwo`, was built with production settings and promoted after the exact reviewed head passed CI. The live protected route returns 401 without credentials. Scheduled runs started at 14:10:13 and 14:15:13 UTC.

The production migration audit reports **1 applied, 0 gaps, 0 undetermined**. Both new tables have RLS; browser roles cannot read them or invoke their functions; the service role can. No business-table privileges were broadened.

## Gaps closed

- Five-minute application monitoring and a separate GitHub watchdog scan unresolved webhook, billing, SMS, dispute and scheduled-worker failures.
- Durable claims and immutable email payloads replace fire-and-forget delivery. Provider errors fail the operation. Only verified delivery evidence counts as delivered.
- Unknown send results reuse the original provider idempotency key; retries stop before that provider's 24-hour deduplication window expires.
- On-call webhook failures and rejected email SDK responses no longer report success. Unsupported SMS and automatic escalation claims were removed.
- The SRE helper cannot pretend to recover a webhook by marking it resolved without processing it.

## Controlled production drill

Five clearly marked source records were inserted at **14:12:34.126 UTC** in the designated BrokePipes test workspace. They represent an unresolved webhook, failed billing projection, failed SMS event, zero-value dispute and failed `service-reminders` run. No real provider payment, dispute, customer SMS or billing replay was requested. The normal scheduler detected all five at **14:15:16.072 UTC**; no manual monitor call drove their initial detection.

All five emails reached **hello@letsgetquoted.com** within the 60-minute requirement. Signed provider callbacks give the receiving-mail-server times below. All five were independently visible in the actual Gmail **Inbox** by 14:18 UTC, within six minutes of failure creation. The billing email was opened and its exact source reference, recovery instructions and admin link checked. The recipient's earlier "not received yet" report was followed by direct inbox verification; reading by Brett is not inferred from provider delivery.

| Failure class | Provider delivery (UTC) | Failure to delivery | Alert reference |
| --- | --- | --- | --- |
| Billing | 14:15:18.546 | 2m 44.4s | `89fe7b0c` |
| Cron | 14:15:19.334 | 2m 45.2s | `d3da72e7` |
| Dispute | 14:15:20.648 | 2m 46.5s | `0d440faa` |
| SMS | 14:15:21.965 | 2m 47.8s | `d15ec0bd` |
| Webhook | 14:15:29.316 | 2m 55.2s | `07fef3ce` |

The monitor finalized every delivery by 14:20:15 UTC (the most conservative recorded upper bound is 7m 40.9s). At 14:20:56–14:21:00 UTC, replaying all five exact payloads with their original provider keys returned HTTP 200 and the original five provider IDs. No new email was created.

Guarded fixture recovery completed at 14:21 UTC. The first pass changed exactly the five controlled records; repeating it changed **0/0/0/0/0**. There were **zero fixture charges, credit grants, SMS messages, delivery tasks or SMS provider IDs** before and after recovery. The synthetic billing receipt remains audited as ignored with `projection_applied=false`; it was not deleted or falsely marked applied. The fake cron row was removed, restoring the original real-run history. No historical business failure was marked recovered.

Raw correlation evidence is stored privately in `C:/dev/operational-alerts-live-evidence.json` and retained in the production operational alert tables. Notification content remains immutable for audit.

The independent watchdog's manually dispatched [recovery run 34363147749](https://github.com/wideeyephoto/lets-get-quoted/actions/runs/34363147749) passed at 14:22:36 UTC. It recorded all five findings cleared at **14:22:35.432 UTC**, queued/claimed/sent zero new notifications and reported zero delivery failures. The Gmail search still contained exactly the five drill emails, four baseline digests and one fallback email after replay. This manual recovery verification is separate from the initial scheduler-driven detection and delivery proof.

The baseline watchdog run [34361514879](https://github.com/wideeyephoto/lets-get-quoted/actions/runs/34361514879) succeeded and sent four digests for the existing backlog. At that time there were 31 unresolved webhook failures, 186 failed billing events and four failed SMS events. A fourth digest recorded that the newly declared application monitor had not yet run; its first successful scheduled run cleared that finding. Existing business failures were preserved.

## Monitor failure and recovery

A separate child process used an intentionally invalid database credential; production credentials and service availability were unchanged. The real monitor script failed and automatically sent its direct fallback. Failure began at 14:08:59.207 UTC; the signed delivery receipt is **14:09:02.676 UTC, 3.469 seconds later**. Two monitor attempts plus the dependency-free fallback returned the same provider message ID `aab07d45-4c08-4436-bb3c-4ee944a39752`. The email was visibly present in the actual Gmail Inbox at 14:15 UTC. This proves automatic notification without a working database, and real-provider deduplication of that fallback.

## Verification scope

- Final-head [CI](https://github.com/wideeyephoto/lets-get-quoted/actions/runs/34360533879) passed security audit, **14,221 unit tests across 1,108 files**, SEO tests, stock tests, typecheck, lint and production build.
- Focused payment, top-up, SMS and recovery regression selection: **114 passed / zero failures**. Cases cover already-paid exact checkout replay, top-up duplicate receipts, and indeterminate SMS submission being blocked from automatic resend.
- Disposable PostgreSQL verification: **9/9**, including duplicate scans, overlapping claims, crashed send retries, expired idempotency windows, source-state preservation and recurrence.
- Hosted staging rehearsal used actual production-shaped tables in a rolled-back transaction: all five categories detected; repeat scan queued zero; hashes of payments, credits, SMS messages and billing receipts stayed unchanged.
- Staging cleanup replay changed zero records and created zero charges, credits, SMS messages, delivery tasks or provider IDs. Billing audit evidence was retained as ignored, never deleted or falsely marked applied.

These checks prove operational notification and controlled recovery safety. They do not replace real-money lifecycle or real-carrier acceptance tests elsewhere in the launch checklist.

## Ongoing operations

Follow [the deployed operational alert runbook](https://github.com/wideeyephoto/lets-get-quoted/blob/48dee526b6c25a020758e42f4684bd5698ef54e2/docs/runbooks/operational-alerts.md). The recipient receives source references, failure stage, recovery instructions and the corresponding admin link. Delivery callbacks may reach the application after the receiving server accepted the email; preserve both timestamps.

GitHub schedules can be delayed, so the five-minute application schedule is the primary path. Both custom alerts use Resend. Existing GitHub-native failed-run emails were also visible in this inbox, but an end-to-end Resend outage and a 60-minute guarantee for GitHub scheduling were not proven in this drill. A recipient-mailbox outage cannot be recovered through that same mailbox.
