-- Durable lifecycle intents. Apply before deploying the sender.
create table public.contractor_lifecycle_sends (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  step_id text not null,
  recipient text not null,
  payload jsonb not null,
  idempotency_key text not null unique,
  provider_scope text not null,
  state text not null check (state in ('sending','retry_wait','accepted','manual_review','cancelled')),
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
  unique(account_id, step_id),
  check (state <> 'sending' or (lease_token is not null and lease_until is not null)),
  check (state <> 'accepted' or (provider_id is not null and accepted_at is not null))
);
alter table public.contractor_lifecycle_sends enable row level security;
revoke all on public.contractor_lifecycle_sends from public, anon, authenticated;
grant select, insert, update, delete on public.contractor_lifecycle_sends to service_role;
create index contractor_lifecycle_sends_attention_idx on public.contractor_lifecycle_sends(state, first_attempt_at)
  where state in ('sending','retry_wait','manual_review');

create function public.claim_contractor_lifecycle_send(p_account_id uuid, p_step_id text, p_payload jsonb, p_provider_scope text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_row public.contractor_lifecycle_sends;
  v_recipient text := lower(btrim(p_payload->>'to'));
  v_id uuid := gen_random_uuid();
  v_token uuid := gen_random_uuid();
  v_now timestamptz := clock_timestamp();
begin
  if p_step_id is null or p_step_id !~ '^[a-z0-9_]{1,80}$'
    or jsonb_typeof(p_payload->'to') is distinct from 'string'
    or coalesce(v_recipient,'') = '' or jsonb_typeof(p_payload->'tags') is distinct from 'array'
    or p_provider_scope is null or p_provider_scope !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid lifecycle send intent';
  end if;

  -- Serialize different steps as well as repeat attempts for one workspace.
  perform 1 from public.accounts where id=p_account_id
    and test_marker is null and suspended_at is null for update;
  if not found then return jsonb_build_object('action','blocked','reason','account_ineligible'); end if;

  update public.contractor_lifecycle_sends set state='manual_review',last_error='retry_window_or_attempt_limit'
    where account_id=p_account_id and state in ('sending','retry_wait')
      and first_attempt_at+interval '23 hours'<=v_now;

  select * into v_row from public.contractor_lifecycle_sends
    where account_id=p_account_id and step_id=p_step_id for update;
  if found and v_row.state='accepted' then
    return jsonb_build_object('action','already_sent','provider_id',v_row.provider_id);
  end if;
  if v_row.id is not null and v_row.state='cancelled' then
    return jsonb_build_object('action','blocked','reason','send_cancelled');
  end if;
  if v_row.id is not null and v_row.state='manual_review' then
    return jsonb_build_object('action','review','reason',v_row.last_error,'id',v_row.id);
  end if;

  -- These safety reads are under the same transaction as the claim.
  if not exists (select 1 from public.owner_emails_for_accounts(array[p_account_id]) o where lower(btrim(o.email))=v_recipient)
    or exists (select 1 from public.email_suppression where account_id=p_account_id and lower(email)=v_recipient) then
    return jsonb_build_object('action','blocked','reason','recipient_no_longer_eligible');
  end if;
  if p_step_id in ('nudge_incomplete_stripe','stripe_payout_day4')
    and exists(select 1 from public.accounts where id=p_account_id and connect_onboarded=true) then
    return jsonb_build_object('action','blocked','reason','payment_setup_complete');
  end if;
  if p_step_id='nudge_zero_quotes' and exists(select 1 from public.jobs where account_id=p_account_id and quoted_amount>0) then
    return jsonb_build_object('action','blocked','reason','quote_already_created');
  end if;

  if v_row.id is not null then
    if v_row.recipient <> v_recipient or v_row.provider_scope <> p_provider_scope then
      update public.contractor_lifecycle_sends set state='manual_review',last_error='recipient_or_provider_changed'
        where id=v_row.id;
      return jsonb_build_object('action','review','reason','recipient_or_provider_changed','id',v_row.id);
    end if;
    if v_row.state='sending' and v_row.lease_until>v_now then
      return jsonb_build_object('action','busy','reason','send_in_progress');
    end if;
    -- Never extend the first-attempt window. Leave an hour of margin before
    -- the provider's 24-hour key expiry, and bound attempts independently.
    if v_row.first_attempt_at+interval '23 hours' <= v_now or v_row.attempts>=3 then
      update public.contractor_lifecycle_sends set state='manual_review',last_error='retry_window_or_attempt_limit'
        where id=v_row.id;
      return jsonb_build_object('action','review','reason','retry_window_or_attempt_limit','id',v_row.id);
    end if;
    if v_row.next_retry_at>v_now then return jsonb_build_object('action','busy','reason','retry_backoff'); end if;
    update public.contractor_lifecycle_sends set state='sending',attempts=attempts+1,
      lease_token=v_token,lease_until=v_now+interval '5 minutes',next_retry_at=null
      where id=v_row.id returning * into v_row;
  else
    if exists(select 1 from public.account_events where account_id=p_account_id
      and kind='contractor_lifecycle_email_sent' and meta->>'step_id'=p_step_id) then
      return jsonb_build_object('action','already_sent');
    end if;
    if exists(select 1 from public.contractor_lifecycle_sends where account_id=p_account_id and state='manual_review') then
      return jsonb_build_object('action','review','reason','unresolved_lifecycle_send');
    end if;
    if exists(select 1 from public.contractor_lifecycle_sends where account_id=p_account_id
      and (state in ('sending','retry_wait','manual_review') or accepted_at>v_now-interval '48 hours'))
      or exists(select 1 from public.account_events where account_id=p_account_id
        and kind='contractor_lifecycle_email_sent' and created_at>v_now-interval '48 hours') then
      return jsonb_build_object('action','blocked','reason','lifecycle_cadence_or_unresolved_send');
    end if;
    insert into public.contractor_lifecycle_sends(id,account_id,step_id,recipient,payload,idempotency_key,provider_scope,state,
      first_attempt_at,lease_token,lease_until)
    values(v_id,p_account_id,p_step_id,v_recipient,
      jsonb_set(p_payload,'{tags}',coalesce((select jsonb_agg(tag) from jsonb_array_elements(p_payload->'tags') tag
        where tag->>'name' not in ('lifecycle_send_id','account_id','step','kind')),'[]'::jsonb) || jsonb_build_array(
          jsonb_build_object('name','kind','value','contractor_lifecycle'),
          jsonb_build_object('name','account_id','value',p_account_id::text),
          jsonb_build_object('name','step','value',p_step_id),
          jsonb_build_object('name','lifecycle_send_id','value',v_id::text))),
      'contractor-lifecycle/'||p_account_id::text||'/'||p_step_id,p_provider_scope,'sending',v_now,v_token,v_now+interval '5 minutes')
    returning * into v_row;
  end if;
  return jsonb_build_object('action','send','id',v_row.id,'token',v_row.lease_token,
    'payload',v_row.payload,'key',v_row.idempotency_key,'retry_before',v_row.first_attempt_at+interval '23 hours');
end $$;
revoke all on function public.claim_contractor_lifecycle_send(uuid,text,jsonb,text) from public, anon, authenticated;
grant execute on function public.claim_contractor_lifecycle_send(uuid,text,jsonb,text) to service_role;

create function public.finish_contractor_lifecycle_send(
  p_id uuid,p_account_id uuid,p_token uuid,p_provider_id text default null,p_error text default null
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_row public.contractor_lifecycle_sends;
begin
  select * into v_row from public.contractor_lifecycle_sends where id=p_id and account_id=p_account_id for update;
  if not found then return false; end if;
  if v_row.state='accepted' then return v_row.provider_id=p_provider_id; end if;
  if v_row.state<>'sending' or v_row.lease_token is distinct from p_token then return false; end if;
  if nullif(btrim(p_provider_id),'') is not null then
    update public.contractor_lifecycle_sends set state='accepted',provider_id=p_provider_id,accepted_at=clock_timestamp(),
      lease_token=null,lease_until=null,next_retry_at=null,last_error=null where id=p_id;
  else
    update public.contractor_lifecycle_sends set
      state=case when attempts>=3 or first_attempt_at+interval '23 hours'<=clock_timestamp() then 'manual_review' else 'retry_wait' end,
      lease_token=null,lease_until=null,next_retry_at=clock_timestamp()+interval '5 minutes',
      last_error=left(coalesce(p_error,'provider_outcome_unknown'),2000) where id=p_id;
  end if;
  return true;
end $$;
revoke all on function public.finish_contractor_lifecycle_send(uuid,uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.finish_contractor_lifecycle_send(uuid,uuid,uuid,text,text) to service_role;

-- A signed callback proves provider acceptance even if the send response or
-- its local acknowledgement was lost. It never changes tenant/recipient binding.
create function public.confirm_contractor_lifecycle_send(p_id uuid,p_account_id uuid,p_recipient text,p_provider_id text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_count integer;
begin
  if nullif(btrim(p_provider_id),'') is null then return false; end if;
  update public.contractor_lifecycle_sends set state=case when state='cancelled' then 'cancelled' else 'accepted' end,provider_id=p_provider_id,
    accepted_at=coalesce(accepted_at,clock_timestamp()),lease_token=null,lease_until=null,next_retry_at=null
    where id=p_id and account_id=p_account_id and recipient=lower(btrim(p_recipient))
      and (provider_id is null or provider_id=p_provider_id);
  get diagnostics v_count=row_count;
  return v_count=1;
end $$;
revoke all on function public.confirm_contractor_lifecycle_send(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.confirm_contractor_lifecycle_send(uuid,uuid,text,text) to service_role;

-- Evidence-based operator closeout never creates a fresh send attempt.
create function public.resolve_contractor_lifecycle_send(
  p_id uuid,p_account_id uuid,p_actor text,p_evidence text,p_provider_id text default null
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_count integer;
begin
  if length(btrim(coalesce(p_actor,'')))<3 or length(btrim(coalesce(p_evidence,'')))<20 then
    raise exception 'Operator and verified recovery evidence are required';
  end if;
  update public.contractor_lifecycle_sends set
    state=case when nullif(btrim(p_provider_id),'') is null then 'cancelled' else 'accepted' end,
    provider_id=nullif(btrim(p_provider_id),''),
    accepted_at=case when nullif(btrim(p_provider_id),'') is not null then clock_timestamp() else null end,
    lease_token=null,lease_until=null,next_retry_at=null,resolved_by=left(p_actor,200),
    resolution=left(p_evidence,4000),resolved_at=clock_timestamp()
    where id=p_id and account_id=p_account_id and (state in ('manual_review','retry_wait')
      or (state='sending' and lease_until<=clock_timestamp()));
  get diagnostics v_count=row_count;
  return v_count=1;
end $$;
revoke all on function public.resolve_contractor_lifecycle_send(uuid,uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.resolve_contractor_lifecycle_send(uuid,uuid,text,text,text) to service_role;
notify pgrst, 'reload schema';
