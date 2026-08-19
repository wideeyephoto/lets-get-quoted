-- Tell the caller when an already-settled resolution has gone stale.
--
-- WHY. settle_direct_checkout_late_success_task computes two fresh fingerprints
-- near the top -- v_expected_task_set and v_expected_evidence -- and compares
-- them against the caller's only AFTER the replay branch has already returned.
-- On the replay path they are computed and thrown away.
--
-- The replay branch checks the caller's fingerprints against the STORED
-- resolution's. Those two still agree with each other after a second paid fact
-- lands, because both describe the same past. So a replay answers
-- 'already_settled' while live evidence says the settlement no longer covers
-- everything that has been paid.
--
-- No money moves wrongly -- the active hold blocks refund release either way --
-- but the RPC describes a stale resolution as current, which can delay
-- recognition of an extra charge.
--
-- WHY NOT RAISE. Hoisting the fresh-evidence check above the replay branch was
-- the smaller change and is what the test author expected. It was rejected on
-- purpose: 'already_settled' exists so an honest retry of an identical call
-- gets an identical answer. Turning a network retry into an error, on a rail
-- carrying real payments, trades a reporting gap for an availability one. The
-- staleness is information the caller needs, not a reason to fail the call. So
-- the call still succeeds, and now it says so.
--
-- WHY DROP AND CREATE. This adds an OUT column, which changes the return type,
-- and CREATE OR REPLACE refuses that with 42P13 -- the usual patch-in-place
-- trick cannot be used here. The body is therefore carried across verbatim from
-- pg_proc.prosrc with only the two return sites rewritten, the header is
-- restated below, and everything a recreate could silently change -- owner,
-- security definer, search_path, timezone, volatility, the grants -- is
-- asserted rather than assumed. A SECURITY DEFINER function runs as its owner,
-- so recreating it under a different role would quietly change who it runs as.
-- That check is why this migration is so much longer than its diff.
--
-- Every dollar-quote below is tag-delimited and no comment inside a DO body
-- contains one -- see 20260818200000 for why that second rule exists.

begin;

do $patch$
declare
  v_oid pg_catalog.oid;
  v_body text;
  v_new_body text;
  v_owner text;
  v_config text[];
  v_ddl text;
  v_old_replay text := $needle$
      v_resolution.paid_operation_pk;$needle$;
  v_new_replay text := $needle$
      v_resolution.paid_operation_pk,
      (v_expected_task_set is distinct from p_task_set_sha256
        or v_expected_evidence is distinct from p_evidence_sha256);$needle$;
  v_old_settled text := $needle$
    'settled'::text, p_payment_id, p_task_id, v_paid.id;$needle$;
  v_new_settled text := $needle$
    'settled'::text, p_payment_id, p_task_id, v_paid.id, false;$needle$;
begin
  v_oid := 'public.settle_direct_checkout_late_success_task(uuid,uuid,uuid,text,text,text,text,uuid)'
    ::pg_catalog.regprocedure;

  if pg_catalog.strpos(pg_catalog.pg_get_function_result(v_oid), 'evidence_moved') > 0 then
    return;
  end if;

  select p.prosrc, pg_catalog.pg_get_userbyid(p.proowner), p.proconfig
    into v_body, v_owner, v_config
    from pg_catalog.pg_proc p
   where p.oid = v_oid;

  if v_owner is distinct from current_user then
    raise exception 'late-success settle owner would change on recreate'
      using errcode = '55000';
  end if;
  -- POSTGRESQL STORES WHAT IT NORMALISES, NOT WHAT THE DDL SAYS. `set
  -- search_path = ''` is stored as search_path="" (with the quotes), and the GUC
  -- name is canonicalised to TimeZone. This comparison was originally written
  -- from the DDL text below -- array['search_path=', 'timezone=UTC'] -- which
  -- matches nothing on any PostgreSQL, so this migration could never have run
  -- anywhere. Production refused it at 55000 with a config that was completely
  -- healthy, and 63 other functions there carry the identical shape.
  --
  -- Checked semantically rather than against a second hand-written literal,
  -- because a literal is what failed. What must survive the recreate is the
  -- property, not the spelling: this SECURITY DEFINER function keeps an EMPTY
  -- pinned search_path, keeps UTC, and carries nothing else. Both spellings of
  -- an empty search_path are accepted; anything that is not empty is not.
  if pg_catalog.array_length(v_config, 1) is distinct from 2
     or not exists (
       select 1
         from pg_catalog.unnest(v_config) as s
        where pg_catalog.btrim(s) in ('search_path=""', 'search_path=')
     )
     or not exists (
       select 1
         from pg_catalog.unnest(v_config) as s
        where pg_catalog.lower(pg_catalog.btrim(s)) = 'timezone=utc'
     ) then
    -- The value is named in the message. Diagnosing the original failure cost a
    -- round trip to production precisely because it was not.
    raise exception 'late-success settle config would change on recreate: %', v_config
      using errcode = '55000';
  end if;

  v_body := pg_catalog.replace(v_body, pg_catalog.chr(13) || pg_catalog.chr(10), pg_catalog.chr(10));
  v_old_replay := pg_catalog.replace(v_old_replay, pg_catalog.chr(13) || pg_catalog.chr(10), pg_catalog.chr(10));
  v_new_replay := pg_catalog.replace(v_new_replay, pg_catalog.chr(13) || pg_catalog.chr(10), pg_catalog.chr(10));
  v_old_settled := pg_catalog.replace(v_old_settled, pg_catalog.chr(13) || pg_catalog.chr(10), pg_catalog.chr(10));
  v_new_settled := pg_catalog.replace(v_new_settled, pg_catalog.chr(13) || pg_catalog.chr(10), pg_catalog.chr(10));

  if pg_catalog.length(v_body)
       - pg_catalog.length(pg_catalog.replace(v_body, v_old_replay, ''))
       is distinct from pg_catalog.length(v_old_replay) then
    raise exception 'late-success settle replay return drifted'
      using errcode = '55000';
  end if;
  if pg_catalog.length(v_body)
       - pg_catalog.length(pg_catalog.replace(v_body, v_old_settled, ''))
       is distinct from pg_catalog.length(v_old_settled) then
    raise exception 'late-success settle applied return drifted'
      using errcode = '55000';
  end if;

  v_new_body := pg_catalog.replace(v_body, v_old_replay, v_new_replay);
  v_new_body := pg_catalog.replace(v_new_body, v_old_settled, v_new_settled);

  v_ddl := $ddl$create function public.settle_direct_checkout_late_success_task(
  p_account_id uuid,
  p_payment_id uuid,
  p_task_id uuid,
  p_operation_id text,
  p_request_sha256 text,
  p_task_set_sha256 text,
  p_evidence_sha256 text,
  p_actor_user_id uuid
)
returns table (
  resolution_schema text,
  resolution_id uuid,
  applied boolean,
  result_code text,
  payment_id uuid,
  task_id uuid,
  paid_operation_pk uuid,
  evidence_moved boolean
)
language plpgsql
security definer
set search_path = ''
set timezone to 'UTC'
as $ddl$ || pg_catalog.quote_literal(v_new_body) || ';';

  drop function public.settle_direct_checkout_late_success_task(
    uuid, uuid, uuid, text, text, text, text, uuid
  );
  execute v_ddl;
