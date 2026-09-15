-- Flex includes the owner and one additional office user.
-- Update both writers before raising existing snapshots. Preserve larger grants,
-- unrelated limits, purchased capacity, price metadata and billing history.
begin;

do $patch$
declare
  v_signature text;
  v_source text;
  v_old text := '"office_users":1,"crew_users":2';
  v_new text := '"office_users":2,"crew_users":2';
  v_old_count integer;
  v_new_count integer;
begin
  foreach v_signature in array array[
    'public.initialize_workspace_pricing()',
    'public.project_stripe_billing_subscription_event_v1_unchecked(uuid,uuid,jsonb)'
  ] loop
    v_source := pg_catalog.pg_get_functiondef(v_signature::pg_catalog.regprocedure);
    v_old_count := (length(v_source) - length(replace(v_source, v_old, ''))) / length(v_old);
    v_new_count := (length(v_source) - length(replace(v_source, v_new, ''))) / length(v_new);
    if v_old_count = 1 and v_new_count = 0 then
      execute replace(v_source, v_old, v_new);
    elsif v_old_count <> 0 or v_new_count <> 1 then
      raise exception 'Flex office-seat source contract drifted in %', v_signature using errcode = '55000';
    end if;
  end loop;
end $patch$;

update public.workspace_entitlements
set feature_limits = pg_catalog.jsonb_set(feature_limits, '{office_users}', '2'::jsonb),
    updated_at = pg_catalog.now()
where plan_code = 'flex'
  and (feature_limits->>'office_users')::numeric < 2;

do $check$
begin
  if exists (
    select 1 from public.workspace_entitlements
    where plan_code = 'flex'
      and (feature_limits->>'office_users' is null or (feature_limits->>'office_users')::numeric < 2)
  ) then
    raise exception 'Flex workspace remains below two office seats';
  end if;
end $check$;

commit;
