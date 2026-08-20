-- Refuse to invite a crew member to the office, at the moment of inviting.
--
-- THE BUG. `create_office_invitation` (20260819210000) refused somebody who was
-- already an `owner` or `office` member and said nothing about `crew`. So an
-- owner inviting a crew member got a link, sent it, and the person clicking it
-- hit `office_membership_role_conflict` — because `memberships` is unique on
-- (account_id, user_id) and the insert could never succeed. The invitation was
-- always going to fail, and the only person who found out was the invitee.
--
-- Proven by scripts/verify-office-seat-collision.mjs before this was written:
-- the invite returned no error at all.
--
-- WHY NOT PROMOTION, which is what blocker 4 in docs/office-seat-activation.md
-- actually asks for. `memberships` holds one row per person per workspace, so
-- "crew AND office" is not expressible — promotion would mean rewriting the row
-- to `office`, which SILENTLY REVOKES THE FIELD APP. `is_crew()` is role =
-- 'crew' exactly, so the moment the role changes they stop being able to open a
-- job, clock in, or see their assignments, while their crew roster row and their
-- assignments stay exactly where they were. An installer who also does the
-- invoicing would be promoted into being unable to work.
--
-- That is a data-model question — whether one person may hold two roles in one
-- workspace — and inventing an answer inside an invitation function is the wrong
-- place to decide it. So this refuses clearly and says why, and the decision
-- stays open and named rather than being made by a silent side effect.

begin;

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

  -- ANY existing membership, not just owner and office. This is the fix: the
  -- unique constraint on (account_id, user_id) means an invitation to somebody
  -- who is already here can never be accepted, whatever role they hold, so the
  -- refusal belongs at the moment of inviting rather than at the moment of
  -- clicking.
  select m.role::text into v_existing_role
  from public.memberships m
  join auth.users u on u.id = m.user_id
  where m.account_id = p_account_id
    and pg_catalog.lower(u.email) = v_email;

  if found then
    if v_existing_role = 'crew' then
      -- Its own code, because the answer an owner needs is different: this
      -- person is not on the team already, they are on the CREW, and moving
      -- them would take the field app away. See the header.
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

revoke all on function public.create_office_invitation(uuid, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.create_office_invitation(uuid, text, text, timestamptz)
  to authenticated;

do $post$
declare
  v_source text;
begin
  select p.prosrc into v_source
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'create_office_invitation';

  if v_source is null then
    raise exception 'create_office_invitation is missing';
  end if;

  -- The check must not have been narrowed back to two roles. Naming the code
  -- rather than counting: a rewrite that dropped the crew branch would still
  -- contain the words "owner" and "office".
  if pg_catalog.strpos(v_source, 'office_invitation_is_crew') = 0 then
    raise exception 'create_office_invitation no longer refuses a crew member up front';
  end if;

  -- And nothing here may have invented promotion. A function that rewrote a
  -- membership role would take the field app away from somebody silently.
  if pg_catalog.strpos(v_source, 'update public.memberships') > 0 then
    raise exception 'create_office_invitation now rewrites memberships; promotion is not decided';
  end if;
end $post$;

commit;
