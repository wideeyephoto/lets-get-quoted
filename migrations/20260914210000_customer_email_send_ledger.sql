
-- Durable customer-facing message intents.
create table public.customer_email_sends (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete cascade,
  kind text not null check (kind in ('appointment_reminder', 'selection_reminder', 'booking_confirmation', 'rebook_invite', 'review_request', 'campaign')),
  recipient text not null,
  payload jsonb not null,
  fallback_payload jsonb,
  provider_scope text not null,
  state text not null check (state in ('sending','retry_wait','accepted','manual_review','cancelled')),
  phase text not null default 'primary' check (phase in ('primary','fallback')),
  first_attempt_at timestamptz not null default now(),
  attempts integer not null default 1 check (attempts between 1 and 3),
  lease_token uuid,
  lease_until timestamptz,
  next_retry_at timestamptz,
  provider_id text unique,
  accepted_at timestamptz,
  last_error text,
  resolved_by text,
  resolution text,
  resolved_at timestamptz,
  idempotency_key text not null unique,
  unique(account_id, idempotency_key),
  check (state <> 'sending' or (lease_token is not null and lease_until is not null)),
  check (state <> 'accepted' or (provider_id is not null and accepted_at is not null))
);
alter table public.customer_email_sends enable row level security;
revoke all on public.customer_email_sends from public, anon, authenticated;
grant select, insert, update, delete on public.customer_email_sends to service_role;
create index customer_email_sends_attention_idx on public.customer_email_sends(state, first_attempt_at)
  where state in ('sending','retry_wait','manual_review');

