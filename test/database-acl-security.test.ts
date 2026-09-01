import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Database ACL & Role Permission Invariants', () => {
  const root = process.cwd();
  const migrationPath = resolve(root, 'migrations/20260901060000_revoke_anon_on_security_and_audit_tables.sql');

  it('verifies that the forward ACL revocation migration exists and covers all sensitive tables', () => {
    expect(existsSync(migrationPath)).toBe(true);
    const sql = readFileSync(migrationPath, 'utf8');

    const requiredTables = [
      'api_credentials',
      'api_idempotency_records',
      'api_request_audit',
      'integration_events',
      'webhook_subscriptions',
      'webhook_deliveries',
      'webhook_delivery_attempts',
      'tenant_audit_events',
      'recoverable_deletions',
    ];

    for (const table of requiredTables) {
      expect(sql).toContain(`revoke all on table public.${table} from anon, public;`);
      expect(sql).toContain(`grant all on table public.${table} to service_role;`);
    }

    expect(sql).toContain('pg_catalog.aclexplode');
    expect(sql).toContain("Security table(s) still hold anon/public grants");
  });

  it('prohibits granting anon privileges on internal and security tables across migrations', () => {
    const sensitiveTables = [
      'api_credentials',
      'api_request_audit',
      'integration_events',
      'tenant_audit_events',
      'recoverable_deletions',
    ];

    const sql = readFileSync(migrationPath, 'utf8');
    for (const table of sensitiveTables) {
      // Must not have grant ... to anon
      const grantPattern = new RegExp(`grant\\s+[^;]+\\s+on\\s+(?:table\\s+)?(?:public\\.)?${table}\\s+to\\s+[^;]*\\banon\\b`, 'i');
      expect(sql).not.toMatch(grantPattern);
    }
  });
});
