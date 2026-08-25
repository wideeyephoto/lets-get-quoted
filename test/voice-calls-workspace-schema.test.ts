import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('voice calls workspace and workflow schema migration', () => {
  const migrationPath = join(process.cwd(), 'migrations', '20260825140000_voice_calls_workspace_and_workflows.sql');
  const migration = readFileSync(migrationPath, 'utf8').replace(/\r\n/g, '\n');

  it('widens voice_calls.outcome to support all granular technical provider states', () => {
    expect(migration).toContain('drop constraint if exists voice_calls_outcome_check');
    expect(migration).toContain('add constraint voice_calls_outcome_check');
    for (const outcome of [
      'in_progress',
      'ai_handled',
      'transfer_attempted',
      'transferred_and_answered',
      'caller_abandoned',
      'no_input',
      'voicemail_fallback',
      'provider_failure',
      'completed',
      'transferred',
      'voicemail',
      'abandoned',
      'failed',
      'unknown',
    ]) {
      expect(migration).toContain(`'${outcome}'`);
    }
  });

  it('adds provisional admission and recording metadata columns to voice_calls', () => {
    expect(migration).toContain('add column if not exists outcome_source text');
    expect(migration).toContain('add column if not exists outcome_observed_at timestamptz');
    expect(migration).toContain('add column if not exists is_provisional boolean not null default false');
    expect(migration).toContain('add column if not exists recording_status text not null default \'none\'');
    expect(migration).toContain('add column if not exists recording_storage_path text');
    expect(migration).toContain('add column if not exists recording_duration_seconds integer');
    expect(migration).toContain('add column if not exists recording_size_bytes bigint');
  });

  it('upgrades voice_calls RLS policy to office_can(account_id, \'leads.read\')', () => {
    expect(migration).toContain('drop policy if exists voice_calls_owner_read on public.voice_calls');
    expect(migration).toContain('create policy voice_calls_office_read');
    expect(migration).toContain("public.office_can(account_id, 'leads.read')");
    expect(migration).toContain('public.voice_transcript_retention_interval(account_id)');
  });

  it('creates the voice_call_workflows table with dispositions and RLS security policies', () => {
    expect(migration).toContain('create table if not exists public.voice_call_workflows');
    expect(migration).toContain('call_id uuid primary key references public.voice_calls(id) on delete cascade');
    expect(migration).toContain('account_id uuid not null references public.accounts(id) on delete cascade');
    for (const disp of [
      'unreviewed',
      'needs_callback',
      'callback_scheduled',
      'contacted',
      'qualified',
      'converted',
      'not_a_fit',
      'spam',
      'resolved',
    ]) {
      expect(migration).toContain(`'${disp}'`);
    }
    expect(migration).toContain("public.office_can(account_id, 'leads.read')");
    expect(migration).toContain("public.office_can(account_id, 'leads.write')");
    expect(migration).toContain('touch_voice_call_workflows_updated_at_trigger');
  });

  it('creates the append-only voice_call_notes table with author attribution and RLS', () => {
    expect(migration).toContain('create table if not exists public.voice_call_notes');
    expect(migration).toContain('call_id uuid not null references public.voice_calls(id) on delete cascade');
    expect(migration).toContain('account_id uuid not null references public.accounts(id) on delete cascade');
    expect(migration).toContain('author_user_id uuid references auth.users(id)');
    expect(migration).toContain('author_name text not null');
    expect(migration).toContain('pg_catalog.length(note) <= 4000');
    expect(migration).toContain("public.office_can(account_id, 'leads.read')");
    expect(migration).toContain("public.office_can(account_id, 'leads.write')");
    expect(migration).toContain('touch_voice_call_notes_updated_at_trigger');
  });

  it('includes assertion blocks that protect against missing RLS and dangerous truncate privileges', () => {
    expect(migration).toContain('raise exception \'row level security is not enabled on voice_call_workflows\'');
    expect(migration).toContain('raise exception \'row level security is not enabled on voice_call_notes\'');
    expect(migration).toContain('raise exception \'voice tables have dangerous truncate grants: %\'');
  });
});