-- Serialize each logical message before inspecting or changing its state.
create function public.claim_customer_email_send(p_account_id uuid,p_kind text,p_idempotency_key text,p_payload jsonb,p_provider_scope text,p_job_id uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.customer_email_sends; v_now timestamptz:=clock_timestamp(); v_token uuid:=gen_random_uuid(); v_to text:=lower(btrim(p_payload->>'to'));
begin
  if nullif(btrim(p_idempotency_key),'') is null or length(p_idempotency_key)>500
    or p_provider_scope is null or p_provider_scope !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(p_payload->'to') is distinct from 'string' or coalesce(v_to,'')=''
    or jsonb_typeof(p_payload->'tags') is distinct from 'array'
    or not exists(select 1 from jsonb_array_elements(p_payload->'tags') t where t->>'name'='account_id' and t->>'value'=p_account_id::text)
    or exists(select 1 from jsonb_array_elements(p_payload->'tags') t where t->>'name'='account_id' and t->>'value' is distinct from p_account_id::text)
    then raise exception 'Invalid customer email identity'; end if;
  perform pg_advisory_xact_lock(hashtextextended('customer-email:'||p_idempotency_key,0));
  select * into r from public.customer_email_sends where idempotency_key=p_idempotency_key for update;
  if found then
    if r.account_id<>p_account_id or r.kind<>p_kind or r.job_id is distinct from p_job_id or r.recipient<>v_to then
      raise exception 'Customer email identity changed'; end if;
    if r.state='accepted' then return jsonb_build_object('action','already_sent','provider_id',r.provider_id); end if;
    if r.state in ('manual_review','cancelled') then return jsonb_build_object('action','review'); end if;
    if r.provider_scope<>p_provider_scope or r.first_attempt_at+interval '23 hours'<=v_now or r.attempts>=3 then
      update public.customer_email_sends set state='manual_review',last_error='provider_scope_window_or_attempt_limit',lease_token=null,lease_until=null where id=r.id;
      return jsonb_build_object('action','review'); end if;
    if (r.state='sending' and r.lease_until>v_now) or r.next_retry_at>v_now then return jsonb_build_object('action','busy'); end if;
  end if;
  if not exists(select 1 from public.accounts where id=p_account_id and suspended_at is null and test_marker is null) then
    return jsonb_build_object('action','blocked','reason','account_ineligible'); end if;
  if p_job_id is not null and not exists(select 1 from public.jobs where id=p_job_id and account_id=p_account_id and deleted_at is null) then
    return jsonb_build_object('action','blocked','reason','job_unavailable'); end if;
  if exists(select 1 from public.email_suppression where account_id=p_account_id and lower(email)=v_to
    and (p_kind in ('campaign','review_request','rebook_invite') or reason in ('hard_bounce','complaint','provider_suppressed'))) then
    return jsonb_build_object('action','blocked','reason','recipient_delivery_block'); end if;
  if r.id is null then
    insert into public.customer_email_sends(account_id,job_id,kind,recipient,payload,provider_scope,state,lease_token,lease_until,idempotency_key)
      values(p_account_id,p_job_id,p_kind,v_to,p_payload,p_provider_scope,'sending',v_token,v_now+interval '5 minutes',p_idempotency_key) returning * into r;
  else
    update public.customer_email_sends set state='sending',attempts=attempts+1,lease_token=v_token,lease_until=v_now+interval '5 minutes',next_retry_at=null
      where id=r.id returning * into r;
  end if;
  return jsonb_build_object('action','send','id',r.id,'account_id',r.account_id,'token',r.lease_token,'phase',r.phase,
    'payload',case when r.phase='fallback' then r.fallback_payload else r.payload end,
    'key','customer-email/'||r.id::text||'/'||r.phase,'retry_before',least(r.lease_until,r.first_attempt_at+interval '23 hours'));
end $$;
revoke all on function public.claim_customer_email_send(uuid,text,text,jsonb,text,uuid) from public,anon,authenticated;
grant execute on function public.claim_customer_email_send(uuid,text,text,jsonb,text,uuid) to service_role;
create function public.fallback_customer_email_send(p_id uuid,p_account_id uuid,p_token uuid,p_error_name text,p_error_message text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_row public.customer_email_sends; v_address text; v_domain text; v_rejected text; v_from text; v_payload jsonb;
begin
  select * into v_row from public.customer_email_sends where id=p_id and account_id=p_account_id for update;
  if not found or v_row.state<>'sending' or v_row.phase<>'primary' or v_row.lease_token is distinct from p_token
    or v_row.lease_until<=clock_timestamp() or v_row.first_attempt_at+interval '23 hours'<=clock_timestamp()
    or p_error_name is distinct from 'validation_error' then return null; end if;
  if not exists(select 1 from public.accounts where id=p_account_id and suspended_at is null and test_marker is null)
    or exists(select 1 from public.email_suppression where account_id=p_account_id and lower(email)=v_row.recipient
      and (v_row.kind in ('campaign','review_request','rebook_invite') or reason in ('hard_bounce','complaint','provider_suppressed'))) then return null; end if;
  v_from := v_row.payload->>'from';
  v_address := coalesce(substring(v_from from '<([^<>]+)>\s*$'),btrim(v_from));
  v_domain := lower(split_part(v_address,'@',2));
  v_rejected := lower(substring(p_error_message from '(?i)^The\s+`?([^\s`]+)`?\s+domain is not verified\.'));
  if coalesce(v_domain,'')='' or v_domain='letsgetquoted.com' or v_domain like '%.letsgetquoted.com'
    or v_domain is distinct from v_rejected then return null; end if;
  v_from := case when v_from like '%<%' then regexp_replace(v_from,'<[^<>]+>\s*$','<hello@letsgetquoted.com>') else 'hello@letsgetquoted.com' end;
  v_payload := jsonb_set(v_row.payload,'{from}',to_jsonb(v_from));
  v_payload := jsonb_set(v_payload,'{tags}',(select jsonb_agg(case when tag->>'name'='send_phase'
    then jsonb_build_object('name','send_phase','value','fallback') else tag end) from jsonb_array_elements(v_payload->'tags') tag));
  update public.customer_email_sends set phase='fallback',fallback_payload=v_payload,last_error=left(p_error_message,2000) where id=p_id;
  return jsonb_build_object('action','send','id',v_row.id,'token',v_row.lease_token,'phase','fallback','payload',v_payload,
    'key','customer-email/'||v_row.id::text||'/fallback','retry_before',least(v_row.lease_until,v_row.first_attempt_at+interval '23 hours'));
end $$;
revoke all on function public.fallback_customer_email_send(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.fallback_customer_email_send(uuid,uuid,uuid,text,text) to service_role;

create function public.finish_customer_email_send(p_id uuid,p_account_id uuid,p_token uuid,p_provider_id text default null,p_error text default null,p_source text default null,p_error_name text default null,p_retry_seconds integer default null,p_run_token text default null)
returns boolean language plpgsql security invoker set search_path='' as $$
declare r public.customer_email_sends;
begin
 select * into r from public.customer_email_sends where id=p_id and account_id=p_account_id for update;
 if not found then return false; end if;
 if r.state='accepted' then return r.provider_id=p_provider_id; end if;
 if r.state<>'sending' or r.lease_token is distinct from p_token then return false; end if;
 if p_error is null and nullif(btrim(p_provider_id),'') is not null then
  update public.customer_email_sends set state='accepted',provider_id=p_provider_id,accepted_at=clock_timestamp(),lease_token=null,lease_until=null,next_retry_at=null,last_error=null where id=p_id;
 else
  update public.customer_email_sends set state=case when attempts>=3 or first_attempt_at+interval '23 hours'<=clock_timestamp() then 'manual_review' else 'retry_wait' end,
    last_error=left(coalesce(p_error,'Provider outcome unknown'),2000),lease_token=null,lease_until=null,
    next_retry_at=clock_timestamp()+make_interval(secs=>greatest(300,least(coalesce(p_retry_seconds,300),82800))) where id=p_id;
 end if;
 return true;
end $$;
revoke all on function public.finish_customer_email_send(uuid,uuid,uuid,text,text,text,text,integer,text) from public,anon,authenticated;
grant execute on function public.finish_customer_email_send(uuid,uuid,uuid,text,text,text,text,integer,text) to service_role;
create index customer_email_sends_account_idx on public.customer_email_sends(account_id);
create index customer_email_sends_job_idx on public.customer_email_sends(job_id);
notify pgrst,'reload schema';
