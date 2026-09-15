-- Durable owner-visible facts and optional email delivery. No network calls,
-- historical backfill, carrier mutations or newly enabled worker.
begin;
create table public.messaging_lifecycle_notifications (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.messaging_registration_applications(id) on delete restrict,
  account_id uuid not null references public.accounts(id) on delete restrict,
  source_key text not null unique,
  application_revision integer not null,
  kind text not null check (kind in ('application_received','payment_received','owner_authorization_required',
    'carrier_action_required','carrier_rejected','carrier_approved','number_activated','number_suspended')),
  required_status text,
  recipient_email text not null,
  livemode boolean,
  created_at timestamptz not null default now(),
  email_state text not null default 'pending' check (email_state in ('pending','leased','accepted','suppressed','indeterminate')),
  attempts integer not null default 0 check (attempts between 0 and 8),
  next_attempt_at timestamptz not null default now(),
  claim_token uuid,
  lease_until timestamptz,
  first_request_at timestamptz,
  email_request jsonb,
  provider_email_id text,
  accepted_at timestamptz,
  failure_code text check (failure_code is null or failure_code in
    ('provider_unconfirmed','retry_window_expired','attempts_exhausted','superseded','pilot_disabled','expired')),
  check ((email_state='leased') = (claim_token is not null and lease_until is not null)),
  check ((first_request_at is null) = (email_request is null)),
  check (email_state <> 'accepted' or (provider_email_id is not null and accepted_at is not null))
);
create index messaging_lifecycle_notifications_owner_idx
  on public.messaging_lifecycle_notifications(account_id,application_id,created_at desc);
create index messaging_lifecycle_notifications_queue_idx
  on public.messaging_lifecycle_notifications(account_id,next_attempt_at,created_at)
  where email_state in ('pending','leased');
alter table public.messaging_lifecycle_notifications enable row level security;
alter table public.messaging_lifecycle_notifications force row level security;
revoke all on public.messaging_lifecycle_notifications from public,anon,authenticated,service_role;
grant select on public.messaging_lifecycle_notifications to service_role;
grant select(id,application_id,account_id,kind,created_at,email_state,livemode) on public.messaging_lifecycle_notifications to authenticated;
create policy messaging_lifecycle_owner_read on public.messaging_lifecycle_notifications
  for select to authenticated using (public.is_owner(account_id));
create policy messaging_lifecycle_service_read on public.messaging_lifecycle_notifications
  for select to service_role using (true);

-- The existing closure orchestrator uses service-role DELETE. Permit it only
-- for a leased, expired-grace closure with no legal hold; not routine queue work.
create function public.guard_messaging_notice_disposal()
returns trigger language plpgsql security definer set search_path='' set timezone='UTC' as $$
begin
  if to_regclass('public.account_closure_jobs') is null then
    raise exception 'Account closure evidence unavailable' using errcode='23514'; end if;
  perform 1 from public.accounts where id=old.account_id and suspended_at is not null and legal_hold is false for share;
  if not found or not exists(select 1 from public.account_closure_jobs where closure_subject_id=old.account_id
      and closure_state='processing' and recoverable_until is not null and recoverable_until<=now()
      and completed_at is null and lease_token is not null and lease_expires_at>now()) then
    raise exception 'Notice disposal requires an authorized account closure without a legal hold' using errcode='23514'; end if;
  return old;
end;
$$;
revoke all on function public.guard_messaging_notice_disposal() from public,anon,authenticated,service_role;
create trigger messaging_notice_disposal before delete on public.messaging_lifecycle_notifications
  for each row execute function public.guard_messaging_notice_disposal();
grant delete on public.messaging_lifecycle_notifications to service_role;
create policy messaging_lifecycle_service_disposal on public.messaging_lifecycle_notifications
  for delete to service_role using (true);

-- Trigger-only authority: source rows are already protected by owner/staff/
-- provider RPCs. Never accept caller-supplied email text or arbitrary metadata.
create function public.capture_messaging_lifecycle_notification()
returns trigger language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare a public.messaging_registration_applications%rowtype; k text; sk text;
  mode boolean; required text; seq uuid := gen_random_uuid();
