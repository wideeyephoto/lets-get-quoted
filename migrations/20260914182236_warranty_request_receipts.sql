create table public.warranty_request_receipts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  job_id uuid not null,
  warranty_id uuid not null,
  request_id uuid not null,
  payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
  claim_id uuid references public.warranty_claims(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  unique(account_id,job_id,warranty_id,request_id)
);
alter table public.warranty_request_receipts enable row level security;
revoke all on public.warranty_request_receipts from public,anon,authenticated;
grant select,insert on public.warranty_request_receipts to service_role;
create index warranty_request_receipts_claim_idx on public.warranty_request_receipts(claim_id);
create function public.submit_warranty_request(p_account_id uuid,p_job_id uuid,p_warranty_id uuid,p_request_id uuid,p_payload_hash text,p_description text,p_photo_paths text[])
returns jsonb language plpgsql security invoker set search_path='' as $$
declare w public.warranties; r public.warranty_request_receipts; c public.warranty_claims; today date:=(clock_timestamp() at time zone 'UTC')::date;
begin
  if p_request_id is null or p_payload_hash is null or p_payload_hash !~ '^[a-f0-9]{64}$'
    or p_description is null or length(btrim(p_description)) not between 1 and 2000
    or p_photo_paths is null or cardinality(p_photo_paths)>3 then raise exception 'Invalid warranty request'; end if;
  select * into w from public.warranties where id=p_warranty_id and account_id=p_account_id and job_id=p_job_id for share;
  if not found then raise exception 'Warranty not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_account_id::text||':'||p_job_id::text||':'||p_warranty_id::text||':'||p_request_id::text,0));
  select * into r from public.warranty_request_receipts where account_id=p_account_id and job_id=p_job_id and warranty_id=p_warranty_id and request_id=p_request_id;
  if found then
    if r.payload_hash<>p_payload_hash then raise exception 'Request was submitted with different content'; end if;
    return jsonb_build_object('claim_id',r.claim_id,'replayed',true);
  end if;
  insert into public.warranty_claims(account_id,job_id,warranty_id,description,photo_paths,in_warranty_at_claim)
    values(p_account_id,p_job_id,p_warranty_id,p_description,p_photo_paths,w.starts_on<=today and (w.ends_on is null or w.ends_on>=today)) returning * into c;
  insert into public.warranty_request_receipts(account_id,job_id,warranty_id,request_id,payload_hash,claim_id)
    values(p_account_id,p_job_id,p_warranty_id,p_request_id,p_payload_hash,c.id);
  return jsonb_build_object('claim_id',c.id,'replayed',false);
end $$;
revoke all on function public.submit_warranty_request(uuid,uuid,uuid,uuid,text,text,text[]) from public,anon,authenticated;
grant execute on function public.submit_warranty_request(uuid,uuid,uuid,uuid,text,text,text[]) to service_role;
notify pgrst,'reload schema';
