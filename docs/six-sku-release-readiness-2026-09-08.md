# Six withheld SKUs: release readiness, September 8, 2026

All six SKUs remain withheld from checkout and fulfillment. This change prepares
release prerequisites; it does not certify all six for sale.

## Verified production facts

- Supabase production project: `mfuvvtrkipkigwqqtcal`.
- Since meter activation on September 6 at 01:03:04 UTC, the database has one
  settled call: 62 AI seconds, two billed minutes, allowance settlement, not
  provisional. The voice ledger has one committed reservation for two minutes
  and no open reservations.
- Individually retrieved Vercel production settings confirm
  `LGQ_VOICE_MINUTE_METER_ENABLED=1`, `LGQ_VOICE_ALLOWANCE_WORKER_ENABLED=1`, and
  `LGQ_VOICE_MINUTE_GATE_ENABLED=0`.
- `LGQ_STORAGE_CAP_ENFORCED` is absent from production settings. Storage usage
  exists for 11 workspaces, measured at September 8, 12:17:19 UTC; the largest
  measured usage is 27,915,610 bytes. This aggregate does not prove that every
  eligible workspace or upload route is covered.
- The available local Stripe key is test mode. The production key is a sensitive
  Vercel setting whose individual read response contains no value. After the user
  signed in, the Stripe live dashboard confirmed four voice Prices created on
  September 7. All match USD amount, cadence, exclusive tax, catalog version
  `2026-08-18-preview`, purpose `top_up`, resource `voice_minutes`, SKU and units:

| SKU | Live Price | Amount / units |
| --- | --- | --- |
| `ai_voice_flex` | `price_1UD5wFGqh5LFKuTCpdHyuxpX` | $69 monthly / 100 |
| `ai_voice_solo` | `price_1UD5wGGqh5LFKuTCP3YKDWJd` | $59 monthly / 100 |
| `ai_voice_growth` | `price_1UD5wHGqh5LFKuTCj9I3BNiH` | $55 monthly / 200 |
| `voice_minutes_100` | `price_1UD5wHGqh5LFKuTCEWTHVNkn` | $35 one-time / 100 |
| `storage_100gb` | `price_1UDOU1Gqh5LFKuTCpGg3HFpF` | $15 monthly / 100 GB |
| `office_user` | `price_1UDOW4Gqh5LFKuTCcVqU7KtL` | $15 monthly / 1 seat |

Storage and office products were absent from the complete 13-product live
catalog. After explicit approval of the two-step setup, both were created and
their five metadata fields were saved and verified in the live dashboard.
Storage uses resource `storage_gb`, SKU `storage_100gb`, units `100`; office uses
resource `office_users`, SKU `office_user`, units `1`. Both use purpose `top_up`
and catalog `2026-08-18-preview`, USD monthly flat pricing and exclusive tax.
Products are `prod_VDqAxCH8pwfwrX` and `prod_VDqCkCcQEQT8yz` respectively.
The live catalog now has 15 active products. No subscriptions or charges were
created. No deployment flags, capacity balances, or purchase gates were changed.

## Code corrections

The seeder previously skipped withheld SKUs, making it impossible to prepare
their Prices while preserving the purchase block. It now supports explicit
selection of withheld SKUs:

```sh
node scripts/seed-stripe-top-up-prices.mjs --prepare-withheld=storage_100gb,office_user,ai_voice_flex,ai_voice_solo,ai_voice_growth,voice_minutes_100 --dry-run
```

The dry run is offline and reads no credentials. It is a plan, not verification
that Stripe already has the Prices. With an approved live Stripe key injected
into the process, replace `--dry-run` with `--live` to prepare only those Prices.
Never put credentials in source, command-line arguments, or this document.

The write path reuses existing Prices, refuses ambiguity, reports mismatched
contracts instead of creating duplicate active Prices, and uses idempotency keys
for Product and Price creation. It leaves catalog withholding in place.

Office clients and jobs already had capability guards, so the catalog's claim
that only leads were reachable was stale. The job detail still proceeded into
owner-only loaders, including admin-client reads. It now returns a separate
office view immediately after the scoped job read, showing contact, address,
schedule and scope without financial totals, private quote items or owner-only
loaders. Schedule navigation requires `schedule.write`.

The voice reasons now acknowledge demonstrated live deduction and identify the
remaining release conditions instead of describing the meter as dark.

## Remaining release work

Follow-up verification on September 8 confirmed all 11 production accounts have
storage measurements, with zero entitled accounts unmeasured and zero entitlement
rows missing the storage limit. The oldest measurement was 12:17:19 UTC.
The disposable PostgreSQL storage harness passed 22 checks, including a purchased
100 GB increasing the plan limit from 5 GB to 105 GB and cancellation restoring
5 GB. The office RLS harness passed 30 checks for client/job/lead reads, capability
revocation and cross-account isolation. The voice allowance harness passed 34
checks for granting, renewal, cancellation, duplicate suppression and spending
near period end. These local database fixtures do not replace hosted acceptance.

The upload inventory found two missing guards: client follow-up attachments and
warranty photos. Both now check the accepted batch's combined size before the
first upload, and return a client-appropriate retry message on refusal. Requests
without attachments remain available at the cap. Eight regression tests exercise
both public entry points, including invalid tokens and refusal before writes.
Staff account attachments retain their documented support exception. Signed
website videos retain the documented client-reported size limitation, and the
periodic sweep is not an atomic reservation against concurrent uploads.

| SKUs | Required before removing withholding |
| --- | --- |
| `storage_100gb` | Validate storage measurement and upload coverage, enable the cap in the intended deployment, prove a purchased 100 GB increases usable headroom and cancellation removes it correctly. Live Price is verified. |
| `office_user` | Deploy the office job boundary, exercise invitation, seat limits, role-specific client/job workflows and cancellation with real authenticated test identities. Live Price is verified. |
| `ai_voice_flex`, `ai_voice_solo`, `ai_voice_growth` | Verify 100/100/200-minute renewal allowances, complete provider recovery/retry and cutoff checks, reconcile a full billing period, and validate enforced exhaustion. Live Prices are verified. |
| `voice_minutes_100` | Verify the purchase/consume/refund lifecycle, plus the voice recovery, reconciliation and exhaustion checks above. The live Price is verified. |

Preparing a Price does not authorize a test charge to a real customer. Use test
mode for transaction fixtures and a specifically designated live canary for any
real-charge acceptance test. Do not retroactively settle unmetered calls.

The existing voice rollout evidence and remaining provider acceptance checks
are recorded in `C:/dev/voice-meter-rollout-20260906.md`.

## Validation

150 focused tests passed across nine suites, including subprocess tests of
offline planning and the real seeder with Stripe mocked at the module boundary.
App and test typechecking passed. The production build passed using dummy
service configuration; existing unrelated lint warnings remain. Changed app
files passed scoped lint without warnings. One existing operator test fixture
was corrected from the obsolete `billing_revenue` category to `billing_revops`
to restore the repository's typecheck.
