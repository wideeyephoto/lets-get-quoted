import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Supabase Security Advisor Verification Suite', () => {
  const root = process.cwd();
  const schemaPath = resolve(root, 'schema.sql');
  const migrationPath = resolve(root, 'migrations/20260901000000_supabase_security_advisor_remediations.sql');

  it('verifies the forward migration exists and contains remediations', () => {
    expect(existsSync(migrationPath)).toBe(true);
    const migration = readFileSync(migrationPath, 'utf8');
    expect(migration).toContain('public.job_account_id');
    expect(migration).toContain('crew_jobs_update_guard');
    expect(migration).toContain('crew_set_job_status');
    expect(migration).toContain('crew_costs_guard');
    expect(migration).toContain('crew_time_entries_guard');
    expect(migration).toContain('atomic_ad_wallet_credit');
    expect(migration).toContain('atomic_ad_wallet_spend');
    expect(migration).toContain('create index if not exists idx_');
  });

  it('asserts that 100% of SECURITY DEFINER functions in schema.sql declare immutable search paths', () => {
    const schema = readFileSync(schemaPath, 'utf8');
    const chunks = schema.split(/create\s+(?:or\s+replace\s+)?function\s+/i);

    const mutableSearchPath: string[] = [];

    for (let i = 1; i < chunks.length; i++) {
      const chunk = chunks[i];
      const nameMatch = chunk.match(/^([a-zA-Z0-9_."]+)\s*\(/);
      const name = nameMatch ? nameMatch[1] : 'unknown';
      const header = chunk.split('$$')[0];
      const isSecDef = /security\s+definer/i.test(header) || /security\s+definer/i.test(chunk.slice(0, 1000));

      if (isSecDef) {
        const searchPathMatch = header.match(/set\s+search_path\s*=\s*([^,\n;]+(?:,\s*[^,\n;]+)*)/i);
        if (!searchPathMatch) {
          mutableSearchPath.push(`${name} (missing search_path)`);
        } else {
          const sp = searchPathMatch[1].trim();
          const isSecure = sp === "''" || sp === 'pg_catalog, pg_temp' || sp === 'public, pg_temp' || sp === 'pg_catalog' || sp.includes('pg_temp');
          if (!isSecure) {
            mutableSearchPath.push(`${name} (insecure: ${sp})`);
          }
        }
      }
    }

    expect(mutableSearchPath, `Functions with mutable search_path: ${mutableSearchPath.join(', ')}`).toEqual([]);
  });

  it('asserts that 100% of foreign keys in schema.sql have covering indexes', () => {
    const schema = readFileSync(schemaPath, 'utf8');

    const fkList: Array<{ table: string; col: string; refTable: string }> = [];
    const tableIndexes = new Map<string, Set<string>>();

    const indexMatches = [...schema.matchAll(/create\s+(?:unique\s+)?index\s+(?:if\s+not\s+exists\s+)?([a-zA-Z0-9_]+)\s+on\s+(?:public\.)?([a-zA-Z0-9_]+)(?:\s+using\s+[a-z]+)?\s*\(([^)]+)\)/gi)];
    for (const match of indexMatches) {
      const [, , tableName, cols] = match;
      const t = tableName.toLowerCase();
      if (!tableIndexes.has(t)) tableIndexes.set(t, new Set());
      const firstCol = cols.split(',')[0].trim().replace(/^["']|["']$/g, '').split(' ')[0].toLowerCase();
      tableIndexes.get(t)!.add(firstCol);
    }

    const tableChunks = schema.split(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-zA-Z0-9_]+)\s*\(/i);
    for (let i = 1; i < tableChunks.length; i += 2) {
      const tableName = tableChunks[i].toLowerCase();
      const body = tableChunks[i + 1].split(');')[0];
      const colLines = body.split('\n');
      for (const line of colLines) {
        const trimmed = line.trim();
        const fkMatch = trimmed.match(/^([a-zA-Z0-9_]+)\s+[^,]*\breferences\s+(?:public\.)?([a-zA-Z0-9_]+)(?:\s*\(([a-zA-Z0-9_]+)\))?/i);
        if (fkMatch) {
          const [, colName, refTable] = fkMatch;
          fkList.push({ table: tableName, col: colName.toLowerCase(), refTable: refTable.toLowerCase() });
        }
        const constraintMatch = trimmed.match(/foreign\s+key\s*\(([a-zA-Z0-9_]+)\)\s+references\s+(?:public\.)?([a-zA-Z0-9_]+)(?:\s*\(([a-zA-Z0-9_]+)\))?/i);
        if (constraintMatch) {
          const [, colName, refTable] = constraintMatch;
          fkList.push({ table: tableName, col: colName.toLowerCase(), refTable: refTable.toLowerCase() });
        }
      }
    }

    const alterMatches = [...schema.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:public\.)?([a-zA-Z0-9_]+)\s+add\s+(?:constraint\s+[a-zA-Z0-9_]+\s+)?foreign\s+key\s*\(([a-zA-Z0-9_]+)\)\s+references\s+(?:public\.)?([a-zA-Z0-9_]+)/gi)];
    for (const match of alterMatches) {
      const [, tableName, colName, refTable] = match;
      fkList.push({ table: tableName.toLowerCase(), col: colName.toLowerCase(), refTable: refTable.toLowerCase() });
    }

    const unindexedFks: string[] = [];
    for (const fk of fkList) {
      const indexes = tableIndexes.get(fk.table);
      if (!indexes || !indexes.has(fk.col)) {
        unindexedFks.push(`${fk.table}.${fk.col} -> ${fk.refTable}`);
      }
    }

    expect(unindexedFks, `Unindexed foreign keys found: ${unindexedFks.join(', ')}`).toEqual([]);
  });
});
