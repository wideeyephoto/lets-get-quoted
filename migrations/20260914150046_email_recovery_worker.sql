-- Recovery is opt-in, restricted to an explicit cohort and fenced per run.
create table public.email_recovery_control (
  id boolean primary key default true check(id),
  enabled boolean not null default false,
  account_ids uuid[] not null default '{}',
  run_token uuid, lease_until timestamptz,
  cooldown_until timestamptz,
  check(cardinality(account_ids)<=100)
);
insert into public.email_recovery_control(id) values(true);
alter table public.email_recovery_control enable row level security;
revoke all on public.email_recovery_control from public,anon,authenticated;
grant select,update on public.email_recovery_control to service_role;

create function public.begin_email_recovery_run() returns uuid
language plpgsql security invoker set search_path='' as $$
declare v_token uuid;
begin
  update public.email_recovery_control set run_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '3 minutes'
    where id and enabled and cardinality(account_ids)>0
      and (lease_until is null or lease_until<=clock_timestamp())
      and (cooldown_until is null or cooldown_until<=clock_timestamp()) returning run_token into v_token;
  return v_token;
end $$;

create function public.email_recovery_can_submit(p_run_token uuid,p_account_id uuid) returns boolean
language sql stable security invoker set search_path='' as $$
  select exists(select 1 from public.email_recovery_control where id and enabled and run_token=p_run_token
    and lease_until>now() and p_account_id=any(account_ids) and (cooldown_until is null or cooldown_until<=now()));
$$;

create function public.end_email_recovery_run(p_run_token uuid) returns void
language sql security invoker set search_path='' as $$
  update public.email_recovery_control set run_token=null,lease_until=null where id and run_token=p_run_token;
$$;

-- Final read immediately before each HTTP request, including after pacing/fallback.
create function public.validate_email_recovery_submission(p_source text,p_id uuid,p_token uuid,p_run_token uuid)
returns boolean language plpgsql stable security invoker set search_path='' as $$
declare d public.document_email_sends; l public.contractor_lifecycle_sends;
begin
  if p_source='document' then
    select * into d from public.document_email_sends where id=p_id and state='sending' and lease_token=p_token
      and lease_until>now() and first_attempt_at+interval '23 hours'>now();
    if not found or not public.email_recovery_can_submit(p_run_token,d.account_id) then return false; end if;
    return exists(select 1 from public.jobs j join public.accounts a on a.id=j.account_id
      where j.id=d.job_id and j.account_id=d.account_id and j.deleted_at is null and a.suspended_at is null and a.test_marker is null
        and lower(btrim(j.client_email))=d.recipient and j.document_email_revision::text=split_part(d.revision,'/',1))
      and (d.invoice_id is null or exists(select 1 from public.invoices i where i.id=d.invoice_id and i.account_id=d.account_id
        and i.job_id=d.job_id and i.status not in ('paid','void') and i.document_email_revision::text=split_part(d.revision,'/',2)))
      and not exists(select 1 from public.email_suppression s where s.account_id=d.account_id and lower(s.email)=d.recipient
        and s.reason in ('hard_bounce','complaint','provider_suppressed'));
  elsif p_source='lifecycle' then
    select * into l from public.contractor_lifecycle_sends where id=p_id and state='sending' and lease_token=p_token
      and lease_until>now() and first_attempt_at+interval '23 hours'>now();
    if not found or not public.email_recovery_can_submit(p_run_token,l.account_id) then return false; end if;
    return exists(select 1 from public.accounts a where a.id=l.account_id and a.suspended_at is null and a.test_marker is null
        and (l.step_id not in ('nudge_incomplete_stripe','stripe_payout_day4') or a.connect_onboarded is distinct from true))
      and exists(select 1 from public.owner_emails_for_accounts(array[l.account_id]) o where lower(btrim(o.email))=l.recipient)
      and not exists(select 1 from public.email_suppression s where s.account_id=l.account_id and lower(s.email)=l.recipient)
      and (l.step_id<>'nudge_zero_quotes' or not exists(select 1 from public.jobs j where j.account_id=l.account_id and j.quoted_amount>0));
  end if;
  return false;
end $$;

