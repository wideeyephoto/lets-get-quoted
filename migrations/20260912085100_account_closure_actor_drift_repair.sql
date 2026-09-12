-- Restore the approved actor cast if an older function definition was reapplied.
-- Accept the already-correct definition unchanged; reject unfamiliar definitions.
do $$
declare
  definition text;
  old_actor text := 'then p_requested_by_user_id else suspended_by end';
  correct_actor text := 'then p_requested_by_user_id::text else suspended_by end';
  old_count integer;
  correct_count integer;
begin
  if (select data_type from information_schema.columns
      where table_schema = 'public' and table_name = 'accounts' and column_name = 'suspended_by') is distinct from 'text' then
    raise exception 'Unexpected accounts.suspended_by type; review closure actor repair';
  end if;

  definition := pg_get_functiondef('public.request_account_closure_atomic(uuid,uuid,text,text,boolean,boolean,boolean)'::regprocedure);
  old_count := (length(definition) - length(replace(definition, old_actor, ''))) / length(old_actor);
  correct_count := (length(definition) - length(replace(definition, correct_actor, ''))) / length(correct_actor);
  if old_count = 1 and correct_count = 0 then
    execute replace(definition, old_actor, correct_actor);
  elsif old_count <> 0 or correct_count <> 1 then
    raise exception 'Unexpected account closure actor definition; refusing to replace newer logic';
  end if;

  if has_function_privilege('anon', 'public.request_account_closure_atomic(uuid,uuid,text,text,boolean,boolean,boolean)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.request_account_closure_atomic(uuid,uuid,text,text,boolean,boolean,boolean)', 'EXECUTE') then
    raise exception 'Account closure request must remain inaccessible to browser roles';
  end if;
end;
$$;
