# Six-SKU release

The catalog enables `storage_100gb`, `office_user`, `ai_voice_flex`,
`ai_voice_solo`, `ai_voice_growth`, and `voice_minutes_100` for eligible plans.
Each requires its matching live Stripe Price and canonical catalog metadata.

## Capacity products

Storage adds 100 GB for $15/month. Production uses
`LGQ_STORAGE_CAP_ENFORCED=1`, and upload paths check the workspace limit.
Storage retains the documented support-upload exception, client-reported video
size limitation, and periodic measurement rather than atomic upload reservations.

Office capacity adds one counted office seat for $15/month on eligible paid
plans. Flex includes two counted office seats. Additional seats do not grant
owner authority or automatically assign permissions; clients and jobs require
the appropriate explicit office grants.

The paid-checkout projector grants recurring capacity only after paid checkout
with a valid subscription ID. Cancellation is scheduled for period end; terminal
provider cancellation removes the purchased capacity idempotently. It does not
delete stored files or automatically remove existing members.

## Voice launch policy

Voice launches with metering enabled and exhaustion blocking disabled. LGQ
absorbs unmetered usage while provider reconciliation continues:

- `LGQ_VOICE_MINUTE_METER_ENABLED=1`
- `LGQ_VOICE_MINUTE_GATE_ENABLED=0`
- The recurring allowance worker remains enabled.

Full-period reconciliation is required before strict exhaustion enforcement.
This release does not enable additional overage charges or enforcement.

Inbound retries exclude their own admission from the concurrency count.
Fallback does not forward a caller back to the same phone. Signed status
callbacks use fixed URLs and retrieve attribution from the saved inbound call;
recording and callback authentication remain mandatory. Duplicate fallback
requests preserve settled call and recording state.

## Verification and release records

Automated coverage includes checkout eligibility, Stripe Price validation,
recurring capacity grants and cancellation, voice allowances, metering,
concurrency, callback signatures, recording ingestion, and workspace access.
Tests use synthetic fixtures and disposable or rolled-back database changes.
No live card charge is part of this verification.

Detailed controlled-call evidence remains in the local release record, outside
this public repository. Implementation is tracked in PRs #28, #29, #30, and #31.
