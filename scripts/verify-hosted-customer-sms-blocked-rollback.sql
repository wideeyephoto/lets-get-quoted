-- Customer acceptance containment probe. No HTTP calls or global queue claims.
-- Every write is inside the exception subtransaction and MUST roll back before
-- the result is returned. The reserved 555 number is only a database fixture.
set local statement_timeout = '20s';
set local lock_timeout = '3s';
do $test$
declare
  a uuid := 'c63293b4-138e-45c2-8e11-0f4e6d7e08e6';
  sender uuid := '6b473bef-0f42-4e0b-8b32-83b94bd51a1e';
  phone text := '+12025550101';
  ev uuid; token uuid; result text; due timestamptz := clock_timestamp()+interval '1 hour';
  checks jsonb := '[]';
begin
  begin
    if public.customer_sms_sender_registered(sender,a) then
      raise exception 'This blocked-sender probe no longer applies: customer registration is now ready';
    end if;
    insert into public.sms_consent(account_id,phone_number,status,source,consented_at,opted_out_at)
      values(a,phone,'opted_in','sms_acceptance_rollback',now(),null)
      on conflict(account_id,phone_number) do update set status='opted_in',consented_at=now(),opted_out_at=null;
    insert into public.sms_consent_scopes(account_id,phone_number,consent_scope,evidence_source)
      values(a,phone,'customer','sms_acceptance_rollback') on conflict do nothing;
    select sms_event_id into ev from public.enqueue_sms_delivery(
      a,phone,'Rollback-only customer acceptance fixture. No carrier request.',
      'customer_acceptance_probe','customer_message','contractor_dedicated','customer',
      'customer_acceptance_probe','sms-acceptance-20260909:'||gen_random_uuid(),null,null,sender,due);
    if not exists(select 1 from public.sms_delivery_tasks where sms_event_id=ev
      and task_state='queued' and available_at=due and attempt_count=0 and request_started_at is null) then
      raise exception 'Future enqueue was not atomic';
    end if;
    checks:=checks||jsonb_build_array('future_customer_intent_queued_atomically');

    -- Scoped lease fixtures exercise the deployed stage/defer RPCs without
    -- claiming, delaying, or inspecting any unrelated production work.
    for i in 1..10 loop
      token:=gen_random_uuid();
      update public.sms_delivery_tasks set task_state='leased',claim_token=token,
        lease_expires_at=now()+interval '5 minutes',attempt_count=attempt_count+1,available_at=now()
        where sms_event_id=ev;
      insert into public.sms_delivery_attempts(sms_event_id,claim_token,attempt_number,leased_at,lease_expires_at)
        values(ev,token,1,now(),now()+interval '5 minutes');
      select dispatch_status into result from public.stage_sms_delivery(ev,token,'signalwire');
      if result is distinct from 'blocked_sender' then raise exception 'Wrong customer sender passed stage: %',result; end if;
      perform public.defer_sms_delivery(ev,token,'sms_sender_not_ready',3600);
    end loop;
    if not exists(select 1 from public.sms_delivery_tasks where sms_event_id=ev and task_state='queued'
      and attempt_count=0 and lease_sequence=10 and available_at>now() and request_started_at is null) then
      raise exception 'Readiness deferral spent attempts or failed to preserve the queue';
    end if;
    if (select count(*) from public.sms_delivery_attempts where sms_event_id=ev and outcome='deferred')<>10 then
      raise exception 'Missing append-only deferral history';
    end if;
    checks:=checks||jsonb_build_array('wrong_customer_campaign_blocked_ten_times','deferral_budget_and_history_preserved');

    token:=gen_random_uuid();
    update public.sms_delivery_tasks set task_state='leased',claim_token=token,
      lease_expires_at=now()+interval '5 minutes',attempt_count=attempt_count+1,
      available_at=now()-interval '25 hours',created_at=now()-interval '25 hours' where sms_event_id=ev;
    insert into public.sms_delivery_attempts(sms_event_id,claim_token,attempt_number,leased_at,lease_expires_at)
      values(ev,token,1,now(),now()+interval '5 minutes');
    select dispatch_status into result from public.stage_sms_delivery(ev,token,'signalwire');
    if result is distinct from 'cancelled' or not exists(select 1 from public.sms_events
      where id=ev and error_reason='sms_delivery_expired') then raise exception 'Expired intent was not cancelled'; end if;
    if exists(select 1 from public.sms_events where id=ev and
      (provider_id is not null or text_usage_reservation_id is not null or text_usage_state is not null)) then
      raise exception 'Unexpected provider or usage evidence';
    end if;
    if exists(select 1 from public.sms_delivery_attempts where sms_event_id=ev and request_started_at is not null) then
      raise exception 'Provider boundary was crossed';
    end if;
    checks:=checks||jsonb_build_array('expired_customer_intent_cancelled','no_provider_request_or_usage');
    raise exception using errcode='P9999',message='Intentional fixture rollback';
  exception when sqlstate 'P9999' then null;
  end;
  if exists(select 1 from public.sms_events where id=ev) then raise exception 'Fixture rollback failed'; end if;
  perform set_config('lgq.customer_sms_acceptance',checks::text,true);
end $test$;
select current_setting('lgq.customer_sms_acceptance')::jsonb as passed_checks;
