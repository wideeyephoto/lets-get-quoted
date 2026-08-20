-- Invitations, which is what the office-seat foundation said had to exist.
--
-- 20260816053000 granted its seat RPC to no API role and said why: "a separate
-- activation migration must first add the approved invitation/acceptance
-- authorization". This is that migration. It does not grant that RPC either —
-- it adds a different one, because the person accepting an invitation is by
-- definition NOT yet a member, and that function authorizes on being an owner.
--
-- WHAT AUTHORIZES AN ACCEPTANCE. Possession of an unexpired, unused token, and
-- nothing else. The invitee has no membership, no relationship to the workspace,
-- and nothing else about them the database could check. So the token has to be
-- the whole credential, which is why it is stored only as a SHA-256 hash: a
-- readable invitations table would otherwise be a list of ways into other
-- people's workspaces.
--
-- THE SEAT IS CHECKED TWICE, and the second time is the one that matters.
-- Checking at invite time is a courtesy — it stops an owner sending an
-- invitation that can never be accepted. Checking again at acceptance is
-- correctness: seats can be filled by somebody else between the two, and the
-- entitlement row is locked FOR UPDATE at acceptance exactly as the original
-- seat RPC locks it, so two people accepting the last seat cannot both succeed.
--
-- STILL NOT ENOUGH TO ACTIVATE. docs/office-seat-activation.md lists six
-- blockers; this closes one and a half of them. What remains, unchanged: an
-- office user still gets no permissions at all (`is_owner` deliberately still
-- means owner), and an office user signing in still has no way to REACH the
-- workspace they joined, because `ensureAccountMembership` provisions them an
-- empty one of their own. Neither is fixed here.

begin;

create table if not exists public.office_invitations (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,

  -- Stored lowercased so 'Sam@X.com' and 'sam@x.com' cannot both be pending.
  email text not null check (
    email = pg_catalog.lower(pg_catalog.btrim(email))
    and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    and pg_catalog.length(email) <= 320
  ),

  -- SHA-256 of the token, hex. The token itself is shown to the sender once and
  -- never stored: this table is readable by a workspace owner, and a readable
  -- plaintext token is a readable way into a workspace.
  token_sha256 text not null unique check (token_sha256 ~ '^[0-9a-f]{64}$'),

  invited_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null,

  accepted_at timestamptz,
  accepted_user_id uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,

  -- How many times the invitation was sent. A resend reuses the row and mints a
  -- new token, so an old link stops working the moment a new one is issued.
  send_count integer not null default 1 check (send_count between 1 and 10),
  last_sent_at timestamptz not null default pg_catalog.now(),
  created_at timestamptz not null default pg_catalog.now(),

  -- Accepted and revoked are mutually exclusive terminal states. Without this,
  -- a race between an acceptance and a revocation could record both, and no
  -- reader could say which actually happened.
  constraint office_invitations_terminal_state_check check (
    accepted_at is null or revoked_at is null
  ),
  constraint office_invitations_accepted_user_check check (
    (accepted_at is null and accepted_user_id is null)
    or (accepted_at is not null and accepted_user_id is not null)
  )
);

-- One live invitation per person per workspace. Partial, so a revoked or
-- accepted one does not block inviting the same person again later -- somebody
-- leaves and is re-hired, and the table should not be the reason that is hard.
create unique index if not exists office_invitations_one_pending_idx
  on public.office_invitations (account_id, email)
  where accepted_at is null and revoked_at is null;

create index if not exists office_invitations_account_idx
  on public.office_invitations (account_id, created_at desc);

alter table public.office_invitations enable row level security;

-- An owner may READ their workspace's invitations, and write nothing. Every
-- write goes through the RPCs below, which is what keeps the seat check and the
-- token handling in one place instead of in whichever caller comes next.
drop policy if exists office_invitations_owner_read on public.office_invitations;
create policy office_invitations_owner_read
  on public.office_invitations
  for select
  to authenticated
  using ((select public.is_owner(account_id)));

revoke all on table public.office_invitations from public, anon, authenticated;
grant select on table public.office_invitations to authenticated;

-- ---------------------------------------------------------------------------
-- Seat availability, in one place
-- ---------------------------------------------------------------------------
-- Shared by the invite and the acceptance so the two cannot disagree about what
-- "full" means. Returns the limit and the count; the caller decides.
create or replace function public.office_seat_usage(p_account_id uuid)
returns table (office_limit bigint, active_count bigint)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $seats$
declare
  v_limits jsonb;
  v_state text;
  v_limit_json jsonb;
  v_numeric numeric;
