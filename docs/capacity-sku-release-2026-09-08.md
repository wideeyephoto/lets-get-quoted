# Storage and office seat release

Release scope: `storage_100gb` ($15/month, 100 GB) and `office_user`
($15/month, one additional counted office seat). Voice SKUs remain withheld.

## Hosted evidence

- Live Stripe Prices and their five catalog metadata fields were verified in
  `six-sku-release-readiness-2026-09-08.md`.
- Production storage sweep on September 8 measured all 11 accounts. All have
  storage entitlements; none is currently above its cap.
- `LGQ_STORAGE_CAP_ENFORCED=1` was saved to the production Vercel project for
  the next deployment. Existing batch upload guards were deployed with PR #27.
- A rollback-only transaction on production's actual capacity functions verified
  that 100 GB increases the storage limit by 107374182400 bytes and one office
  seat raises the seat limit by one. Provider cancellation restored both limits;
  repeated cancellation returned `already_canceled`. No test ledger rows remain.
- Midwest Glass Company has two included Flex seats, with its owner and Brett's
  office membership consuming both. Its invitation RPC rejected a third invite
  with `office_seat_limit_reached` in a rollback-only check; no email was sent.
- Brett accepted the Midwest invitation. In his authenticated browser, workspace
  selection, leads, clients, jobs, and the isolated office job detail all loaded.
  His explicit grants are `leads.read`, `clients.read`, and `jobs.read`.
  Additional seats do not grant owner authority or automatically assign permissions.

## Lifecycle and verification

The existing paid-checkout projector grants recurring capacity only after paid
checkout and requires a valid subscription ID. The existing account settings
action schedules cancellation at period end; the provider lifecycle reconciler
removes capacity on terminal cancellation. Storage and office now exercise these
production code paths without mocking the catalog withholding list. Cancellation
tests cover all three capacity products.

This evidence combines authenticated browser reads, hosted rollback-only database
checks, and hermetic Stripe-boundary tests. It is not a claim that a live customer
card was charged or refunded. No live test charge was made.

Storage retains the documented support-upload exception, client-reported video
size limitation, and periodic measurement rather than atomic upload reservations.
Cancellation reduces future available capacity; it does not delete stored files
or automatically remove existing members.

The four voice SKUs still require controlled provider recovery/cutoff evidence,
enforced exhaustion, and full-period provider reconciliation. Their withholding
is independent of this capacity release.
