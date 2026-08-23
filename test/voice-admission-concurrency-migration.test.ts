import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'migrations', '20260821191000_voice_admission_concurrency.sql'),
  'utf8',
).replace(/\r\n/g, '\n');

describe('voice admission concurrency is a database invariant', () => {
  it('serializes count plus claim per workspace', () => {
    expect(migration).toContain('create or replace function public.claim_voice_call_admission');
    expect(migration).toContain('pg_catalog.pg_advisory_xact_lock');
    expect(migration).toContain('v_open >= p_concurrency_limit');
    expect(migration).toContain("return query select 'at_capacity'::text");
    expect(migration).toContain("admission_state = 'claimed'");
  });

  it('does not count calls after their receipt exists', () => {
    expect(migration).toContain('and not exists (');
    expect(migration).toContain('e.provider_call_id = a.provider_call_id');
    expect(migration).toContain("interval '60 minutes'");
  });

  it('makes claim finalization replay-safe and claim release narrow', () => {
    expect(migration).toContain('create or replace function public.finalize_voice_call_admission');
    expect(migration).toContain('a.reservation_id is not distinct from p_reservation_id');
    expect(migration).toContain('create or replace function public.release_voice_call_admission_claim');
    expect(migration).toContain("and a.admission_state = 'claimed'");
    expect(migration).toContain('and a.reserved_minutes = 0');
  });

  it('exposes all mutations only to the service role', () => {
    expect(migration.match(/security definer/g)).toHaveLength(3);
    expect(migration.match(/set search_path = pg_catalog, pg_temp/g)).toHaveLength(3);
    expect(migration.match(/from public, anon, authenticated, service_role/g)).toHaveLength(3);
    expect(migration.match(/grant execute on function/g)).toHaveLength(3);
  });
});
