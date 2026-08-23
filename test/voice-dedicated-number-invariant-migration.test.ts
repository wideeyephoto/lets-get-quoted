import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'migrations', '20260821221223_voice_dedicated_number_invariant.sql'),
  'utf8',
).replace(/\r\n/g, '\n');

describe('AI Voice dedicated-number invariants', () => {
  it('invalidates route evidence across A to B to A changes', () => {
    expect(migration).toContain('ai_voice_route_revision bigint not null default 0');
    expect(migration).toContain('accounts_ai_voice_route_revision_guard');
    expect(migration).toContain('old.ai_voice_route_revision + 1');
    expect(migration).toContain('new.call_tracking_verified_at := null');
  });

  it('retires the unbound claim RPC and binds every new claim to inventory', () => {
    expect(migration).toContain(
      'drop function if exists public.claim_voice_call_admission(uuid, text, integer)',
    );
    expect(migration).toContain('p_dialed_number text');
    expect(migration).toContain("s.provider = 'signalwire'");
    expect(migration).toContain("s.purpose = 'contractor_dedicated'");
    expect(migration).toContain("s.provisioning_status = 'active'");
    expect(migration).toContain("s.assignment_state = 'assigned'");
    expect(migration).toContain('s.inbound_ready');
    expect(migration).toContain('s.suspended_at is null');
    expect(migration).toContain('for share of a, s');
    expect(migration).toContain("return query select 'number_not_ready'::text");
    expect(migration).toContain('sender_number_id,');
    expect(migration).toContain('dialed_number, route_revision');
  });

  it('exposes only the bound claim function to service role', () => {
    expect(migration).toMatch(
      /revoke all on function public\.claim_voice_call_admission\(uuid, text, text, integer\)[\s\S]*from public, anon, authenticated, service_role/,
    );
    expect(migration).toMatch(
      /grant execute on function public\.claim_voice_call_admission\(uuid, text, text, integer\)[\s\S]*to service_role/,
    );
  });

  it('makes project and space scope mandatory before exact comparison', () => {
    expect(migration).toContain('p_expected_project_id is null');
    expect(migration).toContain('p_provider_project_id is null');
    expect(migration).toContain('voice event project scope is required');
    expect(migration).toContain('p_expected_space_id is null');
    expect(migration).toContain('p_provider_space_id is null');
    expect(migration).toContain('voice event space scope is required');
    expect(migration.indexOf('voice event project scope is required')).toBeLessThan(
      migration.indexOf('p_provider_project_id is distinct from p_expected_project_id'),
    );
    expect(migration.indexOf('voice event space scope is required')).toBeLessThan(
      migration.indexOf('p_provider_space_id is distinct from p_expected_space_id'),
    );
  });
});
