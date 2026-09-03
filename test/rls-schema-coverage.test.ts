import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Database Schema Multi-Tenant RLS Coverage Suite', () => {
  const schemaPath = join(process.cwd(), 'schema.sql');
  const schema = readFileSync(schemaPath, 'utf8');

  it('verifies that every public table in schema.sql has ROW LEVEL SECURITY enabled', () => {
    const tableRegex = /create table (?:if not exists )?(?:public\.)?([a-zA-Z0-9_]+)/gi;
    const allCreatedTables = [...new Set([...schema.matchAll(tableRegex)].map((m) => m[1]))];

    expect(allCreatedTables.length).toBeGreaterThan(100);

    // Capture tables enabled via array iteration
    const arrayMatch = schema.match(/array\[([\s\S]*?)\]\s*loop/i);
    const arrayTables = arrayMatch
      ? arrayMatch[1]
          .split(',')
          .map((s) => s.replace(/['"\s\r\n]/g, ''))
          .filter(Boolean)
      : [];

    // Capture tables enabled via direct ALTER TABLE statements
    const individualRegex = /alter table (?:only )?(?:public\.)?([a-zA-Z0-9_]+) enable row level security/gi;
    const individualTables = [...schema.matchAll(individualRegex)].map((m) => m[1]);

    const allEnabledTables = new Set([...arrayTables, ...individualTables]);

    const missingRls = allCreatedTables.filter((table) => !allEnabledTables.has(table));

    expect(
      missingRls,
      `Tables missing 'enable row level security': ${missingRls.join(', ')}`,
    ).toEqual([]);
  });

  it('verifies that all tenant data tables have policies restricting access by account_id', () => {
    const policyRegex = /create policy\s+([a-zA-Z0-9_]+)\s+on\s+(?:public\.)?([a-zA-Z0-9_]+)([\s\S]*?);/gi;
    const policies = [...schema.matchAll(policyRegex)].map((m) => ({
      name: m[1],
      table: m[2],
      definition: m[3].replace(/\s+/g, ' ').trim(),
    }));

    // Critical tenant data tables that must strictly isolate by account_id
    const coreTenantTables = [
      'jobs',
      'leads',
      'invoices',
      'payments',
      'clients',
      'costs',
      'crew',
      'sites',
      'recurring_plans',
      'services',
      'review_invites',
      'message_templates',
      'saved_places',
      'route_stops',
    ];

    for (const table of coreTenantTables) {
      const tablePolicies = policies.filter(
        (p) => p.table.toLowerCase() === table.toLowerCase(),
      );

      expect(
        tablePolicies.length,
        `Table ${table} must have at least one RLS policy defined`,
      ).toBeGreaterThan(0);

      // Verify at least one policy enforces account ownership or office/crew scope
      const hasTenantGuard = tablePolicies.some((p) => {
        const def = p.definition.toLowerCase();
        return (
          def.includes('is_owner(account_id)') ||
          def.includes('is_owner(id)') ||
          def.includes('office_can(account_id') ||
          def.includes('is_crew(account_id') ||
          def.includes('crew_on_job(id)') ||
          def.includes('crew_owns_crew_row(crew_id)')
        );
      });

      expect(
        hasTenantGuard,
        `Table ${table} has policies, but none enforce account_id tenant boundaries: ${JSON.stringify(
          tablePolicies.map((p) => p.name),
        )}`,
      ).toBe(true);
    }
  });

  it('asserts no tenant data table has open permissive "using (true)" policies for authenticated users', () => {
    const policyRegex = /create policy\s+([a-zA-Z0-9_]+)\s+on\s+(?:public\.)?([a-zA-Z0-9_]+)([\s\S]*?);/gi;
    const policies = [...schema.matchAll(policyRegex)].map((m) => ({
      name: m[1],
      table: m[2],
      definition: m[3].replace(/\s+/g, ' ').trim(),
    }));

    const forbiddenPermissive = policies.filter((p) => {
      const def = p.definition.toLowerCase();
      const isPermissive = def.includes('using (true)') || def.includes('using ( true )');
      // Catalog tables like office_capabilities or service_role-only tables are exempt
      const isCatalog = p.table === 'office_capabilities';
      const isServiceRoleOnly = def.includes('to service_role');
      return isPermissive && !isCatalog && !isServiceRoleOnly;
    });

    expect(
      forbiddenPermissive,
      `Found insecure permissive RLS policies on tenant data: ${JSON.stringify(
        forbiddenPermissive,
        null,
        2,
      )}`,
    ).toEqual([]);
  });
});