begin
  if tg_table_name='messaging_registration_applications' then
    a := new;
    if tg_op='UPDATE' and new.status is not distinct from old.status
      and new.revision is not distinct from old.revision then return new; end if;
    k := case a.status when 'submitted' then 'application_received'
      when 'action_required' then 'carrier_action_required' when 'rejected' then 'carrier_rejected'
      when 'approved' then 'carrier_approved' when 'active' then 'number_activated'
      when 'suspended' then 'number_suspended' end;
    required := a.status;
    sk := 'transition:'||seq::text;
  elsif tg_table_name='messaging_setup_orders' then
    if new.state <> 'paid' or old.state='paid' then return new; end if;
    select * into strict a from public.messaging_registration_applications where id=new.application_id and account_id=new.account_id;
    k := 'payment_received'; sk := 'paid:'||new.id::text; mode := new.livemode;
  elsif tg_table_name='messaging_registration_events' then
    if new.event_type <> 'managed_staff_preflight' then return new; end if;
    select * into strict a from public.messaging_registration_applications where id=new.application_id and account_id=new.account_id;
    if new.metadata->>'revision' is distinct from a.revision::text then return new; end if;
    k := 'owner_authorization_required'; required := 'under_review';
    sk := 'preflight:'||a.id::text||':'||a.revision::text||':'||coalesce(new.metadata->>'digest','');
  else
    -- Polling can identify a carrier issue before staff changes application status.
    if new.provider_state is null or new.provider_state not in ('failed','rejected','declined','suspended')
      or new.provider_state is not distinct from old.provider_state then return new; end if;
    select * into strict a from public.messaging_registration_applications where id=new.application_id and account_id=new.account_id;
    k := 'carrier_action_required'; required := a.status; sk := 'carrier:'||seq::text;
  end if;
  if k is null then return new; end if;
  if tg_table_name <> 'messaging_setup_orders' then
    select livemode into mode from public.messaging_setup_payment_policy where singleton;
  end if;
  insert into public.messaging_lifecycle_notifications(id,application_id,account_id,source_key,
    application_revision,kind,required_status,recipient_email,livemode)
    values(seq,a.id,a.account_id,sk,a.revision,k,required,a.authorized_contact_email,mode)
    on conflict(source_key) do nothing;
  return new;
end;
$$;
revoke all on function public.capture_messaging_lifecycle_notification() from public,anon,authenticated,service_role;
create trigger messaging_lifecycle_application after insert or update on public.messaging_registration_applications
  for each row execute function public.capture_messaging_lifecycle_notification();
create trigger messaging_lifecycle_payment after update on public.messaging_setup_orders
  for each row execute function public.capture_messaging_lifecycle_notification();
create trigger messaging_lifecycle_preflight after insert on public.messaging_registration_events
  for each row execute function public.capture_messaging_lifecycle_notification();
create trigger messaging_lifecycle_carrier after update on public.messaging_managed_registration_operations
  for each row execute function public.capture_messaging_lifecycle_notification();

create function public.claim_messaging_lifecycle_notification(p_account_id uuid)
returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare n public.messaging_lifecycle_notifications%rowtype;
begin
  -- A restored production row must not send from a test/unbound database.
  if not exists(select 1 from public.messaging_setup_payment_policy where singleton and livemode is true) then return null; end if;
  if not exists(select 1 from public.accounts where id=p_account_id and suspended_at is null) then return null; end if;
  select * into n from public.messaging_lifecycle_notifications
    where account_id=p_account_id and livemode is true
      and (email_state='pending' and next_attempt_at<=now() or email_state='leased' and lease_until<=now())
    order by created_at,id limit 1 for update skip locked;
  if not found then return null; end if;
  if n.first_request_at <= now()-interval '23 hours' or n.attempts>=8 then
    update public.messaging_lifecycle_notifications set email_state='indeterminate',claim_token=null,lease_until=null,
      failure_code=case when n.attempts>=8 then 'attempts_exhausted' else 'retry_window_expired' end where id=n.id;
    return jsonb_build_object('terminal',true,'state','indeterminate');
  end if;
  if n.first_request_at is null and n.created_at<now()-interval '7 days' then
    update public.messaging_lifecycle_notifications set email_state='suppressed',claim_token=null,lease_until=null,
      failure_code='expired' where id=n.id;
    return jsonb_build_object('terminal',true,'state','suppressed');
  end if;
  update public.messaging_lifecycle_notifications set email_state='leased',claim_token=gen_random_uuid(),
    lease_until=now()+interval '3 minutes',attempts=attempts+1 where id=n.id returning * into n;
  return to_jsonb(n);
end;
$$;

