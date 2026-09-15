CREATE OR REPLACE FUNCTION public.record_tenant_audit_event_atomic(p_account_id uuid, p_entity_type text, p_entity_id text, p_action text, p_actor jsonb DEFAULT '{}'::jsonb, p_source text DEFAULT 'web'::text, p_request_id text DEFAULT NULL::text, p_delete_operation_id uuid DEFAULT NULL::uuid, p_reason text DEFAULT NULL::text, p_changed_fields text[] DEFAULT '{}'::text[], p_before_state jsonb DEFAULT NULL::jsonb, p_after_state jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare
  v_event_id uuid;
begin
  -- F1 guard: a session (authenticated) caller can only write audit events for
  -- an account they belong to. anon has no EXECUTE; service_role skips the check.
  if auth.role() = 'authenticated' and not public.is_member(p_account_id) then
    raise exception 'record_tenant_audit_event_forbidden'
      using errcode = '42501';
  end if;

  insert into public.tenant_audit_events (
    account_id,
    entity_type,
    entity_id,
    action,
    actor,
    source,
    request_id,
    delete_operation_id,
    reason,
    changed_fields,
    before_state,
    after_state,
    occurred_at
  ) values (
    p_account_id,
    p_entity_type,
    p_entity_id,
    p_action,
    coalesce(p_actor, '{}'::jsonb),
    coalesce(p_source, 'web'),
    p_request_id,
    p_delete_operation_id,
    p_reason,
    coalesce(p_changed_fields, '{}'::text[]),
    p_before_state,
    p_after_state,
    clock_timestamp()
  )
  returning id into v_event_id;

  return v_event_id;
end;
$function$
;
