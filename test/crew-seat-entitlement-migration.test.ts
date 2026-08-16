import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION_FILE = '20260816044858_crew_seat_entitlement_gate.sql';
const sql = readFileSync(join(process.cwd(), 'migrations', MIGRATION_FILE), 'utf8').replace(/\r\n/g, '\n');
const compact = sql.replace(/\s+/g, ' ').toLowerCase();

function functionDefinition(name: string): string {
  const start = compact.indexOf(`create or replace function public.${name}(`);
  expect(start, `${name} must be defined`).toBeGreaterThanOrEqual(0);
  const next = compact.indexOf('create or replace function public.', start + 1);
  return compact.slice(start, next < 0 ? compact.length : next);
}

describe('crew-seat entitlement migration', () => {
  it('is a transactional, additive migration with no plan or roster backfill', () => {
    expect(MIGRATION_FILE).toMatch(/^\d{14}_[a-z0-9_]+\.sql$/);
    expect(compact).toContain('begin;');
    expect(compact.trimEnd().endsWith('commit;')).toBe(true);
    expect(compact).not.toContain('update public.workspace_entitlements');
    expect(compact).not.toContain('delete from public.crew');
    expect(compact).not.toContain('set active = false');
    expect(compact).not.toMatch(/update\s+public\.accounts\s+set\s+plan/);
  });

  it('serializes create before count and insert on the authoritative entitlement row', () => {
    const create = functionDefinition('create_crew_member_with_seat_entitlement');
    const entitlementLock = create.indexOf('from public.workspace_entitlements e');
    const forUpdate = create.indexOf('for update', entitlementLock);
    const count = create.indexOf('select pg_catalog.count(*)', forUpdate);
    const insert = create.indexOf('insert into public.crew as c', count);

    expect(entitlementLock).toBeGreaterThan(-1);
    expect(forUpdate).toBeGreaterThan(entitlementLock);
    expect(count).toBeGreaterThan(forUpdate);
    expect(insert).toBeGreaterThan(count);
    expect(create).toContain("v_limit_json := v_limits -> 'crew_users'");
    expect(create).toContain("pg_catalog.jsonb_typeof(v_limit_json) <> 'number'");
    expect(create).toContain('pg_catalog.trunc(v_limit_numeric) <> v_limit_numeric');
    expect(create).toContain('v_limit_numeric > 9223372036854775807::numeric');
    expect(create).toContain('crew_seat_entitlement_unavailable');
  });

  it('counts roster identities according to the existing employee lifecycle', () => {
    for (const name of [
      'create_crew_member_with_seat_entitlement',
      'reactivate_crew_member_with_seat_entitlement',
    ]) {
      const definition = functionDefinition(name);
      const countStart = definition.indexOf('select pg_catalog.count(*)');
      const countEnd = definition.indexOf(';', countStart);
      const countQuery = definition.slice(countStart, countEnd);
      expect(countQuery).toContain('c.active = true');
      expect(countQuery).toContain('c.deleted_at is null');
      expect(countQuery).toContain("c.worker_type = 'employee'");
      expect(countQuery).not.toMatch(/(?:invited_at|invite_expires_at|user_id|access_revoked_at)/);
    }
  });

  it('surfaces both at-cap and already-over-cap remediation without changing existing rows', () => {
    const create = functionDefinition('create_crew_member_with_seat_entitlement');
    expect(create.indexOf('v_active_count > v_limit')).toBeLessThan(create.indexOf('v_active_count = v_limit'));
    expect(create).toContain('crew_seat_remediation_required');
    expect(create).toContain('crew_seat_limit_reached');
    expect(create).toContain("'active_count', v_active_count");
    expect(create).toContain("'crew_limit', v_limit");
  });

  it('serializes employee reactivation against concurrent creates and leaves deactivation direct', () => {
    const reactivate = functionDefinition('reactivate_crew_member_with_seat_entitlement');
    const entitlementLock = reactivate.indexOf('from public.workspace_entitlements e');
    const entitlementForUpdate = reactivate.indexOf('for update', entitlementLock);
    const rowLock = reactivate.indexOf('from public.crew c', entitlementForUpdate);
    const rowForUpdate = reactivate.indexOf('for update', rowLock);
    const count = reactivate.indexOf('select pg_catalog.count(*)', rowForUpdate);
    const activate = reactivate.lastIndexOf('set active = true');

    expect(entitlementForUpdate).toBeGreaterThan(entitlementLock);
    expect(rowLock).toBeGreaterThan(entitlementForUpdate);
    expect(rowForUpdate).toBeGreaterThan(rowLock);
    expect(count).toBeGreaterThan(rowForUpdate);
    expect(activate).toBeGreaterThan(count);
    expect(reactivate).not.toContain('set active = false');
    expect(reactivate).toContain("if v_worker_type <> 'employee' then");
  });

  it('uses narrow authenticated SECURITY DEFINER RPCs with explicit caller authorization', () => {
    for (const name of [
      'create_crew_member_with_seat_entitlement',
      'reactivate_crew_member_with_seat_entitlement',
    ]) {
      const definition = functionDefinition(name);
      expect(definition).toContain('security definer');
      expect(definition).toContain('set search_path = pg_catalog, pg_temp');
      expect(definition).toContain('v_actor_id uuid := auth.uid()');
      expect(definition).toContain("m.role = 'owner'");
      expect(definition).toContain('m.account_id = p_account_id');
    }

    expect(compact).toContain('from public, anon, authenticated, service_role');
    expect(compact).toContain('to authenticated;');
    expect(compact).not.toMatch(/grant execute on function public\.(?:create|reactivate)_crew_member[^;]+to (?:anon|service_role|public)/);
  });

  it('narrows RLS/browser entry while preserving normal edits and removals', () => {
    expect(compact).toContain('drop policy if exists crew_owner on public.crew');
    expect(compact).toContain('create policy crew_owner_select on public.crew for select to authenticated');
    expect(compact).toContain('create policy crew_owner_update on public.crew for update to authenticated');
    expect(compact).toContain('with check ((select public.is_owner(account_id)))');
    expect(compact).toContain('create policy crew_owner_delete on public.crew for delete to authenticated');
    expect(compact).toContain('create policy crew_owner_insert_subcontractor on public.crew for insert to authenticated');
    expect(compact).toContain("and worker_type = 'subcontractor'");

    const guard = functionDefinition('guard_crew_seat_entry');
    expect(guard).toContain("current_user in ('anon', 'authenticated')");
    // Flag-off actions deliberately use the server-only service-role client so
    // this installed-but-dark migration preserves the pre-rollout insert with
    // zero RPCs. The browser roles remain unable to enter the counted set.
    expect(guard).not.toMatch(/current_user\s+in\s*\([^)]*service_role/);
    expect(guard).toContain('and v_new_counted and ( not v_old_counted');
    expect(guard).toContain('old.account_id is distinct from new.account_id');
    expect(guard).toContain('crew_seat_entry_requires_entitlement_gate');
    expect(guard).toContain('old.worker_type is distinct from new.worker_type');
    expect(compact).toContain('before insert or update on public.crew');
  });
});
