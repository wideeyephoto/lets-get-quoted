# Office-seat activation boundary

This foundation is intentionally dark. The current application has only two
workspace membership roles: `owner` and `crew`. An `owner` row is the only
office-capable identity and receives full owner-dashboard authority. Therefore:

- every `memberships.role = 'owner'` row counts as one office user, including
  the workspace founder;
- membership-row presence is the complete active lifecycle because there is no
  disabled, revoked, invited, or pending state;
- self-signup still creates a new workspace and its founding owner through the
  existing service-role bootstrap path;
- no application route or action currently calls the office-seat RPC.

Do not enable `LGQ_OFFICE_SEAT_ENTITLEMENT_GATE_ENABLED` or expose office-user
management until all of these product decisions and mechanics exist:

1. invitation creation, expiry, acceptance, resend, and cancellation;
2. whether added office users should have full owner authority or narrower
   roles, plus server-side authorization for those roles;
3. removal, suspension, and any reactivation lifecycle;
4. rules for promoting an existing crew membership to office access;
5. handling the existing one-owner-workspace-per-user database constraint when
   an invited person already owns another workspace;
6. an owner-facing team screen with actionable seat-limit errors and a safe
   last-owner rule.

Before activation, restore and verify the historical
`memberships_one_owner_per_user_idx` constraint in every environment. Production
currently has it, while staging does not; the dark gate itself is safe without
that index, but invitation behavior must not differ by environment.

The database migration only installs the concurrency-safe counted-entry RPC and
blocks direct browser entry into the counted owner set. The SECURITY DEFINER RPC
is revoked from `public`, `anon`, `authenticated`, and `service_role`; it cannot
be called through the API until a separate activation migration both adds the
approved invitation/acceptance authorization and grants the narrow execution
privilege. This foundation does not backfill, remove, disable, or otherwise
rewrite existing memberships.
