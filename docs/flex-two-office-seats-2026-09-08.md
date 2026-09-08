# Flex includes two office seats

The owner counts as one seat. Flex now includes one additional office user,
matching the user's September 8 product decision. Solo stays at two, Growth at
five and Scale at fifteen.

Migration `20260908132425_flex_two_office_seats.sql` was applied to production.
It updates the new-account initializer and the subscription cancellation
projector's Flex snapshot, then raises existing Flex snapshots below two seats.
Larger grants, other limits, purchased capacity and historical billing evidence
are preserved. Unexpected function-source drift aborts the transaction.

Production verification found nine Flex workspaces with two seats, one Solo
workspace with two and one Growth workspace with five. Midwest Glass Company
reports one active office user against a limit of two.

The PostgreSQL initialization harness passed 26 checks, including backfill,
new-account grants, idempotence, preservation of paid/custom allowances and
atomic refusal on source drift. It verifies the cancellation function's exact
source change; it does not simulate a full hosted cancellation webhook.
Pricing and entitlement tests and typechecking also passed.

The catalog, comparison table and pricing copy are updated in this branch.
Public pricing copy requires the application deployment. Office-user top-up
withholding is separate from this included-seat allowance and remains in place.
