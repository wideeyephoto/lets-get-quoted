import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION = readFileSync(
  join(process.cwd(), 'migrations/20260906131500_messaging_registry_callback_fail_closed.sql'),
  'utf8',
);
const PACKAGE = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
  scripts?: Record<string, string>;
};
const SYNC = readFileSync(join(process.cwd(), 'scripts/sync-messaging-schema.mjs'), 'utf8');
const VERIFIER = readFileSync(join(process.cwd(), 'scripts/verify-messaging-schema.mjs'), 'utf8');
const PARITY = readFileSync(join(process.cwd(), 'test/messaging-schema-parity.test.ts'), 'utf8');

function compact(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

describe('messaging registry callback fail-closed migration', () => {
  it('replaces the exact callback RPC with its hardened security configuration', () => {
    expect(MIGRATION).toContain('create or replace function public.ingest_messaging_registry_callback(');
    expect(MIGRATION).toContain('security definer');
    expect(MIGRATION).toContain('set search_path = pg_catalog, pg_temp');
    expect(MIGRATION).toContain("set timezone to 'UTC'");
    expect(MIGRATION).toMatch(/revoke all on function public\.ingest_messaging_registry_callback\([\s\S]+?from public, anon, authenticated, service_role;/);
    expect(MIGRATION).toMatch(/grant execute on function public\.ingest_messaging_registry_callback\([\s\S]+?to service_role;/);
  });

  it('moves a failed active sender into a CHECK-valid non-active state atomically', () => {
    const normalized = compact(MIGRATION);
    const failedBranch = normalized.slice(
      normalized.indexOf("elsif p_normalized_state = 'failed' then"),
      normalized.indexOf('end if;', normalized.indexOf("elsif p_normalized_state = 'failed' then")),
    );

    expect(failedBranch).toContain("assignment_state = 'failed'");
    expect(failedBranch).toContain("provisioning_status = 'failed'");
    expect(failedBranch).toContain('suspended_at = coalesce(suspended_at, v_now)');
    expect(failedBranch).toContain('last_verified_at = v_now');
    expect(failedBranch).toContain('updated_at = v_now');
    expect(failedBranch).not.toContain('inbound_ready = false');
    expect(MIGRATION.indexOf("provisioning_status = 'failed'")).toBeLessThan(
      MIGRATION.indexOf('insert into public.messaging_registry_callbacks'),
    );
  });

  it('keeps inbound webhook configuration evidence truthful while other fields quarantine runtime', () => {
    const normalized = compact(MIGRATION);
    const failedBranch = normalized.slice(
      normalized.indexOf("elsif p_normalized_state = 'failed' then"),
      normalized.indexOf('end if;', normalized.indexOf("elsif p_normalized_state = 'failed' then")),
    );
    expect(MIGRATION).toContain('Keep inbound_ready truthful');
    expect(failedBranch).not.toContain('inbound_ready = false');
    expect(MIGRATION).toContain("provisioning_status = 'failed'");
    expect(MIGRATION).toContain('suspended_at = coalesce(suspended_at, v_now)');
  });

  it('preserves complete and byte-identical replay behavior without reactivation', () => {
    const normalized = compact(MIGRATION);
    const completeBranch = normalized.slice(
      normalized.indexOf("if p_normalized_state = 'complete' then"),
      normalized.indexOf("elsif p_normalized_state = 'failed' then"),
    );
    const replayBranch = normalized.slice(
      normalized.indexOf('if found then'),
      normalized.indexOf('-- 1. Try matching contractor application'),
    );

    expect(completeBranch).toContain("assignment_state = 'assigned'");
    expect(completeBranch).toContain('last_verified_at = v_now');
    expect(completeBranch).not.toContain("provisioning_status = 'active'");
    expect(completeBranch).not.toContain('suspended_at = null');
    expect(replayBranch).toContain('v_existing.body_sha256 is distinct from p_body_sha256');
    expect(replayBranch).toContain('return query select v_existing.id, false');
    expect(replayBranch).toContain("using errcode = '23505'");
  });

  it('requires all supplied identifiers to resolve one unambiguous platform sender', () => {
    expect(MIGRATION).toContain('perform pg_catalog.pg_advisory_xact_lock(1280265031, 2108)');
    expect(MIGRATION).toContain("s.purpose in ('lgq_shared', 'lgq_dispatch')");
    expect(MIGRATION).toContain(
      '(p_provider_phone_number is null or s.e164_number = p_provider_phone_number)',
    );
    expect(MIGRATION).toContain(
      '(p_provider_assignment_id is null or s.assignment_id = p_provider_assignment_id)',
    );
    expect(MIGRATION).toContain(
      '(p_provider_campaign_id is null or s.campaign_id = p_provider_campaign_id)',
    );
    expect(MIGRATION).toContain('if v_sender_match_count = 1 then');
  });

  it('asserts the final definition and least-privilege contract during migration', () => {
    expect(MIGRATION).toContain('do $verify_registry_callback_fail_closed$');
    expect(MIGRATION).toContain("v_definition not like '%provisioning_status = ''failed''%'");
    expect(MIGRATION).toContain("v_definition like '%inbound_ready = false%'");
    expect(MIGRATION).toContain("pg_catalog.has_function_privilege(");
    expect(MIGRATION).toContain("'service_role'");
    expect(MIGRATION).toContain("'authenticated'");
    expect(MIGRATION).toContain("'anon'");
  });

  it('is included in package commands, schema generation, parity, and full-schema verification', () => {
    const migrationPath = 'migrations/20260906131500_messaging_registry_callback_fail_closed.sql';
    expect(PACKAGE.scripts?.['test:pg17:registry-callback-fail-closed']).toBe(
      'node scripts/verify-messaging-registry-callback-fail-closed.mjs',
    );
    expect(SYNC).toContain(migrationPath);
    expect(PARITY).toContain(migrationPath);
    expect(VERIFIER).toContain(migrationPath);
  });
});
