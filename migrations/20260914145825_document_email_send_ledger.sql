-- Saved revisions exclude generated links/PDF metadata and harmless status writes.
alter table public.jobs add column document_email_revision uuid not null default gen_random_uuid();
alter table public.invoices add column document_email_revision uuid not null default gen_random_uuid();

create function public.bump_job_email_revision() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  new.document_email_revision := case when
    row(new.client_name,new.client_email,new.ref,new.scope,new.quoted_amount,new.quote_items)
      is distinct from row(old.client_name,old.client_email,old.ref,old.scope,old.quoted_amount,old.quote_items)
    then gen_random_uuid() else old.document_email_revision end;
  return new;
end $$;
create trigger job_email_revision before update on public.jobs for each row execute function public.bump_job_email_revision();

create function public.bump_invoice_email_revision() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  new.document_email_revision := case when
    row(new.ref,new.total,new.discount_percent,new.tax_rate,new.job_id)
      is distinct from row(old.ref,old.total,old.discount_percent,old.tax_rate,old.job_id)
    or (pg_trigger_depth()>1 and new.document_email_revision is distinct from old.document_email_revision)
    then gen_random_uuid() else old.document_email_revision end;
  return new;
end $$;
create trigger invoice_email_revision before update on public.invoices for each row execute function public.bump_invoice_email_revision();

create function public.touch_invoice_email_revision() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='UPDATE' and row(new.invoice_id,new.description,new.amount,new.sort_order)
    is not distinct from row(old.invoice_id,old.description,old.amount,old.sort_order) then return new; end if;
  if tg_op in ('UPDATE','DELETE') then
    update public.invoices set document_email_revision=gen_random_uuid() where id=old.invoice_id;
  end if;
  if tg_op='INSERT' or (tg_op='UPDATE' and new.invoice_id<>old.invoice_id) then
    update public.invoices set document_email_revision=gen_random_uuid() where id=new.invoice_id;
  end if;
  return null;
end $$;
create trigger invoice_item_email_revision after insert or update or delete on public.invoice_items
  for each row execute function public.touch_invoice_email_revision();
revoke all on function public.bump_job_email_revision(), public.bump_invoice_email_revision(), public.touch_invoice_email_revision() from public,anon,authenticated;

create table public.document_email_sends (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  invoice_id uuid references public.invoices(id) on delete cascade,
  kind text not null check(kind in ('client_quote','invoice')),
  document_id uuid not null,
  revision text not null,
  recipient text not null,
  payload jsonb not null,
  fallback_payload jsonb,
  provider_scope text not null,
  state text not null check(state in ('sending','retry_wait','accepted','manual_review','cancelled')),
  phase text not null default 'primary' check(phase in ('primary','fallback')),
  first_attempt_at timestamptz not null default now(),
  attempts integer not null default 1 check(attempts between 1 and 3),
  lease_token uuid,
  lease_until timestamptz,
  next_retry_at timestamptz,
  provider_id text unique,
  accepted_at timestamptz,
  last_error text,
  resolved_by text,
  resolution text,
  resolved_at timestamptz,
  unique(account_id,kind,document_id,revision),
  check((kind='invoice' and invoice_id is not null and invoice_id=document_id) or (kind='client_quote' and invoice_id is null and job_id=document_id)),
  check(state<>'sending' or (lease_token is not null and lease_until is not null)),
  check(state<>'accepted' or (provider_id is not null and accepted_at is not null)),
  check(phase<>'fallback' or fallback_payload is not null)
);
alter table public.document_email_sends enable row level security;
revoke all on public.document_email_sends from public,anon,authenticated;
grant select,insert,update,delete on public.document_email_sends to service_role;
create index document_email_sends_job_idx on public.document_email_sends(job_id);
create index document_email_sends_invoice_idx on public.document_email_sends(invoice_id) where invoice_id is not null;
create index document_email_sends_attention_idx on public.document_email_sends(state,first_attempt_at)
  where state in ('sending','retry_wait','manual_review');

