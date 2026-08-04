-- One auto-provisioned owner account per user.
--
-- ensureAccountMembership creates an account when a user has no owner
-- membership. A brand-new user's first page load fires several concurrent
-- requests (the document, its RSC payload, any prefetch); each reaches that
-- check, each sees no membership, and each creates an account.
--
-- Measured on a fresh signup while testing first run: TWO accounts six
-- milliseconds apart for one user. The app then papered over it —
-- getCurrentMembership takes the OLDEST owner membership, so the contractor
-- lands somewhere consistent — but they owned a junk account they could never
-- reach, and any lookup using .maybeSingle() on memberships broke outright,
-- because two rows is neither one nor none.
--
-- This index makes the second insert fail instead of succeeding quietly; the
-- loser deletes its own orphan and adopts the winner's account (see auth.ts).
--
-- Partial, on role='owner' only: being on someone else's crew must not stop you
-- owning your own account, which is the exact case the surrounding code goes out
-- of its way to preserve.

-- Safety: refuse to create the index while duplicates exist, rather than failing
-- with a bare "could not create unique index" that says nothing about which
-- users are affected.
do $$
declare
  dupes int;
begin
  select count(*) into dupes from (
    select user_id from memberships where role = 'owner' group by user_id having count(*) > 1
  ) d;
  if dupes > 0 then
    raise exception 'Cannot add the one-owner-account index: % user(s) already own more than one account. Resolve those first.', dupes;
  end if;
end $$;

create unique index if not exists memberships_one_owner_per_user_idx
  on memberships (user_id) where role = 'owner';
