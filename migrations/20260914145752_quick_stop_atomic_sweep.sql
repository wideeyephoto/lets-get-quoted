begin;

-- Same conversion as quick-stop-time.ts: reject skipped local times and use
-- the later instant when a wall-clock time repeats. No session zone is used.
create or replace function public.quick_stop_window_instant(p_day date, p_time time, p_timezone text)
returns timestamptz language plpgsql stable strict security invoker set search_path = '' as $$
declare
  v_wall timestamp;
  v_base timestamptz;
  v_probe timestamptz;
  v_candidate timestamptz;
  v_result timestamptz;
  v_step integer;
begin
  if not isfinite(p_day) or extract(year from p_day) not between 1 and 9999
    or extract(hour from p_time) >= 24
    or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_timezone) then
    return null;
  end if;
  v_wall := p_day + p_time;
  v_base := v_wall at time zone 'UTC';
  for v_step in -3..3 loop
    v_probe := v_base + make_interval(hours => v_step * 12);
    v_candidate := v_base - ((v_probe at time zone p_timezone) - (v_probe at time zone 'UTC'));
    if v_candidate at time zone p_timezone = v_wall then
      v_result := greatest(v_result,v_candidate);
    end if;
  end loop;
  return v_result;
exception when datetime_field_overflow or invalid_parameter_value then
  return null;
end $$;

