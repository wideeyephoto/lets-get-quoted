-- A moved billing boundary must not hand out a second month of voice minutes.
--
-- THE LEAK. grant_voice_minute_allowance built its idempotency key out of
-- `p_period_start` verbatim:
--
--   'voice-minutes:v1:' || account_id || ':' || to_char(p_period_start, ...)
--
-- and `period_start` is not stable. The subscription projector writes it from
-- Stripe's `current_period_start` on every subscription event
-- (20260816060000), so a plan change on the 15th moves a workspace from
-- 2026-08-01 to 2026-08-15 mid-month. The next sweep computes a DIFFERENT key,
-- sees no clash, and grants a second full allowance -- for a stretch of time
-- already paid for once. On Scale that is 200 free minutes, worth $70 at the
-- published overage rate.
--
-- Its own comment claimed "one key per workspace per period". The key was per
-- TIMESTAMP, and the timestamp is what moves.
--
-- THE CANONICAL MONTHLY RESET ALREADY GUARDS THIS, differently: it carries a
-- cursor in `next_allowance_reset_at` and refuses when the cursor and the
-- provider period disagree (20260816061500). This function had no cursor and no
-- equivalent, so it is given the guard that fits its shape.
--
-- WHAT IT ASKS INSTEAD. Not "have I used this exact key" but "has this workspace
-- already been granted for any part of this stretch of time". Two periods that
-- overlap are the same coverage under two names, whatever the boundary is
-- called now. A genuine roll does not overlap, so it still grants.
--
-- The period bounds move into the lot's metadata to make that answerable.
-- Comparing against the lot's own `expires_at` would not work: it carries a
-- two-hour tail past period end (see voice_minute_lot_tail), so two ADJACENT
-- months overlap by two hours and the legitimate next grant would be refused.
--
-- A MID-PERIOD UPGRADE GETS NOTHING EXTRA, deliberately. Whether a workspace
-- moving Growth -> Scale on the 15th is owed more minutes for the remainder is
-- a proration question nobody has answered, and refusing is the direction that
-- cannot give away money. When that question is settled this guard is where the
-- answer goes.
--
-- Safe to run now: no voice_minutes lot has ever been granted. The whole voice
-- rail is dark behind LGQ_VOICE_ALLOWANCE_WORKER_ENABLED.

begin;