-- Preview uses this read-only selection too. It never claims or writes a heartbeat.
create function public.due_email_recovery_work(p_limit integer default 20)
returns table(source text,send_id uuid,account_id uuid,work text)
language sql stable security invoker set search_path='' as $$
  with candidates as (
    select 'document'::text source,s.id send_id,s.account_id,s.first_attempt_at,
      case when s.first_attempt_at+interval '23 hours'<=now() or s.attempts>=3 then 'review' else 'resume' end work
    from public.document_email_sends s,public.email_recovery_control c
    where c.id and s.account_id=any(c.account_ids) and
      ((s.state='retry_wait' and coalesce(s.next_retry_at,s.first_attempt_at)<=now()) or (s.state='sending' and s.lease_until<=now()))
    union all
    select 'lifecycle',s.id,s.account_id,s.first_attempt_at,
      case when s.first_attempt_at+interval '23 hours'<=now() or s.attempts>=3 then 'review' else 'resume' end
    from public.contractor_lifecycle_sends s,public.email_recovery_control c
    where c.id and s.account_id=any(c.account_ids) and
      ((s.state='retry_wait' and coalesce(s.next_retry_at,s.first_attempt_at)<=now()) or (s.state='sending' and s.lease_until<=now()))
    union all
    select 'document',s.id,s.account_id,s.first_attempt_at,'reconcile'
    from public.document_email_sends s
    join public.invoices i on i.id=s.invoice_id and i.account_id=s.account_id and i.job_id=s.job_id
    join public.jobs j on j.id=s.job_id and j.account_id=s.account_id
    join public.email_recovery_control c on c.id and s.account_id=any(c.account_ids)
    where s.state='accepted' and i.status='draft' and j.deleted_at is null
      and s.revision=j.document_email_revision::text||'/'||i.document_email_revision::text
  ) select source,send_id,account_id,work from candidates
    order by case when source='document' then 0 else 1 end,first_attempt_at,send_id limit least(greatest(p_limit,1),20);
$$;