begin
  select e.feature_limits, e.entitlement_state
    into v_limits, v_state
  from public.workspace_entitlements e
  where e.account_id = p_account_id
  for update;

  if not found or v_state = 'archived' then
    raise exception 'office_seat_entitlement_unavailable' using errcode = 'P0001';
  end if;

  v_limit_json := v_limits -> 'office_users';
  if pg_catalog.jsonb_typeof(v_limit_json) <> 'number' then
    raise exception 'office_seat_entitlement_unavailable' using errcode = 'P0001';
  end if;

  v_numeric := (v_limit_json #>> '{}')::numeric;
  if v_numeric < 0 or pg_catalog.trunc(v_numeric) <> v_numeric then
    raise exception 'office_seat_entitlement_unavailable' using errcode = 'P0001';
  end if;

  return query
  select v_numeric::bigint,
         (select pg_catalog.count(*)
            from public.memberships m
           where m.account_id = p_account_id
             and m.role in ('owner', 'office'))::bigint;
end;
$seats$;

-- ---------------------------------------------------------------------------
-- Create or resend
-- ---------------------------------------------------------------------------
create or replace function public.create_office_invitation(
  p_account_id uuid,
  p_email text,
  p_token_sha256 text,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $invite$
declare
  v_actor uuid := auth.uid();
  v_email text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_email, '')));
  v_seats record;
  v_existing public.office_invitations%rowtype;
  v_row public.office_invitations%rowtype;
begin
  if v_actor is null or not exists (
    select 1 from public.memberships m
    where m.account_id = p_account_id and m.user_id = v_actor and m.role = 'owner'
  ) then
    raise exception 'office_seat_forbidden' using errcode = 'P0001';
  end if;

  if p_token_sha256 is null or p_token_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'office_invitation_token_invalid' using errcode = '22023';
  end if;
  if p_expires_at is null or p_expires_at <= pg_catalog.now()
     or p_expires_at > pg_catalog.now() + interval '30 days' then
    raise exception 'office_invitation_expiry_invalid' using errcode = '22023';
  end if;

  -- Somebody already in the workspace does not need an invitation, and sending
  -- one would imply they are not there.
  if exists (
    select 1 from public.memberships m
    join auth.users u on u.id = m.user_id
    where m.account_id = p_account_id
      and pg_catalog.lower(u.email) = v_email
      and m.role in ('owner', 'office')
  ) then
    raise exception 'office_invitation_already_a_member' using errcode = 'P0001';
  end if;

  -- Courtesy check. The one that decides is in accept_office_invitation.
  select * into v_seats from public.office_seat_usage(p_account_id);
  if v_seats.active_count >= v_seats.office_limit then
    raise exception 'office_seat_limit_reached'
      using errcode = 'P0001',
            detail = pg_catalog.jsonb_build_object(
              'code', 'office_seat_limit_reached',
              'active_count', v_seats.active_count,
              'office_limit', v_seats.office_limit
            )::text;
  end if;

  select * into v_existing
  from public.office_invitations i
  where i.account_id = p_account_id and i.email = v_email
    and i.accepted_at is null and i.revoked_at is null
  for update;

  if found then
    -- A RESEND. The row is reused and the token replaced, so the previous link
    -- stops working immediately -- which is the point: two live links to one
    -- seat is one more than anybody intended to send.
    if v_existing.send_count >= 10 then
      raise exception 'office_invitation_resend_limit' using errcode = 'P0001';
    end if;
    update public.office_invitations i
       set token_sha256 = p_token_sha256,
           expires_at = p_expires_at,
           send_count = i.send_count + 1,
           last_sent_at = pg_catalog.now(),
           invited_by = v_actor
     where i.id = v_existing.id
    returning * into v_row;
    return pg_catalog.to_jsonb(v_row) || pg_catalog.jsonb_build_object('resent', true);
  end if;

  insert into public.office_invitations
    (account_id, email, token_sha256, invited_by, expires_at)
  values (p_account_id, v_email, p_token_sha256, v_actor, p_expires_at)
  returning * into v_row;

  return pg_catalog.to_jsonb(v_row) || pg_catalog.jsonb_build_object('resent', false);
end;
$invite$;

