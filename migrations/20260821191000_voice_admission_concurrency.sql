-- Make AI-voice concurrency an admission-time invariant rather than a read
-- followed by a later insert. Two webhook requests can otherwise both observe
-- one free seat and both answer, exceeding the plan limit.

begin;

alter table public.voice_call_admissions
  add column if not exists admission_state text not null default 'admitted';

alter table public.voice_call_admissions
  drop constraint if exists voice_call_admissions_state_check;
alter table public.voice_call_admissions
  add constraint voice_call_admissions_state_check
  check (admission_state in ('claimed', 'admitted'));

create or replace function public.claim_voice_call_admission(
  p_account_id uuid,
  p_provider_call_id text,
  p_concurrency_limit integer
)
returns table (
  claim_status text,
  admission_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $fn$
declare
  v_existing public.voice_call_admissions%rowtype;
  v_open bigint;
  v_id uuid;
begin
  if p_account_id is null
     or p_provider_call_id is null
     or pg_catalog.length(pg_catalog.btrim(p_provider_call_id)) = 0
     or pg_catalog.length(p_provider_call_id) > 255
     or p_concurrency_limit is null
     or p_concurrency_limit < 1
     or p_concurrency_limit > 100 then
    raise exception 'voice admission claim arguments are invalid'
      using errcode = '22023';
  end if;

  -- One transaction at a time may count and claim for a workspace. The lock is
  -- transaction-scoped, has no row lifecycle to clean up, and is independent
  -- across workspaces.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_account_id::text, 84601211)
  );

  select a.* into v_existing
    from public.voice_call_admissions a
   where a.provider = 'signalwire'
     and a.provider_call_id = p_provider_call_id;

  if found then
    if v_existing.account_id <> p_account_id then
      raise exception 'voice call id is already bound to another workspace'
        using errcode = '22000';
    end if;
    if v_existing.admission_state = 'admitted' then
      return query select 'existing'::text, v_existing.id;
    else
      return query select 'busy'::text, v_existing.id;
    end if;
    return;
  end if;

  select pg_catalog.count(*) into v_open
    from public.voice_call_admissions a
   where a.account_id = p_account_id
     and a.provider = 'signalwire'
     and a.admitted_at >= pg_catalog.clock_timestamp() - interval '60 minutes'
     and not exists (
       select 1
         from public.voice_events e
        where e.provider = a.provider
          and e.provider_call_id = a.provider_call_id
     );

  if v_open >= p_concurrency_limit then
    return query select 'at_capacity'::text, null::uuid;
    return;
  end if;

  insert into public.voice_call_admissions (
    account_id, provider, provider_call_id, reservation_id,
    reserved_minutes, admission_state
  ) values (
    p_account_id, 'signalwire', p_provider_call_id, null, 0, 'claimed'
  )
  returning id into v_id;

  return query select 'claimed'::text, v_id;
end
$fn$;

create or replace function public.finalize_voice_call_admission(
  p_admission_id uuid,
  p_account_id uuid,
  p_provider_call_id text,
  p_reservation_id uuid,
  p_reserved_minutes integer,
  p_overage_key text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $fn$
begin
  if p_admission_id is null
     or p_account_id is null
     or p_provider_call_id is null
     or pg_catalog.length(pg_catalog.btrim(p_provider_call_id)) = 0
     or p_reserved_minutes is null
     or p_reserved_minutes < 0
     or (p_reservation_id is not null and p_overage_key is not null)
     or (p_reservation_id is null and p_overage_key is null and p_reserved_minutes <> 0)
     or ((p_reservation_id is not null or p_overage_key is not null)
         and p_reserved_minutes = 0) then
    raise exception 'voice admission finalization arguments are invalid'
      using errcode = '22023';
  end if;

  update public.voice_call_admissions a
     set reservation_id = p_reservation_id,
         reserved_minutes = p_reserved_minutes,
         overage_key = p_overage_key,
         admission_state = 'admitted'
   where a.id = p_admission_id
     and a.account_id = p_account_id
     and a.provider = 'signalwire'
     and a.provider_call_id = p_provider_call_id
     and a.admission_state = 'claimed';

  if found then
    return true;
  end if;

  -- A response can be lost after the transaction commits. Repeating the same
  -- finalization is success; a different value is never silently accepted.
  return exists (
    select 1 from public.voice_call_admissions a
     where a.id = p_admission_id
       and a.account_id = p_account_id
       and a.provider = 'signalwire'
       and a.provider_call_id = p_provider_call_id
       and a.admission_state = 'admitted'
       and a.reservation_id is not distinct from p_reservation_id
       and a.reserved_minutes = p_reserved_minutes
       and a.overage_key is not distinct from p_overage_key
  );
end
$fn$;

create or replace function public.release_voice_call_admission_claim(
  p_admission_id uuid,
  p_account_id uuid,
  p_provider_call_id text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $fn$
begin
  delete from public.voice_call_admissions a
   where a.id = p_admission_id
     and a.account_id = p_account_id
     and a.provider = 'signalwire'
     and a.provider_call_id = p_provider_call_id
     and a.admission_state = 'claimed'
     and a.reservation_id is null
     and a.reserved_minutes = 0
     and a.overage_key is null;
  return found;
end
$fn$;

revoke all on function public.claim_voice_call_admission(uuid, text, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.finalize_voice_call_admission(uuid, uuid, text, uuid, integer, text)
  from public, anon, authenticated, service_role;
revoke all on function public.release_voice_call_admission_claim(uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_voice_call_admission(uuid, text, integer) to service_role;
grant execute on function public.finalize_voice_call_admission(uuid, uuid, text, uuid, integer, text) to service_role;
grant execute on function public.release_voice_call_admission_claim(uuid, uuid, text) to service_role;

commit;
