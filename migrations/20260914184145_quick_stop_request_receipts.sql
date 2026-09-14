create table public.quick_stop_request_receipts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  request_id uuid not null,
  payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
  quick_stop_id uuid references public.extra_stop_requests(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  unique(account_id,request_id)
);
alter table public.quick_stop_request_receipts enable row level security;
revoke all on public.quick_stop_request_receipts from public,anon,authenticated;
grant select,insert on public.quick_stop_request_receipts to service_role;
create index quick_stop_request_receipts_source_idx on public.quick_stop_request_receipts(quick_stop_id);
create function public.submit_quick_stop_request(p_account_id uuid,p_request_id uuid,p_payload_hash text,p_request jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.quick_stop_request_receipts; q public.extra_stop_requests; saved_id uuid;
begin
  if p_request_id is null or p_payload_hash is null or p_payload_hash !~ '^[a-f0-9]{64}$'
    or p_request is null or jsonb_typeof(p_request)<>'object' then raise exception 'Invalid Quick Stop request'; end if;
  perform pg_advisory_xact_lock(hashtextextended('quick-stop-request:'||p_account_id::text||':'||p_request_id::text,0));
  select * into r from public.quick_stop_request_receipts where account_id=p_account_id and request_id=p_request_id;
  if found then
    if r.payload_hash<>p_payload_hash then raise exception 'Request was submitted with different content'; end if;
    return jsonb_build_object('quick_stop_id',r.quick_stop_id,'replayed',true);
  end if;
  q:=jsonb_populate_record(null::public.extra_stop_requests,p_request);
  if q.client_id is not null then
    perform 1 from public.clients where id=q.client_id and account_id=p_account_id for share;
    if not found then raise exception 'Client unavailable'; end if;
  end if;
  -- Only intake fields may be supplied. Identity, account, status and payment fields are never caller-controlled.
  insert into public.extra_stop_requests(account_id,status,client_id,requested_date,client_name,client_phone,client_email,address,lat,lng,intake,photo_paths,ai_summary,ai_visit_minutes,ai_complexity,ai_eligible,ai_confidence,ai_exclusions,availability,response_deadline_at)
  values(p_account_id,'awaiting_contractor',q.client_id,q.requested_date,q.client_name,q.client_phone,q.client_email,q.address,q.lat,q.lng,q.intake,q.photo_paths,q.ai_summary,q.ai_visit_minutes,q.ai_complexity,q.ai_eligible,q.ai_confidence,q.ai_exclusions,q.availability,q.response_deadline_at)
  returning id into saved_id;
  insert into public.quick_stop_request_receipts(account_id,request_id,payload_hash,quick_stop_id) values(p_account_id,p_request_id,p_payload_hash,saved_id);
  return jsonb_build_object('quick_stop_id',saved_id,'replayed',false);
end $$;
revoke all on function public.submit_quick_stop_request(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.submit_quick_stop_request(uuid,uuid,text,jsonb) to service_role;
notify pgrst,'reload schema';
