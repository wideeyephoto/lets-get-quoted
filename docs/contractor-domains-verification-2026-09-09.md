# Contractor domains verification — September 9, 2026

Status: **verification and recovery fixes complete for this audit; production rollout remains gated.** This report separates local code checks, real provider/receiver tests, and deployed application behavior. The recovery fixes in this commit have not been deployed by this task.

Follow-up: [Outlook, actual quote-link, callback incident, and canary evidence](contractor-domains-canary-2026-09-09.md). Outlook SPF/DKIM/DMARC and its reply to Gmail passed; a real production J-1004 email opens its matching quote. The original transport probes below used homepage links and are not product-link evidence. Their staging account tags caused production callback failures, now explicitly recorded in the follow-up. The account reservation gap is fixed and its migration applied to both databases. Later observations in that record supersede this initial audit's open items.

## Live email evidence

Brett authorized DNS changes for `blackholeart.com` and test messages to his Gmail inbox. No existing mailbox was required for outbound sending. Replies use his existing Gmail address; `hello@blackholeart.com` has no receiving mailbox or alias.

| Check | Observed result | Scope |
| --- | --- | --- |
| Provider registration and DNS | Resend domain `46a189db-0263-4b13-9ed9-8be696b62bad`, added 20:06 UTC, DNS verified 20:20, domain verified 20:23 | Created through Resend dashboard; DNS entered through authenticated Squarespace UI |
| DNS records | TXT `resend._domainkey` with provider public key; CNAME `rsend` → `rsend.forge.rmta.net`; CNAME `send` → `send.forge.rmta.net`; TXT `_dmarc` = `v=DMARC1; p=none;` | Resend shows all sending records verified; public DNS confirms DMARC. Existing website A record and Domain Connect record preserved; receiving remains off |
| Stale verified-domain rejection | At 20:23:16 UTC, real Resend HTTP 403 `validation_error` rejected the custom From. The new shared transport retried once using the platform From, preserving Reply-To | Staging status was deliberately injected as verified while provider verification was pending; this is failure injection, not successful product onboarding |
| Fallback delivery | Provider message `45d14716-1535-412e-b65b-84264775ad4d` accepted HTTP 200 and received in Gmail Inbox | Subject `Your quote TEST-NO-PAYMENT-20260909 from Black Hole Art rehearsal`; From `hello@letsgetquoted.com` |
| Custom-domain delivery | At 20:27:31 UTC, provider message `81bbc108-4026-4e3b-a8eb-f4e126d724c4` accepted HTTP 200; received at 20:27:35 in Gmail Inbox | Actual `sendClientQuoteEmail` and branding code, executed locally against an isolated staging fixture and the live sending service |
| Receiver authentication | Gmail original: SPF PASS for envelope domain `rsend.blackholeart.com`; DKIM PASS, selector `resend`, signing domain `blackholeart.com`; DMARC PASS, header From `blackholeart.com` | SPF relaxed alignment and exact DKIM alignment observed in receiver headers; received over TLS 1.3 |
| Reply routing | Gmail Reply automatically selected the configured Gmail Reply-To. Test reply sent at 20:28 UTC and appeared in the conversation addressed to that mailbox | Sender and reply destination were the same owned Gmail inbox. Outlook, a separate customer-to-contractor mailbox path, and direct mail to the From address remain untested |

Restricted originals remain in Brett's Gmail account. Search the exact subjects above. The custom message is `msg-f:1875887422817383735`, RFC Message-ID `<010001a087dabf61-714d4434-b535-4f20-ae2e-eb488db6fdcf-000000@email.amazonses.com>`. Personal recipient addresses, raw message bodies, and credentials are omitted from this public repository.

The test quote was explicitly marked as a rehearsal, with a zero amount and a link to the owned website. No real quote, invoice, payment, or customer account was created. Staging account `152db1d4-4448-4c02-8b89-bfb1f243ff26` and its domain binding were removed using its exact ID and test marker; subsequent SQL confirmed zero matching accounts/bindings. Production still contains zero email-domain rows. The verified Resend resource and DNS remain reserved for Brett's rehearsal, consuming one provider slot; it is deliberately not bound to a production tenant. Treat it as a known reserved resource when reviewing orphan reports. A later LGQ connection must deliberately resolve this reservation; this patch refuses automatic adoption by name.

