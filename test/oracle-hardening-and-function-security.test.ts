import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Oracle Hardening and Function Security Migration', () => {
  const migrationPath = join(process.cwd(), 'migrations', '20260831180000_oracle_hardening_and_function_security.sql');
  const migration = readFileSync(migrationPath, 'utf8').replace(/\r\n/g, '\n');
  const schemaPath = join(process.cwd(), 'schema.sql');
  const schema = readFileSync(schemaPath, 'utf8').replace(/\r\n/g, '\n');

  it('hardens job_account_id to prevent anonymous and cross-tenant information oracle', () => {
    expect(migration).toContain('create or replace function public.job_account_id');
    expect(migration).toContain("if auth.role() = 'authenticated' then");
    expect(migration).toContain('not (public.is_owner(v_account_id) or public.crew_on_job(j))');
    expect(migration).toContain("elsif auth.role() = 'anon' then");
    expect(migration).toContain('revoke execute on function public.job_account_id(uuid) from public, anon;');
    expect(migration).toContain('grant execute on function public.job_account_id(uuid) to authenticated, service_role;');

    expect(schema).toContain('create or replace function public.job_account_id');
    expect(schema).toContain('revoke execute on function public.job_account_id(uuid) from public, anon;');
  });

  it('hardens voice_transcript_retention_interval to prevent anonymous and cross-tenant information oracle', () => {
    expect(migration).toContain('create or replace function public.voice_transcript_retention_interval');
    expect(migration).toContain("if auth.role() = 'anon' then");
    expect(migration).toContain('return pg_catalog.make_interval(days => 30);');
    expect(migration).toContain("if auth.role() = 'authenticated' then");
    expect(migration).toContain('public.account_memberships');
    expect(migration).toContain('revoke execute on function public.voice_transcript_retention_interval(uuid) from public, anon;');
    expect(migration).toContain('grant execute on function public.voice_transcript_retention_interval(uuid) to authenticated, service_role;');

    expect(schema).toContain('create or replace function public.voice_transcript_retention_interval');
    expect(schema).toContain('revoke execute on function public.voice_transcript_retention_interval(uuid) from public, anon;');
    expect(schema).toContain('grant execute on function public.voice_transcript_retention_interval(uuid) to authenticated, service_role;');
  });
});