-- Lock application before notification, matching the capture path. Freeze exact
-- content before first request so retries after deploy use identical bytes.
create function public.begin_messaging_lifecycle_email(p_id uuid,p_account_id uuid,p_claim_token uuid,p_email jsonb)
returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare a public.messaging_registration_applications%rowtype; n public.messaging_lifecycle_notifications%rowtype;
begin
  select a1.* into strict a from public.messaging_registration_applications a1
    join public.messaging_lifecycle_notifications n1 on n1.application_id=a1.id and n1.account_id=a1.account_id
    where n1.id=p_id and n1.account_id=p_account_id for share of a1;
  select * into strict n from public.messaging_lifecycle_notifications where id=p_id and account_id=p_account_id for update;
  if n.email_state<>'leased' or n.claim_token is distinct from p_claim_token or n.lease_until<=now()
    or n.livemode is not true
    or not exists(select 1 from public.messaging_setup_payment_policy where singleton and livemode is true)
    or not exists(select 1 from public.accounts where id=p_account_id and suspended_at is null)
    then raise exception 'Notification lease unavailable' using errcode='23514'; end if;
  if n.application_revision<>a.revision or n.recipient_email<>a.authorized_contact_email
    or n.required_status is not null and n.required_status<>a.status then
    update public.messaging_lifecycle_notifications set email_state=case when n.first_request_at is null then 'suppressed' else 'indeterminate' end,
      claim_token=null,lease_until=null,failure_code='superseded' where id=n.id;
    return jsonb_build_object('send',false);
  end if;
  if n.first_request_at<=now()-interval '23 hours' then
    update public.messaging_lifecycle_notifications set email_state='indeterminate',claim_token=null,lease_until=null,
      failure_code='retry_window_expired' where id=n.id;
    return jsonb_build_object('send',false);
  end if;
  if n.first_request_at is null then
    if p_email is null or jsonb_typeof(p_email)<>'object' or octet_length(p_email::text)>50000
      or p_email->>'to' is distinct from n.recipient_email
      or nullif(p_email->>'from','') is null or nullif(p_email->>'subject','') is null
      or nullif(p_email->>'html','') is null or nullif(p_email->>'text','') is null
      or p_email - array['to','from','subject','html','text','reply_to'] <> '{}'::jsonb then
      raise exception 'Notification content unavailable' using errcode='23514'; end if;
    update public.messaging_lifecycle_notifications set first_request_at=now(),email_request=p_email
      where id=n.id returning * into n;
  end if;
  return jsonb_build_object('send',true,'email',n.email_request,'idempotency_key','messaging-lifecycle/'||n.id::text);
end;
$$;

create function public.finish_messaging_lifecycle_email(p_id uuid,p_account_id uuid,p_claim_token uuid,p_outcome text,p_provider_id text)
returns void language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare n public.messaging_lifecycle_notifications%rowtype;
begin
  select * into strict n from public.messaging_lifecycle_notifications where id=p_id and account_id=p_account_id for update;
  if p_outcome='accepted' and n.email_state='accepted' and n.provider_email_id=p_provider_id then return; end if;
  if n.email_state<>'leased' or n.claim_token is distinct from p_claim_token or p_outcome is null
    or p_outcome not in ('accepted','retry','pilot_disabled') then
    raise exception 'Notification completion unavailable' using errcode='23514'; end if;
  if p_outcome='accepted' and (n.first_request_at is null or p_provider_id is null or p_provider_id !~ '^[A-Za-z0-9_-]{1,200}$') then
    raise exception 'Email acceptance evidence required' using errcode='23514'; end if;
  update public.messaging_lifecycle_notifications set
    email_state=case when p_outcome='accepted' then 'accepted' else 'pending' end,
    provider_email_id=case when p_outcome='accepted' then p_provider_id end,
    accepted_at=case when p_outcome='accepted' then now() end,
    failure_code=case p_outcome when 'retry' then 'provider_unconfirmed' when 'pilot_disabled' then 'pilot_disabled' end,
    next_attempt_at=now()+make_interval(secs=>least(3600,60*(2^n.attempts)::integer)),
    claim_token=null,lease_until=null where id=n.id;
end;
$$;
revoke all on function public.claim_messaging_lifecycle_notification(uuid) from public,anon,authenticated;
revoke all on function public.begin_messaging_lifecycle_email(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.finish_messaging_lifecycle_email(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.claim_messaging_lifecycle_notification(uuid) to service_role;
grant execute on function public.begin_messaging_lifecycle_email(uuid,uuid,uuid,jsonb) to service_role;
grant execute on function public.finish_messaging_lifecycle_email(uuid,uuid,uuid,text,text) to service_role;
commit;

;
