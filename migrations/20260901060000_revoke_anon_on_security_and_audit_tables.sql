-- Migration: 20260901060000_revoke_anon_on_security_and_audit_tables.sql
-- Description: Revoke anon and public table-level privileges on API credentials, audit logs,
-- integration events, recoverable deletions, and webhook infrastructure tables.

begin;

-- ============================================================================
-- 1. Revoke all privileges on security, audit, and webhook tables from anon and public
-- ============================================================================

revoke all on table public.api_credentials from anon, public;
revoke all on table public.api_idempotency_records from anon, public;
revoke all on table public.api_request_audit from anon, public;
revoke all on table public.integration_events from anon, public;
revoke all on table public.webhook_subscriptions from anon, public;
revoke all on table public.webhook_deliveries from anon, public;
revoke all on table public.webhook_delivery_attempts from anon, public;
revoke all on table public.tenant_audit_events from anon, public;
revoke all on table public.recoverable_deletions from anon, public;

-- ============================================================================
-- 2. Explicit grants for authenticated role on tenant-accessible tables (governed by RLS)
-- ============================================================================

grant select, insert, update, delete on table public.api_credentials to authenticated;
grant select, insert, update, delete on table public.webhook_subscriptions to authenticated;
grant select on table public.webhook_deliveries to authenticated;
grant select on table public.webhook_delivery_attempts to authenticated;
grant select on table public.tenant_audit_events to authenticated;
grant select, insert, update, delete on table public.recoverable_deletions to authenticated;

-- Internal transactional worker & audit tables are restricted away from direct authenticated access
revoke all on table public.api_idempotency_records from authenticated;
revoke all on table public.api_request_audit from authenticated;
revoke all on table public.integration_events from authenticated;

-- ============================================================================
-- 3. Ensure service_role maintains all privileges
-- ============================================================================

grant all on table public.api_credentials to service_role;
grant all on table public.api_idempotency_records to service_role;
grant all on table public.api_request_audit to service_role;
grant all on table public.integration_events to service_role;
grant all on table public.webhook_subscriptions to service_role;
grant all on table public.webhook_deliveries to service_role;
grant all on table public.webhook_delivery_attempts to service_role;
grant all on table public.tenant_audit_events to service_role;
grant all on table public.recoverable_deletions to service_role;

-- ============================================================================
-- 4. Verification post-condition
-- ============================================================================

do $$
declare
  v_bad text;
begin
  select pg_catalog.string_agg(distinct (g.relname || ':' || g.grantee_name || ':' || g.privilege_type), ', ') into v_bad
  from (
    select c.relname,
           pg_catalog.pg_get_userbyid(x.grantee) as grantee_name,
           x.privilege_type
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      cross join lateral pg_catalog.aclexplode(coalesce(c.relacl, '{}'::aclitem[])) x
     where n.nspname = 'public'
       and c.relname in (
         'api_credentials',
         'api_idempotency_records',
         'api_request_audit',
         'integration_events',
         'webhook_subscriptions',
         'webhook_deliveries',
         'webhook_delivery_attempts',
         'tenant_audit_events',
         'recoverable_deletions'
       )
  ) g
  where g.grantee_name in ('anon', 'public');

  if v_bad is not null then
    raise exception 'Security table(s) still hold anon/public grants: %', v_bad;
  end if;
end $$;

commit;
