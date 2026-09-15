-- Preserve the installed function's hardened settings, grants and other logic.
-- A new request in a correction state is not a replay merely because content
-- is unchanged. Same-key retries still return before this branch.
begin;
do $migration$
declare
  target oid;
  definition text;
  old_branch text := 'if v_application.last_submission_fingerprint = p_submission_fingerprint then';
  new_branch text := 'if v_application.last_submission_fingerprint = p_submission_fingerprint
       and v_application.status not in (''action_required'', ''rejected'') then';
  anchor text := '    v_previous_status := v_application.status;';
begin
  select p.oid into strict target from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='submit_messaging_registration_application';
  definition := pg_get_functiondef(target);
  if (length(definition)-length(replace(definition,old_branch,''))) / length(old_branch) <> 1
    or (length(definition)-length(replace(definition,anchor,''))) / length(anchor) <> 1 then
    raise exception 'Unexpected application function definition; review before migration';
  end if;
  definition := replace(definition, old_branch, new_branch);
  definition := replace(definition, anchor, '    if v_application.provider_brand_id is not null
       or v_application.provider_campaign_id is not null
       or v_application.provider_number_id is not null
       or exists (select 1 from public.messaging_managed_registration_operations operation
                  where operation.application_id = v_application.id) then
      raise exception ''Carrier-bound application cannot be resubmitted'' using errcode = ''55000'';
    end if;
' || anchor);
  execute definition;
end
$migration$;
commit;

;
