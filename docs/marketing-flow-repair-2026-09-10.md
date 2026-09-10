# Business cards, Neighborhood Halo, and Meta Ads repairs

The held card ordering work is restored on top of current main. Halo and managed Meta Ads are repaired in the current implementation. All three flows now require durable records and confirmed provider responses before reporting success.

## Business cards

- Save the canonical approved design as immutable, private 300 DPI PNGs. Decode the QR from the actual back artwork, verify checksums again before fulfillment, and record the approving user.
- Use UUID quote/proof/order identifiers. Calculate prices and shipping on the server, reload the owned quote at checkout, and reject expired quotes, changed destinations, or a mismatched proof.
- Reserve one order with a database lease. Reuse the Stripe idempotency key and existing checkout URL on retry; the browser reuses the prepared proof and quote after an interrupted checkout.
- Use the confirmed shipping address for Stripe tax, show the final amount before payment, and use the quoted delivery service for fulfillment.
- Record verified payment and processing fees once. Confirm the Printful order, reconcile by external order number before retrying, and resolve real pack variant IDs from the live product catalog. Fulfillment retries use the same approved front and back images.
- Persist printer callbacks before acknowledging them. Delayed production updates cannot regress shipment status; a printer credit does not claim that the customer's Stripe payment was refunded.
- Remove invented website addresses and premature manufacturing/dispatch confirmations. Unsupported stationery finishes and unavailable providers fail without simulated production success.

## Neighborhood Halo

- Require a completed owned job, verified coordinates, configured Meta credentials, and actual available wallet funds.
- Reserve the campaign and debit the wallet in one transaction. Serialize monthly-cap and duplicate-area checks on the wallet row.
- Create paused Meta resources with a lifetime budget and provider end time. Save resource IDs before activation. Serialize pause/resume/stop operations with database leases.
- Poll provider lifetime metrics as cumulative snapshots. Never synthesize impressions, clicks, or spend, and never reduce a recorded cumulative total with an older response.
- Stop delivery before settlement. Keep funds reserved for 72 hours to accommodate delayed reporting, then retrieve provider spend and atomically refund the unused proven debit. Failed reads/writes remain recoverable; terminal replays do not credit the wallet twice.
- Show pending final-spend reconciliation in the dashboard and disable resume for a campaign being settled.

## Managed Meta Ads

- Persist Meta campaign, ad-set, creative and ad IDs, channel allocations, and Stripe references inside the atomic wallet-credit transaction. Missing RPCs or failed writes fail visibly.
- Create all resources paused, persist them, then activate the ad, ad set, and parent campaign in that order. Failed activation attempts pause the parent.
- Reject missing credentials/page IDs, fake campaign IDs, incomplete API responses, and invalid spend. Location resolution must identify a unique local area; it cannot silently broaden targeting nationwide.
- Persist lifecycle changes without overwriting concurrent wallet movements. Resume failures trigger provider pause recovery. A payment replay cannot resume a campaign that the contractor manually paused.
- An unfunded wallet starts at zero.

## Verification

Verified on September 10, 2026: **14,694 tests passed**, TypeScript passed, the production build passed, lint completed with warnings and no errors, and `npm audit --omit=dev` reported zero vulnerabilities. Browser checks found no errors or horizontal overflow at mobile width.

The regression suite includes real SQL execution in PGlite for the actual migration functions: owned checkout claims, duplicate delivery leases, wallet reservation and settlement, metadata persistence, payment-ledger idempotency, cumulative metrics, browser permissions, and out-of-order printer callbacks. Provider adapter tests intercept HTTP and cover confirmed order creation, external-ID reconciliation, partial Meta activation, and false-success responses.

The actual PNG output from all three card layouts is rasterized and optically decoded in tests. A local browser fixture renders the real card components at desktop and 390-pixel mobile widths. It exercises proof approval, delivery, a failed checkout, and retry: one proof, one quote, two checkout attempts. No live order, ad campaign, charge, email, or production database mutation is created by these checks.

## Release ordering

Apply `20260905170000_merchandise_card_operations.sql` and then `20260910104058_marketing_flow_repair.sql` before deploying this branch. The earlier migration adds the previously held card tables; the repair migration adds the private artwork bucket, trusted RPCs, restricted browser writes, and settlement/lease fields. Existing main migrations are prerequisites. Use the repository migration ledger workflow; these migrations have only been applied to the local test database during this repair.

Deployment still requires the configured Stripe, Printful, Meta and Supabase credentials, the existing Stripe/Printful webhook routes, and the Halo pacing cron. Provider integration checks here use intercepted responses; a controlled staging purchase and Meta test campaign remain release verification steps before enabling live customer use. Wholesale amounts in quotes are configured estimates; actual provider billing should be reconciled operationally.

Provider references: [Stripe Checkout sessions](https://docs.stripe.com/api/checkout/sessions/create), [Printful API](https://developers.printful.com/docs/), [Supabase database functions](https://supabase.com/docs/guides/database/functions).
