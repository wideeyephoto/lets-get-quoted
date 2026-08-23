import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../migrations/20260821230000_voice_transcript_retention.sql', import.meta.url),
  'utf8',
);

describe('voice transcript retention migration', () => {
  it('rewrites historical receipts to one transcript and re-hashes what remains', () => {
    expect(migration).toContain("array['call_log', 'raw_call_log', 'call_timeline', 'post_prompt_data']");
    expect(migration).toMatch(/update public\.voice_calls[\s\S]*set transcript = transcript\.call_log/i);
    expect(migration).toMatch(/'summary'[\s\S]*post_prompt_data,substituted/i);
    expect(migration).toMatch(/set payload = minimized\.payload[\s\S]*payload_sha256 =/i);
    expect(migration).toContain('voice_events_minimized_payload_check');
    const minimizedStart = migration.indexOf('with minimized as');
    const minimizedEnd = migration.indexOf('alter table public.voice_events', minimizedStart);
    expect(migration.slice(minimizedStart, minimizedEnd)).not.toMatch(/'call_log'\s*,\s*(case|e\.payload|transcript)/i);
  });

  it('enforces the same window inside owner RLS, even if the cron is late', () => {
    expect(migration).toContain('create or replace function public.voice_call_visible_within_retention');
    expect(migration).toMatch(/create policy voice_calls_owner_read[\s\S]*voice_call_visible_within_retention\(account_id, created_at\)/i);
    expect(migration).toMatch(/grant execute on function public\.voice_call_visible_within_retention\(uuid, timestamptz\)[\s\S]*to authenticated/i);
  });

  it('clamps every workspace to a 30-to-90-day window with 30 as fallback', () => {
    expect(migration).toContain('create or replace function public.voice_history_retention_days');
    expect(migration).toMatch(/least\(90, greatest\(30,[\s\S]*else 30/i);
    expect(migration).toMatch(/workspace_entitlements w[\s\S]*voice_history_retention_days\(w\.feature_limits\)/gi);
  });

  it('deletes only terminal receipt work, including exhausted failures', () => {
    expect(migration).toMatch(/processing_status in \('processed', 'ignored'\)/gi);
    expect(migration).toMatch(/processing_status = 'failed'[\s\S]*next_attempt_at is null[\s\S]*processing_token is null[\s\S]*processing_lease_expires_at is null/gi);
    expect(migration).not.toMatch(/processing_status in \([^)]*received/i);
  });

  it('does not delete admissions or any billing ledger', () => {
    expect(migration).not.toMatch(/delete from public\.voice_call_admissions/i);
    expect(migration).not.toMatch(/delete from public\.(usage_|overage_)/i);
    expect(migration).toMatch(/delete from public\.voice_calls/i);
    expect(migration).toMatch(/delete from public\.voice_events/i);
  });

  it('reports whether bounded batches left a due backlog', () => {
    expect(migration).toMatch(/voice_events_deleted integer,[\s\S]*more_due boolean/i);
    expect(migration).toMatch(/return query select v_calls, v_events, v_more/i);
  });

  it('keeps the mutation service-only', () => {
    expect(migration).toMatch(/revoke all on function public\.purge_expired_voice_history\(integer\)[\s\S]*from public, anon, authenticated, service_role/i);
    expect(migration).toMatch(/grant execute on function public\.purge_expired_voice_history\(integer\)[\s\S]*to service_role/i);
    const purgeGrant = migration.slice(
      migration.lastIndexOf('revoke all on function public.purge_expired_voice_history'),
    );
    expect(purgeGrant).not.toMatch(/to (anon|authenticated)/i);
  });
});
