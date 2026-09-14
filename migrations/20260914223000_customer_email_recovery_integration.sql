-- Customer email recovery integration: callback confirmation, operator resolution, recovery work selection, and monitoring
create or replace function public.confirm_customer_email_send(p_id uuid,p_account_id uuid,p_recipient text,p_provider_id text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_count integer;
begin
  if nullif(btrim(p_provider_id),'') is null then return false; end if;
  update public.customer_email_sends set state=case when state='cancelled' then 'cancelled' else 'accepted' end,provider_id=p_provider_id,
    accepted_at=coalesce(accepted_at,clock_timestamp()),lease_token=null,lease_until=null,next_retry_at=null
    where id=p_id and account_id=p_account_id and recipient=lower(btrim(p_recipient))
      and (provider_id is null or provider_id=p_provider_id);
  get diagnostics v_count=row_count;
  return v_count=1;
end $$;
revoke all on function public.confirm_customer_email_send(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.confirm_customer_email_send(uuid,uuid,text,text) to service_role;

create or replace function public.resolve_customer_email_send(
  p_id uuid,p_account_id uuid,p_actor text,p_evidence text,p_provider_id text default null
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_count integer;
begin
  if length(btrim(coalesce(p_actor,'')))<3 or length(btrim(coalesce(p_evidence,'')))<20 then
    raise exception 'Operator and verified recovery evidence are required';
  end if;
  update public.customer_email_sends set
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
revoke all on function public.resolve_customer_email_send(uuid,uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.resolve_customer_email_send(uuid,uuid,text,text,text) to service_role;

create or replace function public.email_send_recovery_queue(p_now timestamptz default now())
returns table(source text,send_id uuid,account_id uuid,kind text,state text,phase text,attempts integer,
  first_attempt_at timestamptz,retry_before timestamptz,reason text)
language sql stable security invoker set search_path='' as $$
  with sends as (
    select 'lifecycle'::text as source,id as send_id,account_id,step_id as kind,state,'primary'::text as phase,
      attempts,first_attempt_at,lease_until,next_retry_at
    from public.contractor_lifecycle_sends where state in ('sending','retry_wait','manual_review')
    union all
    select 'document',id,account_id,kind,state,phase,attempts,first_attempt_at,lease_until,next_retry_at
    from public.document_email_sends where state in ('sending','retry_wait','manual_review')
    union all
    select 'customer',id,account_id,kind,state,phase,attempts,first_attempt_at,lease_until,next_retry_at
    from public.customer_email_sends where state in ('sending','retry_wait','manual_review')
  ), classified as (
    select source,send_id,account_id,kind,state,phase,attempts,first_attempt_at,
      first_attempt_at+interval '23 hours' as retry_before,
      case when state='manual_review' then 'manual_review'
        when first_attempt_at+interval '23 hours'<=p_now then 'retry_window_expired'
        when state='sending' and lease_until>p_now then null
        when attempts>=3 then 'attempt_limit'
        when state='sending' and lease_until<=p_now-interval '5 minutes' then 'worker_stalled'
        when state='retry_wait' and coalesce(next_retry_at,first_attempt_at)<=p_now-interval '10 minutes' then 'retry_overdue'
        else null end as reason
    from sends
  )
  select * from classified where reason is not null order by first_attempt_at,source,send_id;
$$;
revoke all on function public.email_send_recovery_queue(timestamptz) from public,anon,authenticated;
grant execute on function public.email_send_recovery_queue(timestamptz) to service_role;

create or replace function public.due_email_recovery_work(p_limit integer default 20)
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
    select 'customer',s.id,s.account_id,s.first_attempt_at,
      case when s.first_attempt_at+interval '23 hours'<=now() or s.attempts>=3 then 'review' else 'resume' end
    from public.customer_email_sends s,public.email_recovery_control c
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
    order by case when source='document' then 0 when source='customer' then 1 else 2 end,first_attempt_at,send_id limit least(greatest(p_limit,1),20);
$$;
revoke all on function public.due_email_recovery_work(integer) from public,anon,authenticated;
grant execute on function public.due_email_recovery_work(integer) to service_role;

create or replace function public.claim_email_recovery_send(p_source text,p_id uuid,p_run_token uuid,p_provider_scope text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.document_email_sends; l public.contractor_lifecycle_sends; c public.customer_email_sends; v_result jsonb; v_account uuid;
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
  elsif p_source='customer' then
    select * into c from public.customer_email_sends where id=p_id;
    if not found then return jsonb_build_object('action','blocked','reason','missing'); end if;
    v_account:=c.account_id;
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
  elsif p_source='lifecycle' then
    select * into l from public.contractor_lifecycle_sends where id=p_id for update;
    if not found then return jsonb_build_object('action','blocked','reason','missing'); end if;
    if l.state not in ('sending','retry_wait') then return jsonb_build_object('action','blocked','reason',l.state); end if;
    if l.lease_until>clock_timestamp() or l.next_retry_at>clock_timestamp() then return jsonb_build_object('action','busy'); end if;
    if l.first_attempt_at+interval '23 hours'<=clock_timestamp() or l.attempts>=3 then
      v_result:=jsonb_build_object('action','review','reason','retry_window_or_attempt_limit');
    else
      v_result:=public.claim_contractor_lifecycle_send(l.account_id,l.step_id,l.payload,p_provider_scope);
    end if;
  elsif p_source='customer' then
    if c.job_id is not null then
      perform 1 from public.jobs where id=c.job_id for update;
    end if;
    select * into c from public.customer_email_sends where id=p_id for update;
    if not found then return jsonb_build_object('action','blocked','reason','missing'); end if;
    if c.state not in ('sending','retry_wait') then return jsonb_build_object('action','blocked','reason',c.state); end if;
    if c.lease_until>clock_timestamp() or c.next_retry_at>clock_timestamp() then return jsonb_build_object('action','busy'); end if;
    if c.first_attempt_at+interval '23 hours'<=clock_timestamp() or c.attempts>=3 then
      v_result:=jsonb_build_object('action','review','reason','retry_window_or_attempt_limit');
    else
      v_result:=public.claim_customer_email_send(c.account_id,c.kind,c.idempotency_key,c.payload,p_provider_scope,c.job_id);
    end if;
  end if;
  return v_result||jsonb_build_object('account_id',v_account);
end $$;
revoke all on function public.claim_email_recovery_send(text,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.claim_email_recovery_send(text,uuid,uuid,text) to service_role;

create or replace function public.finish_email_recovery_send(p_source text,p_id uuid,p_account_id uuid,p_token uuid,
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
  elsif p_source='customer' then
    v_ok:=public.finish_customer_email_send(p_id,p_account_id,p_token,p_provider_id,p_error);
    if v_ok and p_provider_id is null then
      update public.customer_email_sends set state=case when v_terminal then 'manual_review' else state end,
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
revoke all on function public.finish_email_recovery_send(text,uuid,uuid,uuid,text,text,text,integer,uuid) from public,anon,authenticated;
grant execute on function public.finish_email_recovery_send(text,uuid,uuid,uuid,text,text,text,integer,uuid) to service_role;
notify pgrst,'reload schema';
