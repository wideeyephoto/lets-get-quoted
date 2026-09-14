-- Signed, unscoped negative evidence; never infer platform ownership from an address alone.
create table public.operational_callback_evidence (
  provider_id text primary key check (length(provider_id) between 1 and 256),
  recipient text not null check (recipient=lower(btrim(recipient)) and length(recipient) between 3 and 320),
  reason text not null check (reason in ('provider_suppressed','hard_bounce','complaint')),
  event_id text not null check (length(event_id) between 1 and 256),
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now()
);
alter table public.operational_callback_evidence enable row level security;
revoke all on public.operational_callback_evidence from public,anon,authenticated;
grant select,insert,update on public.operational_callback_evidence to service_role;

create function public.reconcile_operational_callback(p_provider_id text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare evidence public.operational_callback_evidence%rowtype; message jsonb; destination text;
begin
  -- Both arrival directions use the same transaction lock, then read fresh rows.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_provider_id,914164359));
  select * into evidence from public.operational_callback_evidence where provider_id=p_provider_id;
  if not found then return false; end if;
  select payload into message from public.operational_alert_deliveries where provider_id=p_provider_id;
  if not found then return false; end if;
  if jsonb_typeof(message->'to')='string' then destination:=message->>'to';
  elsif jsonb_typeof(message->'to')='array' then
    if jsonb_array_length(message->'to')=1 and jsonb_typeof(message->'to'->0)='string' then destination:=message->'to'->>0; end if;
  end if;
  if destination is null or destination !~ '^[^[:space:]<>@,;]+@[^[:space:]<>@,;]+\.[^[:space:]<>@,;]+$'
    or lower(destination)<>evidence.recipient then return false; end if;
  if coalesce(message->'cc','null'::jsonb) not in ('null'::jsonb,'[]'::jsonb)
    or coalesce(message->'bcc','null'::jsonb) not in ('null'::jsonb,'[]'::jsonb) then return false; end if;
  if jsonb_typeof(message->'tags')='object' then
    if message->'tags' ? 'account_id' then return false; end if;
  elsif jsonb_typeof(message->'tags')='array' then
    if exists(select 1 from jsonb_array_elements(message->'tags') tag where tag->>'name'='account_id') then return false; end if;
  elsif message ? 'tags' and message->'tags'<>'null'::jsonb then return false;
  end if;
  perform public.record_platform_email_suppression(evidence.recipient,evidence.reason);
  return true;
end;
$$;

create function public.record_operational_callback_evidence(p_provider_id text,p_recipient text,p_reason text,p_event_id text,p_occurred_at timestamptz)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare existing_recipient text;
begin
  if p_provider_id is null or length(p_provider_id) not between 1 and 256
    or p_recipient is null or p_recipient !~ '^[^[:space:]<>@,;]+@[^[:space:]<>@,;]+\.[^[:space:]<>@,;]+$'
    or p_reason is null or p_reason not in ('provider_suppressed','hard_bounce','complaint') then
    raise exception 'Invalid operational callback evidence';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_provider_id,914164359));
  select recipient into existing_recipient from public.operational_callback_evidence where provider_id=p_provider_id;
  if found and existing_recipient<>lower(p_recipient) then raise exception 'Conflicting operational callback recipient'; end if;
  insert into public.operational_callback_evidence as existing(provider_id,recipient,reason,event_id,occurred_at)
    values(p_provider_id,lower(p_recipient),p_reason,p_event_id,p_occurred_at)
  on conflict(provider_id) do update set reason=excluded.reason,event_id=excluded.event_id,occurred_at=excluded.occurred_at
    where array_position(array['provider_suppressed','hard_bounce','complaint'],excluded.reason)
      > array_position(array['provider_suppressed','hard_bounce','complaint'],existing.reason);
  perform public.reconcile_operational_callback(p_provider_id);
  return true;
end;
$$;

create function public.reconcile_operational_acceptance_callback()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.provider_id is not null then perform public.reconcile_operational_callback(new.provider_id); end if;
  return new;
end;
$$;
create trigger operational_acceptance_callback
  after insert or update of provider_id on public.operational_alert_deliveries
  for each row execute function public.reconcile_operational_acceptance_callback();

revoke all on function public.reconcile_operational_callback(text) from public,anon,authenticated;
revoke all on function public.record_operational_callback_evidence(text,text,text,text,timestamptz) from public,anon,authenticated;
revoke all on function public.reconcile_operational_acceptance_callback() from public,anon,authenticated;
grant execute on function public.reconcile_operational_callback(text) to service_role;
grant execute on function public.record_operational_callback_evidence(text,text,text,text,timestamptz) to service_role;
grant execute on function public.reconcile_operational_acceptance_callback() to service_role;
