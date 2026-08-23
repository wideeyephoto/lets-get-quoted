-- Keep one useful AI Voice transcript, and keep it only for the period the
-- workspace is promised. The billing/admission ledgers are intentionally not
-- touched: voice_events and voice_calls contain caller content; usage_* and
-- voice_call_admissions contain the immutable proof of what was admitted and
-- charged.

begin;

-- Existing dark/staging rows may still contain SignalWire's three copies of a
-- conversation. Move the useful `call_log` into the contractor-facing row
-- before stripping every transcript from the immutable receipt envelope.
update public.voice_calls c
   set transcript = transcript.call_log
  from public.voice_events e
  cross join lateral (
    select coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
          'role', nullif(pg_catalog.btrim(turn.value ->> 'role'), ''),
          'content', nullif(pg_catalog.btrim(turn.value ->> 'content'), ''),
          'timestamp', case
            when pg_catalog.jsonb_typeof(turn.value -> 'timestamp') = 'number'
              then turn.value -> 'timestamp'
            else null
          end
        )) order by turn.ordinal
      ) filter (
        where pg_catalog.jsonb_typeof(turn.value) = 'object'
          and nullif(pg_catalog.btrim(turn.value ->> 'content'), '') is not null
      ),
      '[]'::jsonb
    ) as call_log
      from pg_catalog.jsonb_array_elements(
        case
          when pg_catalog.jsonb_typeof(e.payload -> 'call_log') = 'array'
            then e.payload -> 'call_log'
          else '[]'::jsonb
        end
      ) with ordinality as turn(value, ordinal)
  ) transcript
 where c.transcript is null
   and pg_catalog.jsonb_typeof(e.payload -> 'call_log') = 'array'
   and (
     c.voice_event_id = e.id
     or (
       c.provider = e.provider
       and c.provider_call_id = e.provider_call_id
     )
   );

