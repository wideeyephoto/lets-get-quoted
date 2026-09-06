# Texting readiness: September 5, 2026

Texting is partially verified. Shared account notifications have current live
delivery and keyword evidence. Dispatch has no sender, and the pilot contractor's
dedicated number is assigned to the platform support campaign instead of a campaign
covering contractor-to-customer messages. Do not interpret local canary checks as
carrier approval or end-to-end delivery evidence.

## Code fixes

- Booking and post-call text producers now check the atomic consent boundary before
  enqueueing. STOP remains authoritative. Consent storage errors do not fall through
  to a send; post-call failures remain retryable. A failed confirmation does not
  discard a saved booking.
- Booking-request leads establish the existing customer consent baseline before
  sending the requested confirmation.
- Voice responses describe queued texts accurately rather than claiming delivery.
- The canary library and CLI explicitly mark unexercised carrier and voice checks
  as skipped. The CLI exits 1 for invalid input and 2 when live verification is
  incomplete; it cannot return a fabricated live pass.
- Read-only carrier inspection reports actual campaign assignments and callbacks.
  The dispatch callback repair script defaults to a dry run and reuses the existing
  production receiver without printing its token.

The four historical consent cancellations predate the current production release.
The production `ensure_sms_consent_baseline_scope` RPC was verified using a rolled
back transaction. Those historical rows do not establish that the RPC is broken.
The fixes address ignored producer errors and missing consent checks; they do not
manufacture consent or replay old customer messages.

## Verification

- Full suite: 1,054 test files, 13,501 tests passed.
- TypeScript check: passed.
- Production build: passed with CI placeholder configuration.
- Focused lint: no errors; one existing unused-import warning in `sms.ts`.
- Full lint: passed with existing warnings; SEO (22) and stock-image (14) tests
  passed; production dependency audit found zero vulnerabilities.
- Production delivery and inbound-action workers were running without a backlog.

Live tests used a handset explicitly authorized by its owner. The full recipient
number and credentials are deliberately excluded from this report. Event IDs allow
an authorized operator to correlate production records.

| Check | Evidence | Result |
| --- | --- | --- |
| Shared outbound | `f0e179e9-0c33-4c33-a5f1-e48fb965735b` | Delivered at 2026-09-05 23:56:22 UTC |
| HELP | Inbound receipt at 2026-09-05 23:57:51 UTC | Processed as `keyword_help`, no processing error |
| STOP | Inbound receipt at 2026-09-05 23:58:24 UTC | Processed as `keyword_stop` |
| START | Inbound receipt at 2026-09-05 23:58:43 UTC | Processed as `keyword_start` |
| Delivery after START | `3a52aeeb-8f9e-4e2e-90f4-2ee2c006b927` | Delivered at 2026-09-06 00:00:21 UTC |
| Second STOP | Inbound receipt at 2026-09-06 00:00:47 UTC | Consent changed to opted out |
| Send while stopped | `c476c7f4-2557-4465-a351-8bd93e5876c9` | Cancelled at 2026-09-06 00:02:18 UTC with `sms_consent_not_current`; no provider ID |
| Final START | Receipt `bbe80b3d-879c-488d-ad20-7b9891c95e52` at 2026-09-06 00:14:07 UTC | Processed; consent restored to opted in |
| Ordinary reply | Receipt `af373c4e-6002-41e0-9f9b-6e253d45df57`; message `0049c4fb-e8c9-4d1e-b5d6-c96c0060f29c` | Stored and routed to the correct workspace at 00:15:25 UTC; worker completed once with `no_action` and no error |
| Post-release delivery | Event `3c1b40d2-98a8-4423-8614-45f1d70e256b`; provider `062335f2-c651-4989-a7d8-38d1b1082bd4` | Delivered at 2026-09-06 00:37:22 UTC; no provider error; usage committed |

Receipt processing proves the application's keyword handling. All four compliance
acknowledgments were recorded as `twiml` egress. Handset receipt of each
acknowledgment still requires handset confirmation.

## Carrier work

The active dispatch campaign's missing status callback was repaired and verified
through a fresh provider GET. Both campaign state and the existing production
receiver were preserved.

Dispatch still needs a separately purchased number, inbound webhook configuration,
completed carrier assignment, and verified application sender registration. A
SignalWire number was quoted at $0.50/month; purchase is pending explicit approval.
Do not mark the lane active before the carrier confirms assignment.

The user confirmed BrokePipes is only a test workspace; no real-business registration
was invented or submitted. The pilot dedicated number is attached to the support campaign. That campaign's
description explicitly excludes contractor-to-customer traffic. Prepare the proper
contractor brand/campaign from real business information and complete the carrier
process before declaring customer messaging ready. Do not move it to the crew
dispatch campaign or alter its voice routing.

## Remaining live matrix

1. Completed: handset opt-in restored through START; ordinary inbound reply stored,
   routed to the expected workspace, and handled without business changes.
2. Complete dispatch provisioning and verify a consented crew send and reply.
3. Correct the dedicated customer campaign, then exercise a real booking or post-call
   flow through the released producer, queue, carrier callback, and inbox.
4. Exercise quiet hours, rejected destinations, retries, duplicate callbacks, and
   usage reconciliation with controlled test records. Local coverage alone does not
   count as live carrier verification.
5. Completed: PR #25 merged as `94404f14d3c69ec62698185745110ef042167972`.
   CI run `34001180283` passed; Vercel `dpl_AXnZn8NAnN6FMTawjvs7ToTdkAtv`
   was READY and assigned to the production apex and wildcard before the final
   delivered SMS. Production health returned 200/operational and unauthenticated
   SWAIG returned 401. No matching SMS error/fatal logs were found in the scoped scan.

Vercel's separate TypeCheck initially exhausted its 2 GB JavaScript heap. Follow-up
`0f1ae88f24a3b6a75f603f42a4f4e5292a209ecc` gives the typecheck command the same
4 GB allowance as CI. Normal and cache-disabled local checks passed; Vercel's check
then exited 0 at 00:33:39 UTC. No check was disabled. Each initial delivered test
has exactly one committed one-segment reservation; the STOP-blocked event has none.

For another handset run, obtain explicit permission for the recipient first. Send
through the normal application queue, correlate event/provider/receipt records, and
test HELP, STOP, a blocked send, START, a delivered send, and an ordinary reply in
that order. Never clear STOP directly in the database to finish a test.
