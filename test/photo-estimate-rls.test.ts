import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Photo Estimates RLS Coverage', () => {
  const migrationPath = join(process.cwd(), 'migrations', '20260915133500_photo_estimates.sql');
  const schema = readFileSync(migrationPath, 'utf8');

  it('verifies that every new table has ROW LEVEL SECURITY enabled', () => {
    const tableRegex = /create table (?:if not exists )?([a-zA-Z0-9_]+)/gi;
    const allCreatedTables = [...new Set([...schema.matchAll(tableRegex)].map((m) => m[1]))];

    expect(allCreatedTables.length).toBeGreaterThan(0);

    allCreatedTables.forEach((table) => {
      const rlsPattern = new RegExp('alter table ' + table + ' enable row level security', 'i');
      expect(schema).toMatch(rlsPattern);
    });
  });

  it('verifies that every table has an owner policy', () => {
    const tableRegex = /create table (?:if not exists )?([a-zA-Z0-9_]+)/gi;
    const allCreatedTables = [...new Set([...schema.matchAll(tableRegex)].map((m) => m[1]))];

    allCreatedTables.forEach((table) => {
      // Check for create policy ... on table ... using
      const policyPattern = new RegExp('create policy.*on ' + table + '.*using.*is_owner.*account_id', 'is');
      expect(schema).toMatch(policyPattern);
    });
  });
});
