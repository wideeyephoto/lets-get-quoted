-- Request receipts survive feed deletion, so a delayed replay cannot recreate mail.
create table public.client_owner_request_receipts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  job_id uuid not null,
  request_id uuid not null,
  payload_hash text not null check(payload_hash ~ '^[0-9a-f]{64}$'),
  feed_id uuid references public.job_feed(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  unique(account_id,job_id,request_id)
);
alter table public.client_owner_request_receipts enable row level security;
revoke all on public.client_owner_request_receipts from public,anon,authenticated;
grant select,insert on public.client_owner_request_receipts to service_role;

create function public.submit_client_owner_request(
  p_account_id uuid,p_job_id uuid,p_request_id uuid,p_payload_hash text,
  p_kind text,p_title text,p_body text,p_meta jsonb
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare receipt public.client_owner_request_receipts; event_id uuid;
begin
  if p_request_id is null or p_payload_hash is null or p_payload_hash !~ '^[0-9a-f]{64}$'
    or p_kind is null or p_kind not in ('client_question','client_followup','rebook_requested')
    or p_body is null or length(btrim(p_body)) not between 1 and 2000
    or p_title is null or length(btrim(p_title)) not between 1 and 998
    or jsonb_typeof(p_meta) is distinct from 'object' then raise exception 'Invalid client request'; end if;
  perform 1 from public.jobs where id=p_job_id and account_id=p_account_id for share;
  if not found then raise exception 'Job not found for this account'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_account_id::text||':'||p_job_id::text||':'||p_request_id::text,0));
  select * into receipt from public.client_owner_request_receipts where account_id=p_account_id and job_id=p_job_id and request_id=p_request_id;
  if found then
    if receipt.payload_hash<>p_payload_hash then raise exception 'Request identity has different content'; end if;
    return jsonb_build_object('feed_id',receipt.feed_id,'replayed',true);
  end if;
  insert into public.job_feed(account_id,job_id,kind,title,body,visibility,author,meta,published_at)
    values(p_account_id,p_job_id,p_kind,p_title,p_body,'client','Customer',
      p_meta||jsonb_build_object('owner_email_notice','v1','client_request_id',p_request_id::text),clock_timestamp()) returning id into event_id;
  insert into public.client_owner_request_receipts(account_id,job_id,request_id,payload_hash,feed_id)
    values(p_account_id,p_job_id,p_request_id,p_payload_hash,event_id);
  return jsonb_build_object('feed_id',event_id,'replayed',false);
end $$;
revoke all on function public.submit_client_owner_request(uuid,uuid,uuid,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.submit_client_owner_request(uuid,uuid,uuid,text,text,text,text,jsonb) to service_role;
notify pgrst,'reload schema';
