create table public.quote_option_request_receipts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  request_id uuid not null,
  payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
  total numeric not null,
  event_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  unique(account_id,request_id)
);
create index quote_option_request_receipts_job_idx on public.quote_option_request_receipts(job_id);
alter table public.quote_option_request_receipts enable row level security;
revoke all on public.quote_option_request_receipts from public,anon,authenticated;
grant select,insert on public.quote_option_request_receipts to service_role;

create function public.save_client_quote_option_request(p_account_id uuid,p_job_id uuid,p_request_id uuid,p_payload_hash text,p_expected jsonb,p_items jsonb,p_total numeric,p_title text,p_body text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.quote_option_request_receipts; result jsonb;
begin
  if p_request_id is null or p_payload_hash is null or p_payload_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid option request'; end if;
  perform pg_advisory_xact_lock(hashtextextended('quote-options:'||p_account_id::text||':'||p_request_id::text,0));
  select * into r from public.quote_option_request_receipts where account_id=p_account_id and request_id=p_request_id;
  if found then
    if r.payload_hash<>p_payload_hash then raise exception 'Request has different content'; end if;
    return jsonb_build_object('total',r.total,'event_id',r.event_id,'replayed',true);
  end if;
  result:=public.save_client_quote_options(p_account_id,p_job_id,p_expected,p_items,p_total,p_title,p_body);
  insert into public.quote_option_request_receipts(account_id,job_id,request_id,payload_hash,total,event_id)
    values(p_account_id,p_job_id,p_request_id,p_payload_hash,(result->>'total')::numeric,(result->>'event_id')::uuid);
  return result||jsonb_build_object('replayed',false);
end $$;
revoke all on function public.save_client_quote_option_request(uuid,uuid,uuid,text,jsonb,jsonb,numeric,text,text) from public,anon,authenticated;
grant execute on function public.save_client_quote_option_request(uuid,uuid,uuid,text,jsonb,jsonb,numeric,text,text) to service_role;
notify pgrst,'reload schema';
