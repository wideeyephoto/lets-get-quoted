-- Actually assert what 20260819190000 claimed to assert.
--
-- WHAT WENT WRONG. That migration ended with a post-condition labelled "THE ONE
-- THAT MATTERS": the canonical monthly allowance reset must not have been made
-- to mention voice_minutes, because voice riding along with the four-resource
-- reset would put every paid workspace's text, email, intake and writing credits
-- at risk. The check read:
--
--   select pg_get_functiondef(p.oid) into v_canonical ... where p.proname =
--     'reset_paid_plan_monthly_allowance';
--   if v_canonical is not null and strpos(v_canonical, 'voice_minutes') > 0 ...
--
-- The function is called `apply_paid_plan_monthly_allowance_reset`. I wrote the
-- words in the wrong order, `v_canonical` came back null, and `is not null`
-- meant the guard could never fire. It committed green on production having
-- verified nothing at all.
--
-- Found by the operator running the verification query beside it, which returned
-- zero rows where it should have returned `false`. The migration's own guard was
-- happy; the query next to it was not, and only one of those was right.
--
-- THE PATTERN, WHICH IS THE ACTUAL LESSON. `if X is not null and <bad>` is not a
-- guard. It is a guard that abstains whenever it cannot find its subject, and
-- "cannot find its subject" is exactly what a typo produces. An absent subject
-- must be a failure, not a pass — so the check below raises when the function is
-- missing, before it looks at what the function says.
--
-- This migration changes nothing. It asserts, and either commits or refuses.

begin;

do $$
declare
  v_definition text;
  v_name text := 'apply_paid_plan_monthly_allowance_reset';
begin
  select pg_catalog.pg_get_functiondef(p.oid)
    into v_definition
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = v_name
  limit 1;

  -- Absent is a FAILURE. This is the whole correction: the previous version
  -- treated "not found" as "nothing to worry about", which is what let a
  -- misspelled name pass as a clean bill of health.
  if v_definition is null then
    raise exception
      'canonical allowance reset %() was not found; this assertion cannot pass without it', v_name;
  end if;

  if pg_catalog.strpos(v_definition, 'voice_minutes') > 0 then
    raise exception
      'canonical allowance reset %() now mentions voice_minutes; voice must stay on its own path', v_name;
  end if;

  -- And it still grants exactly the four it is built around. A reset that
  -- silently lost one would also satisfy "does not mention voice", and the
  -- symptom would be a workspace quietly missing a month of credits.
  if pg_catalog.strpos(v_definition, 'text_segments') = 0
     or pg_catalog.strpos(v_definition, 'marketing_email_sends') = 0
     or pg_catalog.strpos(v_definition, 'ai_intake_threads') = 0
     or pg_catalog.strpos(v_definition, 'ai_writing_drafts') = 0 then
    raise exception 'canonical allowance reset %() no longer grants all four canonical resources', v_name;
  end if;

  -- The voice path exists and is separate. Both halves of the claim, checked.
  if not exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'grant_voice_minute_allowance'
  ) then
    raise exception 'grant_voice_minute_allowance is missing; 20260819190000 did not apply';
  end if;
end $$;

commit;
