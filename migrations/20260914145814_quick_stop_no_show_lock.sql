begin;

-- Keep the idempotency marker away from owner-writable request columns. One
-- verified visit can affect enforcement once, even if staff later dispute or
-- refund it, a process retries, or somebody clears the account's lock manually.
create table public.quick_stop_no_show_enforcements (
  request_id uuid primary key references public.extra_stop_requests(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  applied_at timestamptz not null default clock_timestamp(),
  result jsonb not null
);
alter table public.quick_stop_no_show_enforcements enable row level security;
revoke all on public.quick_stop_no_show_enforcements from public,anon,authenticated;
grant select,insert on public.quick_stop_no_show_enforcements to service_role;

create or replace function public.apply_quick_stop_no_show_lock(p_account_id uuid,p_request_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  a public.accounts%rowtype;
  r public.extra_stop_requests%rowtype;
  v_saved jsonb;
  v_result jsonb;
  v_anchor timestamptz;
  v_candidate_until timestamptz;
  v_now timestamptz := clock_timestamp();
  v_count90 integer;
  v_count180 integer;
  v_prior integer;
  v_tier integer;
  v_days integer;
  v_reason text;
  v_changed boolean := false;
begin
  -- Serialize all enforcement decisions for the account. Cancellation/capture
  -- transactions finish before calling this function, and never acquire this
  -- account lock while holding the request lock.
  select * into a from public.accounts where id=p_account_id for update;
  if not found then raise exception 'Account not found'; end if;
  select result into v_saved from public.quick_stop_no_show_enforcements
    where request_id=p_request_id and account_id=p_account_id;
  if found then return v_saved || jsonb_build_object('changed',false); end if;

  select * into r from public.extra_stop_requests
    where id=p_request_id and account_id=p_account_id for update;
  if not found or r.no_show_confirmed_at is null or r.no_show_confirmed_at>v_now then
    raise exception 'A confirmed no-show is required for enforcement';
  end if;

  -- Report timestamps, rather than retry/worker clocks, determine duration.
  -- Use the latest committed report so an older report committed out of order
  -- still escalates the latest incident correctly. The confirmation timestamp
  -- remains evidence after a request moves to refunded or disputed.
  select max(e.no_show_confirmed_at) into v_anchor from public.extra_stop_requests e
    where e.account_id=p_account_id and e.no_show_confirmed_at<=v_now;
  select
    count(*) filter(where e.no_show_confirmed_at>=v_anchor-interval '2160 hours'),
    count(*),
    count(*) filter(where e.id<>p_request_id)
    into v_count90,v_count180,v_prior
    from public.extra_stop_requests e
    where e.account_id=p_account_id and e.no_show_confirmed_at<=v_anchor
      and e.no_show_confirmed_at>=v_anchor-interval '4320 hours';
  if v_count180>=3 then
    v_tier:=3; v_days:=3650;
    v_reason:='Third no-show within 180 days — Quick Stop disabled pending staff review.';
  elsif v_count90>=2 then
    v_tier:=2; v_days:=30;
    v_reason:='Second no-show within 90 days — Quick Stop locked for 30 days.';
  else
    v_tier:=1; v_days:=10;
    v_reason:='No-show reported — Quick Stop locked for 10 days.';
  end if;
  v_candidate_until:=v_anchor+make_interval(secs=>v_days*86400);
  if a.extra_stop_locked_until is null or a.extra_stop_locked_until<v_candidate_until then
    update public.accounts set extra_stop_locked_until=v_candidate_until,extra_stop_lock_reason=v_reason
      where id=p_account_id;
    a.extra_stop_locked_until:=v_candidate_until;
    a.extra_stop_lock_reason:=v_reason;
    v_changed:=true;
  end if;
  -- A stronger preexisting manual or automatic suspension keeps both its expiry
  -- and explanation. Save this request's outcome even when no change was needed.
  v_result:=jsonb_build_object('tier',v_tier,'untilIso',a.extra_stop_locked_until,
    'reason',a.extra_stop_lock_reason,'priorNoShows',v_prior,'changed',v_changed);
  insert into public.quick_stop_no_show_enforcements(request_id,account_id,result)
    values(p_request_id,p_account_id,v_result);
  return v_result;
end $$;

revoke all on function public.apply_quick_stop_no_show_lock(uuid,uuid) from public,anon,authenticated;
grant execute on function public.apply_quick_stop_no_show_lock(uuid,uuid) to service_role;
create index if not exists quick_stop_no_show_history_idx on public.extra_stop_requests(account_id,no_show_confirmed_at)
  where no_show_confirmed_at is not null;

commit;
