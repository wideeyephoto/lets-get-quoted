# Business cards, Neighborhood Halo, and Meta Ads repairs

The held card ordering work is restored on top of current main. Halo and managed Meta Ads are repaired in the current implementation. All three flows now require durable records and confirmed provider responses before reporting success.

## Business cards

- Save the canonical approved design as immutable, private 300 DPI PNGs. Decode the QR from the actual back artwork, verify checksums again before fulfillment, and record the approving user.
- Use UUID quote/proof/order identifiers. Calculate prices and shipping on the server, reload the owned quote at checkout, and reject expired quotes, changed destinations, or a mismatched proof.
- Reserve one order with a database lease. Reuse the Stripe idempotency key and existing checkout URL on retry; the browser reuses the prepared proof and quote after an interrupted checkout.
- Use the confirmed shipping address for Stripe tax, show the final amount before payment, and use the quoted delivery service for fulfillment.
- Explicitly classify business cards as tangible goods for Stripe Tax instead of inheriting the platform's digital-service default.
- Record verified payment and processing fees once. Confirm the Printful order, reconcile by external order number before retrying, and resolve real pack variant IDs from the live product catalog. Fulfillment retries use the same approved front and back images.
- Send the front artwork using the Orders v1 catalog file ID `default`; `front` is the catalog's display type, not its file ID.
- Persist printer callbacks before acknowledging them. Delayed production updates cannot regress shipment status; a printer credit does not claim that the customer's Stripe payment was refunded.
- Accept signed Printful v2 shipment events, decode the provider's hex signing key regardless of byte length, verify the configured store, and distinguish separate shipments when deduplicating retries.
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

Verified on September 10, 2026 at the initial repair commit: **14,694 tests passed**, TypeScript passed, the production build passed, lint completed with warnings and no errors, and `npm audit --omit=dev` reported zero vulnerabilities. Browser checks found no errors or horizontal overflow at mobile width. The follow-up schema, physical-goods tax, provider file types, and signed v2 callback regressions pass 111 affected tests, including callback tampering, wrong-store rejection, and multiple shipments with retries.

The regression suite includes real SQL execution in PGlite for the actual migration functions: owned checkout claims, duplicate delivery leases, wallet reservation and settlement, metadata persistence, payment-ledger idempotency, cumulative metrics, browser permissions, and out-of-order printer callbacks. Provider adapter tests intercept HTTP and cover confirmed order creation, external-ID reconciliation, partial Meta activation, and false-success responses.

The actual PNG output from all three card layouts is rasterized and optically decoded in tests. A local browser fixture renders the real card components at desktop and 390-pixel mobile widths. It exercises proof approval, delivery, a failed checkout, and retry: one proof, one quote, two checkout attempts. No live order, ad campaign, charge, email, or production database mutation is created by these checks.

## Release ordering

Apply `20260905170000_merchandise_card_operations.sql`, `20260910104058_marketing_flow_repair.sql`, and `20260910112758_halo_wallet_debit_column.sql` in order before deploying this branch. The earlier migration adds the previously held card tables; the repair migration adds the private artwork bucket, trusted RPCs, restricted browser writes, and settlement/lease fields. The final migration adds the wallet-debit column missing from the deployed Halo baseline; old rows default to zero because an unproven debit cannot earn a refund. Existing main migrations are prerequisites.

All three migrations were applied to staging and production on September 10, 2026, with each environment's migration ledger updated in the same transaction. The real staging PostgreSQL checks in `test-staging/marketing-flow-transactions.test.ts` pass all eight transaction, idempotency, lifecycle, and privilege cases. This verification caught the missing Halo column that a fresh database did not reveal. The unit database harness now also tests that older schema shape. Security advisor findings for the changed tables were informational notices about intentionally server-only tables without browser policies.

Real staging Storage checks uploaded the generated PNGs, downloaded and matched their hashes, verified anonymous public access was denied, and removed the test files. The application loaded in an isolated staging browser session, but authenticated card UI verification stopped at the test account's onboarding consent screen; that consent was left unchanged.

With the user's approval, created and connected Printful store `18734603` (Let's Get Quoted), configured its signed v2 callbacks at `https://app.letsgetquoted.com/api/webhooks/printful`, and saved the store ID and webhook secret in Vercel production settings. Enabled events: `shipment_sent`, `order_updated`, `order_failed`, `order_canceled`, `order_put_hold`, and `order_refunded`. These settings require a new deployment to reach running instances; the new callback handler must ship with them.

Activated Stripe Tax in the configured test sandbox using that same account's existing business support address. A real isolated staging service check then verified private artwork and hashes, a live Printful STANDARD shipping quote of $6.59 for 100 cards, automatic-tax Stripe checkout creation, and retry reuse of one persisted order and one test session. The unpaid session was expired and the test customer, order records, and artwork were removed. This did not modify live Stripe Tax settings.

Printful's estimate-only endpoint also returned a real $27.35 cost ($18.68 product, $6.59 shipping, $2.08 tax) for 100 cards using the generated front and back artwork. This verifies cost estimation, not artwork production approval or a confirmed order.

Meta still returns `API access blocked`. After approval, its developer account-confirmation flow was attempted twice; Facebook returned "Sorry, something went wrong" and could not complete confirmation. No paid checkout, confirmed print order, or ad campaign was created. Do not treat successful checkout-session creation, the local browser fixture, or SQL checks as completed payment-to-fulfillment or Meta end-to-end verification.

The application branch has not been released to production. Deployment still requires the configured Stripe, Printful, Meta and Supabase credentials, the existing Stripe/Printful webhook routes, and the Halo pacing cron. Restore Meta API access and complete a controlled staging payment-to-fulfillment check and Meta test campaign before enabling live customer use. Wholesale amounts in quotes are configured estimates; actual provider billing should be reconciled operationally.

Provider references: [Stripe Checkout sessions](https://docs.stripe.com/api/checkout/sessions/create), [Stripe tangible-goods tax codes](https://docs.stripe.com/tax/tax-codes?type=physical), [Printful API](https://developers.printful.com/docs/), [Printful signed v2 callbacks](https://developers.printful.com/docs/v2-beta/), [Supabase database functions](https://supabase.com/docs/guides/database/functions).