create or replace function public.grant_voice_minute_allowance(
  p_account_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_limits jsonb;
  v_state text;
  v_included bigint := 0;
  v_purchased bigint := 0;
  v_total bigint;
  v_key text;
begin
  if p_account_id is null or p_period_start is null or p_period_end is null
     or p_period_end <= p_period_start then
    raise exception 'voice allowance period is invalid' using errcode = '22023';
  end if;

  -- The lock. Everything below is serialised per workspace, which is what makes
  -- the overlap check and the grant that follows it a single decision rather
  -- than a read that another sweep can invalidate.
  select e.feature_limits, e.entitlement_state
    into v_limits, v_state
  from public.workspace_entitlements e
  where e.account_id = p_account_id
  for update;

  -- No entitlement, or an archived one, gets nothing. Not an error: a workspace
  -- can exist without a plan, and granting minutes to one that cannot use them
  -- would put a balance on a screen nobody can spend.
  if not found or v_state = 'archived' then
    return 0;
  end if;

  -- ALREADY COVERED FOR THIS STRETCH OF TIME?
  --
  -- Asked of the period, not of the key. Two periods that overlap are the same
  -- coverage under two names, and the name is the part that moves. Read from
  -- metadata rather than from available_from/expires_at, because the lot's
  -- expiry carries a two-hour tail and two adjacent months would appear to
  -- overlap by it.
  if exists (
    select 1
    from public.usage_credit_lots l
    where l.account_id = p_account_id
      and l.resource_code = 'voice_minutes'
      and l.source_type = 'voice_addon'
      and l.metadata ->> 'period_start' is not null
      and l.metadata ->> 'period_end' is not null
      and (l.metadata ->> 'period_start')::timestamptz < p_period_end
      and (l.metadata ->> 'period_end')::timestamptz > p_period_start
  ) then
    return 0;
  end if;

  -- Included with the base plan. Read defensively: a limits map that has never
  -- carried the key is a workspace on an older catalog, not a broken one.
  if pg_catalog.jsonb_typeof(v_limits -> 'voice_included_minutes') = 'number' then
    v_included := greatest(0, (v_limits ->> 'voice_included_minutes')::bigint);
  end if;

  -- Bought as an add-on. Only ACTIVE subscriptions: a canceled or past-due one
  -- must not keep granting, which is the failure the crew-seat SKU is withheld
  -- for -- a ledger that fills on payment and never empties on lapse.
  select coalesce(pg_catalog.sum(c.units), 0)
    into v_purchased
  from public.workspace_purchased_capacity c
  where c.account_id = p_account_id
    and c.resource_code = 'voice_minutes'
    and c.status = 'active';

  v_total := v_included + v_purchased;
  if v_total <= 0 then
    return 0;
  end if;

  -- Kept, and no longer the only defence. This catches an exact replay without
  -- a table scan; the overlap check above catches the boundary that moved.
  v_key := 'voice-minutes:v1:' || p_account_id::text || ':'
    || pg_catalog.to_char(p_period_start at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SSZ');

  perform public.grant_usage_credits(
    p_account_id => p_account_id,
    p_resource_code => 'voice_minutes',
    p_units => v_total,
    p_source_type => 'voice_addon',
    p_idempotency_key => v_key,
    p_available_from => p_period_start,
    -- The tail. See the header: a lot expiring exactly at period end is
    -- ineligible for any reservation that outlives it, and every voice
    -- reservation does.
    p_expires_at => p_period_end + public.voice_minute_lot_tail(),
    p_metadata => pg_catalog.jsonb_build_object(
      'schema', 'voice-allowance.v1',
      'included_minutes', v_included,
      'purchased_minutes', v_purchased,
      -- The period this covers, so the next call can ask whether it overlaps.
      -- Not derivable from the lot: available_from equals period_start today,
      -- but expires_at deliberately does not equal period_end.
      'period_start', p_period_start,
      'period_end', p_period_end
    )
  );

  return v_total;
end;
$$;

revoke all on function public.grant_voice_minute_allowance(uuid, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.grant_voice_minute_allowance(uuid, timestamptz, timestamptz)
  to service_role;

do $post$
declare
  v_src text;
begin
  select p.prosrc into v_src
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prokind = 'f'
    and p.proname = 'grant_voice_minute_allowance';

  if v_src is null then
    raise exception 'grant_voice_minute_allowance is missing';
  end if;

  -- The guard must be present, and must be the OVERLAP form. A check for the
  -- table name alone would pass on a body that merely mentioned it.
  if pg_catalog.strpos(v_src, '(l.metadata ->> ''period_start'')::timestamptz < p_period_end') = 0
     or pg_catalog.strpos(v_src, '(l.metadata ->> ''period_end'')::timestamptz > p_period_start') = 0 then
    raise exception 'the voice allowance grant does not refuse an overlapping period';
  end if;

  -- And the metadata the guard reads must actually be written, or it can never
  -- match and every period grants for ever.
  if pg_catalog.strpos(v_src, '''period_start'', p_period_start') = 0
     or pg_catalog.strpos(v_src, '''period_end'', p_period_end') = 0 then
    raise exception 'the voice allowance grant does not record the period it covers';
  end if;

  -- The lock has to stay: the overlap read and the grant are one decision.
  if pg_catalog.strpos(v_src, 'for update') = 0 then
    raise exception 'the voice allowance grant no longer locks the entitlement row';
  end if;
end
$post$;

commit;
