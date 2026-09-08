# SMS activation gap audit — September 8, 2026

## Continuation at 20:20 UTC

The permission-fix and existing-offer-link rows below are now closed: production migration `20260908201549` applied, role grants verified, accepted/claimed state retained during exact-event repair, and fresh UI offer delivery projected correctly in one attempt. Six earlier business messages independently matched provider segment counts to application reservations (17 total). Hosted rollback-only duplicate/late-status assertions passed without changing accepted state or accounting; synthetic receipts were absent after rollback. This advances the callback matrix only for those database-layer cases. Fresh decline offer is delivered; handset response, cancellation, and cleanup remain pending. A second-open-request attempt was rejected without creating a duplicate, but surfaced a generic error page. The table below preserves the initial audit snapshot.

Read-only audit of the proposed remaining-work list against the private SMS evidence, source and test reports, related SignalWire setup task, and fresh production database reads. No new carrier messages, payments, schema changes, or rollout changes were made. Absence of evidence is labeled separately from a confirmed incomplete state.

| Proposed item | Verified status and remaining scope |
| --- | --- |
| Subcontractor production permission fix | Confirmed pending: `service_role` still lacks EXECUTE on `apply_subcontractor_sms_event_projection(uuid)`. Local fix and 27-check regression verification are already complete. |
| Existing accepted-offer event link | Confirmed pending: accepted offer still has null event link, sent timestamp, and delivered timestamp. Repair must reuse its existing event. |
| Decline/cancel | Local workflow coverage exists. Current live decline request is still draft; no live decline/cancel completion evidence found. |
| Cross-workspace/sender STOP | Helper and local campaign-wide tests already passed. Staff cross-workspace read denial passed live. Eligible second-workspace/sender carrier acceptance is not evidenced. |
| Fixture cleanup | Confirmed pending for extended session: subcontractor remains active, job is `new_lead`, accepted request is claimed, decline request remains draft. Initial employee-session cleanup was completed. |
| Quiet-hours release | Local time/quiet-hours checks already passed. Live deferred-release acceptance is not evidenced. |
| Rejection/retry/dead-letter recovery | Local worker/delivery checks already passed. Remaining hosted/carrier recovery matrix is not evidenced; do not describe the implementation as missing. |
| Duplicate/out-of-order callbacks | Local webhook checks already passed, and normal producer dedupe passed live. Remaining hosted/carrier callback and accounting cases are not evidenced. |
| Carrier segment reconciliation | Controlled application reservations were verified, including no usage on blocked probes. Independent carrier-segment reconciliation remains unevidenced. |
| Full-schema failure | The earlier clean local schema run failed on `inventory_tool_custody_log` on baseline and fix. Fresh production lookup confirms the table exists. This is a separate reproducibility issue, not a demonstrated production SMS activation blocker. No fresh clean-schema rerun performed in this audit. |
| SignalWire internal-test guidance | Question drafted. Submission and provider response not confirmed in available evidence; do not claim it was never sent. |
| Customer brand/campaign registration | Confirmed no rows in production `messaging_registration_applications`. Test workspaces do not supply an approved customer campaign. |
| Customer number activation | Pilot number exists and is assigned, but still to support campaign. Correct customer campaign assignment remains pending. |
| Customer booking/follow-up delivery | Producers and local tests exist. Earlier pilot/shared delivery does not establish correctly covered customer-lane acceptance. Correct-lane handset completion not evidenced. |
| Customer links/privacy | Subcontractor mobile privacy already passed; that is a separate access flow. Customer-lane link acceptance not evidenced. |
| Customer inbox replies | Shared reply evidence already exists. Correctly registered customer-lane end-to-end acceptance not evidenced. |
| Customer HELP/STOP/START | Shared and dispatch evidence already exists. Correctly registered customer-lane acceptance remains unevidenced. |
| Self-service provider onboarding | Implementation and staged work exist; do not restart as a missing-feature task. Fresh production policy: billing mode null, managed registration false, polling false, project/space binding absent. Activation and full lifecycle verification remain pending. Earlier source-only no-caller finding is historical and is not a complete audit of the staged candidate. |
| Paid dedicated-number lifecycle | Checkout/provisioning scaffolding and local tests exist. Related setup task confirms no test-company application/setup payment/registration. Real paid end-to-end lifecycle completion not evidenced. This gates commercial self-service, not the existing dispatch canary. |
| Duplicate purchase/provider recovery/tenant isolation | Local implementation evidence exists; staff read isolation passed live. Full dedicated-number commercial acceptance is not evidenced. |
| Expansion and monitoring | Existing rollout runbooks and healthy console snapshots are already recorded. Authorized expansion beyond BrokePipes and cohort acceptance are not evidenced. Reuse runbooks; update cohort/evidence rather than recreate them. |

The prior remaining-work list mixed confirmed unfinished production work, already-passed local checks awaiting live evidence, and broader commercialization work. It should not be interpreted as a list of unimplemented features or as proof that every item blocks the existing dispatch canary.
