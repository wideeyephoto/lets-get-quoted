-- Managed registration only. No full EIN, cron, provider request, or enabled gate.
begin;

alter table public.messaging_setup_payment_policy
  add column managed_registration_enabled boolean not null default false,
  add column signalwire_space_origin text,
  add column signalwire_project_id uuid;

create table public.messaging_managed_registration_operations (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.messaging_registration_applications(id) on delete restrict,
  account_id uuid not null references public.accounts(id) on delete restrict,
  application_revision integer not null,
  submission_version text not null default 'managed-v1' check (submission_version='managed-v1'),
  kind text not null check (kind in ('brand', 'campaign')),
  state text not null check (state in ('request_started', 'recorded', 'failed', 'indeterminate')),
  provider_object_id uuid unique,
  provider_state text check (provider_state ~ '^[a-z_]{1,40}$'),
  ein_last_four text check (ein_last_four ~ '^[0-9]{4}$'),
  authorized_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(application_id, kind),
  check (state <> 'recorded' or provider_object_id is not null)
);
create index messaging_managed_operations_account_idx on public.messaging_managed_registration_operations(account_id);
create index messaging_managed_operations_application_idx on public.messaging_managed_registration_operations(application_id);
alter table public.messaging_managed_registration_operations enable row level security;
alter table public.messaging_managed_registration_operations force row level security;
revoke all on public.messaging_managed_registration_operations from public, anon, authenticated, service_role;
grant select on public.messaging_managed_registration_operations to authenticated, service_role;
create policy messaging_managed_operations_owner_read on public.messaging_managed_registration_operations
  for select to authenticated using (public.is_owner(account_id));
create policy messaging_managed_operations_service_read on public.messaging_managed_registration_operations
  for select to service_role using (true);

-- No automatic lease recovery: an interrupted POST may have incurred a fee.
-- Existing attempts are returned with claimed=false, never submitted again.
create function public.claim_messaging_managed_registration(
  p_application_id uuid, p_account_id uuid, p_revision integer, p_kind text,
  p_space_origin text, p_project_id uuid, p_authorized boolean, p_ein_last_four text default null
) returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  a public.messaging_registration_applications%rowtype;
  o public.messaging_managed_registration_operations%rowtype;
begin
  select * into strict a from public.messaging_registration_applications
    where id=p_application_id and account_id=p_account_id for update;
  if a.revision is distinct from p_revision or a.status <> 'under_review'
    or p_kind is null or p_kind not in ('brand','campaign')
    or p_authorized is distinct from true
    or not exists (select 1 from public.accounts where id=p_account_id and suspended_at is null)
    or not exists (select 1 from public.messaging_setup_payment_policy where managed_registration_enabled
      and livemode is true and signalwire_space_origin=p_space_origin and signalwire_project_id=p_project_id)
    or not exists (select 1 from public.messaging_setup_orders where application_id=p_application_id
      and account_id=p_account_id and state='paid' and livemode is true) then
    raise exception 'Managed registration is not authorized for this application' using errcode='23514';
  end if;
  select * into o from public.messaging_managed_registration_operations where application_id=a.id and kind=p_kind for update;
  if found then return jsonb_build_object('claimed',false,'operation',to_jsonb(o)); end if;
  if p_kind='brand' then
    if a.provider_brand_id is not null or a.provider_campaign_id is not null
      or p_ein_last_four is null or p_ein_last_four !~ '^[0-9]{4}$'
      or a.business_type not in ('llc','partnership','nonprofit') then
      raise exception 'Business requires manual registration review' using errcode='23514';
    end if;
  else
    if a.provider_campaign_id is not null or not exists (
      select 1 from public.messaging_managed_registration_operations where application_id=a.id
        and application_revision=a.revision and kind='brand' and state='recorded'
        and provider_state='complete' and provider_object_id::text=a.provider_brand_id
    ) then raise exception 'Verified managed brand required' using errcode='23514'; end if;
  end if;
  insert into public.messaging_managed_registration_operations(application_id,account_id,application_revision,kind,state,ein_last_four)
    values(a.id,a.account_id,a.revision,p_kind,'request_started',case when p_kind='brand' then p_ein_last_four end)
    returning * into o;
  insert into public.messaging_registration_events(application_id,account_id,event_type,actor_type,metadata)
    values(a.id,a.account_id,'managed_'||p_kind||'_request_started','owner',jsonb_build_object('operation_id',o.id,'revision',a.revision));
  return jsonb_build_object('claimed',true,'operation',to_jsonb(o));
