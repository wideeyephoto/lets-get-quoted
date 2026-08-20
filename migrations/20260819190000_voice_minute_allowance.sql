-- Grant voice minutes, so the meter has something to measure.
--
-- THE BLOCKER THIS REMOVES. Nothing fills a `voice_minutes` ledger. The monthly
-- allowance reset grants exactly four canonical resources and voice is not among
-- them, so with the meter on every call reports `exhausted_not_enforced` and
-- measures nothing, and with the gate on every caller goes to voicemail. This is
-- §0 of docs/ai-voice-go-live-runbook.md.
--
-- WHY NOT A FIFTH CANONICAL RESOURCE. 20260816061500 hard-codes success as
-- `verified_lot_count = 4`, in a CHECK, in the selector, and in a runtime raise.
-- Adding a fifth would make the monthly reset fail for EVERY paid workspace at
-- the next period boundary — the credit grants for text, email, intake and
-- writing, not just voice. That is a much larger blast radius than the feature
-- being added, so voice gets its own path and the canonical four stay untouched.
--
-- `usage_credit_lots.source_type` has permitted 'voice_addon' since
-- 20260815213142 and nothing has ever written it. This is what it was for.
--
-- TWO SOURCES, ONE GRANT. A workspace's monthly voice allowance is what its base
-- plan includes plus what it has bought:
--   * Scale includes 100 minutes, carried in feature_limits.voice_included_minutes;
--   * Flex, Solo and Growth buy the add-on, which lands in
--     workspace_purchased_capacity as ai_voice_flex / _solo / _growth.
-- Both are summed into one lot, because a contractor has one balance and the
-- ledger should not make them reconcile two.
--
-- THE EXPIRY TAIL IS NOT DECORATION. `reserve_usage_credits` only draws on lots
-- that OUTLIVE the reservation, and a voice hold is 90 minutes because it must
-- outlast the published 60-minute call cap. A lot expiring exactly at period end
-- is therefore ineligible for the last 90 minutes of every period: a call would
-- refuse for insufficient credits while the credits sat visibly in the balance,
-- silently, once a month, per workspace. The tail is what stops that, and it is
-- deliberately longer than the hold rather than equal to it.

begin;

-- The add-on is a recurring capacity purchase, same as storage and the seats.
alter table public.workspace_purchased_capacity
  drop constraint if exists workspace_purchased_capacity_top_up_id_check;
alter table public.workspace_purchased_capacity
  add constraint workspace_purchased_capacity_top_up_id_check
  check (top_up_id in (
    'crew_user', 'office_user', 'storage_100gb',
    'ai_voice_flex', 'ai_voice_solo', 'ai_voice_growth'
  ));

/**
 * How long a voice lot outlives its period.
 *
 * 90-minute hold + margin. Written as a constant in one place so the reason
 * survives: the number is derived from RESERVATION_TTL_MS in
 * voice-minute-usage.ts, and the two moving apart reintroduces the monthly
 * refusal this exists to prevent.
 */
create or replace function public.voice_minute_lot_tail()
returns interval
language sql
immutable
as $tail$
  select interval '2 hours'
$tail$;

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

  -- One key per workspace per period. A second run in the same period is a
  -- no-op rather than a second month's minutes, which is what makes this safe
  -- to call from a sweep that may overlap itself.
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
      'purchased_minutes', v_purchased
    )
  );

  return v_total;
end;
$$;

revoke all on function public.grant_voice_minute_allowance(uuid, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.grant_voice_minute_allowance(uuid, timestamptz, timestamptz)
  to service_role;

do $$
declare
  v_canonical text;
begin
  if not exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'grant_voice_minute_allowance'
  ) then
    raise exception 'grant_voice_minute_allowance was not created';
  end if;

  -- THE ONE THAT MATTERS. The canonical monthly reset must be exactly as it was.
  -- Voice getting its own path is the entire point; if this migration has
  -- touched the four-resource reset, it has put every paid workspace's text,
  -- email, intake and writing credits at risk to add a fifth.
  select pg_catalog.pg_get_functiondef(p.oid) into v_canonical
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'reset_paid_plan_monthly_allowance'
  limit 1;

  if v_canonical is not null and pg_catalog.strpos(v_canonical, 'voice_minutes') > 0 then
    raise exception 'the canonical monthly reset now mentions voice_minutes; it must not';
  end if;
end $$;

commit;
