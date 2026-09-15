# Add-on renewal dates

A real Stripe sandbox Flex voice subscription fulfilled successfully, but its
capacity row retained a null renewal date after the lifecycle sweep. The worker
read `subscription.current_period_end`, which Stripe removed in the Basil API.
The current response supplies the date on `items.data[0].current_period_end`.

The worker now reads the one-item subscription created by add-on checkout.
Missing, malformed, paginated or multiple-item responses leave the period unknown
rather than choosing an arbitrary date. Existing status reconciliation remains
unchanged, and no schema change is needed.

Verification: 26 lifecycle tests passed, including a worker test using the modern
response shape. Against real Stripe test subscriptions, the staging lifecycle
sweep saved the exact item dates for Flex voice and storage. Initial purchases
and test mode are distinct from production renewal/cancellation evidence.

Reference: https://docs.stripe.com/changelog/basil/2025-03-31/deprecate-subscription-current-period-start-and-end
