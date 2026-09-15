-- Remove the obsolete enqueue_sms_delivery overload left behind when
-- p_available_at was added as an optional thirteenth argument. Keeping both
-- signatures makes named twelve-argument calls ambiguous inside PostgreSQL,
-- which prevents field-intake confirmations from being enqueued.

begin;

do $$
begin
  if not exists (
    select 1
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'enqueue_sms_delivery'
       and p.pronargs = 13
       and p.pronargdefaults = 4
       and p.proargnames[13] = 'p_available_at'
       and p.oid = pg_catalog.to_regprocedure(
         'public.enqueue_sms_delivery(uuid,text,text,text,text,text,text,text,text,uuid,uuid,uuid,timestamptz)'
       )
  ) then
    raise exception 'The delayed SMS enqueue function must exist before overload cleanup';
  end if;
end
$$;

-- Restore the original server-only boundary. The delayed-delivery migration
-- accidentally granted this SECURITY DEFINER function to authenticated users,
-- but every producer calls it from privileged server/database code.
revoke all on function public.enqueue_sms_delivery(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  uuid,
  uuid,
  uuid,
  timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.enqueue_sms_delivery(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  uuid,
  uuid,
  uuid,
  timestamptz
) to service_role;

-- No CASCADE: fail closed if a schema object unexpectedly depends on the old
-- function OID. Existing twelve-argument callers resolve to the retained
-- thirteen-argument function because p_available_at defaults to NULL.
drop function if exists public.enqueue_sms_delivery(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  uuid,
  uuid,
  uuid
);

do $$
declare
  v_overload_count integer;
begin
  select pg_catalog.count(*)::integer
    into v_overload_count
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'enqueue_sms_delivery';

  if v_overload_count <> 1 then
    raise exception 'enqueue_sms_delivery overload cleanup is incomplete';
  end if;

  if not pg_catalog.has_function_privilege(
    'service_role',
    'public.enqueue_sms_delivery(uuid,text,text,text,text,text,text,text,text,uuid,uuid,uuid,timestamptz)',
    'execute'
  ) then
    raise exception 'service_role lost enqueue_sms_delivery execute access';
  end if;

  if pg_catalog.has_function_privilege(
    'anon',
    'public.enqueue_sms_delivery(uuid,text,text,text,text,text,text,text,text,uuid,uuid,uuid,timestamptz)',
    'execute'
  ) then
    raise exception 'anon unexpectedly gained enqueue_sms_delivery execute access';
  end if;

  if pg_catalog.has_function_privilege(
    'authenticated',
    'public.enqueue_sms_delivery(uuid,text,text,text,text,text,text,text,text,uuid,uuid,uuid,timestamptz)',
    'execute'
  ) then
    raise exception 'authenticated unexpectedly retained enqueue_sms_delivery execute access';
  end if;
end
$$;

notify pgrst, 'reload schema';

commit;
