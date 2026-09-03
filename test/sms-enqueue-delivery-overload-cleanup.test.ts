import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(
    process.cwd(),
    'migrations/20260903202831_sms_enqueue_delivery_overload_cleanup.sql',
  ),
  'utf8',
);
const hardening = readFileSync(
  join(
    process.cwd(),
    'migrations/20260903203350_sms_enqueue_delivery_replay_hardening.sql',
  ),
  'utf8',
);

describe('SMS enqueue delivery overload cleanup migration', () => {
  it('requires the delayed enqueue replacement before removing the legacy overload', () => {
    const guardAt = migration.indexOf('to_regprocedure');
    const dropAt = migration.indexOf('drop function if exists public.enqueue_sms_delivery');

    expect(guardAt).toBeGreaterThan(-1);
    expect(dropAt).toBeGreaterThan(guardAt);
    expect(migration).toContain(
      'enqueue_sms_delivery(uuid,text,text,text,text,text,text,text,text,uuid,uuid,uuid,timestamptz)',
    );
    expect(migration).toMatch(/pronargs\s*=\s*13/i);
    expect(migration).toMatch(/pronargdefaults\s*=\s*4/i);
    expect(migration).toMatch(/proargnames\[13\]\s*=\s*'p_available_at'/i);
  });

  it('reloads the PostgREST schema cache after removing the stale signature', () => {
    expect(migration).toMatch(/notify pgrst,\s*'reload schema'/i);
  });

  it('drops only the obsolete twelve-argument overload without cascade', () => {
    expect(migration).toMatch(
      /drop function if exists public\.enqueue_sms_delivery\(\s*uuid,\s*text,\s*text,\s*text,\s*text,\s*text,\s*text,\s*text,\s*text,\s*uuid,\s*uuid,\s*uuid\s*\);/i,
    );
    expect(migration).not.toMatch(/drop function[\s\S]*cascade/i);
  });

  it('fails closed unless one least-privilege enqueue function remains', () => {
    expect(migration).toMatch(/v_overload_count\s*<>\s*1/i);
    expect(migration).toMatch(/has_function_privilege\(\s*'service_role'/i);
    expect(migration).toMatch(/has_function_privilege\(\s*'anon'/i);
    expect(migration).toMatch(/has_function_privilege\(\s*'authenticated'/i);
    expect(migration).toMatch(
      /revoke all on function public\.enqueue_sms_delivery[\s\S]*from public, anon, authenticated, service_role/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.enqueue_sms_delivery[\s\S]*to service_role/i,
    );
  });

  it('preserves delayed scheduling and the legacy replay integrity contract', () => {
    expect(hardening).toMatch(/v_available_at timestamptz := coalesce\(p_available_at, v_now\)/i);
    expect(hardening).toMatch(/values \(\s*v_event\.id, 'queued', v_available_at/i);
    expect(hardening).toMatch(/SMS event exists without its delivery task/i);
    expect(hardening).toMatch(/select v_event\.id, t\.task_state, v_inserted/i);
    expect(hardening).toMatch(/using errcode = '22000'/i);
    expect(hardening).not.toMatch(/'queued'::text as task_state/i);
  });

  it('keeps the hardened replacement service-role-only and refreshes PostgREST', () => {
    expect(hardening).toMatch(
      /revoke all on function public\.enqueue_sms_delivery[\s\S]*from public, anon, authenticated, service_role/i,
    );
    expect(hardening).toMatch(
      /grant execute on function public\.enqueue_sms_delivery[\s\S]*to service_role/i,
    );
    expect(hardening).toMatch(/notify pgrst,\s*'reload schema'/i);
  });
});
