# Customer sender registration guard

During voice receipt recovery on September 8, one previously pending caller
follow-up was delivered from the BrokePipes dedicated number. That number uses
the LGQ support campaign. An older canary migration copied active inventory into
an approved legacy registration row, while no matching customer registration
application existed. Carrier delivery therefore did not establish customer-lane
readiness.

`20260908204510_customer_sms_registered_sender_guard.sql` now checks customer,
payment and verification messages at the existing leased dispatch boundary.
The selected number must match its workspace's active registration application,
provider brand, campaign, number, assignment and inbound-readiness evidence.
Campaigns also used by LGQ shared support or crew dispatch are excluded.

The change preserves the existing TTL, suspension, consent and campaign STOP
checks. A blocked sender is deferred by the existing worker before provider
submission or minute/text debit; pending intent remains subject to its existing
24-hour expiry. Shared owner alerts and crew dispatch keep their own paths.
No registration, sender assignment, consent record or historical delivery is
fabricated or rewritten.

The migration is installed in production. The customer readiness predicate
returns false for the affected number. Its new helper is SECURITY INVOKER;
the existing dispatcher retains its earlier privilege mode. Both are executable
only by the service role, not browser roles. Security advisors did not identify
the new helper; unrelated existing advisories remain.

Validation: `scripts/verify-customer-sms-sender-guard.mjs` passed 23 disposable
PostgreSQL checks, including actual dispatcher calls, repeated migration,
missing/foreign/suspended/mismatched registration, support/crew campaign reuse,
payment/verification traffic, STOP, owner/crew routing and browser-role denial.
It performs no carrier requests. Set `LGQ_PGLITE_MODULE` to an installed PGlite
module file URL when PGlite is not available through normal module resolution.

BrokePipes caller post-call SMS is paused. AI voice and owner SMS alerts remain
enabled. Customer acceptance requires the correct provider registration and
sender evidence before restoring that producer. The delivered controlled-test
follow-up is retained as evidence, not counted as customer launch acceptance.

Containment and rollback: leave caller post-call SMS paused until sender readiness
passes. Keep inbound and status callbacks active. A voice application rollback
does not remove this database guard. Do not roll back the guard merely to restore
the legacy canary's customer sends; correct registration and number assignment.