create or replace function public.sweep_quick_stop_requests(p_account_id uuid default null, p_limit integer default 50)
returns table(kind text, request_id uuid, account_id uuid, client_name text)
language plpgsql security invoker set search_path = '' as $$
declare
  c public.extra_stop_requests%rowtype;
  r public.extra_stop_requests%rowtype;
  p public.payments%rowtype;
  v_now timestamptz := clock_timestamp();
  v_end timestamptz;
  v_start timestamptz;
  v_zone text;
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'Invalid Quick Stop sweep batch size' using errcode='22023';
  end if;

  -- Capture reconciliation already locks payment before request. Take the same
  -- order and skip contended rows, then recheck the entire request under lock.
  -- Eligibility is filtered before LIMIT, so future and malformed rows cannot
  -- indefinitely occupy the first batch ahead of actual overdue work.
  for c in
    select e.* from public.extra_stop_requests e
    where e.status='awaiting_customer_payment' and e.payment_deadline_at<v_now and e.paid_at is null
      and (p_account_id is null or e.account_id=p_account_id)
      and not exists(select 1 from public.payments p0 where p0.id=e.payment_id and p0.account_id=e.account_id
        and (p0.paid_at is not null or p0.status in ('paid','refunded')))
    order by e.payment_deadline_at,e.id limit p_limit
  loop
    if c.payment_id is not null then
      select * into p from public.payments p0 where p0.id=c.payment_id and p0.account_id=c.account_id for update skip locked;
      if not found or p.paid_at is not null or p.status in ('paid','refunded') then continue; end if;
    end if;
    select * into r from public.extra_stop_requests e where e.id=c.id and e.account_id=c.account_id for update skip locked;
    if not found or r.payment_id is distinct from c.payment_id or r.status<>'awaiting_customer_payment'
      or r.paid_at is not null or r.payment_deadline_at is null or r.payment_deadline_at>=v_now then continue; end if;
    update public.extra_stop_requests e set status='offer_expired',hold_expires_at=null,updated_at=v_now where e.id=r.id;
    if r.payment_id is not null then
      update public.payments p0 set status='failed',failed_at=v_now
        where p0.id=r.payment_id and p0.account_id=r.account_id and p0.status in ('requested','processing') and p0.paid_at is null;
    end if;
    if r.job_id is not null then
      update public.jobs j set status='archived' where j.id=r.job_id and j.account_id=r.account_id;
    end if;
    insert into public.extra_stop_events(account_id,request_id,actor,from_status,to_status,meta)
      values(r.account_id,r.id,'system',r.status,'offer_expired','{"reason":"payment_window_elapsed"}'::jsonb);
    kind:='payment_expired'; request_id:=r.id; account_id:=r.account_id; client_name:=r.client_name;
    return next;
  end loop;

  for c in
    select e.* from public.extra_stop_requests e
    where e.status in ('awaiting_contractor','more_information_requested') and e.response_deadline_at<v_now
      and e.paid_at is null and (p_account_id is null or e.account_id=p_account_id)
      and not exists(select 1 from public.payments p0 where p0.id=e.payment_id and p0.account_id=e.account_id
        and (p0.paid_at is not null or p0.status in ('paid','refunded')))
    order by e.response_deadline_at,e.id limit p_limit
  loop
    if c.payment_id is not null then
      select * into p from public.payments p0 where p0.id=c.payment_id and p0.account_id=c.account_id for update skip locked;
      if not found or p.paid_at is not null or p.status in ('paid','refunded') then continue; end if;
    end if;
    select * into r from public.extra_stop_requests e where e.id=c.id and e.account_id=c.account_id for update skip locked;
    if not found or r.payment_id is distinct from c.payment_id or r.status not in ('awaiting_contractor','more_information_requested')
      or r.paid_at is not null or r.response_deadline_at is null or r.response_deadline_at>=v_now then continue; end if;
    update public.extra_stop_requests e set status='offer_expired',hold_expires_at=null,updated_at=v_now where e.id=r.id;
    if r.payment_id is not null then
      update public.payments p0 set status='failed',failed_at=v_now
        where p0.id=r.payment_id and p0.account_id=r.account_id and p0.status in ('requested','processing') and p0.paid_at is null;
    end if;
    if r.job_id is not null then
      update public.jobs j set status='archived' where j.id=r.job_id and j.account_id=r.account_id;
    end if;
    insert into public.extra_stop_events(account_id,request_id,actor,from_status,to_status,meta)
      values(r.account_id,r.id,'system',r.status,'offer_expired','{"reason":"response_window_elapsed"}'::jsonb);
    kind:='response_expired'; request_id:=r.id; account_id:=r.account_id; client_name:=r.client_name;
    return next;
  end loop;

  for c in
    select e.* from public.extra_stop_requests e
    join public.accounts a on a.id=e.account_id
    cross join lateral (select
      public.quick_stop_window_instant(e.arrival_date,e.arrival_start,coalesce(nullif(a.timezone,''),'America/New_York')) as start_at,
      public.quick_stop_window_instant(e.arrival_date,e.arrival_end,coalesce(nullif(a.timezone,''),'America/New_York')) as end_at
    ) w
    where e.status in ('confirmed','en_route','arrived') and e.no_show_reported_at is null
      and e.paid_at is not null and e.paid_at<=v_now and e.job_id is not null and e.payment_id is not null
      and e.arrival_date <= (v_now at time zone 'UTC')::date + 1
      and (p_account_id is null or e.account_id=p_account_id)
      and w.start_at<w.end_at and w.end_at + interval '2 hours'<v_now
      and exists(select 1 from public.payments p0 where p0.id=e.payment_id and p0.account_id=e.account_id
        and p0.status in ('paid','refunded') and p0.paid_at is not null)
      and exists(select 1 from public.jobs j where j.id=e.job_id and j.account_id=e.account_id)
    order by w.end_at,e.id limit p_limit
  loop
    select * into p from public.payments p0 where p0.id=c.payment_id and p0.account_id=c.account_id for update skip locked;
    if not found or p.status not in ('paid','refunded') or p.paid_at is null then continue; end if;
    select * into r from public.extra_stop_requests e where e.id=c.id and e.account_id=c.account_id for update skip locked;
    if not found or r.payment_id is distinct from c.payment_id or r.status not in ('confirmed','en_route','arrived')
      or r.no_show_reported_at is not null or r.paid_at is null or r.paid_at>v_now or r.job_id is null then continue; end if;
    select coalesce(nullif(a.timezone,''),'America/New_York') into v_zone from public.accounts a where a.id=r.account_id;
    v_start:=public.quick_stop_window_instant(r.arrival_date,r.arrival_start,v_zone);
    v_end:=public.quick_stop_window_instant(r.arrival_date,r.arrival_end,v_zone);
    if v_start is null or v_end is null or v_start>=v_end or v_end + interval '2 hours'>=v_now then continue; end if;
    update public.jobs j set status='complete' where j.id=r.job_id and j.account_id=r.account_id;
    if not found then continue; end if;
    update public.extra_stop_requests e set status='completed',completed_at=v_now,updated_at=v_now where e.id=r.id;
    insert into public.extra_stop_events(account_id,request_id,actor,from_status,to_status,meta)
      values(r.account_id,r.id,'system',r.status,'completed','{"reason":"auto_complete_after_window"}'::jsonb);
    kind:='auto_completed'; request_id:=r.id; account_id:=r.account_id; client_name:=r.client_name;
    return next;
  end loop;
end $$;

create index if not exists quick_stop_payment_sweep_idx on public.extra_stop_requests(payment_deadline_at,id)
  where status='awaiting_customer_payment' and paid_at is null;
create index if not exists quick_stop_response_sweep_idx on public.extra_stop_requests(response_deadline_at,id)
  where status in ('awaiting_contractor','more_information_requested') and paid_at is null;
create index if not exists quick_stop_completion_sweep_idx on public.extra_stop_requests(arrival_date,id)
  where status in ('confirmed','en_route','arrived') and no_show_reported_at is null;

revoke all on function public.quick_stop_window_instant(date,time,text) from public,anon,authenticated;
revoke all on function public.sweep_quick_stop_requests(uuid,integer) from public,anon,authenticated;
grant execute on function public.quick_stop_window_instant(date,time,text) to service_role;
grant execute on function public.sweep_quick_stop_requests(uuid,integer) to service_role;

commit;
