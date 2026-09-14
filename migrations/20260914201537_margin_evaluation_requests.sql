create or replace function public.current_margin_warning(p_account_id uuid,p_job_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare revenue numeric; total_cost numeric; floor_pct numeric;
begin
  select coalesce(j.quoted_amount,0) into revenue from public.jobs j where j.id=p_job_id and j.account_id=p_account_id and (to_jsonb(j)->>'deleted_at') is null for share;
  if not found then return null; end if;
  select least(100,greatest(0,coalesce(a.min_margin_pct,15))) into floor_pct from public.accounts a where a.id=p_account_id for share;
  if not found then return null; end if;
  perform 1 from public.costs where account_id=p_account_id and job_id=p_job_id order by id for share;
  select coalesce(sum(case when type in ('material','sub','receipt','labor','other') then amount else 0 end
    +case when type='labor' then coalesce(burden_amount,0) else 0 end),0) into total_cost from public.costs where account_id=p_account_id and job_id=p_job_id;
  if revenue::text in ('NaN','Infinity','-Infinity') or total_cost::text in ('NaN','Infinity','-Infinity') then return null; end if;
  return jsonb_build_object('revenue',round(revenue,2),'total_cost',round(total_cost,2),'floor_pct',floor_pct,
    'warning',revenue>0 and (total_cost>revenue or (floor_pct>0 and (revenue-total_cost)/nullif(revenue,0)*100<floor_pct)));
end $$;
revoke all on function public.current_margin_warning(uuid,uuid) from public,anon,authenticated;
grant execute on function public.current_margin_warning(uuid,uuid) to service_role;

create table public.margin_evaluation_requests (
  job_id uuid primary key references public.jobs(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  revision uuid not null default gen_random_uuid(),
  requested_at timestamptz not null default clock_timestamp(),
  lease_id uuid,
  lease_until timestamptz,
  last_error text
);
create index margin_evaluation_requests_account_idx on public.margin_evaluation_requests(account_id);
create index margin_evaluation_requests_due_idx on public.margin_evaluation_requests(requested_at);
alter table public.margin_evaluation_requests enable row level security;
revoke all on public.margin_evaluation_requests from public,anon,authenticated;
grant select,insert,update,delete on public.margin_evaluation_requests to service_role;

create function public.request_margin_evaluation() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op<>'DELETE' and new.job_id is not null then
    perform 1 from public.jobs where id=new.job_id and account_id=new.account_id;
    if not found then raise exception 'Cost job does not belong to account'; end if;
    insert into public.margin_evaluation_requests(job_id,account_id) values(new.job_id,new.account_id)
      on conflict(job_id) do update set account_id=excluded.account_id,revision=gen_random_uuid(),requested_at=clock_timestamp(),last_error=null;
  end if;
  if tg_op<>'INSERT' and old.job_id is not null and (tg_op='DELETE' or old.job_id is distinct from new.job_id or old.account_id is distinct from new.account_id) then
    insert into public.margin_evaluation_requests(job_id,account_id)
      select j.id,j.account_id from public.jobs j join public.accounts a on a.id=j.account_id where j.id=old.job_id and j.account_id=old.account_id
      on conflict(job_id) do update set revision=gen_random_uuid(),requested_at=clock_timestamp(),last_error=null;
  end if;
  return null;
end $$;
revoke all on function public.request_margin_evaluation() from public,anon,authenticated;
create trigger costs_request_margin_evaluation after insert or delete or update of amount,burden_amount,type,job_id,account_id on public.costs
  for each row execute function public.request_margin_evaluation();

create function public.claim_margin_evaluations(p_limit integer default 5)
returns setof public.margin_evaluation_requests language sql security invoker set search_path='' as $$
  with due as (
    select job_id from public.margin_evaluation_requests where lease_id is null or lease_until<=clock_timestamp()
    order by requested_at,job_id for update skip locked limit least(greatest(coalesce(p_limit,5),1),5)
  )
  update public.margin_evaluation_requests r set lease_id=gen_random_uuid(),lease_until=clock_timestamp()+interval '5 minutes'
    from due where r.job_id=due.job_id returning r.*;
$$;
revoke all on function public.claim_margin_evaluations(integer) from public,anon,authenticated;
grant execute on function public.claim_margin_evaluations(integer) to service_role;

create function public.finish_margin_evaluation(p_account_id uuid,p_job_id uuid,p_revision uuid,p_lease_id uuid,p_succeeded boolean)
returns boolean language plpgsql security invoker set search_path='' as $$
declare r public.margin_evaluation_requests;
begin
  select * into r from public.margin_evaluation_requests where account_id=p_account_id and job_id=p_job_id and lease_id=p_lease_id for update;
  if not found then return false; end if;
  if p_succeeded and r.revision=p_revision then
    delete from public.margin_evaluation_requests where job_id=p_job_id;
  else
    update public.margin_evaluation_requests set lease_id=null,lease_until=null,
      last_error=case when p_succeeded then null else 'evaluation_failed' end where job_id=p_job_id;
  end if;
  return true;
end $$;
revoke all on function public.finish_margin_evaluation(uuid,uuid,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.finish_margin_evaluation(uuid,uuid,uuid,uuid,boolean) to service_role;
notify pgrst,'reload schema';