## Production website domains

Production initially served deployment `dpl_5nriNHKDbA4SUVk4Ycrx1w6qmCR3`, SHA `9fd7802453485c66fb5bb2df2cc2d727eae718a0`. At the final deployment inspection it had moved to READY production `dpl_2vqemzQRcvg9Nn1HHw7KEkWycyDV`, SHA `2c5958ac2e350148b256f670660fad2be296622b`. The website TLS, release, Vercel-domain, and reconciler helpers match the audit baseline at both revisions.

| Check | Evidence | Limit |
| --- | --- | --- |
| Active website TLS | The actual `checkDomainTls('blackholeart.com')` returned true at `2026-09-09T20:21:25.521Z`; production site is published and verified since September 6 | Valid current certificate; not a certificate-renewal drill |
| Certificate watcher deployed and scheduled | At 19:57 UTC, `custom-domain-reconcile` had 96/96 successful runs in the preceding 24 hours; latest inspected run `0eab279d-c7e6-4dc6-9991-2e8c4154be1a`, 19:45:30 UTC | All checked zero pending domains; no pending-to-connected production transition was exercised |
| Provider cleanup in production project | Disposable `domain-deletion-check-20260909.blackholeart.com`: confirmed absent (404), attached (200), released by actual `releaseCustomDomains`, confirmed absent (404), at `20:22:30.660Z` | Uses existing CLI authorization against the production Vercel project. No live site/account was deleted; deployed app credential and deletion-action execution still require a disposable end-to-end rehearsal |
| Email reconciler scheduled | Run `e7162394-5a37-45e2-8fb3-e45c44db4f36`, 06:23:20 UTC: success, checked 0, errors 0, orphans 0 | Scheduling/empty inventory only |

## Fixes and automated verification

- Keep existing domain settings and disconnect controls available when global enrollment is paused; new enrollment remains gated by authenticated workspace eligibility.
- Reuse a provider binding only when its ID comes from the same workspace's stored row and its domain matches. Reject name-only adoption of a stale or unrelated verified provider resource.
- Retry exactly once after Resend's definitive, matching custom-domain-not-verified rejection, preserving Reply-To, content, attachments, and request options. Accepted messages, generic 403s, quotas, timeouts, and unknown outcomes do not trigger a second send. This is a technical fallback, not an abuse-hold control.
- Disable custom sending before provider deletion and retain `CLEANUP_PENDING` until both systems are cleaned. A concurrent administrative hold cannot be overwritten by a cleanup retry.
- Count provider/DB cleanup failures and unavailable management/inventory access as cron failures. Count only rows actually removed; guard removal with disabled status and the cleanup marker.

Validation: 214 tests passed across 16 domain, identity, routing, cron, and deletion suites before the final administrative-hold race guard. The affected five suites were rerun after that guard: 63/63 passed, including its new regression test. TypeScript test-project checking and targeted lint pass. All 15 embedded PostgreSQL 17 domain contract checks pass. A fresh production build and a deployed-runtime rehearsal of the new patch were not performed.

## Remaining launch gates

The current production enrollment flag is absent (the flag exists in Preview only), and no production workspace allowlist is configured. Server-side allowlist and paused-enrollment behavior pass local tests; no production canary has been activated.

The [go-live checklist](contractor-email-domain-go-live-checklist-2026-09-09.md) remains authoritative for deployed onboarding, additional template/attachment coverage, required From alias, real DNS-loss/recovery and cleanup failure drills, abuse holds, response ownership, and seven scheduled canary runs with representative sends. The follow-up closes Outlook/separate-mailbox evidence and the atomic reservation gap. Correction: Resend returns all domains when `limit` is omitted, so the current provider inventory call is not limited to one page. Do not enable general enrollment on the strength of transport probes.
