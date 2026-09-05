begin;

-- Remove inherited table privileges that are not guarded by row policies.
revoke all on public.inventory_tool_custody_log,
  public.inventory_van_kit_templates, public.marketing_tracking_links,
  public.insurance_claims from public, anon, authenticated;
grant select, insert on public.inventory_tool_custody_log to authenticated;
grant select, insert, update, delete on public.inventory_van_kit_templates,
  public.marketing_tracking_links, public.insurance_claims to authenticated;
grant all on public.inventory_tool_custody_log,
  public.inventory_van_kit_templates, public.marketing_tracking_links,
  public.insurance_claims to service_role;

revoke all on function public.enforce_inventory_maintenance_immutable()
  from public, anon, authenticated;

-- The membership compatibility view must obey memberships RLS for its caller.
create or replace view public.account_memberships with (security_invoker = true) as
  select id, account_id, user_id, role, created_at, deactivated_at,
    (deactivated_at is null) as active
  from public.memberships;
revoke all on public.account_memberships from public, anon, authenticated;
grant select on public.account_memberships to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
