# Voice receipt operations

The **Voice receipt processing** section of `/admin/failures` shows pending and
failed receipts in the configured SignalWire project and space. It includes the
original receipt and call references, account link, failure stage, attempts,
arrival time, retry schedule, and active processing lease. Raw receipt payloads,
transcripts, processing tokens, and arbitrary provider errors are not displayed.

The view loads the oldest 100 pending receipts and reports the total. A missing
provider scope, timeout, or database error displays an unavailable state rather
than a healthy zero. The query runs alongside the other operations queries and
has a four-second transport deadline.

Automatic recovery runs every five minutes. After fixing the underlying cause,
an operations administrator can enter a reason and choose **Retry receipt** for
an eligible receipt. The server requires `ops.manage` and MFA, records the retry
intent durably, and invokes the existing `recoverVoiceReceipt` path with the
original event ID. Recovery still verifies provider/account/admission scope,
the complete saved call projection, the 24-hour recovery window, active leases,
backoff, and the five-attempt limit. It never clears counters or creates a new
receipt. A lost response remains unconfirmed; refresh the status before retrying.

Receipts outside the recovery window, without complete attribution/evidence, or
with exhausted attempts need review of the original call and admission before
supported reconciliation. Resolving a generic webhook alert does not repair its
receipt. These controls do not change call routing, minute metering, financial
enforcement, or SMS registration eligibility.

Validation covers permission/MFA rejection, audit failure, exact event reuse,
deferred and exhausted outcomes, uncertain responses, scoped reads, unavailable
data, privacy filtering, and rendered recovery controls. The existing receipt
recovery and processing suites cover reconstruction and lease/idempotency rules.
No database migration or environment change is required.
