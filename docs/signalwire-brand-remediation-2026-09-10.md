# SignalWire sender identity remediation — September 10, 2026

## Status

Prepared locally on `fix/signalwire-brand-identity-20260910`, starting from main `eed040fdc`. Not deployed. No production settings, registration records, consent records, messages, or queued delivery rows have been changed. The support reply is a draft and has not been sent.

## What changed

- STOP, START, HELP, and shared-number informational replies use the registered Let’s Get Quoted brand on `lgq_shared` and `lgq_dispatch`, regardless of the associated account’s workspace name.
- Account, crew, subcontractor, briefing, field-confirmation, and ad-lead templates identify Let’s Get Quoted. Workspace names remain assignment or workspace data. Previews share the affected builders.
- Restored the earlier unmerged voice-summary fix from `43d174d5f`, with additional containment for malformed, mixed, or nested JSON. Recognized structured fields produce prose; unusable input produces a readable fallback. Parsing occurs before shortening, and emergency triage no longer truncates JSON first.
- Before staging, billing, or carrier egress, the durable worker defers ordinary and emergency voice call-alert SMS on `lgq_shared` with `sms_campaign_scope_review`. Changing the prefix does not authorize their campaign use.
- The same worker defers unbranded messages on LGQ campaigns with `sms_brand_identity_review`. This includes old queue entries and independently generated messages. Held bodies are preserved for review, not rewritten or automatically resent.
- Empty field-action responses remain empty; branding does not create a spurious acknowledgement.
- Independently registered contractor-dedicated traffic retains its existing identity and registration gates. This change does not authorize BrokePipes to send as an unregistered brand or allow customer traffic onto LGQ campaigns.

## Verification

509 tests passed across 31 affected test files, including keyword replies, delivery holds, JSON summary containment, field actions, dispatch, template previews, and provider boundaries. The full application/test TypeScript check passed. The changed-file lint check completed with no errors and three existing unused-symbol warnings. Automated tests block provider egress; they do not prove the production deployment or carrier-managed automatic response configuration is corrected.

## Release follow-through

1. Deploy this branch through the normal release process. Until then production retains its current behavior.
2. Confirm both LGQ sender numbers and carrier-managed keyword response settings identify Let’s Get Quoted. The reported provider message IDs have not been retrieved during this local code change.
3. Review held queue entries. Cancel obsolete alerts; regenerate only appropriate current messages with valid consent and an approved campaign. Do not release an old backlog merely because a campaign is approved later.
4. Confirm owner-directed ordinary and emergency call-alert SMS are held. Their source call records remain available; the SMS hold must be communicated because recipients will not receive those texts after deployment.
5. Obtain SignalWire’s written campaign-scope guidance and confirmation on sharing the proposed test campaign between both workspaces. This branch deliberately provides no environment-variable bypass for the disputed call-alert scope.
6. Verify the deployed payloads using controlled devices only after the relevant campaign and consent are in place, then submit the new test campaign.

## Proposed test campaign CTA

“Let’s Get Quoted sends demo booking requests, missed-call follow-ups, post-call follow-ups, and two-way test replies only to company-controlled test devices. Each device owner provides written consent before messages are sent. No external recipients are contacted. No actual service is booked through these tests. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help. Support: hello@letsgetquoted.com.”

Use this statement only when the device restrictions and written-consent process are actually in place. Low Volume Mixed with Customer Care and Account Notification is SignalWire’s recommendation in the supplied email; the provider has not yet answered the two-workspace question.

## Consent record template

Maintain one entry per test device, including a copy of the actual written consent. Do not backdate or infer consent from owning a number.

| Phone number (E.164) | Device owner | Consent date and time | Exact disclosure accepted | Written consent evidence | Workspace(s) | Revoked at |
| --- | --- | --- | --- | --- | --- | --- |
| To be recorded | To be recorded | To be recorded | Paste the complete agreed text | Reference the actual written record | To be recorded | If applicable |
