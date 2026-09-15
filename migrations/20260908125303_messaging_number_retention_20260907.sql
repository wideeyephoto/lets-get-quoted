-- Retention observations do not surrender a number, alter carrier readiness,
-- downgrade a plan, or mint/reset usage. No retrospective release authority.
begin;
create table public.messaging_number_retention (
  sender_id uuid primary key references public.sms_sender_numbers(id) on delete restrict,
  account_id uuid not null references public.accounts(id) on delete restrict,
  provider text not null check(provider='signalwire'),
  provider_number_id text not null,
  e164 text not null,
  livemode boolean not null,
  state text not null check(state in ('subscribed','held','review_required')),
  last_qualified_at timestamptz,
  last_qualified_until timestamptz,
  hold_started_at timestamptz,
  retain_until timestamptz,
  restored_at timestamptz,
  port_out_requested_at timestamptz,
  port_out_requested_by uuid,
  checked_at timestamptz not null default now(),
  check ((hold_started_at is null)=(retain_until is null)),
  check (retain_until is null or retain_until=hold_started_at+interval '30 days'),
  check (state<>'held' or (last_qualified_at is not null and retain_until is not null))
);
create index messaging_number_retention_account_idx on public.messaging_number_retention(account_id);
alter table public.messaging_number_retention enable row level security;
alter table public.messaging_number_retention force row level security;
revoke all on public.messaging_number_retention from public,anon,authenticated,service_role;
grant select on public.messaging_number_retention to service_role;
grant select(sender_id,account_id,e164,state,last_qualified_until,hold_started_at,retain_until,restored_at,port_out_requested_at,checked_at)
  on public.messaging_number_retention to authenticated;
create policy messaging_number_retention_owner on public.messaging_number_retention for select to authenticated using(public.is_owner(account_id));
create policy messaging_number_retention_service on public.messaging_number_retention for select to service_role using(true);

create table public.messaging_number_retention_events (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.messaging_number_retention(sender_id) on delete restrict,
  account_id uuid not null references public.accounts(id) on delete restrict,
  previous_snapshot jsonb,
  current_snapshot jsonb not null,
  created_at timestamptz not null default now()
);
create index messaging_number_retention_events_account_idx on public.messaging_number_retention_events(account_id,created_at);
create index messaging_number_retention_events_sender_idx on public.messaging_number_retention_events(sender_id);
alter table public.messaging_number_retention_events enable row level security;
alter table public.messaging_number_retention_events force row level security;
revoke all on public.messaging_number_retention_events from public,anon,authenticated,service_role;
grant select on public.messaging_number_retention_events to service_role;
create policy messaging_number_retention_events_service on public.messaging_number_retention_events for select to service_role using(true);
create function public.capture_messaging_number_retention_event()
returns trigger language plpgsql security definer set search_path='' set timezone='UTC' as $$
begin
  if tg_op='INSERT' then
    insert into public.messaging_number_retention_events(sender_id,account_id,current_snapshot) values(new.sender_id,new.account_id,to_jsonb(new));
  elsif new.state is distinct from old.state or new.hold_started_at is distinct from old.hold_started_at
      or new.port_out_requested_at is distinct from old.port_out_requested_at then
    insert into public.messaging_number_retention_events(sender_id,account_id,previous_snapshot,current_snapshot)
      values(new.sender_id,new.account_id,to_jsonb(old),to_jsonb(new));
  end if;
  return new;
end;
$$;
revoke all on function public.capture_messaging_number_retention_event() from public,anon,authenticated,service_role;
create trigger messaging_number_retention_event after insert or update on public.messaging_number_retention
  for each row execute function public.capture_messaging_number_retention_event();

