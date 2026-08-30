import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

describe('enterprise closure & RLS suspension hardening', () => {
  const MIGRATION = read('migrations/20260830160000_enterprise_closure_and_rls_hardening.sql');
  const SCHEMA = read('schema.sql');

  it('drops BOTH singular and plural quick_stop_priority_zone policies to prevent permissive leaks', () => {
    expect(MIGRATION).toContain('drop policy if exists quick_stop_priority_zone_owner on public.quick_stop_priority_zones;');
    expect(MIGRATION).toContain('drop policy if exists quick_stop_priority_zones_owner on public.quick_stop_priority_zones;');
  });

  it('adds deactivated_at to memberships and legal_hold to accounts', () => {
    expect(MIGRATION).toContain('alter table public.memberships');
    expect(MIGRATION).toContain('add column if not exists deactivated_at timestamptz default null;');
    expect(MIGRATION).toContain('alter table public.accounts');
    expect(MIGRATION).toContain('add column if not exists legal_hold boolean not null default false;');
    expect(MIGRATION).toContain('create index if not exists memberships_user_active_idx');
  });

  it('hardens RLS helpers to check both suspended_at is null and deactivated_at is null', () => {
    expect(MIGRATION).toContain('a.suspended_at is null');
    expect(MIGRATION).toContain('m.deactivated_at is null');
    expect(SCHEMA).toContain('a.suspended_at is null and m.deactivated_at is null');
  });

  it('creates public.account_closure_jobs with partial unique index for single active job', () => {
    expect(MIGRATION).toContain('create table if not exists public.account_closure_jobs');
    expect(MIGRATION).toContain('create unique index if not exists account_closure_jobs_one_active');
    expect(MIGRATION).toContain('where completed_at is null;');
  });

  it('enforces outbound messaging freeze on suspended accounts', () => {
    expect(MIGRATION).toContain('account_suspended_closed');
    expect(MIGRATION).toContain('a.suspended_at is null');
  });

  it('defines multi-tenant safe check_user_active_memberships RPC with advisory locking', () => {
    expect(MIGRATION).toContain('create or replace function public.check_user_active_memberships');
    expect(MIGRATION).toContain('pg_advisory_xact_lock');
    expect(MIGRATION).toContain('m.account_id <> p_closing_account_id');
  });
});
