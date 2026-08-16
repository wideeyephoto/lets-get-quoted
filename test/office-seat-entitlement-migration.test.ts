import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION_FILE = '20260816053000_office_seat_entitlement_gate.sql';
const sql = readFileSync(join(process.cwd(), 'migrations', MIGRATION_FILE), 'utf8').replace(/\r\n/g, '\n');
const compact = sql.replace(/\s+/g, ' ').toLowerCase();

function functionDefinition(name: string): string {
  const start = compact.indexOf(`create or replace function public.${name}(`);
  expect(start, `${name} must be defined`).toBeGreaterThanOrEqual(0);
  const next = compact.indexOf('create or replace function public.', start + 1);
  return compact.slice(start, next < 0 ? compact.length : next);
}

describe('office-seat entitlement migration', () => {
  it('is transactional and additive with no entitlement or membership rewrite', () => {
    expect(MIGRATION_FILE).toMatch(/^\d{14}_[a-z0-9_]+\.sql$/);
    expect(compact).toContain('begin;');
    expect(compact.trimEnd().endsWith('commit;')).toBe(true);
    expect(compact).not.toContain('update public.workspace_entitlements');
    expect(compact).not.toContain('delete from public.memberships');
    expect(compact).not.toMatch(/update\s+public\.memberships\s+set/);
    expect(compact).not.toMatch(/update\s+public\.accounts\s+set\s+plan/);
  });

  it('serializes idempotency, count, and insert on the authoritative entitlement row', () => {
    const create = functionDefinition('create_office_user_membership_with_seat_entitlement');
    const entitlementLock = create.indexOf('from public.workspace_entitlements e');
    const forUpdate = create.indexOf('for update', entitlementLock);
    const existing = create.indexOf('from public.memberships m', forUpdate);
    const count = create.indexOf('select pg_catalog.count(*)', existing);
    const insert = create.indexOf('insert into public.memberships as m', count);

    expect(entitlementLock).toBeGreaterThan(-1);
    expect(forUpdate).toBeGreaterThan(entitlementLock);
    expect(existing).toBeGreaterThan(forUpdate);
    expect(count).toBeGreaterThan(existing);
    expect(insert).toBeGreaterThan(count);
    expect(create).toContain("v_limit_json := v_limits -> 'office_users'");
    expect(create).toContain("pg_catalog.jsonb_typeof(v_limit_json) <> 'number'");
    expect(create).toContain('pg_catalog.trunc(v_limit_numeric) <> v_limit_numeric');
    expect(create).toContain('v_limit_numeric > 9223372036854775807::numeric');
    expect(create).toContain('office_seat_entitlement_unavailable');
  });

  it('counts every owner membership, including the founder, as the current office identity', () => {
    const create = functionDefinition('create_office_user_membership_with_seat_entitlement');
    const countStart = create.indexOf('select pg_catalog.count(*)');
    const countEnd = create.indexOf(';', countStart);
    const countQuery = create.slice(countStart, countEnd);

    expect(countQuery).toContain('from public.memberships m');
    expect(countQuery).toContain('m.account_id = p_account_id');
    expect(countQuery).toContain("m.role = 'owner'");
    expect(countQuery).not.toMatch(/m\.(?:active|revoked|invited|expires|created_at)/);
    expect(countQuery).not.toContain('m.user_id <> v_actor_id');
    expect(compact).toContain("where role = 'owner'");
  });

  it('leaves over-cap workspaces intact and surfaces explicit remediation', () => {
    const create = functionDefinition('create_office_user_membership_with_seat_entitlement');
    expect(create.indexOf('v_active_count > v_limit')).toBeLessThan(create.indexOf('v_active_count = v_limit'));
    expect(create).toContain('office_seat_remediation_required');
    expect(create).toContain('office_seat_limit_reached');
    expect(create).toContain("'active_count', v_active_count");
    expect(create).toContain("'office_limit', v_limit");
    expect(create).not.toContain('delete from public.memberships');
  });

  it('keeps the tenant-bound SECURITY DEFINER RPC dark to every API role', () => {
    const create = functionDefinition('create_office_user_membership_with_seat_entitlement');
    expect(create).toContain('security definer');
    expect(create).toContain('set search_path = pg_catalog, pg_temp');
    expect(create).toContain('v_actor_id uuid := auth.uid()');
    expect(create).toContain('if p_user_id is null then');
    expect(create).toContain('office_user_target_unavailable');
    expect(create).toContain('m.account_id = p_account_id');
    expect(create).toContain('m.user_id = v_actor_id');
    expect(create).toContain("m.role = 'owner'");
    expect(compact).toContain('from public, anon, authenticated, service_role');
    expect(compact).not.toMatch(/grant\s+execute\s+on\s+function\s+public\.create_office_user_membership/);
    expect(compact).toContain('until then even a current owner cannot call');
  });

  it('blocks direct browser entry and identity swaps without touching service-role bootstrap', () => {
    const guard = functionDefinition('guard_office_seat_entry');
    expect(guard).toContain("current_user in ('anon', 'authenticated')");
    expect(guard).not.toMatch(/current_user\s+in\s*\([^)]*service_role/);
    expect(guard).toContain("v_new_counted := new.role = 'owner'");
    expect(guard).toContain('not v_old_counted');
    expect(guard).toContain('old.account_id is distinct from new.account_id');
    expect(guard).toContain('old.user_id is distinct from new.user_id');
    expect(guard).toContain('office_seat_entry_requires_entitlement_gate');
    expect(compact).toContain('before insert or update on public.memberships');
  });

  it('does not invent invitation, role, suspension, or reactivation schema', () => {
    expect(compact).not.toContain('create table public.office');
    expect(compact).not.toContain('alter type public.member_role');
    expect(compact).not.toMatch(/add column (?:active|revoked_at|invited_at|invite_expires_at)/);
    expect(compact).not.toContain('reactivate_office');
    expect(compact).toContain('office_membership_role_conflict');
  });
});
