-- Enable team.manage and settings.write capabilities in public.office_capabilities
-- and update office invitation / removal RPCs and office_invitations RLS policies.

begin;

update public.office_capabilities
   set enabled = true,
       updated_at = pg_catalog.now()
 where capability in ('team.manage', 'settings.write');

-- 1. create_office_invitation
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
  v_existing_role text;
  v_existing public.office_invitations%rowtype;
  v_row public.office_invitations%rowtype;
begin
  if v_actor is null or not (
    public.is_owner(p_account_id)
    or (
      public.is_office(p_account_id)
      and exists (
        select 1 from public.office_capabilities c
        where c.capability = 'team.manage' and c.enabled
      )
    )
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

  select m.role::text into v_existing_role
  from public.memberships m
  join auth.users u on u.id = m.user_id
  where m.account_id = p_account_id
    and pg_catalog.lower(u.email) = v_email;

  if found then
    if v_existing_role = 'crew' then
      raise exception 'office_invitation_is_crew'
        using errcode = 'P0001',
              detail = pg_catalog.jsonb_build_object('code', 'office_invitation_is_crew')::text;
    end if;
    raise exception 'office_invitation_already_a_member' using errcode = 'P0001';
  end if;

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

-- 2. revoke_office_invitation
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

  if v_actor is null or not (
    public.is_owner(v_invite.account_id)
    or (
      public.is_office(v_invite.account_id)
      and exists (
        select 1 from public.office_capabilities c
        where c.capability = 'team.manage' and c.enabled
      )
    )
  ) then
    raise exception 'office_seat_forbidden' using errcode = 'P0001';
  end if;

  if v_invite.accepted_at is not null or v_invite.revoked_at is not null then
    return false;
  end if;

  update public.office_invitations i
     set revoked_at = pg_catalog.now(), revoked_by = v_actor
   where i.id = v_invite.id;
  return true;
end;
$revoke$;

-- 3. remove_office_user
create or replace function public.remove_office_user(
  p_account_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $remove$
declare
  v_actor uuid := auth.uid();
  v_role text;
begin
  if v_actor is null or not (
    public.is_owner(p_account_id)
    or (
      public.is_office(p_account_id)
      and exists (
        select 1 from public.office_capabilities c
        where c.capability = 'team.manage' and c.enabled
      )
    )
  ) then
    raise exception 'office_seat_forbidden' using errcode = 'P0001';
  end if;

  select m.role::text into v_role
  from public.memberships m
  where m.account_id = p_account_id and m.user_id = p_user_id
  for update;

  if not found then
    return false;
  end if;

  if v_role <> 'office' then
    raise exception 'office_removal_wrong_role'
      using errcode = 'P0001',
            detail = pg_catalog.jsonb_build_object(
              'code', 'office_removal_wrong_role', 'role', v_role
            )::text;
  end if;

  delete from public.memberships m
  where m.account_id = p_account_id and m.user_id = p_user_id and m.role = 'office';

  return true;
end;
$remove$;

-- 4. office_invitations RLS
alter table if exists public.office_invitations enable row level security;
drop policy if exists office_invitations_owner_read on public.office_invitations;
drop policy if exists office_invitations_select on public.office_invitations;

create policy office_invitations_select
  on public.office_invitations
  for select using (
    public.office_can(account_id, 'team.manage')
  );

commit;
