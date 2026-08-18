import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Two SQL traps that only fail when the statement RUNS, guarded across the whole
 * tree rather than one migration at a time.
 *
 * Both have now cost real time here. A `pg_catalog.coalesce` was written into a
 * new migration and caught by hand in review; a `pg_catalog.current_user` had
 * been sitting in the PG17 helper, meaning that helper could never open a
 * connection and every test behind it was unreachable rather than failing. A
 * nested bare `$$` made a third migration unparseable, and PostgreSQL reported it
 * as a syntax error thousands of characters away from the actual mistake.
 *
 * Several migrations already assert `not.toContain('pg_catalog.coalesce')`
 * individually. That is exactly why the helper's bug survived: a per-file guard
 * only protects the file that remembered to add it.
 */

const ROOT = process.cwd();

/**
 * Constructs that are SQL GRAMMAR, not functions in pg_catalog. Qualifying them
 * does not resolve to anything: `pg_catalog.coalesce(...)` raises at runtime,
 * and `pg_catalog.current_user` parses as a column reference and fails 42P01.
 *
 * Deliberately excluded because they ARE real pg_catalog functions and must stay
 * qualified: current_database, current_schema, current_setting, now, length,
 * btrim, sum, count.
 */
const GRAMMAR_CONSTRUCTS = [
  'coalesce', 'nullif', 'greatest', 'least',
  'current_user', 'session_user', 'current_role', 'current_catalog',
  'current_date', 'current_time', 'current_timestamp',
  'localtime', 'localtimestamp',
] as const;

const QUALIFIED = new RegExp(`pg_catalog\\.(${GRAMMAR_CONSTRUCTS.join('|')})\\b`, 'i');

function walk(dir: string, extensions: readonly string[], out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === '.next' || entry === '.git') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, extensions, out);
    else if (extensions.some((extension) => entry.endsWith(extension))) out.push(full);
  }
  return out;
}

/**
 * Lines that would actually reach a parser. Both file kinds here explain the
 * traps they avoid in prose, so a naive scan reports the warning as the bug.
 */
function executableLines(source: string): Array<{ line: string; number: number }> {
  return source
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line, index) => ({ line, number: index + 1 }))
    .filter(({ line }) => {
      const trimmed = line.trimStart();
      return trimmed !== ''
        && !trimmed.startsWith('--')
        && !trimmed.startsWith('//')
        && !trimmed.startsWith('*')
        && !trimmed.startsWith('/*');
    });
}

const SQL_FILES = walk(join(ROOT, 'migrations'), ['.sql']);
const SQL_BEARING_CODE = [
  ...walk(join(ROOT, 'test-pg17'), ['.ts']),
  ...walk(join(ROOT, 'scripts'), ['.mjs', '.ts']),
];

describe('SQL grammar constructs are never schema-qualified', () => {
  it('finds the files it is supposed to be guarding', () => {
    // A walk that silently returns nothing passes every assertion below.
    expect(SQL_FILES.length).toBeGreaterThan(50);
    expect(SQL_BEARING_CODE.length).toBeGreaterThan(0);
  });

  it.each([
    ['migrations', () => SQL_FILES],
    ['SQL-bearing code', () => SQL_BEARING_CODE],
  ])('has none in %s', (_label, files) => {
    const offenders: string[] = [];
    for (const file of files()) {
      for (const { line, number } of executableLines(readFileSync(file, 'utf8'))) {
        if (QUALIFIED.test(line)) {
          offenders.push(`${file.slice(ROOT.length + 1)}:${number} ${line.trim()}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('would catch both bugs that actually happened', () => {
    // Guards the guard. A regex that matches nothing passes the sweep above.
    expect(QUALIFIED.test('select pg_catalog.coalesce(pg_catalog.sum(x), 0)')).toBe(true);
    expect(QUALIFIED.test('join pg_catalog.pg_roles r on r.rolname = pg_catalog.current_user')).toBe(true);
    // And does not fire on the real functions that must stay qualified.
    expect(QUALIFIED.test('where d.datname = pg_catalog.current_database()')).toBe(false);
    expect(QUALIFIED.test('pg_catalog.current_setting(\'server_version_num\')')).toBe(false);
    expect(QUALIFIED.test('created_at timestamptz not null default pg_catalog.now()')).toBe(false);
  });
});

describe('dollar-quoted blocks never nest a bare delimiter', () => {
  it('has no inline bare $$ literal in any migration', () => {
    // A bare $$ inside a `do $$ ... $$` body closes that body at the FIRST
    // delimiter. Everything after is parsed as top-level SQL, and the error
    // surfaces at whatever punctuation comes next -- thousands of characters
    // from the mistake. Use a tagged delimiter ($probe$, $needle$) instead.
    const offenders: string[] = [];
    for (const file of SQL_FILES) {
      for (const { line, number } of executableLines(readFileSync(file, 'utf8'))) {
        if (/\$\$[^$]*\$\$/.test(line)) {
          offenders.push(`${file.slice(ROOT.length + 1)}:${number} ${line.trim()}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('would catch the bug that actually happened', () => {
    const broken = "  if pg_catalog.strpos(v_before, $$'office_users', 15$$) > 0 then";
    const fixed = "  if pg_catalog.strpos(v_before, $probe$'office_users', 15$probe$) > 0 then";
    expect(/\$\$[^$]*\$\$/.test(broken)).toBe(true);
    expect(/\$\$[^$]*\$\$/.test(fixed)).toBe(false);
    // The ordinary opening and closing of a block body must not trip it.
    expect(/\$\$[^$]*\$\$/.test('as $$')).toBe(false);
    expect(/\$\$[^$]*\$\$/.test('$$;')).toBe(false);
  });
});