create function public.claim_email_recovery_send(p_source text,p_id uuid,p_run_token uuid,p_provider_scope text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.document_email_sends; l public.contractor_lifecycle_sends; v_result jsonb; v_account uuid;
begin
  -- Keep lock ordering consistent: control, parent, then intent. Never recreate a missing intent.
  perform 1 from public.email_recovery_control where id for update;
  if p_source='document' then
    select * into d from public.document_email_sends where id=p_id;
    if not found then return jsonb_build_object('action','blocked','reason','missing'); end if;
    v_account:=d.account_id;
  elsif p_source='lifecycle' then
    select * into l from public.contractor_lifecycle_sends where id=p_id;
    if not found then return jsonb_build_object('action','blocked','reason','missing'); end if;
    v_account:=l.account_id;
  else raise exception 'Invalid recovery source'; end if;
  if not public.email_recovery_can_submit(p_run_token,v_account) then return jsonb_build_object('action','busy','reason','paused'); end if;
  if p_source='document' then
    perform 1 from public.jobs where id=d.job_id for update;
    select * into d from public.document_email_sends where id=p_id for update;
    if not found then return jsonb_build_object('action','blocked','reason','missing'); end if;
    if d.state not in ('sending','retry_wait') then return jsonb_build_object('action','blocked','reason',d.state); end if;
    if d.lease_until>clock_timestamp() or d.next_retry_at>clock_timestamp() then return jsonb_build_object('action','busy'); end if;
    if d.first_attempt_at+interval '23 hours'<=clock_timestamp() or d.attempts>=3 then
      v_result:=jsonb_build_object('action','review','reason','retry_window_or_attempt_limit');
    else
      v_result:=public.claim_document_email_send(d.account_id,d.job_id,d.invoice_id,
        split_part(d.revision,'/',1)::uuid,nullif(split_part(d.revision,'/',2),'')::uuid,d.payload,p_provider_scope);
    end if;
    if v_result->>'action' in ('blocked','review') then
      update public.document_email_sends set state='manual_review',last_error=coalesce(v_result->>'reason','recovery_ineligible'),
        lease_token=null,lease_until=null,next_retry_at=null where id=p_id and state in ('sending','retry_wait');
    end if;
  else
    perform 1 from public.accounts where id=l.account_id for update;
    select * into l from public.contractor_lifecycle_sends where id=p_id for update;
    if not found then return jsonb_build_object('action','blocked','reason','missing'); end if;
    if l.state not in ('sending','retry_wait') then return jsonb_build_object('action','blocked','reason',l.state); end if;
    if l.lease_until>clock_timestamp() or l.next_retry_at>clock_timestamp() then return jsonb_build_object('action','busy'); end if;
    if l.first_attempt_at+interval '23 hours'<=clock_timestamp() or l.attempts>=3 then
      v_result:=jsonb_build_object('action','review','reason','retry_window_or_attempt_limit');
    else
      v_result:=public.claim_contractor_lifecycle_send(l.account_id,l.step_id,l.payload,p_provider_scope);
    end if;
    if v_result->>'action' in ('blocked','review') then
      update public.contractor_lifecycle_sends set state='manual_review',last_error=coalesce(v_result->>'reason','recovery_ineligible'),
        lease_token=null,lease_until=null,next_retry_at=null where id=p_id and state in ('sending','retry_wait');
    end if;
  end if;
  return v_result||jsonb_build_object('account_id',v_account);
end $$;

-- Finish and classify under one transaction so another claimant cannot race classification.
create function public.finish_email_recovery_send(p_source text,p_id uuid,p_account_id uuid,p_token uuid,
  p_provider_id text,p_error text,p_error_name text,p_retry_seconds integer,p_run_token uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare v_ok boolean; v_terminal boolean; v_cooldown boolean; v_delay integer;
begin
  perform 1 from public.email_recovery_control where id for update;
  v_terminal:=coalesce(p_error_name,'') in ('validation_error','missing_required_field','missing_required_parameter','invalid_parameter','invalid_access',
    'invalid_idempotency_key','invalid_idempotent_request','invalid_attachment','not_found','method_not_allowed',
    'restricted_api_key','invalid_api_key','missing_api_key','suspended_api_key','invalid_permission',
    'http_400','http_401','http_403','http_404','http_405','http_422');
  v_cooldown:=coalesce(p_error_name,'') in ('rate_limit_exceeded','daily_quota_exceeded','monthly_quota_exceeded','http_429');
  v_delay:=least(82800,greatest(case when p_error_name in ('daily_quota_exceeded','monthly_quota_exceeded') then 3600 else 300 end,coalesce(p_retry_seconds,0)));
  if p_source='document' then
    v_ok:=public.finish_document_email_send(p_id,p_account_id,p_token,p_provider_id,p_error);
    if v_ok and p_provider_id is null then
      update public.document_email_sends set state=case when v_terminal then 'manual_review' else state end,
        next_retry_at=case when v_terminal then null else clock_timestamp()+make_interval(secs=>v_delay) end
        where id=p_id and account_id=p_account_id and state in ('retry_wait','manual_review');
    end if;
  elsif p_source='lifecycle' then
    v_ok:=public.finish_contractor_lifecycle_send(p_id,p_account_id,p_token,p_provider_id,p_error);
    if v_ok and p_provider_id is null then
      update public.contractor_lifecycle_sends set state=case when v_terminal then 'manual_review' else state end,
        next_retry_at=case when v_terminal then null else clock_timestamp()+make_interval(secs=>v_delay) end
        where id=p_id and account_id=p_account_id and state in ('retry_wait','manual_review');
    end if;
  else raise exception 'Invalid recovery source'; end if;
  if v_ok and p_provider_id is null and v_cooldown then
    update public.email_recovery_control set cooldown_until=clock_timestamp()+make_interval(secs=>v_delay)
      where id and run_token=p_run_token;
  end if;
  if v_ok and p_provider_id is null and p_error_name in ('invalid_access','restricted_api_key','invalid_api_key',
    'missing_api_key','suspended_api_key','invalid_permission','http_401','http_403','daily_quota_exceeded','monthly_quota_exceeded') then
    update public.email_recovery_control set enabled=false where id and run_token=p_run_token;
  end if;
  return v_ok;
end $$;

create function public.reconcile_email_recovery_acceptance(p_id uuid,p_run_token uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
declare d public.document_email_sends; j public.jobs; v_count integer;
begin
  perform 1 from public.email_recovery_control where id for update;
  select * into d from public.document_email_sends where id=p_id;
  if not found or not public.email_recovery_can_submit(p_run_token,d.account_id) then return false; end if;
  select * into j from public.jobs where id=d.job_id and account_id=d.account_id and deleted_at is null for update;
  if not found then return false; end if;
  -- Only an accepted, unchanged draft invoice has business state to repair here.
  -- Paid/void invoices, quotes, owner receipts and payment effects remain untouched.
  update public.invoices i set status='sent' where i.id=d.invoice_id and i.job_id=j.id and i.account_id=d.account_id
    and i.status='draft' and d.revision=j.document_email_revision::text||'/'||i.document_email_revision::text
    and exists(select 1 from public.document_email_sends s where s.id=p_id and s.state='accepted' and s.provider_id is not null);
  get diagnostics v_count=row_count;
  return v_count=1;
end $$;

revoke all on function public.begin_email_recovery_run(),public.email_recovery_can_submit(uuid,uuid),
  public.validate_email_recovery_submission(text,uuid,uuid,uuid),
  public.end_email_recovery_run(uuid),public.due_email_recovery_work(integer),
  public.claim_email_recovery_send(text,uuid,uuid,text),public.finish_email_recovery_send(text,uuid,uuid,uuid,text,text,text,integer,uuid),
  public.reconcile_email_recovery_acceptance(uuid,uuid) from public,anon,authenticated;
grant execute on function public.begin_email_recovery_run(),public.email_recovery_can_submit(uuid,uuid),
  public.validate_email_recovery_submission(text,uuid,uuid,uuid),
  public.end_email_recovery_run(uuid),public.due_email_recovery_work(integer),
  public.claim_email_recovery_send(text,uuid,uuid,text),public.finish_email_recovery_send(text,uuid,uuid,uuid,text,text,text,integer,uuid),
  public.reconcile_email_recovery_acceptance(uuid,uuid) to service_role;
notify pgrst,'reload schema';
