-- A provider-confirmed connection must survive late/repeated AI summaries.
-- No customer debit or AI duration is inferred from forwarding measurements.
begin;

alter table public.voice_calls drop constraint if exists voice_calls_outcome_source_check;
alter table public.voice_calls add constraint voice_calls_outcome_source_check
  check (outcome_source is null or outcome_source in
    ('provisional_admission','swml_post_prompt','reconciliation','manual','legacy','provider_forwarding'));

create or replace function public.preserve_voice_transfer_completion()
returns trigger language plpgsql security invoker set search_path = pg_catalog, public as $$
begin
  if new.provider = 'signalwire' and new.forwarding_connected_at is not null then
    new.outcome := 'transferred_and_answered';
    new.outcome_source := 'provider_forwarding';
    new.outcome_observed_at := coalesce(new.forwarding_ended_at, new.forwarding_connected_at);
    new.is_provisional := false;
  end if;
  return new;
end $$;
revoke all on function public.preserve_voice_transfer_completion() from public, anon, authenticated;
grant execute on function public.preserve_voice_transfer_completion() to service_role;
drop trigger if exists voice_transfer_completion on public.voice_calls;
create trigger voice_transfer_completion before insert or update on public.voice_calls
  for each row execute function public.preserve_voice_transfer_completion();

create or replace function public.record_voice_forwarding_usage(
  p_account_id uuid,p_call_id text,p_caller text,p_state text,p_seconds integer,p_observed_at timestamptz
) returns void language plpgsql security invoker set search_path = pg_catalog, public as $$
declare u public.voice_forwarding_usage;
begin
  if p_seconds < 0 or p_seconds > 86400 or nullif(btrim(p_call_id),'') is null
    or p_observed_at is null or not isfinite(p_observed_at)
    or p_state is null or p_state not in ('connecting','connected','disconnected','completed','no-answer','busy','failed','canceled','ended')
  then raise exception 'Invalid forwarding evidence'; end if;
  insert into public.voice_forwarding_usage(provider_call_id,account_id,observed_at,seconds,connected_at,ended_at)
    values(p_call_id,p_account_id,
      case when p_state='completed' and p_seconds is not null then p_observed_at-make_interval(secs=>p_seconds) else p_observed_at end,
      p_seconds,
      case when p_state='connected' then p_observed_at
        when p_state='completed' and p_seconds is not null then p_observed_at-make_interval(secs=>p_seconds) end,
      case when p_state in ('disconnected','completed') then p_observed_at end)
    on conflict(provider_call_id) do update set
      observed_at=least(voice_forwarding_usage.observed_at,excluded.observed_at),
      seconds=greatest(voice_forwarding_usage.seconds,excluded.seconds),
      connected_at=least(voice_forwarding_usage.connected_at,excluded.connected_at),
      ended_at=greatest(voice_forwarding_usage.ended_at,excluded.ended_at)
      where voice_forwarding_usage.account_id=excluded.account_id;
  update public.voice_forwarding_usage set seconds=greatest(seconds,
    least(86400,greatest(0,ceil(extract(epoch from (ended_at-connected_at)))::integer)))
    where provider_call_id=p_call_id and account_id=p_account_id and connected_at is not null and ended_at is not null;
  select * into strict u from public.voice_forwarding_usage where provider_call_id=p_call_id and account_id=p_account_id;
  insert into public.voice_calls(account_id,provider,provider_call_id,caller_number,started_at,outcome,settlement)
    values(p_account_id,'signalwire',p_call_id,p_caller,u.observed_at,
      case when p_state in ('no-answer','busy','failed','canceled') then 'failed' else 'transfer_attempted' end,'unmetered')
    on conflict(provider,provider_call_id) do nothing;
  update public.voice_calls set forwarding_seconds=u.seconds,forwarding_connected_at=u.connected_at,forwarding_ended_at=u.ended_at
    where provider='signalwire' and provider_call_id=p_call_id and account_id=p_account_id;
end $$;
revoke all on function public.record_voice_forwarding_usage(uuid,text,text,text,integer,timestamptz) from public, anon, authenticated;
grant execute on function public.record_voice_forwarding_usage(uuid,text,text,text,integer,timestamptz) to service_role;

commit;
