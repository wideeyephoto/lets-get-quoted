# Dispatch SMS operational acceptance — September 9, 2026

The evening session verified deployed suppression and recovery functions, followed by one real delayed dispatch delivery. It extends the recorded September 8 handset/workflow session and the September 9 afternoon suppression checks. It does not activate customer messaging or expand the dispatch account allow-list.

Private operator evidence and reproducible queries are retained outside this public repository in `C:\dev\sms-operational-evidence-20260909.md`. That record contains the test identities, message/receipt references, exact timing and cleanup evidence. The source-review baseline was `3fa18307a`; the hosted assertions exercised the installed database functions, and the delayed message used the running production worker.

## Verified during this session

| Check | Evidence and scope |
| --- | --- |
| Real STOP and START | The designated handset received both acknowledgments. Both inbound receipts processed without error; the final preference is opted in. |
| Cross-workspace suppression | With real campaign STOP active, otherwise-eligible transaction-only fixtures for both test workspaces were cancelled during staging. Both final request-boundary probes were refused with the keyword-specific code `P5103`. No provider request or usage reservation occurred. |
| Hosted failure and recovery matrix | Twelve rollback-only cases passed against deployed functions: pre-request retry/backoff, exhausted retry budget, definite throttle, terminal rejection, unknown-response quarantine, deferral/reclaim, refusal to defer after request start, stale-claim refusal, accepted usage, rejected usage, unknown-result usage, and duplicate/late callback convergence. |
| Usage finalization | Controlled cases used the normal reservation and reconciliation functions. Accepted and indeterminate sends follow the existing commit policy; definite rejection releases the hold. Repeated reconciliation did not settle the same fixture twice. Unknown outcomes remain quarantined rather than automatically resent. |
| Live delayed dispatch | One clearly labeled test was queued through the normal enqueue function with a future release time. Repeated enqueue returned the same event. The message remained unclaimed before release; the production worker subsequently delivered it in one attempt. This is a controlled queue fixture, not another UI producer acceptance test. |
| Actual carrier accounting | A read of the exact provider message confirmed delivered status, no provider error, and one segment. The application has one committed text unit and one completed attempt. Queued/sent callbacks were safely ignored as stale; delivered status applied without error. |
| Cleanup | All synthetic recovery/suppression events, receipts and credit reservations rolled back. The real delivery and its audit history remain. The temporary subcontractor fixture was archived using the same account-scoped `active=false` update as the application helper; the test job remains archived. |

The live delayed-delivery message still requires the recipient's explicit handset confirmation at this snapshot. Provider delivery is recorded separately from that confirmation.

## Boundaries and remaining acceptance

- The cross-workspace assertions used temporary eligibility fixtures within rolled-back transactions. They neither create real second-workspace consent nor prove acceptance through a second eligible live workspace's worker. Only one real dispatch sender was used; another same-campaign carrier sender remains unsampled.
- Injected database states verify deployed recovery/accounting behavior. They do not establish an actual carrier throttle, timeout, failed delivery, or deliberate signed HTTP callback replay. Existing local and database evidence must retain those labels.
- The timed live message proves the future-availability queue and scheduled worker. Customer timezone/quiet-hours producer acceptance remains separate and requires the correct customer messaging setup.
- Customer messaging remains gated on the accurate LGQ internal-test arrangement, reviewed carrier registration, number assignment, runtime test branding and actual consent enrollment. The authorized provider inquiry was sent; an approved response is not recorded here. See [internal-test setup](customer-sms-internal-test-setup-2026-09-09.md).
- Commercial dedicated-number lifecycle and authorized staged expansion remain open. Preserve the existing dispatch rollout restriction while those applicable gates are resolved.

No application implementation or production schema changed during this session. The verification scripts and detailed operational results remain private; this report records the evidence boundaries for the launch checklist.
