-- 20260914170000_revoke_and_guard_unguarded_security_definer_rpcs.sql
--
-- Pentest finding F1 (2026-09-14): three SECURITY DEFINER functions perform
-- RLS-bypassing writes keyed on a caller-supplied p_account_id and carry no
-- authorization check, yet EXECUTE was granted to the `authenticated` role.
-- Any logged-in contractor could call them directly over PostgREST
-- (/rest/v1/rpc/<fn>) against another tenant: soft-delete/restore that tenant's
-- leads/jobs/crew/services/attachments, or forge audit-trail rows.
--
-- The app never needs these from a browser session:
--   * soft_delete_entity_atomic / restore_entity_atomic are only ever called via
--     createAdminClient() (service_role) from server actions that authorize the
--     caller first (src/lib/recoverable-deletions.ts). -> revoke from
--     public/anon/authenticated.
--   * record_tenant_audit_event_atomic IS legitimately called as `authenticated`
--     (inventory server actions pass the session client, src/lib/inventory-db.ts).
--     -> keep the authenticated grant but add an internal membership guard,
--     following the existing public.job_account_id / voice_transcript_retention
--     hardening pattern.

begin;

-- --------------------------------------------------------------------------
-- 1) soft_delete_entity_atomic — service_role only
-- --------------------------------------------------------------------------
revoke execute on function public.soft_delete_entity_atomic(
  uuid, text, text, jsonb, text, text, text, integer
) from public, anon, authenticated;
grant execute on function public.soft_delete_entity_atomic(
  uuid, text, text, jsonb, text, text, text, integer
) to service_role;

-- --------------------------------------------------------------------------
-- 2) restore_entity_atomic — service_role only
-- --------------------------------------------------------------------------
revoke execute on function public.restore_entity_atomic(
  uuid, text, text, jsonb, text, text
) from public, anon, authenticated;
grant execute on function public.restore_entity_atomic(
  uuid, text, text, jsonb, text, text
) to service_role;

-- --------------------------------------------------------------------------
-- 3) record_tenant_audit_event_atomic — keep authenticated, add member guard
--    An authenticated caller may only write audit events for an account they
--    are an active member of. service_role (auth.role() <> 'authenticated')
--    is unaffected, so all server-side / cron paths keep working.
-- --------------------------------------------------------------------------
create or replace function public.record_tenant_audit_event_atomic(
  p_account_id uuid,
  p_entity_type text,
  p_entity_id text,
  p_action text,
  p_actor jsonb DEFAULT '{}'::jsonb,
  p_source text DEFAULT 'web'::text,
  p_request_id text DEFAULT NULL::text,
  p_delete_operation_id uuid DEFAULT NULL::uuid,
  p_reason text DEFAULT NULL::text,
  p_changed_fields text[] DEFAULT '{}'::text[],
  p_before_state jsonb DEFAULT NULL::jsonb,
  p_after_state jsonb DEFAULT NULL::jsonb
)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'pg_temp'
as $function$
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
$function$;

revoke execute on function public.record_tenant_audit_event_atomic(
  uuid, text, text, text, jsonb, text, text, uuid, text, text[], jsonb, jsonb
) from public, anon;
grant execute on function public.record_tenant_audit_event_atomic(
  uuid, text, text, text, jsonb, text, text, uuid, text, text[], jsonb, jsonb
) to authenticated, service_role;

commit;
