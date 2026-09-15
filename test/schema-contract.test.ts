import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function extractTablesFromSql(sql: string): Set<string> {
  const tables = new Set<string>();

  // Matches "create table [if not exists] [public.][tableName]"
  const tableRegex = /create\s+table(?:\s+if\s+not\s+exists)?\s+(?:public\.)?([a-zA-Z0-9_]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = tableRegex.exec(sql)) !== null) {
    tables.add(match[1].toLowerCase());
  }

  // Matches "create [or replace] view [public.][viewName]"
  const viewRegex = /create(?:\s+or\s+replace)?\s+view\s+(?:public\.)?([a-zA-Z0-9_]+)/gi;
  while ((match = viewRegex.exec(sql)) !== null) {
    tables.add(match[1].toLowerCase());
  }

  return tables;
}

function findSourceFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findSourceFiles(fullPath));
    } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      results.push(fullPath);
    }
  }
  return results;
}

describe('Schema Contract Gate (P2-3)', () => {
  const schemaPath = path.resolve(process.cwd(), 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  const knownTables = extractTablesFromSql(schemaSql);

  // Also include tables defined in migrations if any
  const migrationsDir = path.resolve(process.cwd(), 'migrations');
  if (fs.existsSync(migrationsDir)) {
    const migrationFiles = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));
    for (const file of migrationFiles) {
      const migrationSql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      const migrationTables = extractTablesFromSql(migrationSql);
      for (const t of migrationTables) knownTables.add(t);
    }
  }

  // Allow standard Supabase/PostgREST internal schemas/functions
  const allowedSystemTables = new Set([
    'users',
    'objects',
    'buckets',
    'mfa_factors',
    'mfa_challenges',
    'audit_log_entries',
  ]);

  it('loaded a comprehensive set of schema tables', () => {
    expect(knownTables.size).toBeGreaterThan(50);
    expect(knownTables.has('accounts')).toBe(true);
    expect(knownTables.has('memberships')).toBe(true);
    expect(knownTables.has('jobs')).toBe(true);
  });

  it('all .from("table") calls in Admin Console and AI Operator resolve to valid tables/views in schema.sql', () => {
    const adminFiles = [
      ...findSourceFiles(path.resolve(process.cwd(), 'src/app/admin')),
      ...findSourceFiles(path.resolve(process.cwd(), 'src/lib/ai-operator')),
    ];

    const violations: Array<{ file: string; line: number; table: string }> = [];
    const fromRegex = /\.from\(\s*['"]([a-zA-Z0-9_]+)['"]\s*\)/g;

    for (const file of adminFiles) {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let match: RegExpExecArray | null;
        while ((match = fromRegex.exec(line)) !== null) {
          const table = match[1].toLowerCase();
          if (!knownTables.has(table) && !allowedSystemTables.has(table)) {
            violations.push({
              file: path.relative(process.cwd(), file).replace(/\\/g, '/'),
              line: i + 1,
              table,
            });
          }
        }
      }
    }

    if (violations.length > 0) {
      const details = violations.map((v) => `${v.file}:${v.line} -> table '${v.table}'`).join('\n');
      expect.fail(`Found ${violations.length} query(s) against non-existent tables in Admin/Operator surfaces:\n${details}`);
    }
    expect(violations).toEqual([]);
  });
});
