-- A crew member cannot open a shift that started yesterday.
--
-- FOLLOW-UP TO 2026-08-22-field-app-hardening.sql, which is already applied.
-- That migration pinned the RATE on a crew-inserted shift and narrowed what a
-- crew UPDATE may touch — started_at is outside the update whitelist, so
-- backdating a RUNNING shift is refused. It said nothing about started_at at
-- INSERT, and the offline queue endpoint exists precisely to accept a start
-- time the server did not witness.
--
-- The application bounds that to LONG_SHIFT_HOURS and now refuses anything
-- older rather than clamping it to the edge (see lib/field-submissions). This
-- is the same rule one layer down, because the insert policy is reachable
-- without going through the application at all: cost_crew_insert and
-- time_entry_crew_insert answer PostgREST directly, and "the endpoint checks
-- it" is only true of the endpoint.
--
-- 13 hours, not 12: the app's bound is meant to be the binding one, and a
-- minute of clock drift between the web host and the database must not turn a
-- legitimate replay into an error somebody has to explain.
--
-- Additive: one condition inside an existing trigger function. Safe to run
-- twice.
--
-- Do NOT apply this with scripts/deploy-schema.mjs.

begin;

create or replace function crew_time_entries_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare pinned numeric;
begin
  -- Owners and the service-role client pass through untouched: closing somebody
  -- else's forgotten shift at a corrected time is exactly their job, and so is
  -- entering one after the fact.
  if not is_crew(new.account_id) then return new; end if;

  if tg_op = 'INSERT' then
    select c.hourly_rate into pinned from crew c where c.id = new.crew_id;
    new.rate := coalesce(pinned, 0);
    new.ended_at := null;
    new.cost_id := null;
    new.closed_by_owner := false;

    -- The window a queued clock-in may reach back into. Beyond it, this is not
    -- a shift that waited for signal — it is a claim about a day that is over.
    if new.started_at < now() - interval '13 hours' then
      raise exception 'a shift cannot start more than 13 hours ago';
    end if;
    -- And never the future. Clock skew is minutes; this is generous about that
    -- and unambiguous past it.
    if new.started_at > now() + interval '15 minutes' then
      raise exception 'a shift cannot start in the future';
    end if;
    return new;
  end if;

  if old.ended_at is not null then
    raise exception 'that shift is already closed';
  end if;
  if (to_jsonb(new) - 'ended_at' - 'cost_id' - 'note')
     is distinct from (to_jsonb(old) - 'ended_at' - 'cost_id' - 'note') then
    raise exception 'crew may only close their own shift';
  end if;
  return new;
end;
$$;

commit;
