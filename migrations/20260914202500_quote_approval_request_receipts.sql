create table public.quote_approval_request_receipts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  request_id uuid not null,
  payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
  quoted_amount numeric not null,
  event_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  unique(account_id, request_id)
);
create index quote_approval_request_receipts_job_idx on public.quote_approval_request_receipts(job_id);
alter table public.quote_approval_request_receipts enable row level security;
revoke all on public.quote_approval_request_receipts from public,anon,authenticated;
grant select,insert on public.quote_approval_request_receipts to service_role;

create function public.save_client_quote_approval(
  p_account_id uuid,
  p_job_id uuid,
  p_request_id uuid,
  p_payload_hash text,
  p_expected jsonb,
  p_items jsonb,
  p_total numeric,
  p_signature_name text,
  p_signature_path text,
  p_signature_method text,
  p_title text,
  p_body text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  r public.quote_approval_request_receipts;
  j public.jobs;
  event_id uuid := gen_random_uuid();
  v_promoted boolean := false;
begin
  if p_request_id is null or p_payload_hash is null or p_payload_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid approval request'; end if;
  perform pg_advisory_xact_lock(hashtextextended('quote-approval:'||p_account_id::text||':'||p_request_id::text,0));
  
  select * into r from public.quote_approval_request_receipts where account_id=p_account_id and request_id=p_request_id;
  if found then
    if r.payload_hash<>p_payload_hash then raise exception 'Request has different content'; end if;
    return jsonb_build_object('event_id',r.event_id,'replayed',true,'promoted',false,'leadWon',false);
  end if;

  select * into j from public.jobs where id=p_job_id and account_id=p_account_id for update;
  if not found then raise exception 'Quote unavailable'; end if;
  if jsonb_build_object('quote_items',j.quote_items,'quoted_amount',j.quoted_amount) is distinct from p_expected then
    raise exception 'Quote changed; refresh before approving';
  end if;

  if p_items is not null then
    update public.jobs set quote_items=p_items, quoted_amount=p_total where id=p_job_id and account_id=p_account_id;
  end if;

  if p_signature_name is not null and nullif(btrim(p_signature_name),'') is not null and j.quote_signed_at is null then
    update public.jobs set quote_signer_name=p_signature_name, quote_signed_at=clock_timestamp(), quote_signature_path=p_signature_path, quote_signature_method=p_signature_method
      where id=p_job_id and account_id=p_account_id;
  end if;

  if j.status = 'new_lead' then
    update public.jobs set status='in_progress' where id=p_job_id and account_id=p_account_id;
    v_promoted := true;
  end if;

  insert into public.job_feed(id,account_id,job_id,kind,title,body,visibility,amount,author,source_table,source_id,published_at,meta)
    values(event_id,p_account_id,p_job_id,'quote_approved',p_title,p_body,'client',p_total,'Client','jobs',p_job_id,clock_timestamp(),jsonb_build_object('owner_email_notice','quote_approval_v1','acceptance_source','client_link'));

  insert into public.quote_approval_request_receipts(account_id,job_id,request_id,payload_hash,quoted_amount,event_id)
    values(p_account_id,p_job_id,p_request_id,p_payload_hash,p_total,event_id);

  return jsonb_build_object('event_id',event_id,'replayed',false,'promoted',v_promoted,'leadWon',false);
end $$;
revoke all on function public.save_client_quote_approval(uuid,uuid,uuid,text,jsonb,jsonb,numeric,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.save_client_quote_approval(uuid,uuid,uuid,text,jsonb,jsonb,numeric,text,text,text,text,text) to service_role;
notify pgrst,'reload schema';
