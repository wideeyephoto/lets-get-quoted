-- Let an operator record the decision they are entitled to record.
--
-- WHY. record_direct_checkout_late_success_manual_disposition validates the
-- billing event behind a retain-hold or manual disposition before writing the
-- durable resolution. One clause in that validation is inverted, and the effect
-- is that NO legitimate event can satisfy it.
--
-- The clause sits inside a positive conjunction -- the acceptance half of a
-- `not (...)` -- and reads:
--
--   and v_event.projection_applied is distinct from false
--
-- so it demands that projection_applied be anything EXCEPT false. It admits
-- three projection_result values, and all three are written by one statement in
-- 20260816194056_direct_checkout_late_success_reconciliation.sql (lines
-- 1830-1848): a single CASE picks the result, and the update beneath it sets
--
--   projection_applied = false
--
-- unconditionally, for all three. So every event this branch is meant to accept
-- carries exactly the one value the clause rejects, and the function raises
-- 55000 'late-success manual disposition event is not held for review' for a
-- valid disposition. An operator cannot durably record a retain-hold. The money
-- stays protected -- the hold still holds and refund release stays invalid --
-- but the task sits in manual review needing a human to unstick it.
--
-- WHY NOT SIMPLY DROP THE CONDITION. Requiring false is stronger and is what the
-- writers actually produce. Accepting true would admit a state no production
-- path creates, which is how a guard stops being a guard.
--
-- WHY THIS IS NOT THE SAME AS LINE 1893. That one is the settle guard, it admits
-- only direct_payment_late_success_resolution_pending, and it lives in a
-- rejection-oriented OR chain where `is distinct from false` correctly REJECTS
-- anything not exactly false. The two gate different event classes deliberately.
-- Only the acceptance-side copy is inverted, which is precisely why reading one
-- and assuming the other is safe would have got this wrong.
--
-- HOW THIS WAS FOUND. The PG17 race suite that covers this function had never
-- executed -- two independent bugs stopped it starting, and both are now fixed.
-- The first time it ran, this raised. The defect and the test that catches it
-- were introduced together in fb5b7d57 and neither had ever run.
--
-- The function is patched from its own live source rather than retyped, the
-- house pattern. Every dollar-quote below is tag-delimited, and no comment
-- inside a DO body contains a delimiter -- see 20260818200000 for why that
-- second rule exists.

begin;

do $$
declare
  v_before text;
  v_after text;
  v_old text := $needle$
         and v_event.projection_applied is distinct from false$needle$;
  v_new text := $needle$
         and v_event.projection_applied is not distinct from false$needle$;
begin
  v_before := pg_catalog.pg_get_functiondef(
    'public.record_direct_checkout_late_success_manual_disposition(uuid,uuid,uuid,text,text,text,text,text,uuid)'
      ::pg_catalog.regprocedure
  );
  v_before := pg_catalog.replace(v_before, pg_catalog.chr(13) || pg_catalog.chr(10), pg_catalog.chr(10));
  v_old := pg_catalog.replace(v_old, pg_catalog.chr(13) || pg_catalog.chr(10), pg_catalog.chr(10));
  v_new := pg_catalog.replace(v_new, pg_catalog.chr(13) || pg_catalog.chr(10), pg_catalog.chr(10));

  if pg_catalog.strpos(v_before, 'projection_applied is not distinct from false') > 0 then
    return;
  end if;

  if pg_catalog.length(v_before)
       - pg_catalog.length(pg_catalog.replace(v_before, v_old, ''))
       is distinct from pg_catalog.length(v_old) then
    raise exception 'late-success manual disposition applied check source contract drifted'
      using errcode = '55000';
  end if;
  v_after := pg_catalog.replace(v_before, v_old, v_new);
  execute v_after;
end
$$;

-- Prove the acceptance branch was corrected and nothing around it was lost.
do $$
declare
  v_source text;
begin
  v_source := pg_catalog.pg_get_functiondef(
    'public.record_direct_checkout_late_success_manual_disposition(uuid,uuid,uuid,text,text,text,text,text,uuid)'
      ::pg_catalog.regprocedure
  );
  v_source := pg_catalog.replace(v_source, pg_catalog.chr(13) || pg_catalog.chr(10), pg_catalog.chr(10));

  if v_source not like '%projection_applied is not distinct from false%' then
    raise exception 'late-success manual disposition applied check was not corrected';
  end if;

  -- The three results this branch exists to accept, and the manual_review
  -- alternative beside it, must all still be named.
  if v_source not like '%direct_payment_late_success_resolution_pending%'
     or v_source not like '%direct_payment_late_success_manual_review%'
     or v_source not like '%direct_payment_additional_paid_truth_manual_review%' then
    raise exception 'late-success manual disposition lost an accepted projection result';
  end if;
  if v_source not like '%late-success manual disposition event is not held for review%' then
    raise exception 'late-success manual disposition lost its rejection path';
  end if;
  if v_source not like '%stripe_connected_payment_projection_v1%' then
    raise exception 'late-success manual disposition lost its schema-version check';
  end if;
end;
$$;

commit;
