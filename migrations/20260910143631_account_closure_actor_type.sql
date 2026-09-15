-- Hosted accounts.suspended_by is text (staff identity), not a UUID column.
-- Keep the preceding applied staging migration immutable; assert the exact fix.
do $$
declare
  definition text := pg_get_functiondef('public.request_account_closure_atomic(uuid,uuid,text,text,boolean,boolean,boolean)'::regprocedure);
  needle text := 'then p_requested_by_user_id else suspended_by end';
begin
  if (length(definition) - length(replace(definition, needle, ''))) / length(needle) <> 1 then
    raise exception 'Unexpected account closure actor assignment; review migration ordering';
  end if;
  execute replace(definition, needle, 'then p_requested_by_user_id::text else suspended_by end');
end;
$$;
