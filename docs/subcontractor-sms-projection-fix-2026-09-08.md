# Subcontractor SMS delivery evidence permission fix

The September 8 live offer reached the authorized handset and its private link accepted the test request, but the staff send action returned HTTP 500. Production logs recorded `42501: permission denied for function apply_subcontractor_sms_event_projection`. The durable event delivered, while the offer's `sms_event_id` and carrier timestamps stayed empty.

The offer-link trigger runs as the server role and calls an invoker function whose EXECUTE permission was revoked from that role. Grant only `service_role` EXECUTE on the existing projector. Do not make it SECURITY DEFINER or expose it to browser roles. Existing account/crew identity guards and row permissions remain in place.

Validation: the local delivery harness now reproduces the exact failure while acting as service_role, then verifies successful linking after the grant, browser-role exclusion, delivery projection, cross-crew rejection, and queue/usage behavior: 27/27 checks passed. Canonical schema parity passed. Production application awaits explicit approval.

After approval, recover the already-delivered test offer by attaching its verified existing event without replaying the send or changing its accepted state. Then test a fresh decline/cancel offer through the normal UI and verify its linked delivery evidence.

Other extended-session checks: 239 application tests plus 56 customer-producer/timezone/campaign checks passed; isolated PostgreSQL webhook checks 24/24, campaign-purpose checks 7/7, sender registration checks 3/3. The campaign-purpose test loader needed LF normalization on Windows; only the local loader changed. These are local results, not live-carrier claims. The Midwest-only browser received a 404 for BrokePipes request management. Customer sender registration still uses the support campaign, so live customer sends remain gated.