create function public.claim_document_email_send(
  p_account_id uuid,p_job_id uuid,p_invoice_id uuid,p_job_revision uuid,p_invoice_revision uuid,
  p_payload jsonb,p_provider_scope text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  v_job public.jobs;
  v_invoice public.invoices;
  v_row public.document_email_sends;
  v_kind text := case when p_invoice_id is null then 'client_quote' else 'invoice' end;
  v_document uuid := coalesce(p_invoice_id,p_job_id);
  v_revision text;
  v_to text := lower(btrim(p_payload->>'to'));
  v_id uuid := gen_random_uuid();
  v_token uuid := gen_random_uuid();
  v_now timestamptz;
begin
  if p_job_revision is null or jsonb_typeof(p_payload->'to') is distinct from 'string'
    or coalesce(v_to,'')='' or jsonb_typeof(p_payload->'tags') is distinct from 'array'
    or p_provider_scope is null or p_provider_scope !~ '^[a-f0-9]{64}$' then raise exception 'Invalid document email intent'; end if;
  -- Serialize document claims and reject cross-workspace or stale source data.
  select * into v_job from public.jobs where id=p_job_id and account_id=p_account_id and deleted_at is null for update;
  if not found then return jsonb_build_object('action','blocked','reason','document_unavailable'); end if;
  if not exists(select 1 from public.accounts where id=p_account_id and suspended_at is null and test_marker is null) then
    return jsonb_build_object('action','blocked','reason','account_ineligible'); end if;
  if v_job.document_email_revision<>p_job_revision or lower(btrim(v_job.client_email)) is distinct from v_to then
    return jsonb_build_object('action','blocked','reason','document_or_recipient_changed'); end if;
  v_revision := p_job_revision::text;
  if p_invoice_id is not null then
    select * into v_invoice from public.invoices where id=p_invoice_id and account_id=p_account_id and job_id=p_job_id for update;
    if not found or p_invoice_revision is null or v_invoice.document_email_revision<>p_invoice_revision then
      return jsonb_build_object('action','blocked','reason','invoice_changed_or_unavailable'); end if;
    if v_invoice.status in ('paid','void') then return jsonb_build_object('action','blocked','reason','invoice_closed'); end if;
    v_revision := v_revision||'/'||p_invoice_revision::text;
  end if;
  -- Marketing opt-outs do not block these requested transactional documents.
  if exists(select 1 from public.email_suppression where account_id=p_account_id and lower(email)=v_to
    and reason in ('hard_bounce','complaint','provider_suppressed')) then
    return jsonb_build_object('action','blocked','reason','recipient_delivery_block'); end if;
  v_now := clock_timestamp();
  update public.document_email_sends set state='manual_review',last_error='retry_window_expired'
    where account_id=p_account_id and kind=v_kind and document_id=v_document
      and state in ('sending','retry_wait') and first_attempt_at+interval '23 hours'<=v_now;
  select * into v_row from public.document_email_sends where account_id=p_account_id
    and kind=v_kind and document_id=v_document and revision=v_revision for update;
  if found then
    if v_row.state='accepted' then return jsonb_build_object('action','already_sent','provider_id',v_row.provider_id); end if;
    if v_row.state in ('manual_review','cancelled') then return jsonb_build_object('action','review','id',v_row.id,'reason',v_row.state); end if;
    if v_row.provider_scope<>p_provider_scope then
      update public.document_email_sends set state='manual_review',last_error='provider_credential_changed' where id=v_row.id;
      return jsonb_build_object('action','review','id',v_row.id,'reason','provider_credential_changed'); end if;
    if v_row.state='sending' and v_row.lease_until>v_now or v_row.next_retry_at>v_now then
      return jsonb_build_object('action','busy','reason','send_in_progress_or_backoff'); end if;
    if v_row.attempts>=3 then
      update public.document_email_sends set state='manual_review',last_error='attempt_limit' where id=v_row.id;
      return jsonb_build_object('action','review','id',v_row.id,'reason','attempt_limit'); end if;
    update public.document_email_sends set state='sending',attempts=attempts+1,lease_token=v_token,
      lease_until=v_now+interval '5 minutes',next_retry_at=null where id=v_row.id returning * into v_row;
  else
    -- Editing a document cannot sidestep an unresolved provider outcome.
    if exists(select 1 from public.document_email_sends where account_id=p_account_id and kind=v_kind
      and document_id=v_document and state in ('sending','retry_wait','manual_review')) then
      return jsonb_build_object('action','review','reason','previous_revision_unresolved'); end if;
    insert into public.document_email_sends(id,account_id,job_id,invoice_id,kind,document_id,revision,recipient,payload,
      provider_scope,state,first_attempt_at,lease_token,lease_until)
    values(v_id,p_account_id,p_job_id,p_invoice_id,v_kind,v_document,v_revision,v_to,
      jsonb_set(p_payload,'{tags}',coalesce((select jsonb_agg(tag) from jsonb_array_elements(p_payload->'tags') tag
        where tag->>'name' not in ('document_send_id','send_phase','account_id','kind')),'[]'::jsonb)||jsonb_build_array(
          jsonb_build_object('name','kind','value',v_kind),jsonb_build_object('name','account_id','value',p_account_id::text),
          jsonb_build_object('name','document_send_id','value',v_id::text),jsonb_build_object('name','send_phase','value','primary'))),
      p_provider_scope,'sending',v_now,v_token,v_now+interval '5 minutes') returning * into v_row;
  end if;
  return jsonb_build_object('action','send','id',v_row.id,'token',v_row.lease_token,'phase',v_row.phase,
    'payload',case when v_row.phase='fallback' then v_row.fallback_payload else v_row.payload end,
    'key','document-email/'||v_row.id::text||'/'||v_row.phase,'retry_before',v_row.first_attempt_at+interval '23 hours');
end $$;
revoke all on function public.claim_document_email_send(uuid,uuid,uuid,uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.claim_document_email_send(uuid,uuid,uuid,uuid,uuid,jsonb,text) to service_role;

-- Advance only after a definitive rejection of the exact original From domain.
-- The durable phase survives crashes; retries never switch back to primary.
create function public.fallback_document_email_send(p_id uuid,p_account_id uuid,p_token uuid,p_error_name text,p_error_message text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_row public.document_email_sends; v_address text; v_domain text; v_rejected text; v_from text; v_payload jsonb;
begin
  select * into v_row from public.document_email_sends where id=p_id and account_id=p_account_id for update;
  if not found or v_row.state<>'sending' or v_row.phase<>'primary' or v_row.lease_token is distinct from p_token
    or v_row.lease_until<=clock_timestamp() or v_row.first_attempt_at+interval '23 hours'<=clock_timestamp()
    or p_error_name is distinct from 'validation_error' then return null; end if;
  if not exists(select 1 from public.accounts a join public.jobs j on j.account_id=a.id
      where a.id=p_account_id and a.suspended_at is null and a.test_marker is null and j.id=v_row.job_id and j.deleted_at is null
        and j.document_email_revision::text=split_part(v_row.revision,'/',1)
        and lower(btrim(j.client_email))=v_row.recipient)
    or (v_row.invoice_id is not null and not exists(select 1 from public.invoices i where i.id=v_row.invoice_id
      and i.account_id=p_account_id and i.job_id=v_row.job_id and i.status not in ('paid','void')
      and i.document_email_revision::text=split_part(v_row.revision,'/',2)))
    or exists(select 1 from public.email_suppression where account_id=p_account_id and lower(email)=v_row.recipient
      and reason in ('hard_bounce','complaint','provider_suppressed')) then return null; end if;
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
  update public.document_email_sends set phase='fallback',fallback_payload=v_payload,last_error=left(p_error_message,2000) where id=p_id;
  return jsonb_build_object('action','send','id',v_row.id,'token',v_row.lease_token,'phase','fallback','payload',v_payload,
    'key','document-email/'||v_row.id::text||'/fallback','retry_before',v_row.first_attempt_at+interval '23 hours');
end $$;
revoke all on function public.fallback_document_email_send(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.fallback_document_email_send(uuid,uuid,uuid,text,text) to service_role;

create function public.finish_document_email_send(p_id uuid,p_account_id uuid,p_token uuid,p_provider_id text default null,p_error text default null)
returns boolean language plpgsql security invoker set search_path='' as $$
declare v_row public.document_email_sends;
begin
  select * into v_row from public.document_email_sends where id=p_id and account_id=p_account_id for update;
  if not found then return false; end if;
  if v_row.state='accepted' then return v_row.provider_id=p_provider_id; end if;
  if v_row.state<>'sending' or v_row.lease_token is distinct from p_token then return false; end if;
  if nullif(btrim(p_provider_id),'') is not null then
    update public.document_email_sends set state='accepted',provider_id=p_provider_id,accepted_at=clock_timestamp(),
      lease_token=null,lease_until=null,next_retry_at=null,last_error=null where id=p_id;
  else
    update public.document_email_sends set state=case when attempts>=3 or first_attempt_at+interval '23 hours'<=clock_timestamp()
      then 'manual_review' else 'retry_wait' end,lease_token=null,lease_until=null,next_retry_at=clock_timestamp()+interval '5 minutes',
      last_error=left(coalesce(p_error,'provider_outcome_unknown'),2000) where id=p_id;
  end if;
  return true;
end $$;
revoke all on function public.finish_document_email_send(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.finish_document_email_send(uuid,uuid,uuid,text,text) to service_role;

create function public.confirm_document_email_send(p_id uuid,p_account_id uuid,p_recipient text,p_provider_id text,p_phase text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare v_count integer;
begin
  if nullif(btrim(p_provider_id),'') is null then return false; end if;
  update public.document_email_sends set state=case when state='cancelled' then 'cancelled' else 'accepted' end,
    provider_id=p_provider_id,accepted_at=coalesce(accepted_at,clock_timestamp()),lease_token=null,lease_until=null,next_retry_at=null
    where id=p_id and account_id=p_account_id and recipient=lower(btrim(p_recipient)) and phase=p_phase
      and (provider_id is null or provider_id=p_provider_id);
  get diagnostics v_count=row_count;
  return v_count=1;
end $$;
revoke all on function public.confirm_document_email_send(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.confirm_document_email_send(uuid,uuid,text,text,text) to service_role;

create function public.resolve_document_email_send(p_id uuid,p_account_id uuid,p_actor text,p_evidence text,p_provider_id text default null)
returns boolean language plpgsql security invoker set search_path='' as $$
declare v_count integer;
begin
  if length(btrim(coalesce(p_actor,'')))<3 or length(btrim(coalesce(p_evidence,'')))<20 then
    raise exception 'Operator and verified recovery evidence are required'; end if;
  update public.document_email_sends set state=case when nullif(btrim(p_provider_id),'') is null then 'cancelled' else 'accepted' end,
    provider_id=nullif(btrim(p_provider_id),''),accepted_at=case when nullif(btrim(p_provider_id),'') is not null then clock_timestamp() else null end,
    lease_token=null,lease_until=null,next_retry_at=null,resolved_by=left(p_actor,200),resolution=left(p_evidence,4000),resolved_at=clock_timestamp()
    where id=p_id and account_id=p_account_id and (state in ('manual_review','retry_wait') or (state='sending' and lease_until<=clock_timestamp()));
  get diagnostics v_count=row_count;
  return v_count=1;
end $$;
revoke all on function public.resolve_document_email_send(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.resolve_document_email_send(uuid,uuid,text,text,text) to service_role;
notify pgrst,'reload schema';
