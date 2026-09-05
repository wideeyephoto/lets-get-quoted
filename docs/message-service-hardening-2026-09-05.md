# Message service hardening

The MMS proxy validates every redirect, limits the chain to three redirects,
and sends provider credentials only on the initial provider request. HTTPS
socket lookup rejects internal DNS answers and uses those checked addresses
for the connection, avoiding a second DNS lookup. Downloads share a ten-second
deadline and are limited to 35 MiB.

Delivery callbacks use `record_sms_lead_delivery_history(uuid)` to append the
canonical terminal outcome to the latest lead triage. The append and event
marker commit in one transaction. Duplicate callbacks cannot append again;
an interrupted history update returns HTTP 503 and can recover on a provider
retry even after webhook ingestion committed. The RPC is restricted to the
service role. Existing historical duplicate entries are not deleted.

Open conversations paginate both transcripts and durable send events with
stable timestamp/id ordering. Exact counts handle API caps smaller than the
requested page size. A failed page returns an unavailable conversation rather
than a misleading partial history.

## Release order

1. Apply `migrations/20260905153351_sms_lead_delivery_history.sql` to the target database.
2. Deploy the application changes.
3. Verify a signed delivery callback and its lead history entry in the target environment.

The migration is additive and safe to apply before the application deploy.
Deploying the handler first causes linked status callbacks to return HTTP 503
until the new RPC exists. `schema.sql` includes the migration for fresh databases.

## Verification

- `npm run typecheck`
- `npm exec -- vitest run test/messages-media-redirects.test.ts test/sms-media-fetch.test.ts test/sms-status-lead-history.test.ts test/messages-pagination.test.ts`
- `node scripts/verify-sms-lead-delivery-history.mjs` runs migration replay, duplicate and concurrent callbacks, concurrent notes, rollback/retry, account boundaries, and RPC privileges on disposable PostgreSQL 17.
- `node scripts/sync-messaging-schema.mjs --check`

The PostgreSQL harness uses the same optional embedded-postgres installation as
the other `verify-sms-*.mjs` scripts. `LGQ_PG_TEST_TOOLS_ROOT` can point to a
workspace containing that installation; no hosted database credentials are read.