end
$patch$;

revoke all on function public.settle_direct_checkout_late_success_task(
  uuid, uuid, uuid, text, text, text, text, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.settle_direct_checkout_late_success_task(
  uuid, uuid, uuid, text, text, text, text, uuid
) to service_role;

-- Prove the column landed, the body survived, and the recreate changed nothing
-- else about how this function runs or who is allowed to run it.
do $verify$
declare
  v_oid pg_catalog.oid;
  v_result text;
  v_body text;
begin
  v_oid := 'public.settle_direct_checkout_late_success_task(uuid,uuid,uuid,text,text,text,text,uuid)'
    ::pg_catalog.regprocedure;
  v_result := pg_catalog.pg_get_function_result(v_oid);
  select p.prosrc into v_body from pg_catalog.pg_proc p where p.oid = v_oid;

  if pg_catalog.strpos(v_result, 'evidence_moved boolean') = 0 then
    raise exception 'late-success settle did not gain evidence_moved';
  end if;
  if v_body not like '%or v_expected_evidence is distinct from p_evidence_sha256);%' then
    raise exception 'late-success settle replay does not report moved evidence';
  end if;
  if v_body not like '%p_task_id, v_paid.id, false;%' then
    raise exception 'late-success settle applied path lost its moved-evidence value';
  end if;

  if v_body not like '%late-success settle replay conflicts with durable outcome%'
     or v_body not like '%late-success settle evidence changed after planning%'
     or v_body not like '%late-success settlement actor identity is not a live Auth user%'
     or v_body not like '%payment already has a different late-success settlement resolution%'
     or v_body not like '%late-success settlement task was not atomically enqueued%' then
    raise exception 'late-success settle lost a guard during recreate';
  end if;
  if v_body not like '%pg_advisory_xact_lock%' then
    raise exception 'late-success settle lost its session mutex';
  end if;

  -- The SAME normalisation trap as the pre-flight guard above, and the reason
  -- fixing only that one would have moved the failure rather than removed it:
  -- this runs AFTER the recreate, so it would have rolled back a function that
  -- had just been rebuilt correctly. Checked by property for the same reason.
  if not exists (
    select 1 from pg_catalog.pg_proc p
     where p.oid = v_oid
       and p.prosecdef
       and p.proretset
       and p.provolatile = 'v'
       and pg_catalog.array_length(p.proconfig, 1) = 2
       and exists (
         select 1
           from pg_catalog.unnest(p.proconfig) as s
          where pg_catalog.btrim(s) in ('search_path=""', 'search_path=')
       )
       and exists (
         select 1
           from pg_catalog.unnest(p.proconfig) as s
          where pg_catalog.lower(pg_catalog.btrim(s)) = 'timezone=utc'
       )
  ) then
    raise exception 'late-success settle recreate changed how the function runs';
  end if;

  if not pg_catalog.has_function_privilege('service_role', v_oid, 'EXECUTE') then
    raise exception 'late-success settle is not executable by service_role';
  end if;
  if pg_catalog.has_function_privilege('anon', v_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', v_oid, 'EXECUTE') then
    raise exception 'late-success settle became executable by an untrusted role';
  end if;
end;
$verify$;

commit;
