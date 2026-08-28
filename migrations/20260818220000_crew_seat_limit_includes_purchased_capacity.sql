-- Let a purchased crew seat actually be a seat.
--
-- WHY. Both crew seat RPCs derive their cap from
-- workspace_entitlements.feature_limits -> 'crew_users', which is the PLAN's
-- allowance and nothing else. A workspace can buy a crew_user top-up, be
-- charged $5 a month for it, and find the roster still refuses at the plan
-- number -- because nothing anywhere adds what was bought to what the plan
-- includes. 20260818210000 created the ledger; this is the read that makes it
-- mean something.
--
-- The purchased sum is added AFTER the existing ladder, not merged into
-- feature_limits. That column is recomputed wholesale from the plan by the
-- subscription projector, which also refuses any projection whose limits differ
-- from its own copy -- so a seat written there would be rejected on the way in
-- and erased on the next subscription event.
--
-- TWO FUNCTIONS, TWO PATCHES. create_crew_member_with_seat_entitlement and
-- reactivate_crew_member_with_seat_entitlement each carry their own
-- byte-identical copy of the limit ladder. They are patched separately, each
-- with its own exactly-once assertion, because a single global replace could
-- silently fix one and miss the other -- and two seat gates that disagree about
-- the cap is worse than one that is simply wrong.
--
-- CONCURRENCY IS UNCHANGED. Both functions already hold the entitlement row
-- FOR UPDATE before reading the limit, and the capacity read is issued inside
-- that same transaction, so two concurrent creates still cannot both take the
-- last seat. The added call is STABLE and reads a table; it needs no lock of
-- its own because the entitlement lock already serialises the pair.
--
-- WHAT AN EXPIRED SEAT DOES. When a seat subscription lapses the sum drops and
-- the roster can sit above its cap. This patch never archives or deactivates
-- anybody; the current gate refuses further activation with
-- crew_seat_limit_reached until the roster is back under its cap.
--
-- HOW. Both functions are patched from their own live source rather than
-- retyped, the house pattern -- see 20260818170000_top_up_inbox_ingest_scope.sql.

begin;

-- create_crew_member_with_seat_entitlement
do $$
declare
  v_before text;
  v_after text;
  v_old text;
  v_new text;
begin
  v_before := pg_catalog.pg_get_functiondef(
    'public.create_crew_member_with_seat_entitlement(uuid,text,text,text,text,text,numeric,text,numeric,numeric,text)'
      ::pg_catalog.regprocedure
  );
  v_before := pg_catalog.replace(v_before, pg_catalog.chr(13) || pg_catalog.chr(10), pg_catalog.chr(10));

  if pg_catalog.strpos(v_before, 'workspace_purchased_capacity_units') > 0 then
    return;
  end if;

  if pg_catalog.strpos(v_before, 'v_limit := trunc(v_limit_numeric)::bigint;') > 0 then
    v_old := E'  v_limit := trunc(v_limit_numeric)::bigint;';
    v_new := E'  v_limit := trunc(v_limit_numeric)::bigint\n    + public.workspace_purchased_capacity_units(p_account_id, ''crew_users'');';
  else
    v_old := E'  v_limit := v_limit_numeric::bigint;';
    v_new := E'  v_limit := v_limit_numeric::bigint\n    + public.workspace_purchased_capacity_units(p_account_id, ''crew_users'');';
  end if;

  if pg_catalog.length(v_before)
       - pg_catalog.length(pg_catalog.replace(v_before, v_old, ''))
       is distinct from pg_catalog.length(v_old) then
    raise exception 'crew seat create limit source contract drifted'
      using errcode = '55000';
  end if;
  v_after := pg_catalog.replace(v_before, v_old, v_new);
  execute v_after;
end
$$;

-- reactivate_crew_member_with_seat_entitlement
do $$
declare
  v_before text;
  v_after text;
  v_old text;
  v_new text;
begin
  v_before := pg_catalog.pg_get_functiondef(
    'public.reactivate_crew_member_with_seat_entitlement(uuid,uuid)'
      ::pg_catalog.regprocedure
  );
  v_before := pg_catalog.replace(v_before, pg_catalog.chr(13) || pg_catalog.chr(10), pg_catalog.chr(10));

  if pg_catalog.strpos(v_before, 'workspace_purchased_capacity_units') > 0 then
    return;
  end if;

  if pg_catalog.strpos(v_before, 'v_limit := trunc(v_limit_numeric)::bigint;') > 0 then
    v_old := E'  v_limit := trunc(v_limit_numeric)::bigint;';
    v_new := E'  v_limit := trunc(v_limit_numeric)::bigint\n    + public.workspace_purchased_capacity_units(p_account_id, ''crew_users'');';
  else
    v_old := E'  v_limit := v_limit_numeric::bigint;';
    v_new := E'  v_limit := v_limit_numeric::bigint\n    + public.workspace_purchased_capacity_units(p_account_id, ''crew_users'');';
  end if;

  if pg_catalog.length(v_before)
       - pg_catalog.length(pg_catalog.replace(v_before, v_old, ''))
       is distinct from pg_catalog.length(v_old) then
    raise exception 'crew seat reactivate limit source contract drifted'
      using errcode = '55000';
  end if;
  v_after := pg_catalog.replace(v_before, v_old, v_new);
  execute v_after;
end
$$;

-- Prove BOTH gates now read purchased capacity, and that neither lost the
-- protections around it. One patched gate and one unpatched gate would let a
-- seat be created and then refuse to reactivate it.
do $$
declare
  v_create text;
  v_reactivate text;
begin
  v_create := pg_catalog.pg_get_functiondef(
    'public.create_crew_member_with_seat_entitlement(uuid,text,text,text,text,text,numeric,text,numeric,numeric,text)'
      ::pg_catalog.regprocedure
  );
  v_reactivate := pg_catalog.pg_get_functiondef(
    'public.reactivate_crew_member_with_seat_entitlement(uuid,uuid)'
      ::pg_catalog.regprocedure
  );

  if v_create not like '%workspace_purchased_capacity_units(p_account_id, ''crew_users'')%' then
    raise exception 'crew seat create gate does not read purchased capacity';
  end if;
  if v_reactivate not like '%workspace_purchased_capacity_units(p_account_id, ''crew_users'')%' then
    raise exception 'crew seat reactivate gate does not read purchased capacity';
  end if;

  -- The entitlement lock, the counting predicate and cap outcome are the
  -- reason this gate is safe. A patch that dropped any of them would still
  -- compute the right number and still be wrong.
  if v_create not like '%for update%' or v_reactivate not like '%for update%' then
    raise exception 'crew seat gate lost its entitlement lock';
  end if;
  if v_create not like '%crew_seat_limit_reached%'
     or v_reactivate not like '%crew_seat_limit_reached%' then
    raise exception 'crew seat gate lost a cap outcome';
  end if;
  if v_create not like '%worker_type = ''employee''%'
     or v_reactivate not like '%worker_type = ''employee''%' then
    raise exception 'crew seat gate lost its counting predicate';
  end if;
end;
$$;

commit;