-- ---------------------------------------------------------------------------
-- Accept
-- ---------------------------------------------------------------------------
-- Authorized by the token, because the accepter is not yet anybody here.
create or replace function public.accept_office_invitation(
  p_token_sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $accept$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_invite public.office_invitations%rowtype;
  v_seats record;
  v_membership jsonb;
begin
  if v_user is null then
    raise exception 'office_invitation_requires_sign_in' using errcode = 'P0001';
  end if;
  if p_token_sha256 is null or p_token_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'office_invitation_not_found' using errcode = 'P0001';
  end if;

  select * into v_invite
  from public.office_invitations i
  where i.token_sha256 = p_token_sha256
  for update;

  -- One message for missing, revoked, accepted and expired. Distinguishing them
  -- would let anybody holding a random hash learn which workspaces have live
  -- invitations out.
  if not found
     or v_invite.accepted_at is not null
     or v_invite.revoked_at is not null
     or v_invite.expires_at <= pg_catalog.now() then
    raise exception 'office_invitation_not_found' using errcode = 'P0001';
  end if;

  select pg_catalog.lower(u.email) into v_email from auth.users u where u.id = v_user;
  if v_email is null or v_email <> v_invite.email then
    -- The invitation was addressed to somebody. A forwarded link must not admit
    -- whoever opened it.
    raise exception 'office_invitation_wrong_recipient' using errcode = 'P0001';
  end if;

  -- THE CHECK THAT DECIDES. The entitlement row is locked, so two people
  -- accepting the last seat at once cannot both pass it.
  select * into v_seats from public.office_seat_usage(v_invite.account_id);
  if v_seats.active_count >= v_seats.office_limit then
    raise exception 'office_seat_limit_reached'
      using errcode = 'P0001',
            detail = pg_catalog.jsonb_build_object(
              'code', 'office_seat_limit_reached',
              'active_count', v_seats.active_count,
              'office_limit', v_seats.office_limit
            )::text;
  end if;

  begin
    insert into public.memberships as m (account_id, user_id, role)
    values (v_invite.account_id, v_user, 'office')
    returning pg_catalog.to_jsonb(m) into v_membership;
  exception when unique_violation then
    -- Already a member of this workspace in some role. Not an error worth
    -- inventing a promotion for; promotion is still an open decision.
    raise exception 'office_membership_role_conflict' using errcode = 'P0001';
  end;

  update public.office_invitations i
     set accepted_at = pg_catalog.now(), accepted_user_id = v_user
   where i.id = v_invite.id;

  return v_membership;
end;
$accept$;

-- ---------------------------------------------------------------------------
-- Revoke
-- ---------------------------------------------------------------------------
create or replace function public.revoke_office_invitation(p_invitation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $revoke$
declare
  v_actor uuid := auth.uid();
  v_invite public.office_invitations%rowtype;
begin
  select * into v_invite from public.office_invitations i where i.id = p_invitation_id for update;
  if not found then return false; end if;

  if v_actor is null or not exists (
    select 1 from public.memberships m
    where m.account_id = v_invite.account_id and m.user_id = v_actor and m.role = 'owner'
  ) then
    raise exception 'office_seat_forbidden' using errcode = 'P0001';
  end if;

  -- Revoking an accepted invitation is a no-op, deliberately: the membership it
  -- created is a separate thing, and removing somebody is a different action
  -- from cancelling a link they already used.
  if v_invite.accepted_at is not null or v_invite.revoked_at is not null then
    return false;
  end if;

  update public.office_invitations i
     set revoked_at = pg_catalog.now(), revoked_by = v_actor
   where i.id = v_invite.id;
  return true;
end;
$revoke$;

revoke all on function public.office_seat_usage(uuid) from public, anon, authenticated;
revoke all on function public.create_office_invitation(uuid, text, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.accept_office_invitation(text) from public, anon, authenticated;
revoke all on function public.revoke_office_invitation(uuid) from public, anon, authenticated;

-- The invite and revoke are owner actions taken in the browser, and each
-- verifies ownership itself. Acceptance is taken by somebody who is not a member
-- yet, which is exactly why it exists as its own function.
grant execute on function public.create_office_invitation(uuid, text, text, timestamptz) to authenticated;
grant execute on function public.accept_office_invitation(text) to authenticated;
grant execute on function public.revoke_office_invitation(uuid) to authenticated;

do $post$
declare
  v_bad text;
begin
  if not exists (
    select 1 from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'office_invitations' and c.relrowsecurity
  ) then
    raise exception 'row level security is not enabled on office_invitations';
  end if;

  -- A browser role may read its own workspace's invitations and write none of
  -- them. TRUNCATE included: it is not covered by RLS, which is the gap
  -- 20260819170000 exists for.
  select pg_catalog.string_agg(distinct g.who || ':' || g.priv, ', ') into v_bad
  from (
    select pg_catalog.pg_get_userbyid(x.grantee) as who, x.privilege_type as priv
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    cross join lateral pg_catalog.aclexplode(coalesce(c.relacl, '{}'::aclitem[])) x
    where n.nspname = 'public' and c.relname = 'office_invitations'
  ) g
  where g.who in ('anon', 'authenticated', 'public')
    and g.priv <> 'SELECT';

  if v_bad is not null then
    raise exception 'office_invitations is writable by: %', v_bad;
  end if;

  -- The original seat RPC must STILL be reachable by nobody. This migration
  -- adds an acceptance path; it does not open the one 20260816053000 sealed.
  select pg_catalog.string_agg(distinct pg_catalog.pg_get_userbyid(x.grantee), ', ') into v_bad
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  cross join lateral pg_catalog.aclexplode(coalesce(p.proacl, '{}'::aclitem[])) x
  where n.nspname = 'public'
    and p.proname = 'create_office_user_membership_with_seat_entitlement'
    and x.privilege_type = 'EXECUTE'
    and x.grantee <> p.proowner;

  if v_bad is not null then
    raise exception 'the original seat RPC became reachable by: %', v_bad;
  end if;
end $post$;

commit;
