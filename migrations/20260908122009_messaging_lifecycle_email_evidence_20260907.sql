-- Verified email outcomes are independent of queue acceptance. No egress,
-- backfill, queue reset, deployment or historical frozen-payload rewrite.
begin;
alter table public.messaging_lifecycle_notifications
  add column delivery_status text check (delivery_status in ('sent','delayed','delivered','bounced','complained','failed','suppressed')),
  add column delivery_observed_at timestamptz,
  add column delivery_event_at timestamptz,
  add column delivery_source text check (delivery_source in ('webhook','provider_lookup')),
  add column recipient_blocked boolean not null default false;
create unique index messaging_lifecycle_provider_email_idx on public.messaging_lifecycle_notifications(provider_email_id)
  where provider_email_id is not null;
create index messaging_lifecycle_blocked_recipient_idx on public.messaging_lifecycle_notifications(account_id,lower(recipient_email))
  where recipient_blocked;
alter table public.messaging_lifecycle_notifications drop constraint messaging_lifecycle_notifications_failure_code_check;
alter table public.messaging_lifecycle_notifications add constraint messaging_lifecycle_notifications_failure_code_check
  check (failure_code is null or failure_code in ('provider_unconfirmed','retry_window_expired','attempts_exhausted',
    'superseded','pilot_disabled','expired','recipient_blocked'));
grant select(delivery_status,delivery_observed_at,delivery_event_at,delivery_source) on public.messaging_lifecycle_notifications to authenticated;

-- Private correlation is generated inside the freeze transaction, not from a
-- browser/account tag. Existing frozen requests must retain their original key/body.
create function public.stamp_messaging_lifecycle_email()
returns trigger language plpgsql security definer set search_path='' set timezone='UTC' as $$
begin
  if old.email_request is null and new.email_request is not null then
    new.email_request := new.email_request || jsonb_build_object('tags',jsonb_build_array(
      jsonb_build_object('name','kind','value','messaging_lifecycle'),
      jsonb_build_object('name','notice_id','value',new.id::text),
      jsonb_build_object('name','receipt_token','value',gen_random_uuid()::text)));
  elsif old.email_request is not null and new.email_request is distinct from old.email_request then
    raise exception 'Frozen notification request is immutable' using errcode='23514';
  end if;
  return new;
end;
$$;
revoke all on function public.stamp_messaging_lifecycle_email() from public,anon,authenticated,service_role;
create trigger messaging_lifecycle_email_stamp before update of email_request on public.messaging_lifecycle_notifications
  for each row execute function public.stamp_messaging_lifecycle_email();