end;
$$;
revoke all on function public.claim_messaging_managed_registration(uuid,uuid,integer,text,text,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.claim_messaging_managed_registration(uuid,uuid,integer,text,text,uuid,boolean,text) to service_role;

-- Durable sanitized receipt or known failure. Provider response prose/tax IDs
-- are deliberately not accepted. Identity/approval GET checks happen in code.
create function public.record_messaging_managed_registration(
  p_operation_id uuid, p_application_id uuid, p_account_id uuid, p_state text,
  p_provider_object_id uuid default null, p_provider_state text default null
) returns void language plpgsql security definer
set search_path = ''
as $$
declare
  a public.messaging_registration_applications%rowtype;
  o public.messaging_managed_registration_operations%rowtype;
begin
  select * into strict a from public.messaging_registration_applications where id=p_application_id and account_id=p_account_id for update;
  select * into strict o from public.messaging_managed_registration_operations
    where id=p_operation_id and application_id=a.id and account_id=a.account_id for update;
  if a.revision<>o.application_revision or p_state is null or p_state not in ('recorded','failed','indeterminate')
    or p_state<>'recorded' and (p_provider_object_id is not null or p_provider_state is not null)
    or p_state='recorded' and (p_provider_object_id is null or p_provider_state is null or p_provider_state !~ '^[a-z_]{1,40}$')
    or o.state='recorded' and (p_state<>'recorded' or p_provider_object_id is distinct from o.provider_object_id)
    or o.state in ('failed','indeterminate') and p_state is distinct from o.state then
    raise exception 'Managed registration result conflicts with durable state' using errcode='23514';
  end if;
  if o.state=p_state and o.provider_object_id is not distinct from p_provider_object_id
    and o.provider_state is not distinct from p_provider_state then return; end if;
  if p_state='recorded' and exists(select 1 from public.messaging_registration_applications where id<>a.id
    and (provider_brand_id=p_provider_object_id::text or provider_campaign_id=p_provider_object_id::text)) then
    raise exception 'Provider object already belongs to another application' using errcode='23514';
  end if;
  update public.messaging_managed_registration_operations set state=p_state,
    provider_object_id=p_provider_object_id,provider_state=p_provider_state,updated_at=now() where id=o.id;
  if p_state='recorded' then
    update public.messaging_registration_applications set
      provider_brand_id=case when o.kind='brand' then p_provider_object_id::text else provider_brand_id end,
      provider_campaign_id=case when o.kind='campaign' then p_provider_object_id::text else provider_campaign_id end,
      updated_at=now() where id=a.id;
  end if;
  insert into public.messaging_registration_events(application_id,account_id,event_type,actor_type,metadata)
    values(a.id,a.account_id,'managed_'||o.kind||'_'||p_state,'system',
      jsonb_build_object('operation_id',o.id,'provider_object_id',p_provider_object_id,'provider_state',p_provider_state));
end;
$$;
revoke all on function public.record_messaging_managed_registration(uuid,uuid,uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.record_messaging_managed_registration(uuid,uuid,uuid,text,uuid,text) to service_role;

create function public.freeze_managed_registration_identity()
returns trigger language plpgsql security definer
set search_path = ''
as $$
declare o public.messaging_managed_registration_operations%rowtype;
begin
  for o in select * from public.messaging_managed_registration_operations where application_id=old.id loop
    if row(new.revision,new.account_id,new.legal_business_name,new.dba_name,new.business_type,new.website_url,
      new.business_email,new.business_phone,new.address_line1,new.address_line2,new.city,new.region,new.postal_code,
      new.messaging_support_email,new.messaging_support_phone,new.messaging_use_case,new.opt_in_description,
      new.opt_in_evidence_url,new.sample_messages,new.privacy_policy_url,new.terms_url,new.attested_at,
      new.authorized_contact_name,new.authorized_contact_title,new.authorized_contact_email,new.authorized_contact_phone)
      is distinct from row(old.revision,old.account_id,old.legal_business_name,old.dba_name,old.business_type,old.website_url,
      old.business_email,old.business_phone,old.address_line1,old.address_line2,old.city,old.region,old.postal_code,
      old.messaging_support_email,old.messaging_support_phone,old.messaging_use_case,old.opt_in_description,
      old.opt_in_evidence_url,old.sample_messages,old.privacy_policy_url,old.terms_url,old.attested_at,
      old.authorized_contact_name,old.authorized_contact_title,old.authorized_contact_email,old.authorized_contact_phone)
      or o.kind='brand' and new.provider_brand_id is distinct from o.provider_object_id::text
      or o.kind='campaign' and new.provider_campaign_id is distinct from o.provider_object_id::text then
      raise exception 'Managed registration identity is locked; reconcile before changing it' using errcode='23514';
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function public.freeze_managed_registration_identity() from public,anon,authenticated,service_role;
create trigger messaging_managed_identity_lock before update on public.messaging_registration_applications
  for each row execute function public.freeze_managed_registration_identity();
commit;

;
