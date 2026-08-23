import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'migrations', '20260821190000_voice_runtime_hardening.sql'),
  'utf8',
).replace(/\r\n/g, '\n');

describe('unsupported voice settings remain unrepresentable', () => {
  it('turns off stale values before adding the guards', () => {
    expect(migration).toContain('set recording_enabled = false,\n       emergency_transfer_number = null');
  });

  it('keeps recording off until the provider and retention rail exist', () => {
    expect(migration).toContain('constraint voice_settings_recording_runtime_disabled');
    expect(migration).toContain('check (recording_enabled = false)');
  });

  it('keeps the unused emergency route empty', () => {
    expect(migration).toContain('constraint voice_settings_emergency_routing_runtime_disabled');
    expect(migration).toContain('check (emergency_transfer_number is null)');
  });

  it('is transactional and proves its postconditions', () => {
    expect(migration.trimStart().startsWith('--')).toBe(true);
    expect(migration).toContain('\nbegin;');
    expect(migration.trimEnd().endsWith('commit;')).toBe(true);
    expect(migration).toContain("raise exception 'unsupported voice settings remain enabled'");
  });
});

describe('voice receipt settlement is a token-bound finite queue', () => {
  it('claims with a rotating token and a finite lease before doing work', () => {
    expect(migration).toContain('add column if not exists processing_token uuid');
    expect(migration).toContain('add column if not exists processing_lease_expires_at timestamptz');
    expect(migration).toContain('create or replace function public.claim_voice_event_processing');
    expect(migration).toContain("processing_lease_expires_at = v_now + interval '5 minutes'");
    expect(migration).toContain('processing_token = v_token');
  });

  it('finalizes success and failure only for the current claim token', () => {
    expect(migration).toContain('create or replace function public.complete_voice_event_processing');
    expect(migration).toContain('create or replace function public.fail_voice_event_processing');
    expect(migration.match(/e\.processing_token = p_claim_token/g)).toHaveLength(1);
    expect(migration).toContain('v_event.processing_token is distinct from p_claim_token');
    expect(migration).toContain("using errcode = '55000'");
  });

  it('backs off retryable work and exhausts it after five claims', () => {
    expect(migration).toContain('v_event.attempt_count >= 5');
    expect(migration).toContain('v_event.attempt_count < 5');
    expect(migration).toContain('least(300, 5 * (2 ^ least(v_event.attempt_count - 1, 6)))');
    expect(migration).toContain("return query select 'exhausted'::text");
  });

  it('gives lead creation a stable event id for lost-response replays', () => {
    expect(migration).toContain('add column if not exists source_voice_event_id uuid');
    expect(migration).toContain('create unique index if not exists leads_source_voice_event_uidx');
  });

  it('keeps all queue mutations service-role-only with a fixed search path', () => {
    expect(migration.match(/security definer/g)).toHaveLength(3);
    expect(migration.match(/set search_path = pg_catalog, pg_temp/g)).toHaveLength(3);
    for (const fn of [
      'claim_voice_event_processing(uuid)',
      'complete_voice_event_processing(uuid, uuid)',
      'fail_voice_event_processing(uuid, uuid, text, boolean)',
    ]) {
      expect(migration).toContain(`revoke all on function public.${fn}\n  from public, anon, authenticated, service_role`);
      expect(migration).toContain(`grant execute on function public.${fn} to service_role`);
    }
  });
});
