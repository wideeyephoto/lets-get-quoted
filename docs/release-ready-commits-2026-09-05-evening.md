# Production release: September 5, 2026 (evening)

Base: `782ca7603b5f449d3e16d61c37255c9d850d480a` (AI Voice without verification codes).

## Included work

| Original commit | Release commit | Change |
| --- | --- | --- |
| `92e3cd08e` | `e6f557cb7` | Reflect pending Wisetack partner approval accurately. |
| `57b254db6` | `e0ad82cd7` | Cache public contractor sites and prioritize hero images. |
| `0a6fb8c4d` | `a2af095bf` | Office permission presets and assignment, with the atomic owner-only correction in this release. |
| `3446f93ff` | `bd7129cdf` | Provision custom domains and require a valid TLS handshake before activation. |
| `a1c1f47f3` | `694f1dc75` | Require real room geometry and persist validated scan takeoffs. |

Selected property-sizing corrections from `af33a406b` are included without its dependencies on the held features. TLS/cache and LiDAR/property-sizing integrations retain both changes. The lightweight stylesheet is regenerated. The general feature test mocks domain-provider verification; dedicated domain tests cover provider outcomes.

## Held work — do not merge into production

The original commits remain on preserved local branches. This release starts from the production base and selects independent ready changes.

- `9ecdbf88f`: New business-card checkout trusts browser-supplied quote amounts; generated proof/quote IDs conflict with UUID columns; failed persistence can still report success; artwork fulfillment is incomplete.
- `5ab249e98`: Neighborhood Halo fabricates live campaign IDs and spend without provisioning ads. Wallet debit failure can be ignored and refunds are not tied to proven debits.
- `1ceb17190`: Meta campaign identifiers are omitted from the production atomic wallet RPC. Only the campaign is activated while its ad set and ad remain paused; lifecycle errors can be hidden. Requires a complete provider/persistence review before release.
- The card and Halo migrations are intentionally excluded.

## Required migrations

1. `20260905163943_room_spatial_scans.sql`: nullable JSONB columns on jobs and leads; object-only, maximum 1 MiB. Existing row ownership, retention and RLS apply. No existing values change.
2. `20260905192513_atomic_office_permission_assignment.sql`: transactional replacement of one office member's grants. Uses SECURITY INVOKER and an empty search path, checks the caller is an account owner, locks the target office membership, validates capability keys, and retains existing table RLS. PUBLIC and anon cannot execute. No existing grants change when the migration is installed.

The server action and UI restrict assignment to owners, matching the existing database policy. An insert failure rolls back removal of previous grants.

## Validation

- PostgreSQL-compatible PGlite execution: 19 checks passed, including valid replacement, deduplication, clearing grants, invalid targets/keys, cross-account and non-owner denial, anonymous execute denial, rollback after forced insert failure, and scan shape/size constraints.
- Test harness: `C:/dev/voice-no-codes-db-test/release-evening.mjs`; result: `C:/dev/release-evening-db-tests.log`.
- Typecheck passed. Lint passed with existing warnings.
- Full suite: 13,483 tests passed, zero failures.
- Production-build and deployment results are recorded in the external production validation record after completion.

No live ads, payments, calls, or customer updates are issued by this release validation. A new live call is still required to validate the already-deployed AI Voice conversation changes.
