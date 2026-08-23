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

/**
 * CRITICAL: these two sweeps scan EVERY line, comments included.
 *
 * That is the opposite of the grammar sweep above, and the difference is the
 * whole lesson. A comment mentioning `pg_catalog.coalesce` is harmless prose. A
 * comment containing a bare `$$` is a live delimiter: inside a dollar-quoted
 * body the outer lexer sees raw string content, not comments, so a `--` line
 * closes the block just as surely as code does.
 *
 * This file learned that the hard way. The first version stripped comments here
 * too, so when the fix for the original bug was written as a comment EXPLAINING
 * the bug -- containing two bare `$$` -- the guard passed and PostgreSQL failed
 * the migration a second time, at a syntax error 4,150 characters in.
 */
const INLINE_PAIR = /\$\$[^$]*\$\$/;

function allLines(source: string): Array<{ line: string; number: number }> {
  return source
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line, index) => ({ line, number: index + 1 }));
}

describe('dollar-quoted blocks never nest a bare delimiter', () => {
  it('has no bare $$ inside any SQL comment', () => {
    // Zero of these exist across the tree, so this is a real invariant rather
    // than a threshold. `do $$ begin` and `end $$;` are legitimate and common,
    // which is why the rule targets comments rather than line shape.
    const offenders: string[] = [];
    for (const file of SQL_FILES) {
      for (const { line, number } of allLines(readFileSync(file, 'utf8'))) {
        const comment = line.indexOf('--');
        if (comment >= 0 && line.slice(comment).includes('$$')) {
          offenders.push(`${file.slice(ROOT.length + 1)}:${number} ${line.trim()}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('has no inline bare $$ literal, in code or in prose', () => {
    const offenders: string[] = [];
    for (const file of SQL_FILES) {
      for (const { line, number } of allLines(readFileSync(file, 'utf8'))) {
        if (INLINE_PAIR.test(line)) {
          offenders.push(`${file.slice(ROOT.length + 1)}:${number} ${line.trim()}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('would catch BOTH versions of the bug that actually happened', () => {
    // Round one: in code.
    const inCode = "  if pg_catalog.strpos(v_before, $$'office_users', 15$$) > 0 then";
    expect(INLINE_PAIR.test(inCode)).toBe(true);

    // Round two: in the comment written to explain round one. The old guard
    // stripped comments and waved this through.
    const inComment = '  -- The probe is $probe$-tagged, NOT bare $$. A bare $$ here closes it';
    expect(INLINE_PAIR.test(inComment)).toBe(true);
    const commentAt = inComment.indexOf('--');
    expect(inComment.slice(commentAt).includes('$$')).toBe(true);

    // The fix, and ordinary block syntax, must not trip either rule.
    const fixed = "  if pg_catalog.strpos(v_before, $probe$'office_users', 15$probe$) > 0 then";
    expect(INLINE_PAIR.test(fixed)).toBe(false);
    for (const ordinary of ['do $$', 'as $$', '$$;', 'do $$ begin', 'exception when duplicate_object then null; end $$;']) {
      expect(INLINE_PAIR.test(ordinary), ordinary).toBe(false);
    }
  });
});