create table public.messaging_lifecycle_email_evidence (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.messaging_lifecycle_notifications(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete restrict,
  event_key text not null unique,
  provider_email_id text not null,
  source text not null check (source in ('webhook','provider_lookup')),
  status text check (status in ('sent','delayed','delivered','bounced','complained','failed','suppressed')),
  occurred_at timestamptz,
  observed_at timestamptz not null default now(),
  actor_id uuid,
  evidence_digest text not null,
  check ((source='provider_lookup') = (actor_id is not null))
);
create index messaging_lifecycle_email_evidence_account_idx on public.messaging_lifecycle_email_evidence(account_id,notification_id);
alter table public.messaging_lifecycle_email_evidence enable row level security;
alter table public.messaging_lifecycle_email_evidence force row level security;
revoke all on public.messaging_lifecycle_email_evidence from public,anon,authenticated,service_role;
grant select,delete on public.messaging_lifecycle_email_evidence to service_role;
create policy messaging_lifecycle_evidence_service_read on public.messaging_lifecycle_email_evidence for select to service_role using (true);
create policy messaging_lifecycle_evidence_service_disposal on public.messaging_lifecycle_email_evidence for delete to service_role using (true);
create trigger messaging_lifecycle_evidence_disposal before delete on public.messaging_lifecycle_email_evidence
  for each row execute function public.guard_messaging_notice_disposal();

-- Authenticate staff and ops.manage/MFA in the server action before this
-- service-only preflight. Recheck policy again at the evidence commit boundary.
create function public.load_messaging_lifecycle_email_recovery(p_id uuid,p_application_id uuid,p_account_id uuid)
returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare n public.messaging_lifecycle_notifications%rowtype;
begin
  select * into strict n from public.messaging_lifecycle_notifications
    where id=p_id and application_id=p_application_id and account_id=p_account_id;
  if n.livemode is not true or n.first_request_at is null or n.email_state not in ('accepted','indeterminate')
    or not exists(select 1 from public.messaging_setup_payment_policy where singleton and livemode is true)
    or not exists(select 1 from public.accounts where id=p_account_id and suspended_at is null) then
    raise exception 'Notification recovery unavailable' using errcode='23514'; end if;
  return jsonb_build_object('id',n.id,'provider_email_id',n.provider_email_id);
end;
$$;

-- Input is constructed only after a verified raw-body webhook, or a server-side
-- GET /emails/:id. Tags locate a candidate; frozen identity/content authorizes
-- the binding. Account scope is taken exclusively from the stored notification.
create function public.record_messaging_lifecycle_email_evidence(p_id uuid,p_source text,p_event_id text,
  p_receipt jsonb,p_actor_id uuid default null,p_application_id uuid default null,p_account_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare n public.messaging_lifecycle_notifications%rowtype; e public.messaging_lifecycle_email_evidence%rowtype;
  token text; provider text; status text; occurred timestamptz; created timestamptz;
  v_event_key text; fingerprint text; old_rank integer; new_rank integer; blocked boolean;
begin
  if p_source is null or p_source not in ('webhook','provider_lookup') or p_receipt is null
    or jsonb_typeof(p_receipt)<>'object' or octet_length(p_receipt::text)>100000 then
    raise exception 'Invalid notification evidence' using errcode='23514'; end if;
  select * into strict n from public.messaging_lifecycle_notifications where id=p_id for update;
  provider := p_receipt->>'id'; status := p_receipt->>'status';
  select t->>'value' into token from jsonb_array_elements(n.email_request->'tags') t where t->>'name'='receipt_token';
  if n.livemode is not true or n.first_request_at is null or n.email_request is null
    or not exists(select 1 from public.messaging_setup_payment_policy where singleton and livemode is true)
    or provider is null or provider !~ '^[A-Za-z0-9_-]{1,200}$'
    or n.provider_email_id is not null and n.provider_email_id<>provider
    or token is null or p_receipt->>'receipt_token' is distinct from token
    or p_receipt->>'notice_id' is distinct from n.id::text
    or p_receipt->>'kind' is distinct from 'messaging_lifecycle'
    or p_receipt->'to' is distinct from jsonb_build_array(n.recipient_email)
    or p_receipt->>'from' is distinct from n.email_request->>'from'
    or p_receipt->>'subject' is distinct from n.email_request->>'subject'
    or status is not null and status not in ('sent','delayed','delivered','bounced','complained','failed','suppressed') then
    raise exception 'Notification evidence does not match' using errcode='23514'; end if;
  if p_source='provider_lookup' then
    perform public.load_messaging_lifecycle_email_recovery(p_id,p_application_id,p_account_id);
    created := (p_receipt->>'created_at')::timestamptz;
    if p_actor_id is null or p_account_id is distinct from n.account_id or p_application_id is distinct from n.application_id
      or p_receipt->>'html' is distinct from n.email_request->>'html'
      or p_receipt->>'text' is distinct from n.email_request->>'text'
      or p_receipt->'reply_to' is distinct from jsonb_build_array(n.email_request->>'reply_to')
      or p_receipt->'cc' is distinct from '[]'::jsonb or p_receipt->'bcc' is distinct from '[]'::jsonb
      or created is null or created<n.first_request_at-interval '5 minutes'
      or created>n.first_request_at+interval '23 hours' or created>now()+interval '5 minutes' then
      raise exception 'Provider lookup evidence does not match' using errcode='23514'; end if;
    -- Retrieval has no timestamp for last_event. Never present created_at as
    -- delivery time or invent an event time from the staff lookup time.
    v_event_key := 'lookup:'||n.id::text||':'||provider||':'||coalesce(status,'accepted');
  else
    occurred := (p_receipt->>'occurred_at')::timestamptz;
    if p_actor_id is not null or p_event_id is null or p_event_id !~ '^[A-Za-z0-9_-]{1,200}$'
      or status is null or occurred is null or occurred<n.first_request_at-interval '5 minutes'
      or occurred>now()+interval '5 minutes' then
      raise exception 'Webhook evidence unavailable' using errcode='23514'; end if;
    v_event_key := 'webhook:'||p_event_id;
  end if;
  fingerprint := encode(sha256(convert_to(p_receipt::text,'UTF8')),'hex');
  insert into public.messaging_lifecycle_email_evidence(notification_id,account_id,event_key,provider_email_id,
    source,status,occurred_at,actor_id,evidence_digest)
    values(n.id,n.account_id,v_event_key,provider,p_source,status,occurred,p_actor_id,fingerprint)
    on conflict(event_key) do nothing;
  if not found then
    select * into strict e from public.messaging_lifecycle_email_evidence where event_key=v_event_key;
    if e.notification_id<>n.id or e.provider_email_id<>provider or e.evidence_digest<>fingerprint then
      raise exception 'Conflicting notification evidence replay' using errcode='23514'; end if;
    return jsonb_build_object('recorded',true,'replayed',true);
  end if;
  old_rank := case n.delivery_status when 'sent' then 10 when 'delayed' then 20 when 'delivered' then 30
    when 'bounced' then 40 when 'failed' then 40 when 'suppressed' then 40 when 'complained' then 50 else 0 end;
  new_rank := case status when 'sent' then 10 when 'delayed' then 20 when 'delivered' then 30
    when 'bounced' then 40 when 'failed' then 40 when 'suppressed' then 40 when 'complained' then 50 else 0 end;
  blocked := status in ('complained','suppressed') or status='bounced' and p_receipt->>'bounce_type'='Permanent';
  update public.messaging_lifecycle_notifications set email_state='accepted',provider_email_id=provider,
    accepted_at=coalesce(accepted_at,now()),claim_token=null,lease_until=null,failure_code=null,
    recipient_blocked=recipient_blocked or coalesce(blocked,false),
    delivery_status=case when new_rank>old_rank then status else delivery_status end,
    delivery_source=case when new_rank>old_rank then p_source else delivery_source end,
    delivery_observed_at=case when new_rank>old_rank then now() else delivery_observed_at end,
    delivery_event_at=case when new_rank>old_rank then occurred else delivery_event_at end
    where id=n.id;
  return jsonb_build_object('recorded',true,'replayed',false);
end;
$$;
revoke all on function public.load_messaging_lifecycle_email_recovery(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.load_messaging_lifecycle_email_recovery(uuid,uuid,uuid) to service_role;
revoke all on function public.record_messaging_lifecycle_email_evidence(uuid,text,text,jsonb,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.record_messaging_lifecycle_email_evidence(uuid,text,text,jsonb,uuid,uuid,uuid) to service_role;

-- Preserve the original freeze/lease/revision checks. Recipient suppression is
-- scoped to this owner-notification lane, never SMS consent or unrelated mail.
alter function public.begin_messaging_lifecycle_email(uuid,uuid,uuid,jsonb) rename to begin_messaging_lifecycle_email_base;
revoke all on function public.begin_messaging_lifecycle_email_base(uuid,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
create function public.begin_messaging_lifecycle_email(p_id uuid,p_account_id uuid,p_claim_token uuid,p_email jsonb)
returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare result jsonb; prior_request timestamptz;
begin
  select first_request_at into prior_request from public.messaging_lifecycle_notifications where id=p_id and account_id=p_account_id;
  result := public.begin_messaging_lifecycle_email_base(p_id,p_account_id,p_claim_token,p_email);
  if result->>'send'='true' and exists(select 1 from public.messaging_lifecycle_notifications
    where account_id=p_account_id and lower(recipient_email)=lower(result->'email'->>'to') and recipient_blocked) then
    update public.messaging_lifecycle_notifications set email_state=case when prior_request is null then 'suppressed' else 'indeterminate' end,
      claim_token=null,lease_until=null,failure_code='recipient_blocked' where id=p_id;
    return jsonb_build_object('send',false);
  end if;
  return result;
end;
$$;
revoke all on function public.begin_messaging_lifecycle_email(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.begin_messaging_lifecycle_email(uuid,uuid,uuid,jsonb) to service_role;

-- A verified callback may win the race against a lost/late HTTP response. A
-- worker timeout cannot reset that proof back to pending and send again.
alter function public.finish_messaging_lifecycle_email(uuid,uuid,uuid,text,text) rename to finish_messaging_lifecycle_email_base;
revoke all on function public.finish_messaging_lifecycle_email_base(uuid,uuid,uuid,text,text) from public,anon,authenticated,service_role;
create function public.finish_messaging_lifecycle_email(p_id uuid,p_account_id uuid,p_claim_token uuid,p_outcome text,p_provider_id text)
returns void language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare n public.messaging_lifecycle_notifications%rowtype;
begin
  select * into strict n from public.messaging_lifecycle_notifications where id=p_id and account_id=p_account_id for update;
  if n.email_state='accepted' and (p_outcome in ('retry','pilot_disabled') or p_outcome='accepted' and n.provider_email_id=p_provider_id) then return; end if;
  perform public.finish_messaging_lifecycle_email_base(p_id,p_account_id,p_claim_token,p_outcome,p_provider_id);
end;
$$;
revoke all on function public.finish_messaging_lifecycle_email(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.finish_messaging_lifecycle_email(uuid,uuid,uuid,text,text) to service_role;
commit;

;
