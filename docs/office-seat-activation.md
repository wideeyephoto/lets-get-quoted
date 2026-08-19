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

## Correction, 2026-08-19: this foundation cannot function as built

Everything above describes the blocker as a missing permission model. That is
true but incomplete, and the incompleteness matters, because it reads as "add a
role and this works" when in fact the counted identity is itself wrong.

The RPC inserts `memberships.role = 'owner'`. Production also carries
`memberships_one_owner_per_user_idx`, a UNIQUE index on `(user_id)` where
`role = 'owner'`, added by `2026-08-03-one-owner-account.sql` to stop the
signup race that once created two accounts six milliseconds apart. Each is
correct alone. Together they leave an office invitation exactly two outcomes:

1. **The invitee already owns a workspace.** The insert trips the unique index.
   The RPC catches `unique_violation` and raises
   `office_user_target_unavailable`, which names the person rather than the
   cause. This is not a gap to be gated later; it can never succeed.
2. **The invitee owns nothing.** It succeeds — and this is the worse outcome.
   They now hold the one owner row they are permitted, on their employer's
   workspace, indistinguishable in the schema from the founder.
   `ensureAccountMembership` looks for exactly that row to answer "does this
   user own a business", so the employer's workspace becomes their own, and
   they can never create theirs.

Item 5 above frames this as handling a constraint for people who already own
another workspace. It is not that narrow. It is every invitation, in one
direction or the other.

`scripts/verify-office-seat-collision.mjs` applies both migrations to a real
PostgreSQL 17 and demonstrates all of it (9/9). Run it before changing any of
this; it is faster to re-run than to re-reason about.

### What this changes about the plan

The seat accounting is sound. The verification also confirms outsiders are
refused, the founder is counted, re-invites are idempotent, and the limit is
enforced under a row lock taken before the count. So this is a role change, not
a rewrite.

An office user must be a third `memberships.role` — not `owner`. That one
change resolves three of the six blockers at once:

- the partial unique index is `where role = 'owner'`, so it stops applying;
- `ensureAccountMembership` no longer mistakes employment for ownership;
- a distinct role is the thing a narrower permission set attaches to.

It also surfaces a question the owner-role design hid: an office user with no
owner row of their own signs in and `ensureAccountMembership` provisions them
a fresh empty workspace. Reaching the employer's workspace then requires
choosing between workspaces, which the product has never needed before. That is
the real remaining scope of item 6, and it is larger than a team screen.
