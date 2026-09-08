# Six-SKU release

Release scope: `storage_100gb` ($15/month, 100 GB) and `office_user`
($15/month, one additional counted office seat), the three AI Voice subscriptions,
and the 100-minute voice pack.

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

## Voice launch decision

The owner explicitly selected: launch with metering and absorb unmetered usage.
`LGQ_VOICE_MINUTE_METER_ENABLED=1` and the allowance worker remain enabled;
`LGQ_VOICE_MINUTE_GATE_ENABLED=0` remains off. Full-period reconciliation is a
post-launch requirement before strict exhaustion enforcement, not a checkout
block under this decision. No new overage enforcement or charges are enabled.

The September 8 regression run passed 218 voice tests and all 34 disposable
PostgreSQL allowance checks. A live test exposed Vercel SSO protection on the app
alias: SignalWire received 401 before the webhook. Registering the existing
app.letsgetquoted.com hostname as a production project domain restored public
routing while retaining application webhook signature checks. Anonymous health
returns 200 and unsigned voice requests correctly return application 403.

The subsequent live call reserved ten minutes, but a provider retry counted its
own admission against the concurrency limit and returned forwarding instead of
AI. Because the forwarding target was the staff caller, this rang the caller
back. Provider events confirmed fallback-only delivery and termination. The
stale admission was closed through the provider-status RPC and the unused
reservation released through the normal release RPC. This is not evidence of a
successful AI conversation.

PR #29 excludes the current provider call from the preflight count while keeping
atomic admission checks, and sends same-caller fallback to voicemail. Its build,
test TypeScript check, scoped lint, 102 voice regression tests, and 12 recording
tests passed. Callback phone query values use digits and normalize after signed
verification; live callback delivery still needs checking. Final AI answer,
cutoff, and recovery observations remain pending before the voice SKU release.


## Production release progress

PR #28 merged as 66b146d07990e04c0b1cd66a13abf88572994438. Its production
build was assigned to app.letsgetquoted.com. Anonymous health returned 200 and
unsigned voice requests returned 403. Authenticated storage purchase reached
live Stripe checkout for 100 GB at $15/month; checkout was exited without
payment. PR #29 merged as 378b32a7deadf6c964257dc21652881ef01e3095 after all
hosted checks passed; production deployment and the controlled call are pending.
The voice catalog changes in this branch remain a draft until those checks pass.
