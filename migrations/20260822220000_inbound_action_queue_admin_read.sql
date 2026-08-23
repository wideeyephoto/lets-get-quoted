-- Let the operations dashboard see the inbound SMS action queue.
--
-- WHAT WAS WRONG. /admin/messaging has been reporting "inbound SMS action queue
-- could not be read" since the queue shipped. loadMessagingOperationsHealth
-- reads three task tables with the service-role client:
--
--     sms_delivery_tasks          service_role: SELECT
--     payment_sms_producer_tasks  service_role: SELECT
--     sms_inbound_action_tasks    service_role: (nothing)   <- 42501
--
-- 20260821192000 revoked ALL on this table from every role and then granted
-- EXECUTE function by function, which is a stricter posture than either sibling
-- and was almost certainly deliberate. The observability code was nonetheless
-- written against direct table reads, so the page has been half-blind ever
-- since — honestly, it names what it could not read, but blind.
--
-- WHAT WAS NOT WRONG, and why this is a dashboard fix rather than an incident:
-- the rail itself never touches the table directly. The worker claims, applies,
-- completes and fails through SECURITY DEFINER functions, each already granted
-- EXECUTE to service_role. enqueue_sms_inbound_action_task has no grant because
-- it is a TRIGGER function, where EXECUTE is checked at CREATE TRIGGER time and
-- not at fire time. Nothing has been failing to process.
--
-- WHAT THIS DOES NOT OPEN. SELECT only, and only for service_role, which already
-- holds BYPASSRLS — so this grants no visibility that role could not obtain
-- through the functions it can already execute. Every WRITE stays RPC-only, and
-- anon and authenticated stay at nothing. The post-conditions below assert all
-- three, because the whole point of this file is that a missing grant is
-- invisible until something reads.

begin;

grant select on table public.sms_inbound_action_tasks to service_role;

-- ---------------------------------------------------------------------------
-- Post-conditions. The bug being fixed was a grant nobody checked, so check.
-- ---------------------------------------------------------------------------
do $$
declare
  v_oid oid := 'public.sms_inbound_action_tasks'::regclass;
begin
  if not pg_catalog.has_table_privilege('service_role', v_oid, 'select') then
    raise exception 'service_role still cannot read sms_inbound_action_tasks';
  end if;

  -- Mutation stays RPC-only. If this ever passes, the outbox has lost the
  -- property that a task can only move through its claim/apply/complete
  -- functions, and the queue's exactly-once guarantee goes with it.
  if pg_catalog.has_table_privilege('service_role', v_oid, 'insert')
     or pg_catalog.has_table_privilege('service_role', v_oid, 'update')
     or pg_catalog.has_table_privilege('service_role', v_oid, 'delete') then
    raise exception 'sms_inbound_action_tasks became writable outside its RPCs';
  end if;

  -- The tenant-facing roles gain nothing. This table carries every account's
  -- inbound traffic, and it has no RLS policy to fall back on.
  if pg_catalog.has_table_privilege('anon', v_oid, 'select')
     or pg_catalog.has_table_privilege('authenticated', v_oid, 'select') then
    raise exception 'sms_inbound_action_tasks is readable by a tenant role';
  end if;

  -- Unchanged, and load-bearing for the above: with RLS forced and no policy,
  -- a role without BYPASSRLS reads nothing even if it were granted SELECT.
  if not exists (
    select 1 from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'sms_inbound_action_tasks'
       and c.relrowsecurity and c.relforcerowsecurity
  ) then
    raise exception 'row level security is no longer forced on sms_inbound_action_tasks';
  end if;
end $$;

commit;