create function public.reconcile_messaging_number_retention(p_account_id uuid,p_sender_id uuid,p_livemode boolean)
returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare n public.sms_sender_numbers%rowtype; r public.messaging_number_retention%rowtype; e jsonb; qualified boolean;
begin
  if p_livemode is null or not exists(select 1 from public.messaging_setup_payment_policy
      where singleton and livemode=p_livemode) then
    raise exception 'Retention billing mode is not configured' using errcode='23514'; end if;
  -- The same lock serializes overlapping sweeps. Never touch shared inventory.
  select * into n from public.sms_sender_numbers where id=p_sender_id and account_id=p_account_id
    and purpose='contractor_dedicated' and provider='signalwire'
    and provider_number_id is not null and provisioning_status not in ('released','release_pending') for update;
  if not found then raise exception 'Dedicated inventory unavailable' using errcode='23514'; end if;
  select * into r from public.messaging_number_retention where sender_id=n.id for update;
  if found and (r.account_id<>n.account_id or r.provider_number_id<>n.provider_number_id
      or r.e164<>n.e164_number or r.livemode<>p_livemode) then
    raise exception 'Retention inventory identity changed; staff reconciliation required' using errcode='23514'; end if;
  e:=public.messaging_primary_number_entitlement(p_account_id,p_livemode);
  if e is null or jsonb_typeof(e->'entitled') is distinct from 'boolean' then
    raise exception 'Subscription evidence unavailable' using errcode='23514'; end if;
  qualified:=(e->>'entitled')::boolean;
  if qualified and ((e->>'valid_until')::timestamptz<=now() or e->>'valid_until' is null) then
    raise exception 'Subscription evidence expired' using errcode='23514'; end if;
  if r.sender_id is null then
    insert into public.messaging_number_retention(sender_id,account_id,provider,provider_number_id,e164,livemode,state,
      last_qualified_at,last_qualified_until)
    values(n.id,n.account_id,n.provider,n.provider_number_id,n.e164_number,p_livemode,
      case when qualified then 'subscribed' else 'review_required' end,
      case when qualified then now() end,case when qualified then (e->>'valid_until')::timestamptz end);
  elsif qualified then
    update public.messaging_number_retention set state='subscribed',last_qualified_at=now(),
      last_qualified_until=(e->>'valid_until')::timestamptz,
      restored_at=case when r.state<>'subscribed' then now() else restored_at end,
      hold_started_at=null,retain_until=null,checked_at=now() where sender_id=n.id;
  else
    -- Never backdate a new hold from stale event timestamps. Thirty full days
    -- from first observed loss is a conservative floor, not release permission.
    update public.messaging_number_retention set
      state=case when last_qualified_at is null then 'review_required' else 'held' end,
      hold_started_at=case when last_qualified_at is not null then coalesce(hold_started_at,now()) end,
      retain_until=case when last_qualified_at is not null then coalesce(retain_until,now()+interval '30 days') end,
      checked_at=now() where sender_id=n.id;
  end if;
  select * into r from public.messaging_number_retention where sender_id=n.id;
  return jsonb_build_object('sender_id',r.sender_id,'state',r.state,'retain_until',r.retain_until,
    'release_authorized',false,'restored_at',r.restored_at);
end;
$$;
revoke all on function public.reconcile_messaging_number_retention(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.reconcile_messaging_number_retention(uuid,uuid,boolean) to service_role;

-- An owner request is a support intake, never permission to port or release.
-- Restoration deliberately does not erase the request.
create function public.request_messaging_number_port_out(p_account_id uuid,p_sender_id uuid)
returns timestamptz language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare requested timestamptz;
begin
  if auth.uid() is null or public.is_owner(p_account_id) is not true then raise exception 'Owner access required' using errcode='42501'; end if;
  perform 1 from public.sms_sender_numbers n join public.messaging_number_retention r on r.sender_id=n.id
    where n.id=p_sender_id and n.account_id=p_account_id and r.account_id=p_account_id
      and n.purpose='contractor_dedicated' and n.provider=r.provider and n.provider_number_id=r.provider_number_id
      and n.e164_number=r.e164 and n.provisioning_status not in ('released','release_pending') for update of n;
  if not found then raise exception 'Dedicated inventory unavailable' using errcode='23514'; end if;
  update public.messaging_number_retention set port_out_requested_at=coalesce(port_out_requested_at,now()),
    port_out_requested_by=coalesce(port_out_requested_by,auth.uid())
    where sender_id=p_sender_id and account_id=p_account_id returning port_out_requested_at into requested;
  return requested;
end;
$$;
revoke all on function public.request_messaging_number_port_out(uuid,uuid) from public,anon,service_role;
grant execute on function public.request_messaging_number_port_out(uuid,uuid) to authenticated;
comment on table public.messaging_number_retention is 'Conservative billing retention observations. Holds never authorize provider release. Unknown history requires staff review. Carrier suspensions remain independent.';
commit;

;
