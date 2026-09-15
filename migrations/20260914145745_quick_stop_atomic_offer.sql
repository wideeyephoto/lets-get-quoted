-- Publish a complete offer in one transaction. No externally visible reservation
-- exists without its date, tentative job, payment, and expiration deadline.
begin;

create or replace function public.create_quick_stop_offer(
  p_account_id uuid,
  p_request_id uuid,
  p_offer jsonb
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_account public.accounts%rowtype;
  v_request public.extra_stop_requests%rowtype;
  v_day date := (p_offer->>'arrival_date')::date;
  v_start time := (p_offer->>'arrival_start')::time;
  v_end time := (p_offer->>'arrival_end')::time;
  v_fee integer := (p_offer->>'fee_cents')::integer;
  v_visit integer := (p_offer->>'visit_minutes')::integer;
  v_zone text;
  v_cap integer;
  v_count integer;
  v_ref_number numeric;
  v_job_id uuid;
  v_payment_id uuid;
  v_now timestamptz := clock_timestamp();
  v_deadline timestamptz;
begin
  if v_day is null or v_start is null or v_end is null or v_start >= v_end
     or v_fee is null or v_fee <= 0 then
    raise exception 'Set a valid arrival window and Quick Stop fee.' using errcode = '22023';
  end if;

  -- Transaction-scoped, account/date-scoped serialization covers the count AND
  -- publication. Different request IDs cannot consume the same last slot.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('quick-stop-day:' || p_account_id::text || ':' || v_day::text, 0)
  );
  select * into v_account from public.accounts where id = p_account_id;
  if not found then raise exception 'Account not found.' using errcode = 'P0002'; end if;
  if not coalesce(v_account.connect_onboarded, false) or nullif(v_account.stripe_connect_id, '') is null then
    raise exception 'Finish your Stripe payout setup before sending Quick Stop offers.' using errcode = '22023';
  end if;
  v_zone := coalesce(nullif(v_account.timezone, ''), 'America/New_York');
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = v_zone) then
    raise exception 'The account timezone is invalid.' using errcode = '22023';
  end if;
  -- Reject DST gaps as well as elapsed windows. A contractor may negotiate a
  -- date beyond the customer request horizon; daysAhead is intentionally absent.
  if public.quick_stop_window_instant(v_day, v_start, v_zone) is null
     or public.quick_stop_window_instant(v_day, v_end, v_zone) is null
     or public.quick_stop_window_instant(v_day, v_end, v_zone) <= clock_timestamp() then
    raise exception 'Choose an arrival window that has not ended in your timezone.' using errcode = '22023';
  end if;
  if nullif(v_account.extra_stop_weekdays, '') is not null
     and not (extract(dow from v_day)::integer = any(string_to_array(v_account.extra_stop_weekdays, ',')::integer[])) then
    raise exception 'That day is not in your Quick Stop schedule.' using errcode = '22023';
  end if;
  if v_start < coalesce(nullif(v_account.extra_stop_earliest_time, '')::time, '08:00'::time)
     or v_end > coalesce(nullif(v_account.extra_stop_latest_end, '')::time, '20:00'::time) then
    raise exception 'The arrival window is outside your Quick Stop hours.' using errcode = '22023';
  end if;

  select * into v_request from public.extra_stop_requests
    where id = p_request_id and account_id = p_account_id for update;
  if not found then raise exception 'Request not found.' using errcode = 'P0002'; end if;
  if v_request.status not in ('awaiting_contractor', 'more_information_requested') then
    raise exception 'This request can no longer be offered.' using errcode = '22023';
  end if;
  if v_request.job_id is not null or v_request.payment_id is not null then
    raise exception 'This request already has a job or payment. Reload before continuing.' using errcode = '22023';
  end if;
  if v_request.client_id is not null and not exists (
    select 1 from public.clients where id = v_request.client_id and account_id = p_account_id
  ) then
    raise exception 'The request client does not belong to this account.' using errcode = '22023';
  end if;
  v_cap := greatest(1, least(50, coalesce(v_account.extra_stop_max_per_day, 2)));
  select count(*) into v_count from public.extra_stop_requests
    where account_id = p_account_id and arrival_date = v_day
      and status in ('contractor_offer_sent', 'awaiting_customer_payment', 'confirmed', 'en_route', 'arrived');
  if v_count >= v_cap then
    raise exception 'You are at your Quick Stop limit (%) for that day.', v_cap using errcode = '22023';
  end if;

  -- Preserve the normal numeric J- reference allocation. Normal job creation
  -- does not take our day lock, so retry an account/ref collision transactionally.
  for attempt in 1..5 loop
    select greatest(1000, coalesce(max(substring(ref from 3)::numeric), 1000)) + 1
      into v_ref_number from public.jobs where account_id = p_account_id and ref ~ '^J-[0-9]+$';
    begin
      insert into public.jobs (
        account_id, ref, client_id, client_name, client_phone, client_email,
        address, scope, status, scheduled_for, scheduled_time, quoted_amount,
        estimated_hours, lat, lng, geocoded_at
      ) values (
        p_account_id, 'J-' || v_ref_number::text, v_request.client_id,
        v_request.client_name, v_request.client_phone, v_request.client_email,
        v_request.address, 'Quick Stop — ' || coalesce(nullif(v_request.ai_summary, ''), 'quick visit'),
        'new_lead', v_day, v_start, 0,
        case when v_visit > 0 then greatest(0.25, round(v_visit::numeric / 60, 2)) else null end,
        v_request.lat, v_request.lng,
        case when v_request.lat is not null and v_request.lng is not null then v_now else null end
      ) returning id into v_job_id;
      exit;
    exception when unique_violation then
      if attempt = 5 then raise; end if;
    end;
  end loop;

  -- Same payment shape as createDepositRequest. Stripe Checkout is created only
  -- when the customer follows the link, after this transaction has committed.
  insert into public.payments (
    account_id, job_id, kind, label, amount, status,
    homeowner_phone, sms_consent, sms_consent_at
  ) values (
    p_account_id, v_job_id, 'deposit', 'Quick Stop priority visit fee', v_fee::numeric / 100,
    'requested', v_request.client_phone, nullif(v_request.client_phone, '') is not null,
    case when nullif(v_request.client_phone, '') is not null then v_now else null end
  ) returning id into v_payment_id;

  v_deadline := clock_timestamp() + make_interval(mins => least(720, greatest(1, coalesce(nullif(v_account.extra_stop_payment_deadline_mins, 0), 15))));
  update public.extra_stop_requests set
    status = 'awaiting_customer_payment', job_id = v_job_id, payment_id = v_payment_id,
    arrival_date = v_day, arrival_start = v_start, arrival_end = v_end,
    fee_cents = v_fee, diagnostic_fee_cents = (p_offer->>'diagnostic_fee_cents')::integer,
    offer_visit_minutes = v_visit, contractor_note = p_offer->>'contractor_note',
    detour_miles = (p_offer->>'detour_miles')::numeric,
    detour_minutes = (p_offer->>'detour_minutes')::numeric,
    route_extension_minutes = (p_offer->>'route_extension_minutes')::numeric,
    offer_sent_at = v_now, payment_deadline_at = v_deadline, hold_expires_at = v_deadline,
    updated_at = v_now
    where id = p_request_id and account_id = p_account_id;
  insert into public.extra_stop_events(account_id, request_id, actor, from_status, to_status, meta)
    values(p_account_id, p_request_id, 'contractor', v_request.status, 'awaiting_customer_payment',
      jsonb_build_object('paymentId', v_payment_id, 'jobId', v_job_id, 'arrivalDate', v_day, 'atomicOffer', true));
  return jsonb_build_object('id', p_request_id, 'job_id', v_job_id, 'payment_id', v_payment_id,
    'status', 'awaiting_customer_payment', 'payment_deadline_at', v_deadline);