-- Rewrite events to the same transcript-free envelope the application now
-- sends to ingest_voice_event. The persisted hash follows the persisted JSON
-- so an identical minimized provider retry remains an exact replay.
with minimized as (
  select e.id,
         pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'action', e.payload -> 'action',
      'call_id', e.payload -> 'call_id',
      'project_id', e.payload -> 'project_id',
      'space_id', e.payload -> 'space_id',
      'conversation_type', e.payload -> 'conversation_type',
      'call_start_date', e.payload -> 'call_start_date',
      'call_answer_date', e.payload -> 'call_answer_date',
      'call_end_date', e.payload -> 'call_end_date',
      'ai_start_date', e.payload -> 'ai_start_date',
      'ai_end_date', e.payload -> 'ai_end_date',
      'caller_id_number', e.payload -> 'caller_id_number',
      'summary', pg_catalog.to_jsonb(coalesce(
        nullif(pg_catalog.btrim(e.payload #>> '{post_prompt_data,substituted}'), ''),
        nullif(pg_catalog.btrim(e.payload #>> '{post_prompt_data,raw}'), ''),
        (
          select nullif(pg_catalog.btrim(turn.value ->> 'content'), '')
            from pg_catalog.jsonb_array_elements(
              case
                when pg_catalog.jsonb_typeof(e.payload -> 'call_log') = 'array'
                  then e.payload -> 'call_log'
                else '[]'::jsonb
              end
            ) with ordinality as turn(value, ordinal)
           where turn.value ->> 'role' = 'assistant'
           order by turn.ordinal desc
           limit 1
        )
      )),
      'SWMLCall', case
        when nullif(pg_catalog.btrim(e.payload #>> '{SWMLCall,call_id}'), '') is not null
          then pg_catalog.jsonb_build_object(
            'call_id', e.payload #>> '{SWMLCall,call_id}'
          )
        else null
      end,
      'SWMLVars', case
        when nullif(pg_catalog.btrim(
          e.payload #>> '{SWMLVars,userVariables,memberCallId}'
        ), '') is not null then pg_catalog.jsonb_build_object(
          'userVariables', pg_catalog.jsonb_build_object(
            'memberCallId', e.payload #>> '{SWMLVars,userVariables,memberCallId}'
          )
        )
        else null
      end
         )) as payload
    from public.voice_events e
   where e.payload ?| array['call_log', 'raw_call_log', 'call_timeline', 'post_prompt_data']
      or not (e.payload ? 'summary')
)
update public.voice_events e
   set payload = minimized.payload,
       payload_sha256 = pg_catalog.encode(
         extensions.digest(
           pg_catalog.convert_to(minimized.payload::text, 'UTF8'),
           'sha256'
         ),
         'hex'
       )
  from minimized
 where e.id = minimized.id;

alter table public.voice_events
  drop constraint if exists voice_events_minimized_payload_check;
alter table public.voice_events
  add constraint voice_events_minimized_payload_check check (
    not (payload ?| array['call_log', 'raw_call_log', 'call_timeline', 'post_prompt_data'])
    and (
      not (payload ? 'summary')
      or pg_catalog.jsonb_typeof(payload -> 'summary') = 'string'
    )
  );

-- Catalog values are 30 or 90 today. Clamp rather than trusting arbitrary
-- JSON so a malformed or bespoke entitlement cannot retain caller content
-- forever (or erase it immediately). Missing entitlement evidence is the
-- privacy-safe shorter window.
create or replace function public.voice_history_retention_days(
  p_feature_limits jsonb
)
returns integer
language sql
immutable
set search_path = pg_catalog, pg_temp
as $fn$
  select least(90, greatest(30,
    case
      when pg_catalog.length(p_feature_limits ->> 'voice_history_days') between 1 and 3
       and (p_feature_limits ->> 'voice_history_days') ~ '^[0-9]+$'
        then (p_feature_limits ->> 'voice_history_days')::integer
      else 30
    end
  ))
$fn$;

-- RLS is part of retention, not merely tenant isolation. The daily purge may
-- run hours after a row expires (or may be temporarily unhealthy); a direct
-- Supabase REST query must still be unable to read it. This predicate reveals
-- no entitlement data and returns false for every non-owner account.
create or replace function public.voice_call_visible_within_retention(
  p_account_id uuid,
  p_created_at timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $fn$
  select coalesce(public.is_owner(p_account_id), false)
     and p_created_at >= pg_catalog.now() - pg_catalog.make_interval(
       days => coalesce((
         select public.voice_history_retention_days(w.feature_limits)
           from public.workspace_entitlements w
          where w.account_id = p_account_id
       ), 30)
     )
$fn$;

drop policy if exists voice_calls_owner_read on public.voice_calls;
create policy voice_calls_owner_read
  on public.voice_calls
  for select
  to authenticated
  using (public.voice_call_visible_within_retention(account_id, created_at));

-- There is deliberately no feature flag around this function or its cron.
-- Once caller content exists, deletion must not depend on product rollout or
-- provider availability. Only terminal inbox rows are eligible: an actively
-- processing or retryable receipt keeps its evidence until processing reaches
-- a durable outcome.
create or replace function public.purge_expired_voice_history(
  p_batch_size integer default 500
)
returns table (
  voice_calls_deleted integer,
  voice_events_deleted integer,
  more_due boolean
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $fn$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_calls integer := 0;
  v_events integer := 0;
  v_more boolean := false;
begin
  if p_batch_size is null or p_batch_size not between 1 and 5000 then
    raise exception 'voice retention batch size must be between 1 and 5000'
      using errcode = '22023';
  end if;

  with candidates as (
    select c.id
      from public.voice_calls c
      left join public.workspace_entitlements w on w.account_id = c.account_id
     where c.created_at < v_now - pg_catalog.make_interval(
       days => public.voice_history_retention_days(w.feature_limits)
     )
       and (
         c.voice_event_id is null
         or exists (
           select 1
             from public.voice_events e
            where e.id = c.voice_event_id
              and (
                e.processing_status in ('processed', 'ignored')
                or (
                  e.processing_status = 'failed'
                  and e.next_attempt_at is null
                  and e.processing_token is null
                  and e.processing_lease_expires_at is null
                )
              )
         )
       )
     order by c.created_at, c.id
     limit p_batch_size
     for update of c skip locked
  ), removed as (
    delete from public.voice_calls c
     using candidates x
     where c.id = x.id
    returning c.id
  )
  select pg_catalog.count(*)::integer into v_calls from removed;

  with candidates as (
    select e.id
      from public.voice_events e
      left join public.workspace_entitlements w on w.account_id = e.account_id
     where e.received_at < v_now - pg_catalog.make_interval(
       days => public.voice_history_retention_days(w.feature_limits)
     )
       and (
         e.processing_status in ('processed', 'ignored')
         or (
           e.processing_status = 'failed'
           and e.next_attempt_at is null
           and e.processing_token is null
           and e.processing_lease_expires_at is null
         )
       )
     order by e.received_at, e.id
     limit p_batch_size
     for update of e skip locked
  ), removed as (
    delete from public.voice_events e
     using candidates x
     where e.id = x.id
    returning e.id
  )
  select pg_catalog.count(*)::integer into v_events from removed;

  select
    exists (
      select 1
        from public.voice_calls c
        left join public.workspace_entitlements w on w.account_id = c.account_id
       where c.created_at < v_now - pg_catalog.make_interval(
         days => public.voice_history_retention_days(w.feature_limits)
       )
         and (
           c.voice_event_id is null
           or exists (
             select 1 from public.voice_events e
              where e.id = c.voice_event_id
                and (
                  e.processing_status in ('processed', 'ignored')
                  or (
                    e.processing_status = 'failed'
                    and e.next_attempt_at is null
                    and e.processing_token is null
                    and e.processing_lease_expires_at is null
                  )
                )
           )
         )
    )
    or exists (
      select 1
        from public.voice_events e
        left join public.workspace_entitlements w on w.account_id = e.account_id
       where e.received_at < v_now - pg_catalog.make_interval(
         days => public.voice_history_retention_days(w.feature_limits)
       )
         and (
           e.processing_status in ('processed', 'ignored')
           or (
             e.processing_status = 'failed'
             and e.next_attempt_at is null
             and e.processing_token is null
             and e.processing_lease_expires_at is null
           )
         )
    )
    into v_more;

  return query select v_calls, v_events, v_more;
end
$fn$;

revoke all on function public.voice_history_retention_days(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.voice_history_retention_days(jsonb)
  to service_role;

revoke all on function public.voice_call_visible_within_retention(uuid, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.voice_call_visible_within_retention(uuid, timestamptz)
  to authenticated;

revoke all on function public.purge_expired_voice_history(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.purge_expired_voice_history(integer)
  to service_role;

commit;