end;
$$;

revoke all on function public.create_quick_stop_offer(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.create_quick_stop_offer(uuid, uuid, jsonb) to service_role;

-- Recover pre-migration staged offers. New creation never commits this status.
-- Stamp/compare updated_at because failure may precede offer_sent_at entirely.
create or replace function public.recover_stale_quick_stop_offer(
  p_account_id uuid, p_request_id uuid, p_stale_before timestamptz
) returns boolean
language plpgsql security invoker set search_path = ''
as $$
declare
  v_request public.extra_stop_requests%rowtype;
  v_snapshot public.extra_stop_requests%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  select * into v_snapshot from public.extra_stop_requests
    where id = p_request_id and account_id = p_account_id;
  if not found or p_stale_before is null or v_snapshot.status <> 'contractor_offer_sent'
     or v_snapshot.updated_at > least(p_stale_before, v_now - interval '15 minutes') then return false; end if;
  -- Include a payment created against the placeholder before linkage failed.
  -- Lock payments before requests, matching capture/refund reconciliation.
  perform 1 from public.payments where account_id = p_account_id
    and (id = v_snapshot.payment_id or job_id = v_snapshot.job_id) order by id for update;
  select * into v_request from public.extra_stop_requests
    where id = p_request_id and account_id = p_account_id for update;
  if not found or v_request.status <> 'contractor_offer_sent'
     or v_request.updated_at > least(p_stale_before, v_now - interval '15 minutes')
     or v_request.payment_id is distinct from v_snapshot.payment_id
     or v_request.job_id is distinct from v_snapshot.job_id then return false; end if;
  -- A concurrent captured payment wins. Preserve charge evidence for review and
  -- keep processing the rest of the bounded batch instead of rolling it back.
  if exists (select 1 from public.payments where account_id = p_account_id
      and (id = v_request.payment_id or job_id = v_request.job_id)
      and (status in ('paid', 'refunded', 'disputed') or paid_at is not null)) then
    return false;
  end if;
  update public.payments set status = 'failed', failed_at = v_now
    where account_id = p_account_id and (id = v_request.payment_id or job_id = v_request.job_id)
      and status in ('requested', 'processing');
  update public.jobs set status = 'archived' where id = v_request.job_id and account_id = p_account_id;
  update public.extra_stop_requests set status = 'offer_expired', updated_at = v_now
    where id = p_request_id and account_id = p_account_id;
  insert into public.extra_stop_events(account_id, request_id, actor, from_status, to_status, meta)
    values(p_account_id, p_request_id, 'system', 'contractor_offer_sent', 'offer_expired',
      jsonb_build_object('reason', 'offer_creation_interrupted'));
  return true;
end;
$$;

revoke all on function public.recover_stale_quick_stop_offer(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.recover_stale_quick_stop_offer(uuid, uuid, timestamptz) to service_role;

-- Bound work after filtering out settled rows that require staff adjudication.
-- Those rows cannot repeatedly occupy the first page and starve recoverable ones.
create or replace function public.recover_stale_quick_stop_offers(
  p_account_id uuid default null, p_limit integer default 50
) returns integer
language plpgsql security invoker set search_path = ''
as $$
declare
  v_row record;
  v_count integer := 0;
  v_before timestamptz := clock_timestamp() - interval '15 minutes';
begin
  for v_row in
    select r.id, r.account_id from public.extra_stop_requests r
      where r.status = 'contractor_offer_sent' and r.updated_at <= v_before
        and (p_account_id is null or r.account_id = p_account_id)
        and not exists (select 1 from public.payments p where p.account_id = r.account_id
          and (p.id = r.payment_id or p.job_id = r.job_id)
          and (p.status in ('paid', 'refunded', 'disputed') or p.paid_at is not null))
      order by r.updated_at, r.id limit greatest(1, least(coalesce(p_limit, 50), 100))
  loop
    if public.recover_stale_quick_stop_offer(v_row.account_id, v_row.id, v_before) then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.recover_stale_quick_stop_offers(uuid, integer) from public, anon, authenticated;
grant execute on function public.recover_stale_quick_stop_offers(uuid, integer) to service_role;

-- Accepting a negotiated date consumes that day's same capacity as a new offer.
-- Compare the precise proposal version and perform both schedule writes together.
create or replace function public.accept_quick_stop_window(
  p_account_id uuid, p_request_id uuid, p_expected_proposed_at timestamptz
) returns boolean
language plpgsql security invoker set search_path = ''
as $$
declare
  v_request public.extra_stop_requests%rowtype;
  v_account public.accounts%rowtype;
  v_day date;
  v_zone text;
  v_count integer;
  v_cap integer;
  v_now timestamptz := clock_timestamp();
begin
  select proposed_arrival_date into v_day from public.extra_stop_requests
    where id = p_request_id and account_id = p_account_id;
  if not found or v_day is null or p_expected_proposed_at is null then return false; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('quick-stop-day:' || p_account_id::text || ':' || v_day::text, 0)
  );
  select * into v_request from public.extra_stop_requests
    where id = p_request_id and account_id = p_account_id for update;
  if not found or v_request.status not in ('confirmed', 'en_route')
     or v_request.no_show_reported_at is not null
     or v_request.proposed_window_at is distinct from p_expected_proposed_at
     or v_request.proposed_arrival_date is distinct from v_day then return false; end if;
  select * into v_account from public.accounts where id = p_account_id;
  if not found then return false; end if;
  v_zone := coalesce(nullif(v_account.timezone, ''), 'America/New_York');
  if v_request.proposed_arrival_start is null or v_request.proposed_arrival_end is null
     or v_request.proposed_arrival_start >= v_request.proposed_arrival_end
     or public.quick_stop_window_instant(v_day, v_request.proposed_arrival_start, v_zone) is null
     or public.quick_stop_window_instant(v_day, v_request.proposed_arrival_end, v_zone) is null
     or public.quick_stop_window_instant(v_day, v_request.proposed_arrival_end, v_zone) <= clock_timestamp() then
    raise exception 'Choose an arrival window that has not ended in your timezone.' using errcode = '22023';
  end if;
  if (nullif(v_account.extra_stop_weekdays, '') is not null
      and not (extract(dow from v_day)::integer = any(string_to_array(v_account.extra_stop_weekdays, ',')::integer[])))
     or v_request.proposed_arrival_start < coalesce(nullif(v_account.extra_stop_earliest_time, '')::time, '08:00'::time)
     or v_request.proposed_arrival_end > coalesce(nullif(v_account.extra_stop_latest_end, '')::time, '20:00'::time) then
    raise exception 'The arrival window is outside your Quick Stop schedule.' using errcode = '22023';
  end if;
  v_cap := greatest(1, least(50, coalesce(v_account.extra_stop_max_per_day, 2)));
  select count(*) into v_count from public.extra_stop_requests where account_id = p_account_id
    and arrival_date = v_day and id <> p_request_id
    and status in ('contractor_offer_sent', 'awaiting_customer_payment', 'confirmed', 'en_route', 'arrived');
  if v_count >= v_cap then
    raise exception 'This arrival day has reached its Quick Stop limit. Ask your contractor for another window.' using errcode = '22023';
  end if;
  update public.jobs set scheduled_for = v_day, scheduled_time = v_request.proposed_arrival_start
    where id = v_request.job_id and account_id = p_account_id;
  if not found then raise exception 'The Quick Stop job could not be updated.' using errcode = 'P0002'; end if;
  update public.extra_stop_requests set
    arrival_date = v_day, arrival_start = v_request.proposed_arrival_start, arrival_end = v_request.proposed_arrival_end,
    proposed_arrival_date = null, proposed_arrival_start = null, proposed_arrival_end = null,
    proposed_window_at = null, updated_at = v_now
    where id = p_request_id and account_id = p_account_id;
  insert into public.extra_stop_events(account_id, request_id, actor, from_status, to_status, meta)
    values(p_account_id, p_request_id, 'customer', v_request.status, v_request.status,
      jsonb_build_object('action', 'accepted_revised_window', 'arrivalDate', v_day));
  return true;
end;
$$;
revoke all on function public.accept_quick_stop_window(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.accept_quick_stop_window(uuid, uuid, timestamptz) to service_role;

commit;
